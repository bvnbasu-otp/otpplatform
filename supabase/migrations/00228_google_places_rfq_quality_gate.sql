-- Coverage → RFQ bridge quality gate.
-- Phone and businessStatus are NOT in the Places API (New) searchText field mask.
-- Phone enrichment is NOT certified (no Place Details fan-out in this migration).
-- Search-only rows may be stored; they are not invited until supplier_json already
-- contains every mandatory field from a previously stored value.
-- Email is never inferred from Google, a website, or a domain. This predicate does not read it.
-- Business status rule: only OPERATIONAL is addressable.
-- Missing status is not addressable.
-- CLOSED_PERMANENTLY is not addressable.
-- CLOSED_TEMPORARILY is not operational, so it is not addressable.

BEGIN;

CREATE OR REPLACE FUNCTION private.jsonb_finite_number(p_text text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v numeric;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;
  v := btrim(p_text)::numeric;
  RETURN v;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.jsonb_finite_number(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.google_places_pin_coverage_rfq_addressable(
  p_place_id text,
  p_supplier_json jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_json jsonb := COALESCE(p_supplier_json, '{}'::jsonb);
  v_name text;
  v_address text;
  v_phone text;
  v_lat numeric;
  v_lng numeric;
  v_place text;
  v_uri text;
  v_status text;
BEGIN
  v_place := nullif(btrim(coalesce(p_place_id, v_json ->> 'placeId', v_json ->> 'place_id', '')), '');
  v_name := nullif(btrim(coalesce(
    v_json ->> 'businessName',
    v_json ->> 'business_name',
    v_json ->> 'displayName',
    v_json #>> '{displayName,text}',
    ''
  )), '');
  v_address := nullif(btrim(coalesce(
    v_json ->> 'formattedAddress',
    v_json ->> 'formatted_address',
    v_json #>> '{locations,0,addressLine}',
    ''
  )), '');
  v_phone := nullif(btrim(coalesce(
    v_json ->> 'phone',
    v_json ->> 'contactPhone',
    v_json #>> '{locations,0,phone}',
    ''
  )), '');
  v_lat := coalesce(
    private.jsonb_finite_number(v_json ->> 'lat'),
    private.jsonb_finite_number(v_json #>> '{coordinates,lat}'),
    private.jsonb_finite_number(v_json #>> '{location,latitude}'),
    private.jsonb_finite_number(v_json #>> '{locations,0,latitude}'),
    private.jsonb_finite_number(v_json #>> '{locations,0,lat}')
  );
  v_lng := coalesce(
    private.jsonb_finite_number(v_json ->> 'lng'),
    private.jsonb_finite_number(v_json #>> '{coordinates,lng}'),
    private.jsonb_finite_number(v_json #>> '{location,longitude}'),
    private.jsonb_finite_number(v_json #>> '{locations,0,longitude}'),
    private.jsonb_finite_number(v_json #>> '{locations,0,lng}')
  );
  v_uri := nullif(btrim(coalesce(
    v_json ->> 'googleMapsUri',
    v_json ->> 'google_maps_uri',
    v_json #>> '{locations,0,googleMapsUri}',
    ''
  )), '');
  v_status := upper(btrim(coalesce(
    v_json ->> 'businessStatus',
    v_json ->> 'business_status',
    ''
  )));

  IF v_name IS NULL OR v_address IS NULL OR v_place IS NULL OR v_lat IS NULL OR v_lng IS NULL THEN
    RETURN false;
  END IF;
  IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 10 THEN
    RETURN false;
  END IF;
  IF v_uri IS NULL OR v_uri !~* '^https://' OR v_uri !~* 'maps|google' THEN
    RETURN false;
  END IF;
  -- Only OPERATIONAL. Missing, CLOSED_PERMANENTLY, and CLOSED_TEMPORARILY fail closed.
  IF v_status IS DISTINCT FROM 'OPERATIONAL' THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.google_places_pin_coverage_rfq_addressable(text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(
  p_rfq_id  uuid,
  p_limit   integer DEFAULT 10,
  p_exclude uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq       rfqs%ROWTYPE;
  v_req       requirements%ROWTYPE;
  v_candidate record;
  v_cov       record;
  v_invited   int := 0;
  v_evaluated int := 0;
  v_pin_cov   int := 0;
  v_pin_stored int := 0;
  v_label     text;
  v_limit     int := GREATEST(COALESCE(p_limit, 10), 1);
  v_quotes_res jsonb := NULL;
  v_is_staging boolean := COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';
  v_is_reset   boolean := COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on';
  v_scope_key text;
  v_assess    jsonb;
  v_supplier_id uuid;
  v_phone     text;
  v_reasons   text[];
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;

  IF NOT (
    v_is_staging
    OR v_is_reset
    OR private.is_org_member(v_rfq.organization_id)
    OR private.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not an organization member';
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Discovery only allowed while RFQ is DRAFT or OPEN';
  END IF;

  -- Pass 0: FRESH PIN+category coverage. Identity is stored even when not RFQ-addressable.
  -- Missing or unusable phone increments pin_coverage_stored_no_contact and does not invite.
  -- A usable phone without the rest of the quality gate is stored, not counted as no-contact, and not invited.
  v_scope_key := private.rfq_requirement_coverage_scope_key(v_req);
  IF v_scope_key IS NOT NULL THEN
    v_assess := public.location_pin_coverage_assess(v_scope_key, 30);
    IF coalesce(v_assess ->> 'status', '') = 'FRESH' THEN
      FOR v_cov IN
        SELECT l.place_id, l.supplier_json
        FROM location_pin_coverage_supplier l
        WHERE l.scope_key = v_scope_key
        ORDER BY l.last_seen_at DESC
        LIMIT v_limit
      LOOP
        IF coalesce(btrim(v_cov.place_id), '') = '' THEN
          CONTINUE;
        END IF;

        v_supplier_id := private.ensure_supplier_from_pin_coverage(v_cov.place_id, v_cov.supplier_json, v_scope_key);
        IF v_supplier_id IS NULL THEN
          CONTINUE;
        END IF;

        v_phone := nullif(
          btrim(
            coalesce(
              v_cov.supplier_json ->> 'phone',
              v_cov.supplier_json ->> 'contactPhone',
              v_cov.supplier_json #>> '{locations,0,phone}'
            )
          ),
          ''
        );

        IF v_phone IS NULL OR length(regexp_replace(v_phone, '\D', '', 'g')) < 10 THEN
          v_pin_stored := v_pin_stored + 1;
          CONTINUE;
        END IF;

        IF NOT private.google_places_pin_coverage_rfq_addressable(v_cov.place_id, v_cov.supplier_json) THEN
          CONTINUE;
        END IF;

        IF v_supplier_id = ANY(COALESCE(p_exclude, '{}')) THEN
          CONTINUE;
        END IF;
        IF EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier_id
        ) THEN
          CONTINUE;
        END IF;

        v_reasons := ARRAY['pin_coverage', 'discovered_in_area'];

        v_label := private.assign_anonymous_label(p_rfq_id, v_supplier_id);
        INSERT INTO rfq_invitations (
          rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
        ) VALUES (
          p_rfq_id,
          v_supplier_id,
          v_label,
          'INVITED',
          70,
          v_reasons
        );
        v_invited := v_invited + 1;
        v_pin_cov := v_pin_cov + 1;
      END LOOP;
    END IF;
  END IF;

  -- Pass 1: Canonical capability-based ranking (registered ACTIVE suppliers)
  FOR v_candidate IN
    SELECT * FROM private.rank_discovery_candidates(p_rfq_id, p_exclude)
    LIMIT GREATEST(v_limit - v_invited, 0)
  LOOP
    v_evaluated := v_evaluated + 1;

    IF EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = v_candidate.supplier_id
    ) THEN
      CONTINUE;
    END IF;

    v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
    ) VALUES (
      p_rfq_id,
      v_candidate.supplier_id,
      v_label,
      'INVITED',
      v_candidate.match_score,
      v_candidate.match_reasons
    );

    v_invited := v_invited + 1;
  END LOOP;

  -- Pass 2: Fallback only when coverage did not populate invitations
  IF v_pin_cov = 0 AND (v_invited + (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id)) < 4 THEN
    FOR v_candidate IN
      SELECT s.id AS supplier_id, COALESCE(s.rating_avg, 4.0) * 20 AS match_score,
             ARRAY['category_match', 'verified_active'] AS match_reasons
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT (s.id = ANY(COALESCE(p_exclude, '{}')))
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST
      LIMIT (4 - (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id))
    LOOP
      v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id,
        v_candidate.supplier_id,
        v_label,
        'INVITED',
        v_candidate.match_score,
        v_candidate.match_reasons
      );

      v_invited := v_invited + 1;
    END LOOP;
  END IF;

  IF v_rfq.status = 'DRAFT' THEN
    UPDATE rfqs
    SET status = 'OPEN',
        quote_deadline = COALESCE(quote_deadline, now() + interval '5 days'),
        updated_at = now()
    WHERE id = p_rfq_id;

    IF NOT v_is_staging AND NOT v_rfq.is_demo THEN
      UPDATE requirements
      SET status = 'QUOTING'::requirement_status,
          updated_at = now()
      WHERE id = v_rfq.requirement_id;
    END IF;
  END IF;

  v_quotes_res := jsonb_build_object('skipped', true, 'reason', 'Discovery never generates quotes');

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'rfq.suppliers_discovered',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'invited', v_invited,
      'evaluated', v_evaluated,
      'pin_coverage_invited', v_pin_cov,
      'pin_coverage_stored_no_contact', v_pin_stored,
      'pin_coverage_scope_key', v_scope_key
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invited', v_invited,
    'evaluated', v_evaluated,
    'pin_coverage_invited', v_pin_cov,
    'pin_coverage_stored_no_contact', v_pin_stored,
    'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id),
    'quotes_result', v_quotes_res
  );
END;
$$;

REVOKE ALL ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) TO authenticated, anon, service_role;

COMMIT;
