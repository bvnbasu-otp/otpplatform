CREATE OR REPLACE FUNCTION public.create_purchase_order_from_award(p_award_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_award       awards%ROWTYPE;
  v_rfq         rfqs%ROWTYPE;
  v_quote       quotes%ROWTYPE;
  v_version     quote_versions%ROWTYPE;
  v_existing_po purchase_orders%ROWTYPE;
  v_po_id       uuid;
  v_po_number   text;
  v_total       numeric;
  v_currency    text;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  IF v_award.status <> 'REVEALED' THEN
    RAISE EXCEPTION 'Award must be REVEALED before creating a Purchase Order';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_award.rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT * INTO v_existing_po FROM purchase_orders WHERE award_id = p_award_id;
  IF FOUND THEN
    -- Ensure work order exists
    IF NOT EXISTS (SELECT 1 FROM work_orders WHERE purchase_order_id = v_existing_po.id) THEN
      INSERT INTO work_orders (
        purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
      ) VALUES (
        v_existing_po.id, v_existing_po.supplier_id, 'NOT_STARTED', 'Work order — ' || v_existing_po.po_number, 0, now(), now()
      );
    END IF;
    RETURN jsonb_build_object('po_id', v_existing_po.id, 'po_number', v_existing_po.po_number);
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awarded quote not found';
  END IF;

  SELECT * INTO v_version
  FROM quote_versions
  WHERE quote_id = v_quote.id AND version = v_quote.current_version;

  v_total := COALESCE((v_version.snapshot->>'totalCost')::numeric, (v_version.snapshot->>'basePrice')::numeric, 0);
  v_currency := COALESCE(v_version.snapshot->>'currency', 'INR');
  v_po_number := 'PO-' || to_char(now(), 'YYYY-MM-DD') || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  INSERT INTO purchase_orders (
    award_id,
    rfq_id,
    organization_id,
    supplier_id,
    po_number,
    status,
    total_amount,
    currency,
    issued_at,
    created_at,
    updated_at
  ) VALUES (
    v_award.id,
    v_award.rfq_id,
    v_rfq.organization_id,
    v_quote.supplier_id,
    v_po_number,
    'ISSUED',
    v_total,
    v_currency,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_po_id;

  -- Auto-create work order record for execution tracking
  INSERT INTO work_orders (
    purchase_order_id,
    supplier_id,
    status,
    title,
    progress_percent,
    created_at,
    updated_at
  ) VALUES (
    v_po_id,
    v_quote.supplier_id,
    'NOT_STARTED',
    'Work order — ' || v_po_number,
    0,
    now(),
    now()
  );

  INSERT INTO audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'purchase_order.created',
    private.get_profile_id(),
    v_rfq.organization_id,
    'purchase_order',
    v_po_id::text,
    jsonb_build_object('po_number', v_po_number, 'amount', v_total, 'currency', v_currency)
  );

  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number);
END;
$$;
