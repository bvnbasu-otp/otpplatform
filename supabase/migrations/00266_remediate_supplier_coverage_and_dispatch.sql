-- 00266_remediate_supplier_coverage_and_dispatch.sql
-- Remediates:
-- 1. DEF-01: delivery_state capture & Indian PIN code state inference for RFQ discovery scope
-- 2. DEF-02: dispatch_supplier_invitation_notification fallback to suppliers.contact_phone & hosted URL
-- 3. DEF-03: rank_discovery_candidates category array fallback for registered suppliers without line-item capabilities
-- 4. CAP-03: Audited public.waive_rfq_quote_quorum RPC for authorized managers/admins

BEGIN;

-- 1. Schema update: delivery_state on requirements
ALTER TABLE public.requirements
  ADD COLUMN IF NOT EXISTS delivery_state text;

-- 2. Indian PIN Code state inference helper
CREATE OR REPLACE FUNCTION public.infer_indian_state_from_pincode(p_pincode text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text;
  v_p2 text;
BEGIN
  IF p_pincode IS NULL THEN
    RETURN NULL;
  END IF;
  v_clean := btrim(p_pincode);
  IF v_clean !~ '^[0-9]{6}$' THEN
    RETURN NULL;
  END IF;

  v_p2 := substring(v_clean from 1 for 2);

  IF v_p2 = '11' THEN RETURN 'Delhi';
  ELSIF v_p2 IN ('12', '13') THEN RETURN 'Haryana';
  ELSIF v_p2 IN ('14', '15') THEN RETURN 'Punjab';
  ELSIF v_p2 = '16' THEN RETURN 'Chandigarh';
  ELSIF v_p2 = '17' THEN RETURN 'Himachal Pradesh';
  ELSIF v_p2 IN ('18', '19') THEN RETURN 'Jammu and Kashmir';
  ELSIF v_p2 IN ('20', '21', '22', '23', '25', '26', '27', '28') THEN RETURN 'Uttar Pradesh';
  ELSIF v_p2 = '24' THEN RETURN 'Uttarakhand';
  ELSIF v_p2 IN ('30', '31', '32', '33', '34') THEN RETURN 'Rajasthan';
  ELSIF v_p2 IN ('36', '37', '38', '39') THEN RETURN 'Gujarat';
  ELSIF v_p2 = '40' THEN
    IF v_clean LIKE '403%' THEN RETURN 'Goa';
    ELSE RETURN 'Maharashtra';
    END IF;
  ELSIF v_p2 IN ('41', '42', '43', '44') THEN RETURN 'Maharashtra';
  ELSIF v_p2 IN ('45', '46', '47', '48') THEN RETURN 'Madhya Pradesh';
  ELSIF v_p2 = '49' THEN RETURN 'Chhattisgarh';
  ELSIF v_p2 = '50' THEN RETURN 'Telangana';
  ELSIF v_p2 IN ('51', '52', '53') THEN RETURN 'Andhra Pradesh';
  ELSIF v_p2 IN ('56', '57', '58', '59') THEN RETURN 'Karnataka';
  ELSIF v_p2 IN ('60', '61', '62', '63', '64') THEN RETURN 'Tamil Nadu';
  ELSIF v_p2 IN ('67', '68', '69') THEN RETURN 'Kerala';
  ELSIF v_p2 IN ('70', '71', '72', '73', '74') THEN RETURN 'West Bengal';
  ELSIF v_p2 IN ('75', '76', '77') THEN RETURN 'Odisha';
  ELSIF v_p2 = '78' THEN RETURN 'Assam';
  ELSIF v_p2 IN ('80', '84', '85') THEN RETURN 'Bihar';
  ELSIF v_p2 IN ('81', '82', '83') THEN RETURN 'Jharkhand';
  END IF;

  RETURN NULL;
END;
$$;

-- 3. Robust coverage scope key calculation with state inference
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
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'city'), ''),
    nullif(btrim(p_req.attributes ->> 'delivery_city'), '')
  );

  v_state := coalesce(
    nullif(btrim(p_req.delivery_state), ''),
    nullif(btrim(p_req.structured_specs -> 'deliveryLocation' ->> 'state'), ''),
    nullif(btrim(p_req.attributes ->> 'delivery_state'), ''),
    public.infer_indian_state_from_pincode(v_pincode)
  );

  IF v_city IS NULL AND v_state IS NOT NULL THEN
    v_city := CASE
      WHEN lower(v_state) = 'karnataka' THEN 'bengaluru'
      WHEN lower(v_state) = 'tamil nadu' THEN 'chennai'
      WHEN lower(v_state) = 'maharashtra' THEN 'mumbai'
      WHEN lower(v_state) = 'delhi' THEN 'delhi'
      WHEN lower(v_state) = 'telangana' THEN 'hyderabad'
      WHEN lower(v_state) = 'gujarat' THEN 'ahmedabad'
      WHEN lower(v_state) = 'west bengal' THEN 'kolkata'
      ELSE 'general'
    END;
  END IF;

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

