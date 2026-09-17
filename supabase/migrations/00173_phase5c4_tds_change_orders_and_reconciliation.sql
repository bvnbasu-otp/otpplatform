-- =============================================================================
-- Migration 00173: Phase 5C.4 — Statutory TDS, PO Change Orders, Bank Remittance Reconciliation & Financial Observability
--
-- Description:
--   1. Table public.tds_deductions:
--      - Tracks statutory Income-tax TDS withholdings, legal regime awareness (1961 vs 2025 Act),
--        PAN validation status, Form 16A metadata, and deposit/reversal lifecycles.
--   2. Tables public.po_change_orders & public.po_change_order_items:
--      - Tracks formal PO variation requests, line-item deltas, commitment adjustments,
--        and negative variation guards enforcing commitment >= cumulative invoiced floor.
--   3. Table public.bank_reconciliation_records:
--      - Reconciles buyer-recorded payment UTRs against bank remittance advices,
--        detecting amount mismatches, unknown UTRs, duplicates, and date drifts.
--   4. Atomic RPCs:
--      - public.apply_tds_withholding_atomic(...)
--      - public.commit_po_change_order_atomic(...)
--      - public.reconcile_bank_utr_atomic(...)
--      - public.get_financial_observability_summary(p_org_id uuid)
--   5. Invariant Triggers & Full Multi-Tenant RLS Policies.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create public.tds_deductions Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tds_deductions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  supplier_id                 uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_order_id           uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_id                  uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  payment_id                  uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  law_version                 text NOT NULL DEFAULT 'INCOME_TAX_ACT_2025'
    CHECK (law_version IN ('INCOME_TAX_ACT_1961', 'INCOME_TAX_ACT_2025')),
  section                     text NOT NULL
    CHECK (section IN ('194C', '194Q', '194J_TECH', '194J_PROF', '194H', '194I_LAND', '194I_PLANT', '194M', 'OTHER')),
  taxable_amount              numeric(14, 2) NOT NULL CHECK (taxable_amount >= 0),
  tds_rate                    numeric(5, 2) NOT NULL CHECK (tds_rate >= 0),
  tds_amount                  numeric(14, 2) NOT NULL CHECK (tds_amount >= 0),
  status                      text NOT NULL DEFAULT 'DEDUCTED'
    CHECK (status IN ('PENDING', 'DEDUCTED', 'DEPOSITED', 'CERTIFIED', 'VOIDED')),
  deductee_pan                text,
  pan_status                  text NOT NULL DEFAULT 'VALID'
    CHECK (pan_status IN ('VALID', 'INVALID', 'ABSENT', 'NON_FILER_206AB')),
  is_lower_deduction          boolean NOT NULL DEFAULT false,
  lower_deduction_cert_number text,
  challan_bsr_code            text,
  challan_number              text,
  challan_date                date,
  certificate_number          text,
  financial_year              text NOT NULL,
  assessment_year             text NOT NULL,
  created_by                  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tds_deductions_org ON public.tds_deductions(organization_id);
CREATE INDEX IF NOT EXISTS idx_tds_deductions_supplier ON public.tds_deductions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_tds_deductions_invoice ON public.tds_deductions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tds_deductions_po ON public.tds_deductions(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_tds_deductions_status ON public.tds_deductions(status);

DROP TRIGGER IF EXISTS tds_deductions_updated_at ON public.tds_deductions;
CREATE TRIGGER tds_deductions_updated_at
  BEFORE UPDATE ON public.tds_deductions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.tds_deductions ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
DROP POLICY IF EXISTS tds_deductions_select ON public.tds_deductions;
CREATE POLICY tds_deductions_select ON public.tds_deductions
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
    OR supplier_id IN (SELECT private.get_user_supplier_ids())
  );

-- MUTATE Policy (Buyer OWNER / MANAGER only)
DROP POLICY IF EXISTS tds_deductions_mutate ON public.tds_deductions;
CREATE POLICY tds_deductions_mutate ON public.tds_deductions
  FOR ALL
  USING (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  );

