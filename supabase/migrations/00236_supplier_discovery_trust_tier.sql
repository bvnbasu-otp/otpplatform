-- 00236: OTP_REGISTERED means a real OTP login, not a directory row.
--
-- 00232's OTP network invited every rank_discovery_candidates hit and stamped
-- otp_registered. A supplier with no login (Kongu Cotton Suppliers:
-- verification_status NOT_PROVIDED, lifecycle_state ONBOARDING_REQUIRED) was
-- therefore invited as OTP registered.
--
-- Trust ladder, from the existing supplier identity:
--   no supplier_users login linked to auth.users -> DISCOVERED_IN_AREA
--   that login, without successful GST verification -> OTP_REGISTERED
--   that login plus verification_status VERIFIED, lifecycle_state VERIFIED,
--   and gst_verified -> GST_VERIFIED
--
-- ONBOARDING_REQUIRED / NOT_PROVIDED do not grant OTP_REGISTERED.
-- The four-argument default stays GOOGLE_PLACES. 00235 still passes
-- OTP_REGISTERED explicitly for demo staging. Purchase-order verification
-- is not changed.

BEGIN;

CREATE OR REPLACE FUNCTION private.supplier_discovery_trust_tier(p_supplier_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
  SELECT CASE
    WHEN s.id IS NULL THEN 'DISCOVERED_IN_AREA'
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.supplier_users su
      JOIN public.profiles pr ON pr.id = su.profile_id
      JOIN auth.users au ON au.id = pr.auth_user_id
      WHERE su.supplier_id = s.id
    ) THEN 'DISCOVERED_IN_AREA'
    WHEN s.verification_status = 'VERIFIED'
      AND s.lifecycle_state = 'VERIFIED'
      AND COALESCE(s.gst_verified, false)
    THEN 'GST_VERIFIED'
    ELSE 'OTP_REGISTERED'
  END
  FROM (SELECT 1) AS present
  LEFT JOIN public.suppliers s ON s.id = p_supplier_id;
$$;

REVOKE ALL ON FUNCTION private.supplier_discovery_trust_tier(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(
  p_rfq_id  uuid,
  p_limit   integer DEFAULT 10,
  p_exclude uuid[] DEFAULT '{}'::uuid[],
  p_network text DEFAULT 'GOOGLE_PLACES'
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
  v_otp_invited int := 0;
  v_label     text;
  v_limit     int := GREATEST(COALESCE(p_limit, 10), 1);
  v_quotes_res jsonb := NULL;
  v_is_staging boolean := COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';
  v_is_reset   boolean := COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on';
  v_scope_key text;
  v_assess    jsonb;
  v_supplier_id uuid;
  v_reasons   text[];
  v_network   text := upper(btrim(COALESCE(p_network, 'GOOGLE_PLACES')));
  v_outcome   text;
  v_coverage_status text := NULL;
  v_quoting_opened boolean := false;
  v_total     int := 0;
  v_tier      text;
  v_tier_reason text;
BEGIN
  IF v_network NOT IN ('GOOGLE_PLACES', 'OTP_REGISTERED') THEN
    RAISE EXCEPTION 'Unsupported discovery network';
  END IF;

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

  IF v_network = 'GOOGLE_PLACES' THEN
    v_scope_key := private.rfq_requirement_coverage_scope_key(v_req);
    IF v_scope_key IS NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'outcome', 'INVALID_REQUIREMENT',
        'invited', 0,
        'evaluated', 0,
        'google_places_invited', 0,
        'otp_registered_invited', 0,
        'pin_coverage_invited', 0,
        'pin_coverage_dropped', 0,
        'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id),
        'coverage_status', NULL,
        'quoting_opened', false,
        'quotes_result', jsonb_build_object('skipped', true, 'reason', 'Discovery never generates quotes')
      );
    END IF;

    v_assess := public.location_pin_coverage_assess(v_scope_key, 30);
    v_coverage_status := coalesce(v_assess ->> 'status', '');

    IF v_coverage_status = 'FRESH' THEN
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
        IF v_supplier_id IS NULL OR v_supplier_id = ANY(COALESCE(p_exclude, '{}')) THEN
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
          p_rfq_id, v_supplier_id, v_label, 'INVITED', 70, v_reasons
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

      v_outcome := CASE WHEN v_pin_cov > 0 THEN 'GOOGLE_PLACES_DISCOVERY' ELSE 'ZERO_RESULTS' END;
    ELSE
      -- Not fresh includes a genuine Google zero, which is not cached as fresh.
      -- Do not fall through to OTP registered suppliers.
      v_outcome := 'COVERAGE_NOT_FRESH';
    END IF;
  ELSE
    FOR v_candidate IN
      SELECT ranked.*
      FROM private.rank_discovery_candidates(p_rfq_id, p_exclude) ranked
      WHERE private.supplier_discovery_trust_tier(ranked.supplier_id) IN ('OTP_REGISTERED', 'GST_VERIFIED')
      LIMIT v_limit
    LOOP
      v_evaluated := v_evaluated + 1;
      IF EXISTS (
        SELECT 1 FROM rfq_invitations
        WHERE rfq_id = p_rfq_id AND supplier_id = v_candidate.supplier_id
      ) THEN
        CONTINUE;
      END IF;

      v_tier := private.supplier_discovery_trust_tier(v_candidate.supplier_id);
      v_tier_reason := lower(v_tier);
      SELECT COALESCE(array_agg(DISTINCT u.reason), ARRAY[]::text[])
        INTO v_reasons
      FROM unnest(COALESCE(v_candidate.match_reasons, ARRAY[]::text[])) AS u(reason)
      WHERE u.reason IS DISTINCT FROM 'verified_active'
        AND u.reason IS DISTINCT FROM 'otp_registered'
        AND u.reason IS DISTINCT FROM 'gst_verified';
      v_reasons := COALESCE(v_reasons, ARRAY[]::text[]) || ARRAY[v_tier_reason];

      v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);
      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id,
        v_candidate.supplier_id,
        v_label,
        'INVITED',
        v_candidate.match_score,
        v_reasons
      );
      v_invited := v_invited + 1;
      v_otp_invited := v_otp_invited + 1;
    END LOOP;

    v_outcome := CASE WHEN v_otp_invited > 0 THEN 'OTP_REGISTERED_SUPPLIER_DISCOVERY' ELSE 'ZERO_RESULTS' END;
  END IF;

  v_total := (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id);

  -- Quoting starts only after at least one supplier has actually been invited.
  IF v_rfq.status = 'DRAFT' AND v_total > 0 THEN
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
    v_quoting_opened := true;
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
      'network', v_network,
      'outcome', v_outcome,
      'google_places_invited', v_pin_cov,
      'otp_registered_invited', v_otp_invited,
      'pin_coverage_dropped', v_pin_dropped,
      'pin_coverage_scope_key', v_scope_key,
      'quoting_opened', v_quoting_opened
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'outcome', v_outcome,
    'invited', v_invited,
    'evaluated', v_evaluated,
    'google_places_invited', v_pin_cov,
    'otp_registered_invited', v_otp_invited,
    'pin_coverage_invited', v_pin_cov,
    'pin_coverage_dropped', v_pin_dropped,
    'total', v_total,
    'coverage_status', v_coverage_status,
    'quoting_opened', v_quoting_opened,
    'quotes_result', v_quotes_res
  );
END;
$$;

REVOKE ALL ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[], text) TO authenticated, anon, service_role;

COMMIT;