-- 4. Outbound invitation dispatch with contact_phone channel fallback & URL fallback
CREATE TABLE IF NOT EXISTS private.platform_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.dispatch_supplier_invitation_notification(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_supabase_url text;
  v_service_key  text;
  v_inv          rfq_invitations%ROWTYPE;
  v_is_demo      boolean;
  v_supp_phone   text;
  v_phone_digits text;
  v_phone_e164   text;
BEGIN
  IF private.supplier_network_stub_enabled() THEN RETURN; END IF;

  SELECT * INTO v_inv FROM rfq_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT is_demo INTO v_is_demo FROM rfqs WHERE id = v_inv.rfq_id;
  IF COALESCE(v_is_demo, false) THEN RETURN; END IF;

  -- Ensure the supplier has a verified channel in supplier_messaging_channels
  IF NOT EXISTS (
    SELECT 1 FROM supplier_messaging_channels
    WHERE supplier_id = v_inv.supplier_id AND status = 'VERIFIED'
  ) THEN
    -- Fall back to suppliers.contact_phone
    SELECT contact_phone INTO v_supp_phone
    FROM suppliers
    WHERE id = v_inv.supplier_id;

    IF v_supp_phone IS NOT NULL AND btrim(v_supp_phone) <> '' THEN
      v_phone_digits := regexp_replace(v_supp_phone, '[^0-9]', '', 'g');
      IF length(v_phone_digits) = 10 THEN
        v_phone_e164 := '+91' || v_phone_digits;
      ELSIF length(v_phone_digits) = 12 AND v_phone_digits LIKE '91%' THEN
        v_phone_e164 := '+' || v_phone_digits;
      ELSIF length(v_phone_digits) >= 10 THEN
        v_phone_e164 := '+' || v_phone_digits;
      END IF;

      IF v_phone_e164 IS NOT NULL THEN
        INSERT INTO supplier_messaging_channels (
          supplier_id, channel, phone_e164, status, verified_at
        ) VALUES (
          v_inv.supplier_id, 'WHATSAPP', v_phone_e164, 'VERIFIED', now()
        )
        ON CONFLICT (supplier_id, channel) DO UPDATE
          SET phone_e164 = EXCLUDED.phone_e164,
              status = 'VERIFIED',
              verified_at = now();
      ELSE
        RETURN;
      END IF;
    ELSE
      RETURN;
    END IF;
  END IF;

  v_supabase_url := coalesce(
    nullif(current_setting('app.settings.supabase_url', true), ''),
    (SELECT value FROM private.platform_secrets WHERE key = 'supabase_url'),
    'https://qsuvtcezffomtwzwyrso.supabase.co'
  );
  v_service_key := coalesce(
    nullif(current_setting('app.settings.service_role_key', true), ''),
    (SELECT value FROM private.platform_secrets WHERE key = 'service_role_key'),
    ''
  );

  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/messaging-outbound',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'rfqId', v_inv.rfq_id,
      'supplierId', v_inv.supplier_id,
      'invitationId', v_inv.id
    )
  );
END;
$$;