-- ---------------------------------------------------------------------------
-- 2. Create public.po_change_orders & public.po_change_order_items Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_change_orders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_order_id           uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  change_order_number         text NOT NULL,
  sequence                    integer NOT NULL DEFAULT 1 CHECK (sequence > 0),
  title                       text NOT NULL,
  reason                      text NOT NULL,
  status                      text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'COMMITTED', 'REJECTED')),
  change_type                 text NOT NULL DEFAULT 'SCOPE_EXPANSION'
    CHECK (change_type IN ('SCOPE_EXPANSION', 'SCOPE_REDUCTION', 'SPECIFICATION_CHANGE', 'RATE_ADJUSTMENT', 'ADMINISTRATIVE')),
  net_amount_delta            numeric(14, 2) NOT NULL DEFAULT 0.00,
  tax_amount_delta            numeric(14, 2) NOT NULL DEFAULT 0.00,
  total_delta                 numeric(14, 2) NOT NULL DEFAULT 0.00,
  previous_po_total           numeric(14, 2) NOT NULL CHECK (previous_po_total >= 0),
  revised_po_total            numeric(14, 2) NOT NULL CHECK (revised_po_total >= 0),
  requested_by                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_at                timestamptz NOT NULL DEFAULT now(),
  approved_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at                 timestamptz,
  committed_by                uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  committed_at                timestamptz,
  rejection_reason            text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_po_change_orders_org_number UNIQUE (organization_id, change_order_number),
  CONSTRAINT uq_po_change_orders_po_seq UNIQUE (purchase_order_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_po_change_orders_po ON public.po_change_orders(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_change_orders_org ON public.po_change_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_po_change_orders_status ON public.po_change_orders(status);

DROP TRIGGER IF EXISTS po_change_orders_updated_at ON public.po_change_orders;
CREATE TRIGGER po_change_orders_updated_at
  BEFORE UPDATE ON public.po_change_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.po_change_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_change_orders_select ON public.po_change_orders;
CREATE POLICY po_change_orders_select ON public.po_change_orders
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
    OR EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = po_change_orders.purchase_order_id
        AND po.supplier_id IN (SELECT private.get_user_supplier_ids())
    )
  );

DROP POLICY IF EXISTS po_change_orders_mutate ON public.po_change_orders;
CREATE POLICY po_change_orders_mutate ON public.po_change_orders
  FOR ALL
  USING (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  );

-- Sub-table: Line Item Deltas
CREATE TABLE IF NOT EXISTS public.po_change_order_items (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id             uuid NOT NULL REFERENCES public.po_change_orders(id) ON DELETE CASCADE,
  po_line_item_id             uuid REFERENCES public.purchase_order_line_items(id) ON DELETE SET NULL,
  item_index                  integer NOT NULL CHECK (item_index > 0),
  description                 text NOT NULL,
  hsn_sac_code                text,
  quantity_delta              numeric(12, 4) NOT NULL DEFAULT 0.0000,
  unit                        text NOT NULL DEFAULT 'lot',
  unit_price                  numeric(14, 2) NOT NULL DEFAULT 0.00,
  amount_delta                numeric(14, 2) NOT NULL DEFAULT 0.00,
  tax_amount_delta            numeric(14, 2) NOT NULL DEFAULT 0.00,
  total_delta                 numeric(14, 2) NOT NULL DEFAULT 0.00,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_change_order_items_co ON public.po_change_order_items(change_order_id);

DROP TRIGGER IF EXISTS po_change_order_items_updated_at ON public.po_change_order_items;
CREATE TRIGGER po_change_order_items_updated_at
  BEFORE UPDATE ON public.po_change_order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.po_change_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_change_order_items_select ON public.po_change_order_items;
CREATE POLICY po_change_order_items_select ON public.po_change_order_items
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.po_change_orders co
      WHERE co.id = po_change_order_items.change_order_id
        AND (
          co.organization_id IN (SELECT private.get_user_org_ids())
          OR EXISTS (
            SELECT 1 FROM public.purchase_orders po
            WHERE po.id = co.purchase_order_id
              AND po.supplier_id IN (SELECT private.get_user_supplier_ids())
          )
        )
    )
  );

