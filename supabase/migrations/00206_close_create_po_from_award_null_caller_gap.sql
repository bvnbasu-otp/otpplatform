-- Migration 00206: Close the null-auth.uid() bypass branch in
-- create_purchase_order_from_award
--
-- D-04 (residual part only). create_purchase_order_from_award (00196:751-877)
-- only ran its buying-organization membership check when
-- "auth.uid() IS NOT NULL", so a caller with no user JWT (e.g. the anon key,
-- which the function is still GRANTed EXECUTE on at 00196:880) skipped the
-- check entirely and reached every subsequent step. This residual gap is the
-- part of D-04 still owed after the P0 hotfix's separate, unmerged blanket
-- anon-EXECUTE revoke: the internal logic branch itself was never rewritten.
-- The check now applies unconditionally: service_role, platform admins and
-- members of the RFQ's buying organization pass; every other caller,
-- including anon (auth.uid() IS NULL), is rejected. The function is still
-- called from inside lock_and_reveal_award_atomic in the same session as the
-- already-authorized buyer/admin/service_role caller, so that path is
-- unaffected by this change.
--
-- Idempotent and non-destructive: CREATE OR REPLACE FUNCTION only; no table,
-- column, row or grant is dropped or changed.

BEGIN;

CREATE OR REPLACE FUNCTION public.create_purchase_order_from_award(p_award_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_award           awards%ROWTYPE;
  v_rfq             rfqs%ROWTYPE;
  v_quote           quotes%ROWTYPE;
  v_supplier        suppliers%ROWTYPE;
  v_version         quote_versions%ROWTYPE;
  v_existing_po     purchase_orders%ROWTYPE;
  v_po_id           uuid;
  v_po_number       text;
  v_total           numeric;
  v_currency        text;
  v_pending_stages  integer := 0;
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

  -- D-04: unconditional caller check (previously skipped for auth.uid() IS
  -- NULL callers, e.g. anon).
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR private.is_org_member(v_rfq.organization_id)
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Fail-Closed multi-tier approval verification on PO creation
  SELECT COUNT(*) INTO v_pending_stages
  FROM public.rfq_approval_stages
  WHERE rfq_id = v_rfq.id AND status != 'APPROVED';

  IF v_pending_stages > 0 THEN
    RAISE EXCEPTION 'Cannot create Purchase Order: Required approval tier(s) are pending satisfaction.';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awarded quote not found';
  END IF;

  -- Fail-Closed Supplier Truthful Verification Gate
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state <> 'VERIFIED' OR v_supplier.verification_status <> 'VERIFIED' THEN
    RAISE EXCEPTION 'Cannot create Purchase Order: Supplier must complete onboarding and verification before PO creation.';
  END IF;

  SELECT * INTO v_existing_po FROM purchase_orders WHERE award_id = p_award_id;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM work_orders WHERE purchase_order_id = v_existing_po.id) THEN
      INSERT INTO work_orders (
        purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
      ) VALUES (
        v_existing_po.id, v_existing_po.supplier_id, 'NOT_STARTED', 'Work order - ' || v_existing_po.po_number, 0, now(), now()
      );
    END IF;
    RETURN jsonb_build_object('po_id', v_existing_po.id, 'po_number', v_existing_po.po_number);
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
    taxable_total,
    cgst_total,
    sgst_total,
    utgst_total,
    igst_total,
    tax_snapshot,
    delivery_address_snapshot,
    billing_address_snapshot,
    issued_at,
    created_at,
    updated_at
  ) VALUES (
    p_award_id,
    v_rfq.id,
    v_rfq.organization_id,
    v_quote.supplier_id,
    v_po_number,
    'ISSUED'::public.purchase_order_status,
    v_total,
    v_currency,
    v_total,
    0, 0, 0, 0,
    v_version.snapshot,
    v_rfq.delivery_address_snapshot,
    v_rfq.billing_address_snapshot,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_po_id;

  INSERT INTO work_orders (
    purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
  ) VALUES (
    v_po_id, v_quote.supplier_id, 'NOT_STARTED', 'Work order - ' || v_po_number, 0, now(), now()
  );

  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number);
END;
$$;

-- Grant unchanged from 00196 (authenticated, anon, service_role): the
-- anon-EXECUTE revoke sweep is tracked separately (P0 hotfix, unmerged).
-- This migration only closes the internal null-caller logic gap.
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_award(uuid) TO authenticated, anon, service_role;

COMMIT;