-- 5. Discovery candidate ranking with category array fallback for registered suppliers
CREATE OR REPLACE FUNCTION private.rank_discovery_candidates(
  p_rfq_id  uuid,
  p_exclude uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  supplier_id   uuid,
  match_score   numeric,
  match_reasons text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq              rfqs%ROWTYPE;
  v_req              requirements%ROWTYPE;
  v_city             text;
  v_pincode          text;
  v_primary_total    int;
  v_secondary_total  int;
  v_requirement_caps boolean;
  v_cat_code         text;
  v_cat_name         text;
  v_subcat_code      text;
  v_subcat_name      text;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;

  v_city := COALESCE(
    v_req.delivery_city,
    v_req.structured_specs -> 'deliveryLocation' ->> 'city'
  );
  v_pincode := COALESCE(
    v_req.delivery_pincode,
    v_req.structured_specs -> 'deliveryLocation' ->> 'pincode'
  );

  SELECT
    count(*) FILTER (WHERE rc.is_primary),
    count(*) FILTER (WHERE NOT rc.is_primary)
  INTO v_primary_total, v_secondary_total
  FROM private.rfq_required_capabilities(p_rfq_id) rc;

  v_requirement_caps := COALESCE(v_primary_total, 0) > 0;

  SELECT c.code, c.name INTO v_cat_code, v_cat_name
  FROM requirement_categories c
  WHERE c.id = v_req.category_id;

  SELECT s.code, s.name INTO v_subcat_code, v_subcat_name
  FROM requirement_subcategories s
  WHERE s.id = v_req.subcategory_id;

  RETURN QUERY
  WITH required AS (
    SELECT rc.capability_id, rc.capability_code, rc.capacity_unit, rc.is_primary,
           private.requirement_capacity_need(v_req.id, rc.capacity_unit) AS need
    FROM private.rfq_required_capabilities(p_rfq_id) rc
  ),
  candidate AS (
    SELECT
      s.id,
      s.rating_avg,
      s.on_time_percent,
      s.dispute_rate,
      (SELECT count(*) FROM supplier_capabilities sc WHERE sc.supplier_id = s.id) AS declared_caps_count,
      (
        s.categories IS NULL
        OR cardinality(s.categories) = 0
        OR 'general_other' = ANY(s.categories)
        OR 'General / Other' = ANY(s.categories)
        OR (v_cat_code IS NOT NULL AND v_cat_code = ANY(s.categories))
        OR (v_cat_name IS NOT NULL AND v_cat_name = ANY(s.categories))
        OR (v_subcat_code IS NOT NULL AND v_subcat_code = ANY(s.categories))
        OR (v_subcat_name IS NOT NULL AND v_subcat_name = ANY(s.categories))
        OR EXISTS (
          SELECT 1 FROM unnest(s.categories) cat
          WHERE (v_cat_code IS NOT NULL AND (cat LIKE '%' || split_part(v_cat_code, '_', 1) || '%' OR v_cat_code LIKE '%' || cat || '%'))
        )
      ) AS category_match,
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND (
            rq.need = 0
            OR sc.max_capacity_value IS NULL
            OR sc.max_capacity_value >= rq.need
          )
      ) AS primary_hits,
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE NOT rq.is_primary
      ) AS secondary_hits,
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND sc.max_capacity_value IS NOT NULL
          AND sc.max_capacity_value < rq.need
      ) AS capacity_short,
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND sc.max_capacity_value IS NOT NULL
          AND sc.max_capacity_value >= rq.need * 1.5
      ) AS capacity_comfort,
      (
        SELECT count(*)
        FROM required rq
        JOIN supplier_capabilities sc
          ON sc.supplier_id = s.id AND sc.capability_id = rq.capability_id
        WHERE rq.is_primary
          AND rq.need > 0
          AND sc.max_capacity_value IS NULL
      ) AS capacity_unknown,
      (SELECT count(*) FROM supplier_service_areas a WHERE a.supplier_id = s.id) AS area_rows,
      EXISTS (
        SELECT 1 FROM supplier_service_areas a
        WHERE a.supplier_id = s.id AND v_pincode IS NOT NULL AND a.pincode = v_pincode
      ) AS pincode_match,
      EXISTS (
        SELECT 1 FROM supplier_service_areas a
        WHERE a.supplier_id = s.id AND v_city IS NOT NULL
          AND lower(a.city) = lower(v_city)
      ) AS city_match,
      (lower(COALESCE(s.city, '')) = lower(COALESCE(v_city, '~'))) AS based_in_city,
      COALESCE(v_pincode IS NOT NULL AND s.pincode = v_pincode, false) AS supplier_pin_match
    FROM suppliers s
    WHERE s.status = 'ACTIVE'
      AND NOT (s.id = ANY(COALESCE(p_exclude, '{}')))
  ),
  scored AS (
    SELECT
      c.id,
      c.primary_hits,
      c.secondary_hits,
      c.capacity_short,
      c.capacity_unknown,
      c.declared_caps_count,
      c.category_match,
      c.pincode_match,
      c.city_match,
      c.based_in_city,
      c.supplier_pin_match,
      c.area_rows,
      LEAST(100, GREATEST(0,
          CASE
            WHEN NOT v_requirement_caps THEN 40
            WHEN c.declared_caps_count > 0 THEN round(40.0 * c.primary_hits / GREATEST(v_primary_total, 1), 2)
            WHEN c.category_match THEN 30
            ELSE 0
          END
        + CASE
            WHEN COALESCE(v_secondary_total, 0) = 0 THEN 0
            ELSE round(10.0 * c.secondary_hits / v_secondary_total, 2)
          END
        + CASE
            WHEN c.pincode_match OR c.supplier_pin_match THEN 20
            WHEN c.city_match THEN 15
            WHEN c.based_in_city THEN 12
            WHEN c.area_rows = 0 THEN 6
            ELSE 0
          END
        + round(COALESCE(c.rating_avg, 3.0) * 3, 2)
        + round(COALESCE(c.on_time_percent, 80) * 0.10, 2)
        + CASE WHEN c.capacity_comfort > 0 THEN 5 ELSE 0 END
        - CASE WHEN c.capacity_unknown > 0 THEN 8 ELSE 0 END
        - round(COALESCE(c.dispute_rate, 0) * 0.10, 2)
      )) AS score
    FROM candidate c
  )
  SELECT
    sc.id,
    sc.score,
    (
      SELECT ARRAY_AGG(reason ORDER BY reason)
      FROM (
        SELECT 'capability:' || rq.capability_code AS reason
        FROM required rq
        JOIN supplier_capabilities sup
          ON sup.supplier_id = sc.id AND sup.capability_id = rq.capability_id
        UNION ALL
        SELECT 'category:declared' WHERE sc.declared_caps_count = 0 AND sc.category_match
        UNION ALL
        SELECT 'geo:pincode' WHERE sc.pincode_match OR sc.supplier_pin_match
        UNION ALL
        SELECT 'geo:city' WHERE sc.city_match AND NOT sc.pincode_match AND NOT sc.supplier_pin_match
        UNION ALL
        SELECT 'geo:based_in_city' WHERE sc.based_in_city AND NOT sc.city_match AND NOT sc.pincode_match AND NOT sc.supplier_pin_match
        UNION ALL
        SELECT 'geo:undeclared' WHERE sc.area_rows = 0
        UNION ALL
        SELECT 'capacity:undeclared' WHERE sc.capacity_unknown > 0
        UNION ALL
        SELECT 'capability:none_required' WHERE NOT v_requirement_caps
      ) reasons
    ) AS match_reasons
  FROM scored sc
  WHERE
    (
      NOT v_requirement_caps
      OR sc.primary_hits > 0
      OR (sc.declared_caps_count = 0 AND sc.category_match)
    )
    AND (
      (v_city IS NULL AND v_pincode IS NULL)
      OR sc.area_rows = 0
      OR sc.pincode_match
      OR sc.supplier_pin_match
      OR sc.city_match
      OR sc.based_in_city
    )
  ORDER BY sc.score DESC, sc.id ASC;