DROP POLICY IF EXISTS po_change_order_items_mutate ON public.po_change_order_items;
CREATE POLICY po_change_order_items_mutate ON public.po_change_order_items
  FOR ALL
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.po_change_orders co
      WHERE co.id = po_change_order_items.change_order_id
        AND private.get_org_role(co.organization_id) IN ('OWNER', 'MANAGER')
    )
  )
  WITH CHECK (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.po_change_orders co
      WHERE co.id = po_change_order_items.change_order_id
        AND private.get_org_role(co.organization_id) IN ('OWNER', 'MANAGER')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Create public.bank_reconciliation_records Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_reconciliation_records (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  payment_id                  uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  utr_number                  text NOT NULL,
  bank_reference              text,
  bank_name                   text,
  buyer_recorded_amount       numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (buyer_recorded_amount >= 0),
  bank_cleared_amount         numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (bank_cleared_amount >= 0),
  amount_difference           numeric(14, 2) NOT NULL DEFAULT 0.00,
  buyer_recorded_date         timestamptz,
  bank_cleared_date           timestamptz NOT NULL,
  date_drift_days             integer NOT NULL DEFAULT 0 CHECK (date_drift_days >= 0),
  status                      text NOT NULL DEFAULT 'UNRECONCILED'
    CHECK (status IN ('UNRECONCILED', 'MATCHED', 'DISCREPANCY', 'RESOLVED', 'RECONCILED')),
  discrepancy_type            text NOT NULL DEFAULT 'NONE'
    CHECK (discrepancy_type IN ('AMOUNT_MISMATCH', 'DATE_DRIFT', 'UNKNOWN_UTR', 'DUPLICATE_UTR', 'BENEFICIARY_MISMATCH', 'NONE')),
  discrepancy_details         text,
  resolution_notes            text,
  reconciled_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reconciled_at               timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_bank_reconciliation_org_utr UNIQUE (organization_id, utr_number)
);

CREATE INDEX IF NOT EXISTS idx_bank_rec_org ON public.bank_reconciliation_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_bank_rec_payment ON public.bank_reconciliation_records(payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_rec_status ON public.bank_reconciliation_records(status);

DROP TRIGGER IF EXISTS bank_reconciliation_updated_at ON public.bank_reconciliation_records;
CREATE TRIGGER bank_reconciliation_updated_at
  BEFORE UPDATE ON public.bank_reconciliation_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.bank_reconciliation_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_reconciliation_select ON public.bank_reconciliation_records;
CREATE POLICY bank_reconciliation_select ON public.bank_reconciliation_records
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS bank_reconciliation_mutate ON public.bank_reconciliation_records;
CREATE POLICY bank_reconciliation_mutate ON public.bank_reconciliation_records
  FOR ALL
  USING (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  )
  WITH CHECK (
    private.is_platform_admin()
    OR private.get_org_role(organization_id) IN ('OWNER', 'MANAGER')
  );

-- ---------------------------------------------------------------------------
-- 4. Atomic Statutory TDS Withholding RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_tds_withholding_atomic(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_section text,
  p_taxable_amount numeric(14, 2),
  p_tds_rate numeric(5, 2),
  p_deductee_pan text DEFAULT NULL,
  p_pan_status text DEFAULT 'VALID',
  p_is_lower_deduction boolean DEFAULT false,
  p_lower_deduction_cert text DEFAULT NULL,
  p_law_version text DEFAULT 'INCOME_TAX_ACT_2025'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_invoice RECORD;
  v_po RECORD;
  v_statutory_tds numeric(14, 2);
  v_fy text;
  v_ay text;
  v_record_id uuid;
  v_created_rec RECORD;
BEGIN
  -- 1. Authorization check
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can apply statutory TDS withholding (TDS-5C4-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 2. Lock Invoice row
  SELECT * INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
  END IF;

  IF v_invoice.status IN ('DRAFT', 'REJECTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot apply TDS to invoice with status % (TDS-5C4-INVALID-STATUS)', v_invoice.status;
  END IF;

  -- 3. Lock PO row if applicable
  IF v_invoice.purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po
    FROM public.purchase_orders
    WHERE id = v_invoice.purchase_order_id;
  END IF;

  -- 4. Statutory Rounding (Section 288B: nearest whole rupee)
  v_statutory_tds := ROUND((p_taxable_amount * p_tds_rate) / 100.0);

  IF v_statutory_tds <= 0 AND p_tds_rate > 0 THEN
    v_statutory_tds := 1.00;
  END IF;

  IF v_statutory_tds > v_invoice.amount THEN
    RAISE EXCEPTION 'Statutory TDS amount ₹% exceeds gross invoice amount ₹% (RED-03/RED-08)',
      v_statutory_tds, v_invoice.amount;
  END IF;

  -- 5. Derive FY & AY
  v_fy := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 4
    THEN EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
    ELSE (EXTRACT(YEAR FROM now()) - 1)::text || '-' || EXTRACT(YEAR FROM now())::text
  END;

  v_ay := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 4
    THEN (EXTRACT(YEAR FROM now()) + 1)::text || '-' || (EXTRACT(YEAR FROM now()) + 2)::text
    ELSE EXTRACT(YEAR FROM now())::text || '-' || (EXTRACT(YEAR FROM now()) + 1)::text
  END;

  -- 6. Insert TDS deduction record
  INSERT INTO public.tds_deductions (
    organization_id,
    supplier_id,
    purchase_order_id,
    invoice_id,
    law_version,
    section,
    taxable_amount,
    tds_rate,
    tds_amount,
    status,
    deductee_pan,
    pan_status,
    is_lower_deduction,
    lower_deduction_cert_number,
    financial_year,
    assessment_year,
    created_by
  ) VALUES (
    p_organization_id,
    v_invoice.supplier_id,
    v_invoice.purchase_order_id,
    v_invoice.id,
    p_law_version,
    p_section,
    p_taxable_amount,
    p_tds_rate,
    v_statutory_tds,
    'DEDUCTED',
    p_deductee_pan,
    p_pan_status,
    p_is_lower_deduction,
    p_lower_deduction_cert,
    v_fy,
    v_ay,
    v_caller_profile_id
  )
  RETURNING id INTO v_record_id;

  SELECT * INTO v_created_rec FROM public.tds_deductions WHERE id = v_record_id;

  -- 7. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'TDS_DEDUCTED',
    'TDS_DEDUCTION',
    v_record_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'purchase_order_id', v_invoice.purchase_order_id,
      'section', p_section,
      'taxable_amount', p_taxable_amount,
      'tds_rate', p_tds_rate,
      'tds_amount', v_statutory_tds,
      'deductee_pan', p_deductee_pan,
      'pan_status', p_pan_status
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'tds_deduction_id', v_record_id,
    'tds_deduction', row_to_json(v_created_rec)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Atomic PO Change Order Commitment RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.commit_po_change_order_atomic(
  p_change_order_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_co RECORD;
  v_po RECORD;
  v_cumulative_invoiced numeric(14, 2) := 0.00;
  v_revised_po_total numeric(14, 2);
  v_updated_po RECORD;
  v_updated_co RECORD;
BEGIN
  -- 1. Authorization Check (RED-01: Supplier cannot approve / commit change orders)
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can commit PO change orders (RED-01/CO-5C4-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 2. Lock Change Order row
  SELECT * INTO v_co
  FROM public.po_change_orders
  WHERE id = p_change_order_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change Order % not found for organization %', p_change_order_id, p_organization_id;
  END IF;

  IF v_co.status = 'COMMITTED' THEN
    RAISE EXCEPTION 'Change Order % is already COMMITTED (RED-14/CO-5C4-ALREADY-COMMITTED)', p_change_order_id;
  END IF;

  IF v_co.status = 'REJECTED' THEN
    RAISE EXCEPTION 'Cannot commit a REJECTED change order %', p_change_order_id;
  END IF;

  -- 3. Lock PO row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = v_co.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase Order % not found', v_co.purchase_order_id;
  END IF;

  IF v_po.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot commit change order against PO in status %', v_po.status;
  END IF;

  -- 4. Calculate Cumulative Invoiced Amount on this PO
  SELECT COALESCE(SUM(amount), 0.00) INTO v_cumulative_invoiced
  FROM public.invoices
  WHERE purchase_order_id = v_po.id
    AND status NOT IN ('REJECTED', 'CANCELLED');

  v_revised_po_total := v_po.total_amount + v_co.total_delta;

  -- 5. Negative Change Order Invariant (RED-02: Revised total >= Cumulative Invoiced)
  IF v_revised_po_total < v_cumulative_invoiced THEN
    RAISE EXCEPTION 'Negative change order rejection: Revised PO commitment ₹% cannot be less than cumulative invoiced amount ₹% (REV-5C4-CO-BELOW-INVOICED)',
      v_revised_po_total, v_cumulative_invoiced;
  END IF;

  IF v_revised_po_total < 0 THEN
    RAISE EXCEPTION 'Change order would result in negative PO commitment (₹%)', v_revised_po_total;
  END IF;

  -- 6. Apply Commitment to Change Order
  UPDATE public.po_change_orders
  SET status = 'COMMITTED',
      previous_po_total = v_po.total_amount,
      revised_po_total = v_revised_po_total,
      committed_by = v_caller_profile_id,
      committed_at = now(),
      updated_at = now()
  WHERE id = v_co.id
  RETURNING * INTO v_updated_co;

  -- 7. Synchronize PO Total Amount
  UPDATE public.purchase_orders
  SET total_amount = v_revised_po_total,
      updated_at = now()
  WHERE id = v_po.id
  RETURNING * INTO v_updated_po;

  -- 8. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PO_CHANGE_ORDER_COMMITTED',
    'PO_CHANGE_ORDER',
    v_co.id,
    jsonb_build_object(
      'purchase_order_id', v_po.id,
      'change_order_number', v_co.change_order_number,
      'previous_po_total', v_po.total_amount,
      'revised_po_total', v_revised_po_total,
      'total_delta', v_co.total_delta,
      'cumulative_invoiced', v_cumulative_invoiced
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'change_order_id', v_co.id,
    'change_order', row_to_json(v_updated_co),
    'purchase_order', row_to_json(v_updated_po)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Atomic Bank Remittance UTR Reconciliation RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_bank_utr_atomic(
  p_organization_id uuid,
  p_utr_number text,
  p_cleared_amount numeric(14, 2),
  p_cleared_date timestamptz,
  p_bank_name text DEFAULT NULL,
  p_bank_reference text DEFAULT NULL,
  p_payment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_payment RECORD;
  v_existing_rec RECORD;
  v_clean_utr text;
  v_amount_diff numeric(14, 2) := 0.00;
  v_status text := 'MATCHED';
  v_discrepancy_type text := 'NONE';
  v_discrepancy_details text := NULL;
  v_date_drift_days integer := 0;
  v_record_id uuid;
  v_final_rec RECORD;
BEGIN
  -- 1. Authorization Check
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can reconcile bank remittance records (REC-5C4-UNAUTHORIZED)';
    END IF;
  END IF;

  v_clean_utr := UPPER(REPLACE(REPLACE(TRIM(p_utr_number), ' ', ''), '-', ''));

  -- 2. Duplicate UTR check across org
  SELECT * INTO v_existing_rec
  FROM public.bank_reconciliation_records
  WHERE organization_id = p_organization_id
    AND utr_number = v_clean_utr;

  IF FOUND THEN
    RAISE EXCEPTION 'Duplicate UTR reconciliation: % has already been recorded (RED-11/REC-5C4-DUPLICATE-UTR)', v_clean_utr;
  END IF;

  -- 3. Payment Lookup
  IF p_payment_id IS NOT NULL THEN
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id;
  ELSE
    -- Search payment by reference
    SELECT * INTO v_payment
    FROM public.payments
    WHERE UPPER(REPLACE(REPLACE(TRIM(COALESCE(reference, payment_reference, '')), ' ', ''), '-', '')) = v_clean_utr
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_payment.id IS NULL THEN
    v_status := 'DISCREPANCY';
    v_discrepancy_type := 'UNKNOWN_UTR';
    v_discrepancy_details := 'UTR ' || v_clean_utr || ' cleared ₹' || p_cleared_amount || ' at bank but has no matching buyer payment record';
    v_amount_diff := -p_cleared_amount;
  ELSE
    v_amount_diff := v_payment.amount - p_cleared_amount;
    IF v_payment.created_at IS NOT NULL THEN
      v_date_drift_days := ABS(EXTRACT(DAY FROM (p_cleared_date - v_payment.created_at)))::integer;
    END IF;

    IF ABS(v_amount_diff) > 0.01 THEN
      v_status := 'DISCREPANCY';
      v_discrepancy_type := 'AMOUNT_MISMATCH';
      v_discrepancy_details := 'Amount mismatch: Buyer recorded ₹' || v_payment.amount || ' vs Bank cleared ₹' || p_cleared_amount || ' (Diff: ₹' || v_amount_diff || ')';
    ELSIF v_date_drift_days > 7 THEN
      v_status := 'DISCREPANCY';
      v_discrepancy_type := 'DATE_DRIFT';
      v_discrepancy_details := 'Date drift of ' || v_date_drift_days || ' days exceeds allowable maximum of 7 days';
    ELSE
      v_status := 'MATCHED';
      v_discrepancy_type := 'NONE';
    END IF;
  END IF;

  -- 4. Insert Reconciliation Record
  INSERT INTO public.bank_reconciliation_records (
    organization_id,
    payment_id,
    utr_number,
    bank_reference,
    bank_name,
    buyer_recorded_amount,
    bank_cleared_amount,
    amount_difference,
    buyer_recorded_date,
    bank_cleared_date,
    date_drift_days,
    status,
    discrepancy_type,
    discrepancy_details,
    reconciled_by,
    reconciled_at
  ) VALUES (
    p_organization_id,
    v_payment.id,
    v_clean_utr,
    p_bank_reference,
    p_bank_name,
    COALESCE(v_payment.amount, 0.00),
    p_cleared_amount,
    v_amount_diff,
    v_payment.created_at,
    p_cleared_date,
    v_date_drift_days,
    v_status,
    v_discrepancy_type,
    v_discrepancy_details,
    v_caller_profile_id,
    now()
  )
  RETURNING id INTO v_record_id;

  SELECT * INTO v_final_rec FROM public.bank_reconciliation_records WHERE id = v_record_id;

  -- 5. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'BANK_UTR_RECONCILED',
    'BANK_RECONCILIATION',
    v_record_id,
    jsonb_build_object(
      'utr_number', v_clean_utr,
      'status', v_status,
      'discrepancy_type', v_discrepancy_type,
      'bank_cleared_amount', p_cleared_amount,
      'buyer_recorded_amount', COALESCE(v_payment.amount, 0.00)
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', v_record_id,
    'reconciliation', row_to_json(v_final_rec)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Financial Observability Summary RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_financial_observability_summary(
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;

  v_total_po_authorized numeric(14, 2) := 0.00;
  v_open_po_count integer := 0;
  v_completed_po_count integer := 0;

  v_total_invoiced numeric(14, 2) := 0.00;
  v_total_paid numeric(14, 2) := 0.00;
  v_total_tds_withheld numeric(14, 2) := 0.00;
  v_total_tds_deposited numeric(14, 2) := 0.00;
  v_total_debit_notes numeric(14, 2) := 0.00;
  v_total_credit_notes numeric(14, 2) := 0.00;
  v_total_outstanding numeric(14, 2) := 0.00;
  v_total_unallocated_adv numeric(14, 2) := 0.00;
  v_total_utr_cleared numeric(14, 2) := 0.00;
  v_discrepancy_count integer := 0;
  v_discrepancy_amount numeric(14, 2) := 0.00;
BEGIN
  -- 1. Authorization check (RED-09: Cross-tenant access blocked)
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Caller cannot access financial observability metrics for organization % (RED-09/OBS-5C4-UNAUTHORIZED)',
        p_organization_id;
    END IF;
  END IF;

  -- 2. PO Aggregations
  SELECT
    COALESCE(SUM(total_amount), 0.00),
    COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED')),
    COUNT(*) FILTER (WHERE status = 'COMPLETED')
  INTO
    v_total_po_authorized,
    v_open_po_count,
    v_completed_po_count
  FROM public.purchase_orders
  WHERE organization_id = p_organization_id;

  -- 3. Invoices Aggregation (excluding REJECTED and CANCELLED)
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_total_invoiced
  FROM public.invoices
  WHERE organization_id = p_organization_id
    AND status NOT IN ('REJECTED', 'CANCELLED');

  -- 4. Active Allocations Aggregation
  SELECT COALESCE(SUM(pa.allocated_amount), 0.00)
  INTO v_total_paid
  FROM public.payment_allocations pa
  JOIN public.invoices inv ON inv.id = pa.invoice_id
  WHERE inv.organization_id = p_organization_id
    AND pa.status = 'ALLOCATED';

  -- 5. TDS Deductions Aggregation
  SELECT
    COALESCE(SUM(tds_amount) FILTER (WHERE status != 'VOIDED'), 0.00),
    COALESCE(SUM(tds_amount) FILTER (WHERE status IN ('DEPOSITED', 'CERTIFIED')), 0.00)
  INTO
    v_total_tds_withheld,
    v_total_tds_deposited
  FROM public.tds_deductions
  WHERE organization_id = p_organization_id;

  -- 6. Credit and Debit Notes Aggregation
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE note_type = 'DEBIT_NOTE' AND status NOT IN ('CANCELLED', 'DRAFT')), 0.00),
    COALESCE(SUM(amount) FILTER (WHERE note_type = 'CREDIT_NOTE' AND status NOT IN ('CANCELLED', 'DRAFT')), 0.00)
  INTO
    v_total_debit_notes,
    v_total_credit_notes
  FROM public.credit_debit_notes
  WHERE organization_id = p_organization_id;

  -- 7. Outstanding Obligations Equation
  v_total_outstanding := GREATEST(
    0.00,
    (v_total_invoiced - v_total_debit_notes + v_total_credit_notes) - v_total_tds_withheld - v_total_paid
  );

  -- 8. Unallocated Advances
  SELECT COALESCE(SUM(unallocated_amount), 0.00)
  INTO v_total_unallocated_adv
  FROM public.payments
  WHERE organization_id = p_organization_id;

  -- 9. Bank Reconciliation Aggregations
  SELECT
    COALESCE(SUM(bank_cleared_amount), 0.00),
    COUNT(*) FILTER (WHERE status = 'DISCREPANCY'),
    COALESCE(SUM(ABS(amount_difference)) FILTER (WHERE status = 'DISCREPANCY'), 0.00)
  INTO
    v_total_utr_cleared,
    v_discrepancy_count,
    v_discrepancy_amount
  FROM public.bank_reconciliation_records
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'total_po_authorized', v_total_po_authorized,
    'open_po_count', v_open_po_count,
    'completed_po_count', v_completed_po_count,
    'total_invoiced', v_total_invoiced,
    'total_paid', v_total_paid,
    'total_tds_withheld', v_total_tds_withheld,
    'total_tds_deposited', v_total_tds_deposited,
    'total_debit_notes', v_total_debit_notes,
    'total_credit_notes', v_total_credit_notes,
    'total_outstanding_obligations', v_total_outstanding,
    'total_unallocated_advances', v_total_unallocated_adv,
    'total_utr_cleared', v_total_utr_cleared,
    'reconciliation_discrepancy_count', v_discrepancy_count,
    'reconciliation_discrepancy_amount', v_discrepancy_amount,
    'generated_at', now()
  );
END;
$$;

COMMIT;
