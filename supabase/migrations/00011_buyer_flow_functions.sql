-- Buyer-initiated discovery, performance review, and RLS fixes for MVP flows.

-- ---------------------------------------------------------------------------
-- Discovery — managers/buyers invite suppliers without reading supplier table
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_req requirements%ROWTYPE;
  v_category text;
  v_hp numeric;
  v_invited int := 0;
  v_existing int;
  v_supplier record;
  v_label text;
  v_score numeric;
  v_reasons text[];
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF private.get_org_role(v_rfq.organization_id) NOT IN ('OWNER', 'MANAGER', 'BUYER')
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Insufficient role for discovery';
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Discovery only allowed while RFQ is DRAFT or OPEN';
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;

  v_category := COALESCE(
    v_req.structured_specs->>'category',
    v_req.structured_specs->'attributes'->>'service',
    'General'
  );
  v_hp := COALESCE(
    NULLIF(v_req.structured_specs->>'motorCapacityHp', '')::numeric,
    NULLIF(v_req.structured_specs->'attributes'->>'hp', '')::numeric,
    0
  );

  SELECT count(*)::int INTO v_existing FROM rfq_invitations WHERE rfq_id = p_rfq_id;

  FOR v_supplier IN
    SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories
    FROM suppliers s
    WHERE s.status = 'ACTIVE'
      AND (
        v_category = 'General'
        OR v_category = ANY (s.categories)
        OR EXISTS (
          SELECT 1
          FROM unnest(s.categories) AS cat
          WHERE v_req.title ILIKE '%' || cat || '%'
        )
      )
    ORDER BY s.rating_avg DESC NULLS LAST
    LIMIT 10
  LOOP
    IF EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier.id
    ) THEN
      CONTINUE;
    END IF;

    IF v_hp > 0 AND COALESCE((v_supplier.capabilities->>'maxHp')::numeric, 0) < v_hp THEN
      CONTINUE;
    END IF;

    v_label := 'Supplier ' || chr(65 + v_existing + v_invited);
    v_score := LEAST(100, 70 + COALESCE(v_supplier.rating_avg, 3) * 10);
    v_reasons := ARRAY[
      'category:' || v_category,
      'source:' || v_supplier.source::text
    ];

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
    ) VALUES (
      p_rfq_id, v_supplier.id, v_label, 'INVITED', v_score, v_reasons
    );

    v_invited := v_invited + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'invited', v_invited,
    'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Buyer performance review — gated on WO complete + payment verified
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_buyer_performance_review(
  p_rfq_id uuid,
  p_quality_rating numeric,
  p_actual_delivery_days integer,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_award awards%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_snapshot jsonb;
  v_quoted_total numeric;
  v_quoted_days int;
  v_po purchase_orders%ROWTYPE;
  v_wo work_orders%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_record_id uuid;
  v_variance jsonb;
BEGIN
  IF p_quality_rating < 1 OR p_quality_rating > 5 THEN
    RAISE EXCEPTION 'Quality rating must be between 1 and 5';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Only managers can submit performance reviews';
  END IF;

  IF EXISTS (
    SELECT 1 FROM procurement_performance_records WHERE rfq_id = p_rfq_id
  ) THEN
    RAISE EXCEPTION 'Performance review already recorded for this RFQ';
  END IF;

  SELECT * INTO v_award FROM awards WHERE rfq_id = p_rfq_id AND status = 'REVEALED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award must be revealed before submitting a review';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awarded quote not found';
  END IF;

  SELECT qv.snapshot INTO v_snapshot
  FROM quote_versions qv
  WHERE qv.quote_id = v_quote.id AND qv.version = v_quote.current_version;

  v_quoted_total := COALESCE((v_snapshot->>'totalCost')::numeric, 0);
  v_quoted_days := COALESCE((v_snapshot->>'deliveryDays')::int, 0);

  SELECT * INTO v_po
  FROM purchase_orders
  WHERE rfq_id = p_rfq_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order required before review';
  END IF;

  SELECT * INTO v_wo FROM work_orders WHERE purchase_order_id = v_po.id;
  IF NOT FOUND OR v_wo.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Work order must be completed before review';
  END IF;

  SELECT p.* INTO v_payment
  FROM payments p
  JOIN invoices i ON i.id = p.invoice_id
  WHERE i.work_order_id = v_wo.id
    AND p.status = 'VERIFIED'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Verified payment required before review';
  END IF;

  v_variance := jsonb_build_object(
    'deliveryDeltaDays', p_actual_delivery_days - v_quoted_days,
    'notes', p_notes
  );

  INSERT INTO procurement_performance_records (
    supplier_id,
    rfq_id,
    organization_id,
    quoted_total,
    actual_total,
    quoted_delivery_days,
    actual_delivery_days,
    quality_rating,
    variance
  ) VALUES (
    v_quote.supplier_id,
    p_rfq_id,
    v_rfq.organization_id,
    v_quoted_total,
    v_quoted_total,
    v_quoted_days,
    p_actual_delivery_days,
    p_quality_rating,
    v_variance
  )
  RETURNING id INTO v_record_id;

  UPDATE requirements
  SET status = 'COMPLETED', updated_at = now()
  WHERE id = v_rfq.requirement_id
    AND status <> 'COMPLETED';

  RETURN v_record_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_buyer_performance_review(uuid, numeric, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Allow org managers to insert performance records (RPC remains primary path)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS performance_insert ON procurement_performance_records;

CREATE POLICY performance_insert ON procurement_performance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_org_manager_or_above(organization_id)
    OR private.is_platform_admin()
  );