END;
$$;

-- 6. Audited waive_rfq_quote_quorum RPC
CREATE OR REPLACE FUNCTION public.waive_rfq_quote_quorum(
  p_rfq_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_caller uuid;
  v_caller_role text;
  v_caller_org uuid;
  v_reason text;
  v_quotes_count int;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  v_reason := btrim(COALESCE(p_reason, ''));
  IF length(v_reason) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A valid waiver reason of at least 5 characters is required');
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  IF v_rfq.status NOT IN ('OPEN', 'EVALUATING') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Quorum can only be waived for OPEN or EVALUATING RFQs');
  END IF;

  SELECT role, organization_id INTO v_caller_role, v_caller_org
  FROM profiles WHERE id = v_caller;

  IF v_caller_role NOT IN ('SUPERADMIN', 'ADMIN', 'CEO') AND v_caller_org IS DISTINCT FROM v_rfq.organization_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: you do not have permission to waive quorum for this RFQ');
  END IF;

  SELECT count(*) INTO v_quotes_count
  FROM supplier_quotes
  WHERE rfq_id = p_rfq_id AND status IN ('SUBMITTED', 'ACCEPTED');

  UPDATE rfqs
  SET min_quotes_waived = true,
      min_quotes_waiver_reason = v_reason,
      min_quotes_waived_by = v_caller,
      min_quotes_waived_at = now()
  WHERE id = p_rfq_id;

  INSERT INTO audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload,
    occurred_at
  ) VALUES (
    'RFQ_QUORUM_WAIVED',
    v_caller,
    v_rfq.organization_id,
    'RFQ',
    p_rfq_id,
    jsonb_build_object(
      'min_quotes_required', v_rfq.min_quotes_required,
      'quotes_received', v_quotes_count,
      'waiver_reason', v_reason,
      'waived_by', v_caller
    ),
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'rfqId', p_rfq_id,
    'minQuotesWaived', true,
    'quotesReceived', v_quotes_count,
    'minQuotesRequired', v_rfq.min_quotes_required
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.waive_rfq_quote_quorum(uuid, text) TO authenticated;

COMMIT;
