-- Bridge FRESH location_pin_coverage suppliers into discover_and_invite_for_rfq (RFQ PIN + category scope).
-- Idempotent supplier rows keyed by Google Place ID (source_ref google_place:<place_id>).

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_google_place_source_ref
  ON public.suppliers (source_ref)
  WHERE source = 'OTHER'::supplier_source AND source_ref LIKE 'google_place:%';

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS external_place_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_external_place_id
  ON public.suppliers (external_place_id)
  WHERE external_place_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.rfq_requirement_coverage_scope_key(p_req requirements)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_state text;
  v_city text;
  v_pincode text;
  v_category text;
BEGIN
  v_pincode := coalesce(
    nullif(btrim(p_req.delivery_pincode), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'pincode'), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'postalCode'), '')
  );
  IF v_pincode IS NULL OR v_pincode !~ '^[0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  v_city := coalesce(
    nullif(btrim(p_req.delivery_city), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'city'), '')
  );
  v_state := coalesce(
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'state'), ''),
    nullif(btrim(p_req.attributes ->> 'delivery_state'), '')
  );

  SELECT coalesce(
    (SELECT c.name FROM requirement_categories c WHERE c.id = p_req.category_id),
    (SELECT s.name FROM requirement_subcategories s WHERE s.id = p_req.subcategory_id)
  ) INTO v_category;

  IF coalesce(btrim(v_category), '') = '' OR coalesce(btrim(v_state), '') = '' OR coalesce(btrim(v_city), '') = '' THEN
    RETURN NULL;
  END IF;

  RETURN public.location_pin_coverage_build_scope_key(v_state, v_city, v_pincode, v_category);
END;
$$;

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
BEGIN
  IF coalesce(btrim(p_place_id), '') = '' THEN
    RETURN NULL;
  END IF;

  v_source_ref := 'google_place:' || btrim(p_place_id);

  SELECT id INTO v_supplier_id
  FROM suppliers
  WHERE external_place_id = btrim(p_place_id)
     OR (source = 'OTHER' AND source_ref = v_source_ref)
  LIMIT 1;

  IF v_supplier_id IS NOT NULL THEN
    RETURN v_supplier_id;
  END IF;

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
    btrim(p_place_id),
    'PENDING',
    'QUOTE_PARTICIPANT',
    'NOT_PROVIDED',
    v_phone,
    CASE WHEN v_category IS NOT NULL THEN ARRAY[v_category] ELSE ARRAY[]::text[] END,
    v_pincode,
    v_city
  )
  RETURNING id INTO v_supplier_id;

  RETURN v_supplier_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_supplier_id
    FROM suppliers
    WHERE external_place_id = btrim(p_place_id)
       OR (source = 'OTHER' AND source_ref = v_source_ref)
    LIMIT 1;
    RETURN v_supplier_id;
END;
$$;

REVOKE ALL ON FUNCTION private.rfq_requirement_coverage_scope_key(requirements) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.ensure_supplier_from_pin_coverage(text, jsonb, text) FROM PUBLIC, anon, authenticated;

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

  -- Pass 0: FRESH PIN+category coverage (Google-discovered network), idempotent placeholders.
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

        v_phone := nullif(
          btrim(
            coalesce(
              v_cov.supplier_json ->> 'phone',
              v_cov.supplier_json #>> '{locations,0,phone}'
            )
          ),
          ''
        );
        v_reasons := ARRAY['pin_coverage', 'discovered_in_area'];
        IF v_phone IS NULL THEN
          v_reasons := v_reasons || ARRAY['no_contact_channel'];
        END IF;

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
      'pin_coverage_scope_key', v_scope_key
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'invited', v_invited,
    'evaluated', v_evaluated,
    'pin_coverage_invited', v_pin_cov,
    'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id),
    'quotes_result', v_quotes_res
  );
END;
$$;

REVOKE ALL ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) TO authenticated, anon, service_role;

COMMIT;
