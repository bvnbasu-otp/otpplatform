-- =============================================================================
-- Migration 00174: Phase 5C.5 — Financial Operations Completion, Settlement Execution & Production Financial Controls
--
-- Description:
--   1. Table public.platform_fee_policies:
--      - Effective-dated versioned commercial fee policies (default 0.50% platform fee).
--   2. Table public.po_fee_snapshots:
--      - Snapshots fee policy version & rate on PO award/acceptance, requiring explicit supplier acknowledgement.
--   3. Table public.platform_fee_transactions:
--      - Settlement fee deductions, idempotency constraints, and financial conservation enforcement.
--   4. Table public.settlement_reconciliations:
--      - Authoritative reconciliation read model tracking gross, TDS, fees, net settlements, and UTR clearances.
--   5. Table public.settlement_exceptions:
--      - Immutable financial exception queue with resolution audit capture.
--   6. Atomic RPCs:
--      - public.acknowledge_po_platform_fee_atomic(...)
--      - public.apply_platform_fee_deduction_atomic(...)
--      - public.execute_settlement_reconciliation_atomic(...)
--      - public.resolve_settlement_exception_atomic(...)
--      - public.get_financial_observability_summary(...) [extended for Phase 5C.5]
--   7. Immutability Triggers & Multi-Tenant RLS Policies.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create public.platform_fee_policies Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_fee_policies (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version              integer NOT NULL UNIQUE CHECK (policy_version > 0),
  fee_type                    text NOT NULL DEFAULT 'PERCENTAGE'
    CHECK (fee_type IN ('PERCENTAGE', 'FLAT', 'TIERED')),
  rate                        numeric(5, 2) NOT NULL CHECK (rate >= 0 AND rate <= 100),
  min_fee_amount              numeric(14, 2) CHECK (min_fee_amount IS NULL OR min_fee_amount >= 0),
  max_fee_amount              numeric(14, 2) CHECK (max_fee_amount IS NULL OR max_fee_amount >= 0),
  effective_from              timestamptz NOT NULL DEFAULT now(),
  effective_to                timestamptz,
  status                      text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'DEPRECATED')),
  description                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_policies_status ON public.platform_fee_policies(status);
CREATE INDEX IF NOT EXISTS idx_platform_fee_policies_version ON public.platform_fee_policies(policy_version);

DROP TRIGGER IF EXISTS platform_fee_policies_updated_at ON public.platform_fee_policies;
CREATE TRIGGER platform_fee_policies_updated_at
  BEFORE UPDATE ON public.platform_fee_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed Default Policy Version 1 (0.50% Platform Fee) if not exists
INSERT INTO public.platform_fee_policies (
  policy_version,
  fee_type,
  rate,
  effective_from,
  status,
  description
) VALUES (
  1,
  'PERCENTAGE',
  0.50,
  now(),
  'ACTIVE',
  'Standard OTP Supplier Platform Fee at Settlement (0.50%)'
) ON CONFLICT (policy_version) DO NOTHING;

-- Enable RLS on platform_fee_policies
ALTER TABLE public.platform_fee_policies ENABLE ROW LEVEL SECURITY;

-- SELECT Policy (Public read for all authenticated users/suppliers/buyers)
DROP POLICY IF EXISTS platform_fee_policies_select ON public.platform_fee_policies;
CREATE POLICY platform_fee_policies_select ON public.platform_fee_policies
  FOR SELECT
  USING (true);

