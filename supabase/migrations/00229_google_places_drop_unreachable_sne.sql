-- Drop Google Places rows that fail the SNE gate.
-- 00228 is already applied locally; this file does not rewrite it.
-- searchText already requests phone and businessStatus (see the adapter field mask).
-- A Google business is an OTP SNE candidate only when name, formatted address,
-- phone, lat, lng, Place ID, Maps URI, and businessStatus OPERATIONAL are all present.
-- No phone: do not insert a supplier, do not write supplier_provider_identities,
-- do not invite, and do not leave a PENDING placeholder active.
-- A later rediscovery that passes the gate may insert or reactivate that placeholder.
-- Email is never read or inferred. Registered ACTIVE ranking is unchanged.
-- Invitation insert is not an RFQ send; WhatsApp/SMS stays on the existing trigger.

BEGIN;

CREATE OR REPLACE FUNCTION private.retire_unreachable_google_places_placeholder(p_place_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_place text := nullif(btrim(p_place_id), '');
  v_supplier_id uuid;
BEGIN
  IF v_place IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_supplier_id
  FROM suppliers
  WHERE external_place_id = v_place
    AND source = 'OTHER'
    AND source_ref = 'google_place:' || v_place
    AND status IN ('PENDING', 'SUSPENDED')
    AND lifecycle_state = 'QUOTE_PARTICIPANT'
    AND verification_status IS DISTINCT FROM 'VERIFIED'
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM supplier_provider_identities
  WHERE supplier_id = v_supplier_id
    AND provider = 'GOOGLE_PLACES'
    AND provider_supplier_id = v_place;

  UPDATE suppliers
  SET status = 'SUSPENDED'
  WHERE id = v_supplier_id
    AND status = 'PENDING';
END;
$$;

REVOKE ALL ON FUNCTION private.retire_unreachable_google_places_placeholder(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.ensure_supplier_from_pin_coverage(
  p_place_id text,
  p_supplier_json jsonb,
  p_scope_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_supplier_id uuid;
  v_source_ref text;
  v_name text;
  v_phone text;
  v_pincode text;
  v_city text;
  v_state text;
  v_category text;
  v_place text;
BEGIN
  v_place := nullif(btrim(p_place_id), '');
  IF v_place IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT private.google_places_pin_coverage_rfq_addressable(v_place, p_supplier_json) THEN
    PERFORM private.retire_unreachable_google_places_placeholder(v_place);
    RETURN NULL;
  END IF;

  v_source_ref := 'google_place:' || v_place;

  SELECT id INTO v_supplier_id
  FROM suppliers
  WHERE external_place_id = v_place
     OR (source = 'OTHER' AND source_ref = v_source_ref)
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    SELECT pincode, city, state, category
    INTO v_pincode, v_city, v_state, v_category
    FROM location_pin_coverage_scope
    WHERE scope_key = p_scope_key;

    v_name := coalesce(
      nullif(btrim(p_supplier_json ->> 'businessName'), ''),
      nullif(btrim(p_supplier_json ->> 'business_name'), ''),
      'Discovered supplier'
    );

    v_phone := nullif(
      btrim(
        coalesce(
          p_supplier_json ->> 'phone',
          p_supplier_json #>> '{locations,0,phone}'
        )
      ),
      ''
    );

    INSERT INTO suppliers (
      business_name,
      source,
      source_ref,
      external_place_id,
      status,
      lifecycle_state,
      verification_status,
      contact_phone,
      categories,
      pincode,
      city
    ) VALUES (
      v_name,
      'OTHER',
      v_source_ref,
      v_place,
      'PENDING',
      'QUOTE_PARTICIPANT',
      'NOT_PROVIDED',
      v_phone,
      CASE WHEN v_category IS NOT NULL THEN ARRAY[v_category] ELSE ARRAY[]::text[] END,
      v_pincode,
      v_city
    )
    RETURNING id INTO v_supplier_id;
  ELSE
    UPDATE suppliers
    SET status = 'PENDING'
    WHERE id = v_supplier_id
      AND status = 'SUSPENDED'
      AND source = 'OTHER'
      AND source_ref = v_source_ref
      AND lifecycle_state = 'QUOTE_PARTICIPANT'
      AND verification_status IS DISTINCT FROM 'VERIFIED';
  END IF;

  PERFORM private.upsert_supplier_provider_identity(
    v_supplier_id,
    'GOOGLE_PLACES',
    v_place,
    NULL,
    NULL,
    NULL
  );

  RETURN v_supplier_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_supplier_id
    FROM suppliers
    WHERE external_place_id = v_place
       OR (source = 'OTHER' AND source_ref = v_source_ref)
    LIMIT 1;
    IF v_supplier_id IS NOT NULL THEN
      UPDATE suppliers
      SET status = 'PENDING'
      WHERE id = v_supplier_id
        AND status = 'SUSPENDED'
        AND source = 'OTHER'
        AND source_ref = v_source_ref
        AND lifecycle_state = 'QUOTE_PARTICIPANT'
        AND verification_status IS DISTINCT FROM 'VERIFIED';
      PERFORM private.upsert_supplier_provider_identity(
        v_supplier_id,
        'GOOGLE_PLACES',
        v_place,
        NULL,
        NULL,
        NULL
      );
    END IF;
    RETURN v_supplier_id;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_supplier_from_pin_coverage(text, jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.location_pin_coverage_drop_unreachable(
  p_scope_key text,
  p_place_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_place text;
  v_count integer := 0;
BEGIN
  IF p_scope_key IS NULL OR btrim(p_scope_key) = '' THEN
    RETURN 0;
  END IF;

  FOREACH v_place IN ARRAY COALESCE(p_place_ids, ARRAY[]::text[])
  LOOP
    IF coalesce(btrim(v_place), '') = '' THEN
      CONTINUE;
    END IF;
    DELETE FROM location_pin_coverage_supplier
    WHERE scope_key = p_scope_key
      AND place_id = btrim(v_place);
    PERFORM private.retire_unreachable_google_places_placeholder(btrim(v_place));
  END LOOP;

  SELECT count(*)::integer INTO v_count
  FROM location_pin_coverage_supplier
  WHERE scope_key = p_scope_key;

  UPDATE location_pin_coverage_scope
  SET supplier_count = v_count,
      updated_at = now(),
      last_successful_discovery_at = CASE
        WHEN v_count > 0 THEN last_successful_discovery_at
        ELSE NULL
      END
  WHERE scope_key = p_scope_key;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.location_pin_coverage_drop_unreachable(text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.location_pin_coverage_drop_unreachable(text, text[]) TO service_role;

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
  v_pin_dropped int := 0;
  v_label     text;
  v_limit     int := GREATEST(COALESCE(p_limit, 10), 1);
  v_quotes_res jsonb := NULL;
  v_is_staging boolean := COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';
  v_is_reset   boolean := COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on';
  v_scope_key text;
  v_assess    jsonb;
  v_supplier_id uuid;
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

  -- Pass 0: FRESH coverage. Invite only rows that pass the Google SNE gate.
  -- Failing rows are removed from coverage and any PENDING placeholder is suspended.
  -- This function inserts an invitation row. It does not send WhatsApp or SMS.
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

        IF NOT private.google_places_pin_coverage_rfq_addressable(v_cov.place_id, v_cov.supplier_json) THEN
          PERFORM private.retire_unreachable_google_places_placeholder(v_cov.place_id);
          DELETE FROM location_pin_coverage_supplier
          WHERE scope_key = v_scope_key
            AND place_id = v_cov.place_id;
          v_pin_dropped := v_pin_dropped + 1;
          CONTINUE;
        END IF;

        v_supplier_id := private.ensure_supplier_from_pin_coverage(v_cov.place_id, v_cov.supplier_json, v_scope_key);
        IF v_supplier_id IS NULL THEN
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

      IF v_pin_dropped > 0 THEN
        UPDATE location_pin_coverage_scope
        SET supplier_count = (
              SELECT count(*)::integer
              FROM location_pin_coverage_supplier
              WHERE scope_key = v_scope_key
            ),
            last_successful_discovery_at = CASE
              WHEN (
                SELECT count(*)
                FROM location_pin_coverage_supplier
                WHERE scope_key = v_scope_key
              ) = 0 THEN NULL
              ELSE last_successful_discovery_at
            END,
            updated_at = now()
        WHERE scope_key = v_scope_key;
      END IF;
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
      'pin_coverage_dropped', v_pin_dropped,
      'pin_coverage_scope_key', v_scope_key
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invited', v_invited,
    'evaluated', v_evaluated,
    'pin_coverage_invited', v_pin_cov,
    'pin_coverage_dropped', v_pin_dropped,
    'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id),
    'quotes_result', v_quotes_res
  );
END;
$$;

REVOKE ALL ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) TO authenticated, anon, service_role;

COMMIT;
