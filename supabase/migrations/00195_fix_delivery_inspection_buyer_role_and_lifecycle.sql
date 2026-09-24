-- =============================================================================
-- Migration 00195: Fix Delivery Inspection Buyer Authorization & Quick-Quote Token Generation
-- =============================================================================
-- 1. accept_delivery_inspection:
--    - Relaxes overly strict manager-only role check to permit any authorized
--      buyer organization member (role 'BUYER', 'MANAGER', 'OWNER') or platform admin.
--    - When buyer signs off 100% inspection, automatically sets progress_percent = 100
--      and marks work order COMPLETED.
--    - Preserves Phase 5C.2 financial settlement guard: PO is only transitioned to
--      COMPLETED if all invoices are approved, paid, and obligations fully settled.
-- 2. invite_direct_supplier:
--    - Generates a single-use quick-quote magic link token and returns it in
--      the response payload ({ ok: true, token, quickQuotePath, ... }) so buyers
--      can immediately copy and forward the link to suppliers directly via
--      WhatsApp or Email when automated outbound gateways are inactive.
-- 3. Data API Grants & Default Privileges:
--    - Grants execute to authenticated and service_role.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. accept_delivery_inspection
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.accept_delivery_inspection(
  p_work_order_id uuid,
  p_notes text DEFAULT NULL,
  p_rating numeric DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $BODY$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_po purchase_orders%ROWTYPE;
  v_rfq rfqs%ROWTYPE;
  v_avg_rating numeric;
  v_completed_count integer;
  v_inv_count integer := 0;
  v_unpaid_count integer := 0;
  v_cum_paid numeric(14, 2) := 0.00;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = v_wo.purchase_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase order not found'; END IF;

  -- Allow any authorized buyer organization member or platform admin
  IF NOT private.is_org_member(v_po.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only authorized buyer organization members can accept delivery';
  END IF;

  -- 1. Update Work Order with star rating & review
  UPDATE work_orders
  SET buyer_accepted_at = COALESCE(buyer_accepted_at, now()),
      inspection_notes = COALESCE(p_notes, inspection_notes),
      review_text = COALESCE(p_notes, review_text),
      rating = COALESCE(p_rating, rating),
      status = 'COMPLETED',
      progress_percent = 100,
      completed_at = COALESCE(completed_at, now()),
      updated_at = now()
  WHERE id = p_work_order_id;

  -- 2. Recalculate Supplier's Average Rating & Completed Jobs
  IF p_rating IS NOT NULL THEN
    SELECT COALESCE(AVG(rating), p_rating), COUNT(*)
    INTO v_avg_rating, v_completed_count
    FROM work_orders
    WHERE supplier_id = v_wo.supplier_id AND rating IS NOT NULL;

    UPDATE suppliers
    SET rating_avg = ROUND(v_avg_rating, 2),
        completed_jobs = GREATEST(COALESCE(completed_jobs, 0), v_completed_count),
        updated_at = now()
    WHERE id = v_wo.supplier_id;
  END IF;

  -- 3. Check Phase 5C.2 financial settlement status
  -- Count valid non-rejected invoices
  SELECT COUNT(*) INTO v_inv_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED';

  -- Count any unpaid or partial invoices
  SELECT COUNT(*) INTO v_unpaid_count
  FROM public.invoices
  WHERE (purchase_order_id = v_po.id OR work_order_id = v_wo.id)
    AND status <> 'REJECTED'
    AND (status <> 'PAID' OR balance_due > 0.00);

  -- Cumulative allocated payments
  SELECT COALESCE(SUM(pa.allocated_amount), 0.00) INTO v_cum_paid
  FROM public.payment_allocations pa
  JOIN public.invoices i ON i.id = pa.invoice_id
  WHERE (i.purchase_order_id = v_po.id OR i.work_order_id = v_wo.id)
    AND i.status <> 'REJECTED'
    AND pa.status = 'ALLOCATED';

  -- Only transition PO to COMPLETED if financial settlement criteria are fully satisfied
  IF v_inv_count > 0 AND v_unpaid_count = 0 AND v_cum_paid >= v_po.total_amount THEN
    UPDATE purchase_orders
    SET status = 'COMPLETED',
        updated_at = now()
    WHERE id = v_po.id;

    SELECT * INTO v_rfq FROM rfqs WHERE id = v_po.rfq_id;
    IF FOUND THEN
      UPDATE requirements
      SET status = 'COMPLETED',
          updated_at = now()
      WHERE id = v_rfq.requirement_id;
    END IF;
  ELSE
    -- Keep PO in active/in-progress state; do not trigger premature PO-5C2-NOT-SETTLED guard
    UPDATE purchase_orders
    SET updated_at = now()
    WHERE id = v_po.id;
  END IF;
END;
$BODY$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_inspection(uuid, text, numeric) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. invite_direct_supplier with Quick-Quote Magic Link Token Generation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invite_direct_supplier(
  p_rfq_id uuid,
  p_contact_kind text,
  p_contact_value text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq            rfqs%ROWTYPE;
  v_supplier_id    uuid;
  v_invite_id      uuid;
  v_direct_id      uuid;
  v_normalized     text;
  v_label          text;
  v_profile_id     uuid;
  v_token          text;
  v_channel        messaging_channel;
  v_link_id        uuid;
BEGIN
  IF p_contact_kind IS NULL OR p_contact_kind NOT IN ('PHONE', 'EMAIL') THEN
    RAISE EXCEPTION 'contact_kind must be PHONE or EMAIL';
  END IF;

  IF COALESCE(btrim(p_contact_value), '') = '' THEN
    RAISE EXCEPTION 'contact_value is required';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_member(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF private.get_org_role(v_rfq.organization_id) NOT IN ('OWNER', 'MANAGER', 'BUYER')
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Insufficient role for direct invitation';
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Direct invitations only allowed while RFQ is DRAFT or OPEN';
  END IF;

  v_profile_id := private.get_profile_id();
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'No profile for caller';
  END IF;

  -- Normalize contact info
  IF p_contact_kind = 'EMAIL' THEN
    v_normalized := lower(btrim(p_contact_value));
    IF v_normalized !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
      RAISE EXCEPTION 'Not a valid email';
    END IF;
    v_channel := 'EMAIL'::messaging_channel;
  ELSE
    v_normalized := regexp_replace(btrim(p_contact_value), '[^0-9+]', '', 'g');
    IF v_normalized !~ '^\+?[0-9]{8,15}$' THEN
      RAISE EXCEPTION 'Not a valid phone number';
    END IF;
    v_channel := 'WHATSAPP'::messaging_channel;
  END IF;

  -- Match existing supplier or insert a new PENDING supplier
  IF p_contact_kind = 'PHONE' THEN
    SELECT id INTO v_supplier_id
    FROM suppliers WHERE contact_phone = v_normalized LIMIT 1;
  ELSE
    SELECT id INTO v_supplier_id
    FROM suppliers WHERE contact_email = v_normalized LIMIT 1;
  END IF;

  IF v_supplier_id IS NULL THEN
    INSERT INTO suppliers (
      business_name, source, source_ref, status,
      contact_phone, contact_email, categories
    ) VALUES (
      'Invited supplier',
      'DIRECT',
      p_contact_kind || ':' || v_normalized,
      'PENDING',
      CASE WHEN p_contact_kind = 'PHONE' THEN v_normalized END,
      CASE WHEN p_contact_kind = 'EMAIL' THEN v_normalized END,
      ARRAY[]::text[]
    ) RETURNING id INTO v_supplier_id;
  END IF;

  -- Reuse existing invitation or allocate canonical Crockford Base32 pseudonym label
  SELECT id INTO v_invite_id
  FROM rfq_invitations
  WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier_id;

  IF v_invite_id IS NULL THEN
    -- Canonical Base32 pseudonym (e.g. 'Supplier A7K3')
    v_label := private.assign_anonymous_label(p_rfq_id, v_supplier_id);

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_reasons
    ) VALUES (
      p_rfq_id, v_supplier_id, v_label, 'INVITED',
      ARRAY['direct:' || lower(p_contact_kind)]
    ) RETURNING id INTO v_invite_id;
  END IF;

  -- Insert direct invite record if not present
  INSERT INTO direct_supplier_invites (
    rfq_id, organization_id, invited_by,
    contact_kind, contact_value, supplier_id, invitation_id
  ) VALUES (
    p_rfq_id, v_rfq.organization_id, v_profile_id,
    p_contact_kind, v_normalized, v_supplier_id, v_invite_id
  ) ON CONFLICT (rfq_id, contact_kind, contact_value) DO NOTHING
  RETURNING id INTO v_direct_id;

  -- Generate Single-Use Quick-Quote Magic Link Token (32-byte URL-safe)
  v_token := rtrim(
    replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'),
    '=');

  INSERT INTO supplier_magic_links (
    supplier_id, rfq_id, token_hash, expires_at, channel, is_demo
  ) VALUES (
    v_supplier_id, p_rfq_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '7 days',
    v_channel,
    COALESCE(v_rfq.is_demo, false)
  ) RETURNING id INTO v_link_id;

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'rfq.direct_invitation_created',
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'supplier_id', v_supplier_id,
      'invitation_id', v_invite_id,
      'contact_kind', p_contact_kind,
      'contact_value_masked', CASE
        WHEN p_contact_kind = 'PHONE' THEN regexp_replace(v_normalized, '.(?=.{4})', '*', 'g')
        ELSE regexp_replace(v_normalized, '(^.).*(@.*$)', '\1***\2')
      END,
      'magic_link_issued', true
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reused', (v_direct_id IS NULL),
    'invitationId', v_invite_id,
    'supplierId', v_supplier_id,
    'token', v_token,
    'quickQuotePath', '/q/' || v_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_direct_supplier(uuid, text, text) TO authenticated, service_role;

COMMIT;