-- MUTATE Policy (Platform Admin only)
DROP POLICY IF EXISTS platform_fee_policies_mutate ON public.platform_fee_policies;
CREATE POLICY platform_fee_policies_mutate ON public.platform_fee_policies
  FOR ALL
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 2. Create public.po_fee_snapshots Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.po_fee_snapshots (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id           uuid NOT NULL UNIQUE REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  policy_id                   uuid NOT NULL REFERENCES public.platform_fee_policies(id) ON DELETE RESTRICT,
  policy_version              integer NOT NULL,
  fee_type                    text NOT NULL DEFAULT 'PERCENTAGE'
    CHECK (fee_type IN ('PERCENTAGE', 'FLAT', 'TIERED')),
  rate                        numeric(5, 2) NOT NULL CHECK (rate >= 0),
  estimated_fee_amount        numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (estimated_fee_amount >= 0),
  is_acknowledged             boolean NOT NULL DEFAULT false,
  acknowledged_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  acknowledged_at             timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_fee_snapshots_po ON public.po_fee_snapshots(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_po_fee_snapshots_policy ON public.po_fee_snapshots(policy_id);

DROP TRIGGER IF EXISTS po_fee_snapshots_updated_at ON public.po_fee_snapshots;
CREATE TRIGGER po_fee_snapshots_updated_at
  BEFORE UPDATE ON public.po_fee_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.po_fee_snapshots ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
DROP POLICY IF EXISTS po_fee_snapshots_select ON public.po_fee_snapshots;
CREATE POLICY po_fee_snapshots_select ON public.po_fee_snapshots
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR purchase_order_id IN (
      SELECT id FROM public.purchase_orders
      WHERE organization_id IN (SELECT private.get_user_org_ids())
         OR supplier_id IN (SELECT private.get_user_supplier_ids())
    )
  );

-- MUTATE Policy (Platform Admin or via atomic RPC)
DROP POLICY IF EXISTS po_fee_snapshots_mutate ON public.po_fee_snapshots;
CREATE POLICY po_fee_snapshots_mutate ON public.po_fee_snapshots
  FOR ALL
  USING (
    private.is_platform_admin()
    OR purchase_order_id IN (
      SELECT id FROM public.purchase_orders
      WHERE organization_id IN (SELECT private.get_user_org_ids())
         OR supplier_id IN (SELECT private.get_user_supplier_ids())
    )
  )
  WITH CHECK (
    private.is_platform_admin()
    OR purchase_order_id IN (
      SELECT id FROM public.purchase_orders
      WHERE organization_id IN (SELECT private.get_user_org_ids())
         OR supplier_id IN (SELECT private.get_user_supplier_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Create public.platform_fee_transactions Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_fee_transactions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  supplier_id                 uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_order_id           uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  invoice_id                  uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id                  uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  payment_allocation_id       uuid REFERENCES public.payment_allocations(id) ON DELETE SET NULL,
  policy_id                   uuid NOT NULL REFERENCES public.platform_fee_policies(id) ON DELETE RESTRICT,
  policy_version              integer NOT NULL,
  gross_amount                numeric(14, 2) NOT NULL CHECK (gross_amount >= 0),
  fee_rate                    numeric(5, 2) NOT NULL CHECK (fee_rate >= 0),
  fee_amount                  numeric(14, 2) NOT NULL CHECK (fee_amount >= 0 AND fee_amount <= gross_amount),
  net_settlement_amount       numeric(14, 2) NOT NULL CHECK (net_settlement_amount >= 0),
  status                      text NOT NULL DEFAULT 'APPLIED'
    CHECK (status IN ('CALCULATED', 'DISCLOSED', 'ACKNOWLEDGED', 'APPLIED', 'SETTLED', 'VOIDED', 'REVERSED', 'DISPUTED')),
  notes                       text,
  settled_at                  timestamptz,
  voided_at                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_platform_fee_po_allocation UNIQUE (purchase_order_id, payment_allocation_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_fee_tx_org ON public.platform_fee_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_platform_fee_tx_supplier ON public.platform_fee_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_platform_fee_tx_po ON public.platform_fee_transactions(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_platform_fee_tx_inv ON public.platform_fee_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_platform_fee_tx_pay ON public.platform_fee_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_platform_fee_tx_status ON public.platform_fee_transactions(status);

DROP TRIGGER IF EXISTS platform_fee_transactions_updated_at ON public.platform_fee_transactions;
CREATE TRIGGER platform_fee_transactions_updated_at
  BEFORE UPDATE ON public.platform_fee_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.platform_fee_transactions ENABLE ROW LEVEL SECURITY;

-- SELECT Policy
DROP POLICY IF EXISTS platform_fee_tx_select ON public.platform_fee_transactions;
CREATE POLICY platform_fee_tx_select ON public.platform_fee_transactions
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
    OR supplier_id IN (SELECT private.get_user_supplier_ids())
  );

-- MUTATE Policy (Buyer Owner/Manager only or Admin)
DROP POLICY IF EXISTS platform_fee_tx_mutate ON public.platform_fee_transactions;
CREATE POLICY platform_fee_tx_mutate ON public.platform_fee_transactions
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
-- 4. Create public.settlement_reconciliations Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_reconciliations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  supplier_id                     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_order_id               uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  invoice_id                      uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  payment_id                      uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_gross_amount            numeric(14, 2) NOT NULL CHECK (invoice_gross_amount >= 0),
  adjusted_gross_amount           numeric(14, 2) NOT NULL CHECK (adjusted_gross_amount >= 0),
  tds_amount                      numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (tds_amount >= 0),
  platform_fee_amount             numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (platform_fee_amount >= 0),
  paid_allocated_amount           numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (paid_allocated_amount >= 0),
  supplier_net_settlement_amount  numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (supplier_net_settlement_amount >= 0),
  utr_number                      text,
  utr_cleared_amount              numeric(14, 2) CHECK (utr_cleared_amount IS NULL OR utr_cleared_amount >= 0),
  variance_amount                 numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (variance_amount >= 0),
  status                          text NOT NULL DEFAULT 'UNRECONCILED'
    CHECK (status IN ('UNRECONCILED', 'MATCHED', 'PARTIAL', 'MISMATCH', 'DISPUTED', 'RESOLVED')),
  discrepancy_type                text NOT NULL DEFAULT 'NONE'
    CHECK (discrepancy_type IN ('NONE', 'PAYMENT_AMOUNT_MISMATCH', 'UTR_AMOUNT_MISMATCH', 'TDS_MISMATCH', 'FEE_MISMATCH', 'ALLOCATION_MISMATCH', 'DUPLICATE_UTR', 'MISSING_UTR', 'EXCESS_ALLOCATION', 'UNDER_ALLOCATION', 'UNKNOWN')),
  discrepancy_details             text,
  notes                           text,
  reconciled_at                   timestamptz,
  reconciled_by                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_rec_org ON public.settlement_reconciliations(organization_id);
CREATE INDEX IF NOT EXISTS idx_settlement_rec_supplier ON public.settlement_reconciliations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_settlement_rec_po ON public.settlement_reconciliations(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_settlement_rec_inv ON public.settlement_reconciliations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_settlement_rec_status ON public.settlement_reconciliations(status);

DROP TRIGGER IF EXISTS settlement_reconciliations_updated_at ON public.settlement_reconciliations;
CREATE TRIGGER settlement_reconciliations_updated_at
  BEFORE UPDATE ON public.settlement_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settlement_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_reconciliations_select ON public.settlement_reconciliations;
CREATE POLICY settlement_reconciliations_select ON public.settlement_reconciliations
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
    OR supplier_id IN (SELECT private.get_user_supplier_ids())
  );

DROP POLICY IF EXISTS settlement_reconciliations_mutate ON public.settlement_reconciliations;
CREATE POLICY settlement_reconciliations_mutate ON public.settlement_reconciliations
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
-- 5. Create public.settlement_exceptions Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_exceptions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  reconciliation_id           uuid NOT NULL REFERENCES public.settlement_reconciliations(id) ON DELETE RESTRICT,
  purchase_order_id           uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_id                  uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_id                  uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  exception_type              text NOT NULL
    CHECK (exception_type IN ('PAYMENT_AMOUNT_MISMATCH', 'UTR_AMOUNT_MISMATCH', 'TDS_MISMATCH', 'FEE_MISMATCH', 'ALLOCATION_MISMATCH', 'DUPLICATE_UTR', 'MISSING_UTR', 'EXCESS_ALLOCATION', 'UNDER_ALLOCATION', 'UNKNOWN')),
  severity                    text NOT NULL DEFAULT 'MEDIUM'
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status                      text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'INVESTIGATING', 'RESOLVED')),
  amount_in_dispute           numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (amount_in_dispute >= 0),
  reason                      text NOT NULL,
  resolution_notes            text,
  assigned_to                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_exceptions_org ON public.settlement_exceptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_settlement_exceptions_rec ON public.settlement_exceptions(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_settlement_exceptions_status ON public.settlement_exceptions(status);

DROP TRIGGER IF EXISTS settlement_exceptions_updated_at ON public.settlement_exceptions;
CREATE TRIGGER settlement_exceptions_updated_at
  BEFORE UPDATE ON public.settlement_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.settlement_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_exceptions_select ON public.settlement_exceptions;
CREATE POLICY settlement_exceptions_select ON public.settlement_exceptions
  FOR SELECT
  USING (
    private.is_platform_admin()
    OR organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS settlement_exceptions_mutate ON public.settlement_exceptions;
CREATE POLICY settlement_exceptions_mutate ON public.settlement_exceptions
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
-- 6. Immutability Guards: Deletion & Modification Triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_platform_fee_tx_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('SETTLED', 'APPLIED') THEN
      RAISE EXCEPTION 'Committed platform fee transaction % cannot be deleted (RED-28: IMMUTABLE_FEE_RECORD)', OLD.id;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'SETTLED' AND NEW.status != 'REVERSED' AND NEW.status != 'DISPUTED' THEN
      IF NEW.fee_amount != OLD.fee_amount OR NEW.gross_amount != OLD.gross_amount OR NEW.purchase_order_id != OLD.purchase_order_id THEN
        RAISE EXCEPTION 'Settled platform fee transaction % is immutable and cannot be altered (RED-28: IMMUTABLE_FEE_RECORD)', OLD.id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_platform_fee_tx ON public.platform_fee_transactions;
CREATE TRIGGER trg_guard_platform_fee_tx
  BEFORE UPDATE OR DELETE ON public.platform_fee_transactions
  FOR EACH ROW EXECUTE FUNCTION public.guard_platform_fee_tx_immutability();

CREATE OR REPLACE FUNCTION public.guard_settlement_exceptions_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Financial exception queue records are immutable audit artifacts and cannot be deleted (EXC-5C5-NO-DELETE)';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_settlement_exceptions ON public.settlement_exceptions;
CREATE TRIGGER trg_guard_settlement_exceptions
  BEFORE DELETE ON public.settlement_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_settlement_exceptions_immutability();

-- ---------------------------------------------------------------------------
-- 7. Atomic RPC: acknowledge_po_platform_fee_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acknowledge_po_platform_fee_atomic(
  p_purchase_order_id uuid,
  p_policy_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_po RECORD;
  v_policy RECORD;
  v_existing_snapshot RECORD;
  v_estimated_fee numeric(14, 2);
  v_snapshot_id uuid;
BEGIN
  -- 1. Lock Purchase Order row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found', p_purchase_order_id;
  END IF;

  -- 2. Authorization check: Must be the Supplier assigned to the PO or Platform Admin
  IF NOT v_is_admin THEN
    IF NOT (v_po.supplier_id IN (SELECT private.get_user_supplier_ids())) THEN
      RAISE EXCEPTION 'Unauthorized: Only the assigned supplier can acknowledge platform fees on PO acceptance (RED-05/FEE-5C5-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 3. Check PO Status (Only ISSUED POs can be acknowledged on acceptance)
  IF v_po.status != 'ISSUED' AND v_po.status != 'ACCEPTED' THEN
    RAISE EXCEPTION 'Purchase order % is in status % and cannot receive fee acknowledgement (FEE-5C5-INVALID-PO-STATUS)',
      p_purchase_order_id, v_po.status;
  END IF;

  -- 4. Check if snapshot already exists
  SELECT * INTO v_existing_snapshot
  FROM public.po_fee_snapshots
  WHERE purchase_order_id = p_purchase_order_id
  FOR UPDATE;

  IF FOUND AND v_existing_snapshot.is_acknowledged THEN
    RETURN jsonb_build_object(
      'ok', true,
      'snapshot_id', v_existing_snapshot.id,
      'is_acknowledged', true,
      'rate', v_existing_snapshot.rate,
      'message', 'Fee already acknowledged'
    );
  END IF;

  -- 5. Fetch Active Fee Policy (or specific policy if provided and active)
  IF p_policy_id IS NOT NULL THEN
    SELECT * INTO v_policy
    FROM public.platform_fee_policies
    WHERE id = p_policy_id;
  ELSE
    SELECT * INTO v_policy
    FROM public.platform_fee_policies
    WHERE status = 'ACTIVE'
    ORDER BY policy_version DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active platform fee policy available (FEE-5C5-NO-POLICY)';
  END IF;

  -- 6. Calculate estimated fee
  v_estimated_fee := ROUND((COALESCE(v_po.total_amount, 0.00) * v_policy.rate) / 100.0, 2);

  -- 7. Upsert PO Fee Snapshot
  IF v_existing_snapshot.id IS NOT NULL THEN
    UPDATE public.po_fee_snapshots
    SET
      policy_id = v_policy.id,
      policy_version = v_policy.policy_version,
      fee_type = v_policy.fee_type,
      rate = v_policy.rate,
      estimated_fee_amount = v_estimated_fee,
      is_acknowledged = true,
      acknowledged_by = v_caller_profile_id,
      acknowledged_at = now(),
      updated_at = now()
    WHERE id = v_existing_snapshot.id
    RETURNING id INTO v_snapshot_id;
  ELSE
    INSERT INTO public.po_fee_snapshots (
      purchase_order_id,
      policy_id,
      policy_version,
      fee_type,
      rate,
      estimated_fee_amount,
      is_acknowledged,
      acknowledged_by,
      acknowledged_at
    ) VALUES (
      p_purchase_order_id,
      v_policy.id,
      v_policy.policy_version,
      v_policy.fee_type,
      v_policy.rate,
      v_estimated_fee,
      true,
      v_caller_profile_id,
      now()
    )
    RETURNING id INTO v_snapshot_id;
  END IF;

  -- 8. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PO_PLATFORM_FEE_ACKNOWLEDGED',
    'PURCHASE_ORDER',
    p_purchase_order_id,
    jsonb_build_object(
      'snapshot_id', v_snapshot_id,
      'policy_id', v_policy.id,
      'policy_version', v_policy.policy_version,
      'rate', v_policy.rate,
      'estimated_fee', v_estimated_fee
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot_id', v_snapshot_id,
    'policy_version', v_policy.policy_version,
    'rate', v_policy.rate,
    'estimated_fee_amount', v_estimated_fee,
    'is_acknowledged', true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Atomic RPC: apply_platform_fee_deduction_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_platform_fee_deduction_atomic(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid DEFAULT NULL,
  p_payment_allocation_id uuid DEFAULT NULL,
  p_gross_amount numeric(14, 2) DEFAULT NULL
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
  v_po RECORD;
  v_snapshot RECORD;
  v_invoice RECORD;
  v_payment RECORD;
  v_gross numeric(14, 2);
  v_fee_amount numeric(14, 2);
  v_net_settlement numeric(14, 2);
  v_tx_id uuid;
  v_existing_tx RECORD;
BEGIN
  -- 1. Authorization check: Buyer OWNER or MANAGER only
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can apply platform fee deductions (RED-09/FEE-5C5-UNAUTHORIZED)';
    END IF;
  END IF;

  -- 2. Lock PO row and verify organization ownership (Cross-tenant guard)
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found', p_purchase_order_id;
  END IF;

  IF v_po.organization_id != p_organization_id THEN
    RAISE EXCEPTION 'Purchase order does not belong to organization % (RED-08: CROSS_TENANT_VIOLATION)', p_organization_id;
  END IF;

  -- 3. Lock PO Fee Snapshot and verify supplier acknowledgement (RED-06)
  SELECT * INTO v_snapshot
  FROM public.po_fee_snapshots
  WHERE purchase_order_id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_snapshot.is_acknowledged THEN
    RAISE EXCEPTION 'Cannot apply platform fee: Supplier has not acknowledged the platform fee policy snapshot (RED-06: UNACKNOWLEDGED_FEE_SNAPSHOT)';
  END IF;

  -- 4. Lock Invoice if provided
  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('REJECTED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Cannot apply platform fee to % invoice % (RED-10: INVALID_INVOICE_STATUS)', v_invoice.status, p_invoice_id;
    END IF;
  END IF;

  -- 5. Lock Payment if provided
  IF p_payment_id IS NOT NULL THEN
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment % not found', p_payment_id;
    END IF;

    IF v_payment.status IN ('FAILED', 'REVERSED', 'VOIDED') THEN
      RAISE EXCEPTION 'Cannot apply platform fee to % payment % (RED-10: INVALID_PAYMENT_STATUS)', v_payment.status, p_payment_id;
    END IF;
  END IF;

  -- 6. Check Idempotency: Duplicate fee application prevention (RED-01, RED-12)
  IF p_payment_allocation_id IS NOT NULL THEN
    SELECT * INTO v_existing_tx
    FROM public.platform_fee_transactions
    WHERE purchase_order_id = p_purchase_order_id
      AND payment_allocation_id = p_payment_allocation_id
      AND status NOT IN ('VOIDED', 'REVERSED')
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'transaction_id', v_existing_tx.id,
        'fee_amount', v_existing_tx.fee_amount,
        'status', v_existing_tx.status,
        'message', 'Fee deduction already applied (idempotent)'
      );
    END IF;
  END IF;

  -- 7. Calculate Deterministic Fee
  v_gross := COALESCE(p_gross_amount, v_invoice.amount, v_po.total_amount, 0.00);
  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Gross settlement amount must be greater than zero';
  END IF;

  v_fee_amount := ROUND((v_gross * v_snapshot.rate) / 100.0, 2);

  -- Invariant: Fee cannot exceed gross amount (RED-03, RED-04)
  IF v_fee_amount > v_gross THEN
    v_fee_amount := v_gross;
  END IF;

  v_net_settlement := v_gross - v_fee_amount;

  -- 8. Insert Fee Transaction
  INSERT INTO public.platform_fee_transactions (
    organization_id,
    supplier_id,
    purchase_order_id,
    invoice_id,
    payment_id,
    payment_allocation_id,
    policy_id,
    policy_version,
    gross_amount,
    fee_rate,
    fee_amount,
    net_settlement_amount,
    status,
    notes,
    settled_at
  ) VALUES (
    p_organization_id,
    v_po.supplier_id,
    p_purchase_order_id,
    p_invoice_id,
    p_payment_id,
    p_payment_allocation_id,
    v_snapshot.policy_id,
    v_snapshot.policy_version,
    v_gross,
    v_snapshot.rate,
    v_fee_amount,
    v_net_settlement,
    'SETTLED',
    'Settlement platform fee deduction applied',
    now()
  )
  RETURNING id INTO v_tx_id;

  -- 9. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PLATFORM_FEE_DEDUCTION_APPLIED',
    'PLATFORM_FEE_TRANSACTION',
    v_tx_id,
    jsonb_build_object(
      'purchase_order_id', p_purchase_order_id,
      'invoice_id', p_invoice_id,
      'gross_amount', v_gross,
      'fee_rate', v_snapshot.rate,
      'fee_amount', v_fee_amount,
      'net_settlement_amount', v_net_settlement
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx_id,
    'gross_amount', v_gross,
    'fee_rate', v_snapshot.rate,
    'fee_amount', v_fee_amount,
    'net_settlement_amount', v_net_settlement,
    'status', 'SETTLED'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Atomic RPC: execute_settlement_reconciliation_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_settlement_reconciliation_atomic(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid DEFAULT NULL,
  p_utr_number text DEFAULT NULL,
  p_utr_amount numeric(14, 2) DEFAULT NULL
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
  v_clean_utr text;
  v_existing_utr_rec RECORD;
  v_tds_total numeric(14, 2) := 0.00;
  v_fee_total numeric(14, 2) := 0.00;
  v_paid_total numeric(14, 2) := 0.00;
  v_debit_total numeric(14, 2) := 0.00;
  v_credit_total numeric(14, 2) := 0.00;
  v_adjusted_gross numeric(14, 2);
  v_expected_net numeric(14, 2);
  v_variance numeric(14, 2) := 0.00;
  v_status text := 'UNRECONCILED';
  v_discrepancy_type text := 'NONE';
  v_discrepancy_details text := NULL;
  v_severity text := 'MEDIUM';
  v_requires_exception boolean := false;
  v_rec_id uuid;
  v_exc_id uuid;
  v_final_rec RECORD;
BEGIN
  -- 1. Authorization check: Buyer OWNER or MANAGER only
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can execute settlement reconciliation (RED-09/REC-5C5-UNAUTHORIZED)';
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

  IF v_invoice.organization_id != p_organization_id THEN
    RAISE EXCEPTION 'Invoice does not belong to organization % (RED-08: CROSS_TENANT_VIOLATION)', p_organization_id;
  END IF;

  -- 3. Lock PO row
  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = v_invoice.purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found for invoice', v_invoice.purchase_order_id;
  END IF;

  v_clean_utr := NULLIF(UPPER(TRIM(COALESCE(p_utr_number, ''))), '');

  -- 4. Calculate Adjustments, TDS, Platform Fees, and Paid Allocations
  SELECT COALESCE(SUM(amount) FILTER (WHERE note_type = 'DEBIT_NOTE' AND status != 'CANCELLED'), 0.00),
         COALESCE(SUM(amount) FILTER (WHERE note_type = 'CREDIT_NOTE' AND status != 'CANCELLED'), 0.00)
  INTO v_debit_total, v_credit_total
  FROM public.credit_debit_notes
  WHERE invoice_id = p_invoice_id;

  v_adjusted_gross := v_invoice.amount - v_debit_total + v_credit_total;

  SELECT COALESCE(SUM(tds_amount), 0.00)
  INTO v_tds_total
  FROM public.tds_deductions
  WHERE invoice_id = p_invoice_id AND status != 'VOIDED';

  SELECT COALESCE(SUM(fee_amount), 0.00)
  INTO v_fee_total
  FROM public.platform_fee_transactions
  WHERE invoice_id = p_invoice_id AND status NOT IN ('VOIDED', 'REVERSED');

  SELECT COALESCE(SUM(allocated_amount), 0.00)
  INTO v_paid_total
  FROM public.payment_allocations
  WHERE invoice_id = p_invoice_id AND status = 'ALLOCATED';

  v_expected_net := GREATEST(0.00, v_adjusted_gross - v_tds_total - v_fee_total);

  -- 5. Discrepancy Classification Engine
  -- Check A: Duplicate UTR in organization (RED-16)
  IF v_clean_utr IS NOT NULL THEN
    SELECT * INTO v_existing_utr_rec
    FROM public.settlement_reconciliations
    WHERE organization_id = p_organization_id
      AND utr_number = v_clean_utr
      AND invoice_id != p_invoice_id
    LIMIT 1;

    IF FOUND THEN
      v_status := 'MISMATCH';
      v_discrepancy_type := 'DUPLICATE_UTR';
      v_discrepancy_details := 'Bank UTR ' || v_clean_utr || ' is already used in another reconciliation record';
      v_requires_exception := true;
      v_severity := 'HIGH';
    END IF;
  END IF;

  -- Check B: Excess Allocation (RED-13, RED-14)
  IF v_discrepancy_type = 'NONE' AND v_paid_total > v_expected_net THEN
    v_status := 'MISMATCH';
    v_discrepancy_type := 'EXCESS_ALLOCATION';
    v_variance := v_paid_total - v_expected_net;
    v_discrepancy_details := 'Paid allocation (' || v_paid_total || ') exceeds net settlement obligation (' || v_expected_net || ')';
    v_requires_exception := true;
    v_severity := 'HIGH';
  END IF;

  -- Check C: UTR Amount Mismatch against paid allocation (RED-15)
  IF v_discrepancy_type = 'NONE' AND p_utr_amount IS NOT NULL THEN
    IF ABS(p_utr_amount - v_paid_total) > 0.01 THEN
      v_status := 'MISMATCH';
      v_discrepancy_type := 'UTR_AMOUNT_MISMATCH';
      v_variance := ABS(p_utr_amount - v_paid_total);
      v_discrepancy_details := 'Bank cleared UTR amount (' || p_utr_amount || ') does not match recorded payment (' || v_paid_total || ')';
      v_requires_exception := true;
      v_severity := CASE WHEN v_variance > 1000 THEN 'CRITICAL' ELSE 'MEDIUM' END;
    END IF;
  END IF;

  -- Check D: Under Allocation / Partial Settlement
  IF v_discrepancy_type = 'NONE' AND v_paid_total > 0 AND v_paid_total < v_expected_net THEN
    v_status := 'PARTIAL';
    v_discrepancy_type := 'UNDER_ALLOCATION';
    v_variance := v_expected_net - v_paid_total;
    v_discrepancy_details := 'Partial payment recorded: ' || v_paid_total || ' of ' || v_expected_net || ' net obligation';
  END IF;

  -- Check E: Unreconciled (Zero paid or missing UTR)
  IF v_discrepancy_type = 'NONE' AND v_paid_total = 0 THEN
    v_status := 'UNRECONCILED';
    v_discrepancy_type := 'NONE';
    v_variance := v_expected_net;
    v_discrepancy_details := 'Awaiting settlement payment';
  ELSIF v_discrepancy_type = 'NONE' AND v_paid_total >= v_expected_net AND v_clean_utr IS NULL AND p_utr_amount IS NULL THEN
    v_status := 'UNRECONCILED';
    v_discrepancy_type := 'MISSING_UTR';
    v_variance := 0.00;
    v_discrepancy_details := 'Payment allocated but bank remittance advice UTR pending';
  ELSIF v_discrepancy_type = 'NONE' AND v_paid_total >= v_expected_net THEN
    v_status := 'MATCHED';
    v_discrepancy_type := 'NONE';
    v_variance := 0.00;
    v_discrepancy_details := 'Settlement fully matched and reconciled';
  END IF;

  -- 6. Upsert Settlement Reconciliation Record
  INSERT INTO public.settlement_reconciliations (
    organization_id,
    supplier_id,
    purchase_order_id,
    invoice_id,
    payment_id,
    invoice_gross_amount,
    adjusted_gross_amount,
    tds_amount,
    platform_fee_amount,
    paid_allocated_amount,
    supplier_net_settlement_amount,
    utr_number,
    utr_cleared_amount,
    variance_amount,
    status,
    discrepancy_type,
    discrepancy_details,
    reconciled_at,
    reconciled_by
  ) VALUES (
    p_organization_id,
    v_po.supplier_id,
    v_po.id,
    p_invoice_id,
    p_payment_id,
    v_invoice.amount,
    v_adjusted_gross,
    v_tds_total,
    v_fee_total,
    v_paid_total,
    v_expected_net,
    v_clean_utr,
    p_utr_amount,
    v_variance,
    v_status,
    v_discrepancy_type,
    v_discrepancy_details,
    CASE WHEN v_status = 'MATCHED' THEN now() ELSE NULL END,
    v_caller_profile_id
  )
  RETURNING id INTO v_rec_id;

  -- 7. If exception is required, insert into settlement_exceptions queue
  IF v_requires_exception THEN
    INSERT INTO public.settlement_exceptions (
      organization_id,
      reconciliation_id,
      purchase_order_id,
      invoice_id,
      payment_id,
      exception_type,
      severity,
      status,
      amount_in_dispute,
      reason
    ) VALUES (
      p_organization_id,
      v_rec_id,
      v_po.id,
      p_invoice_id,
      p_payment_id,
      v_discrepancy_type,
      v_severity,
      'OPEN',
      v_variance,
      v_discrepancy_details
    )
    RETURNING id INTO v_exc_id;
  END IF;

  SELECT * INTO v_final_rec FROM public.settlement_reconciliations WHERE id = v_rec_id;

  -- 8. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'SETTLEMENT_RECONCILIATION_EXECUTED',
    'SETTLEMENT_RECONCILIATION',
    v_rec_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'status', v_status,
      'discrepancy_type', v_discrepancy_type,
      'variance_amount', v_variance,
      'exception_id', v_exc_id
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reconciliation_id', v_rec_id,
    'status', v_status,
    'discrepancy_type', v_discrepancy_type,
    'variance_amount', v_variance,
    'exception_id', v_exc_id,
    'reconciliation', row_to_json(v_final_rec)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Atomic RPC: resolve_settlement_exception_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_settlement_exception_atomic(
  p_exception_id uuid,
  p_resolution_notes text
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
  v_exception RECORD;
BEGIN
  -- 1. Lock Exception row
  SELECT * INTO v_exception
  FROM public.settlement_exceptions
  WHERE id = p_exception_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement exception % not found', p_exception_id;
  END IF;

  -- 2. Authorization check: Buyer OWNER / MANAGER only (RED-21)
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(v_exception.organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can resolve settlement exceptions (RED-21: UNAUTHORIZED_EXCEPTION_RESOLUTION)';
    END IF;
  END IF;

  -- 3. Check already resolved
  IF v_exception.status = 'RESOLVED' THEN
    RAISE EXCEPTION 'Settlement exception % is already resolved', p_exception_id;
  END IF;

  -- 4. Validate resolution note
  IF p_resolution_notes IS NULL OR length(trim(p_resolution_notes)) < 5 THEN
    RAISE EXCEPTION 'Resolution notes must be at least 5 characters long';
  END IF;

  -- 5. Update Exception record
  UPDATE public.settlement_exceptions
  SET
    status = 'RESOLVED',
    resolution_notes = trim(p_resolution_notes),
    resolved_by = v_caller_profile_id,
    resolved_at = now(),
    updated_at = now()
  WHERE id = p_exception_id;

  -- 6. Update corresponding reconciliation record status
  UPDATE public.settlement_reconciliations
  SET
    status = 'RESOLVED',
    notes = 'Exception resolved: ' || trim(p_resolution_notes),
    reconciled_at = now(),
    reconciled_by = v_caller_profile_id,
    updated_at = now()
  WHERE id = v_exception.reconciliation_id;

  -- 7. Audit Event
  INSERT INTO public.audit_events (
    action,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'SETTLEMENT_EXCEPTION_RESOLVED',
    'SETTLEMENT_EXCEPTION',
    p_exception_id,
    jsonb_build_object(
      'reconciliation_id', v_exception.reconciliation_id,
      'resolution_notes', p_resolution_notes,
      'resolved_by', v_caller_profile_id
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'exception_id', p_exception_id,
    'status', 'RESOLVED',
    'resolved_at', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Extend Financial Observability Summary RPC
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

  -- Phase 5C.5 Metrics
  v_total_fee_calculated numeric(14, 2) := 0.00;
  v_total_fee_settled numeric(14, 2) := 0.00;
  v_settlement_rec_count integer := 0;
  v_settlement_mismatch_count integer := 0;
  v_open_exception_count integer := 0;
  v_resolved_exception_count integer := 0;
BEGIN
  -- 1. Authorization check (RED-09/RED-20: Cross-tenant access blocked)
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'Unauthorized: Caller cannot access financial observability metrics for organization % (RED-09/OBS-5C5-UNAUTHORIZED)',
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

  -- 7. Outstanding Obligations (Invariant: max(0, Invoiced - Debit + Credit - TDS - Paid))
  v_total_outstanding := GREATEST(
    0.00,
    v_total_invoiced - v_total_debit_notes + v_total_credit_notes - v_total_tds_withheld - v_total_paid
  );

  -- 8. Unallocated Advances
  SELECT COALESCE(SUM(unallocated_amount), 0.00)
  INTO v_total_unallocated_adv
  FROM public.payments
  WHERE organization_id = p_organization_id;

  -- 9. Bank UTR Reconciliations
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

  -- 10. Phase 5C.5: Platform Fees Aggregation
  SELECT
    COALESCE(SUM(fee_amount) FILTER (WHERE status NOT IN ('VOIDED', 'REVERSED')), 0.00),
    COALESCE(SUM(fee_amount) FILTER (WHERE status = 'SETTLED'), 0.00)
  INTO
    v_total_fee_calculated,
    v_total_fee_settled
  FROM public.platform_fee_transactions
  WHERE organization_id = p_organization_id;

  -- 11. Phase 5C.5: Settlement Reconciliations Aggregation
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('MISMATCH', 'DISPUTED'))
  INTO
    v_settlement_rec_count,
    v_settlement_mismatch_count
  FROM public.settlement_reconciliations
  WHERE organization_id = p_organization_id;

  -- 12. Phase 5C.5: Settlement Exceptions Aggregation
  SELECT
    COUNT(*) FILTER (WHERE status IN ('OPEN', 'INVESTIGATING')),
    COUNT(*) FILTER (WHERE status = 'RESOLVED')
  INTO
    v_open_exception_count,
    v_resolved_exception_count
  FROM public.settlement_exceptions
  WHERE organization_id = p_organization_id;

  RETURN jsonb_build_object(
    'organization_id', p_organization_id,
    'total_po_authorized', v_total_po_authorized,
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
    'open_po_count', v_open_po_count,
    'completed_po_count', v_completed_po_count,
    'total_platform_fee_calculated', v_total_fee_calculated,
    'total_platform_fee_settled', v_total_fee_settled,
    'settlement_reconciliation_count', v_settlement_rec_count,
    'settlement_mismatch_count', v_settlement_mismatch_count,
    'open_exception_count', v_open_exception_count,
    'resolved_exception_count', v_resolved_exception_count,
    'generated_at', now()
  );
END;
$$;

COMMIT;
