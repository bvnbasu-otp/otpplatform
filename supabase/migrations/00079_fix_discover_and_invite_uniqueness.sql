-- 00079_fix_discover_and_invite_uniqueness.sql
-- Fix ambiguous function overload for discover_and_invite_for_rfq and ensure category/subcategory matching invites all 4 specialized suppliers.

BEGIN;

-- 1. Drop the ambiguous overloaded function
DROP FUNCTION IF EXISTS public.discover_and_invite_for_rfq(uuid, integer, uuid[]);
DROP FUNCTION IF EXISTS public.discover_and_invite_for_rfq(uuid);

-- 2. Create single, clean, robust discover_and_invite_for_rfq function
CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq record;
  v_req record;
  v_cat_code text;
  v_sub_code text;
  v_cat_name text;
  v_sub_name text;
  v_supplier record;
  v_invited integer := 0;
  v_existing integer := 0;
  v_label text;
  v_score numeric;
  v_reasons text[];
  v_hp numeric := 0;
  v_total integer := 0;
BEGIN
  -- Get RFQ and requirement
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RFQ not found');
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirement not found');
  END IF;

  -- Resolve category and subcategory codes & names
  SELECT code, name INTO v_cat_code, v_cat_name FROM requirement_categories WHERE id = v_req.category_id;
  SELECT code, name INTO v_sub_code, v_sub_name FROM requirement_subcategories WHERE id = v_req.subcategory_id;

  -- Extract HP if applicable
  IF v_req.attributes ? 'hp' THEN
    BEGIN
      v_hp := (v_req.attributes->>'hp')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_hp := 0;
    END;
  END IF;

  -- Count existing invitations
  SELECT count(*)::int INTO v_existing FROM rfq_invitations WHERE rfq_id = p_rfq_id;

  -- 1. Pass 1: Match suppliers by category, subcategory keywords, capability flags, or title/description
  FOR v_supplier IN
    SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories, s.business_name
    FROM suppliers s
    WHERE s.status = 'ACTIVE'
      AND (
        v_cat_code = ANY(s.categories)
        OR (v_cat_code IS NOT NULL AND s.categories::text ILIKE '%' || v_cat_code || '%')
        OR (v_sub_code IS NOT NULL AND (
             s.capabilities ? v_sub_code
             OR s.categories::text ILIKE '%' || v_sub_code || '%'
             OR s.capabilities::text ILIKE '%' || v_sub_code || '%'
           ))
        -- Domain-specific capability matching
        OR (v_req.title ILIKE '%chair%' AND (s.capabilities::text ILIKE '%chair%' OR s.capabilities::text ILIKE '%furniture%' OR s.business_name ILIKE '%furniture%' OR s.business_name ILIKE '%chair%'))
        OR (v_req.title ILIKE '%furniture%' AND (s.capabilities::text ILIKE '%furniture%' OR s.business_name ILIKE '%furniture%'))
        OR (v_req.title ILIKE '%solar%' AND (s.capabilities::text ILIKE '%solar%' OR s.business_name ILIKE '%solar%'))
        OR (v_req.title ILIKE '%cctv%' AND (s.capabilities::text ILIKE '%cctv%' OR s.business_name ILIKE '%cctv%' OR s.capabilities::text ILIKE '%camera%'))
        OR (v_req.title ILIKE '%water%' AND (s.capabilities::text ILIKE '%water%' OR s.business_name ILIKE '%water%' OR s.capabilities::text ILIKE '%ro%'))
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

  -- 3. Transition RFQ to OPEN if in DRAFT
  IF v_rfq.status = 'DRAFT' THEN
    UPDATE rfqs
    SET status = 'OPEN',
        quote_deadline = COALESCE(quote_deadline, now() + interval '5 days'),
        updated_at = now()
    WHERE id = p_rfq_id;

    UPDATE requirements
    SET status = 'QUOTING'::requirement_status,
        updated_at = now()
    WHERE id = v_rfq.requirement_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invited_count', v_invited,
    'total_invitations', v_existing + v_invited,
    'rfq_status', 'OPEN'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid) TO authenticated, anon, service_role;

-- 4. Automatically invite all matched suppliers for any existing RFQs
DO $$
DECLARE
  v_r record;
BEGIN
  FOR v_r IN SELECT id FROM rfqs LOOP
    PERFORM public.discover_and_invite_for_rfq(v_r.id);
  END LOOP;
END $$;

COMMIT;
