CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_req        requirements%ROWTYPE;
  v_cat_name   text;
  v_sub_name   text;
  v_hp         numeric;
  v_invited    int := 0;
  v_existing   int;
  v_supplier   record;
  v_label      text;
  v_score      numeric;
  v_reasons    text[];
  v_total      int;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;

  SELECT name INTO v_cat_name FROM requirement_categories WHERE id = v_req.category_id;
  SELECT name INTO v_sub_name FROM requirement_subcategories WHERE id = v_req.subcategory_id;

  v_hp := COALESCE(
    NULLIF(v_req.structured_specs->>'motorCapacityHp', '')::numeric,
    NULLIF(v_req.structured_specs->'attributes'->>'hp', '')::numeric,
    0
  );

  SELECT count(*)::int INTO v_existing FROM rfq_invitations WHERE rfq_id = p_rfq_id;

  -- 1. Pass 1: Targeted category & keyword matching
  FOR v_supplier IN
    SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories
    FROM suppliers s
    WHERE s.status = 'ACTIVE'
      AND (
        EXISTS (
          SELECT 1 FROM unnest(s.categories) cat
          WHERE cat ILIKE '%' || COALESCE(v_sub_name, '') || '%'
             OR cat ILIKE '%' || COALESCE(v_cat_name, '') || '%'
             OR v_req.title ILIKE '%' || cat || '%'
             OR COALESCE(v_req.description, '') ILIKE '%' || cat || '%'
        )
      )
    ORDER BY s.rating_avg DESC NULLS LAST
    LIMIT 6
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier.id
    ) THEN
      IF v_hp = 0 OR COALESCE((v_supplier.capabilities->>'maxHp')::numeric, 0) >= v_hp THEN
        v_label := 'Supplier ' || chr(65 + v_existing + v_invited);
        v_score := LEAST(100, 75 + COALESCE(v_supplier.rating_avg, 3.5) * 5);
        v_reasons := ARRAY[
          'category_match:' || COALESCE(v_cat_name, 'General'),
          'source:' || v_supplier.source::text
        ];

        INSERT INTO rfq_invitations (
          rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
        ) VALUES (
          p_rfq_id, v_supplier.id, v_label, 'INVITED', v_score, v_reasons
        );

        v_invited := v_invited + 1;
      END IF;
    END IF;
  END LOOP;

  -- 2. Pass 2: Fallback to ensure at least 4 active suppliers are invited
  SELECT count(*)::int INTO v_total FROM rfq_invitations WHERE rfq_id = p_rfq_id;
  IF v_total < 4 THEN
    FOR v_supplier IN
      SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST
      LIMIT (4 - v_total)
    LOOP
      v_label := 'Supplier ' || chr(65 + v_existing + v_invited);
      v_score := 75.0;
      v_reasons := ARRAY['open_network_discovery', 'source:' || v_supplier.source::text];

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id, v_supplier.id, v_label, 'INVITED', v_score, v_reasons
      );

      v_invited := v_invited + 1;
    END LOOP;
  END IF;

  -- Auto-open the RFQ and start Quoting immediately upon sending the enquiry
  UPDATE rfqs
  SET status = 'OPEN', updated_at = now()
  WHERE id = p_rfq_id AND status = 'DRAFT';

  UPDATE requirements
  SET status = 'QUOTING', updated_at = now()
  WHERE id = v_rfq.requirement_id AND status IN ('DRAFT', 'SUBMITTED', 'RFQ_CREATED', 'SOURCING');

  SELECT count(*)::int INTO v_total FROM rfq_invitations WHERE rfq_id = p_rfq_id;

  RETURN jsonb_build_object(
    'invited', v_invited,
    'total', v_total,
    'rfq_status', 'OPEN'
  );
END;
$$;
