-- =============================================================================
-- Migration 00169: Phase 5C.1 — Payment Allocations, Multi-Invoice Settlement & Partial Payments
--
-- Description:
--   1. Enhances public.payments:
--      - Makes invoice_id nullable to support multi-invoice and advance payments.
--      - Adds purchase_order_id foreign key referencing public.purchase_orders.
--      - Adds unallocated_amount tracking remaining unassigned payment balance.
--   2. Enhances public.invoices:
--      - Adds paid_amount (cumulative allocated payments) with non-negative check.
--      - Adds balance_due (remaining amount owed) with non-negative check.
--      - Adds PARTIALLY_PAID state to public.invoice_status enum.
--   3. Creates public.payment_allocations table:
--      - Links payments to invoices with allocated_amount, status, and audit metadata.
--      - Supports ALLOCATED, VOIDED, and REVERSED statuses.
--   4. Adds Financial Invariant Triggers:
--      - validate_payment_allocation_integrity(): Prevents payment and invoice over-allocation
--        with pessimistic FOR UPDATE concurrency row locking.
--      - sync_invoice_payment_state(): Recomputes invoices.paid_amount, balance_due,
--        and state (APPROVED -> PARTIALLY_PAID -> PAID), plus payments.unallocated_amount.
--   5. Deterministic Historical Backfill:
--      - Generates payment_allocations for all existing payments with invoice_id.
--      - Synchronizes paid_amount, balance_due, and invoice_status across legacy data.
--   6. Configures Tenant Row-Level Security (RLS) Policies on payment_allocations and payments.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend public.invoice_status Enum
-- ---------------------------------------------------------------------------
ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID' BEFORE 'PAID';

-- ---------------------------------------------------------------------------
-- 2. Modify public.payments Table
-- ---------------------------------------------------------------------------
ALTER TABLE public.payments
  ALTER COLUMN invoice_id DROP NOT NULL;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS unallocated_amount numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (unallocated_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_payments_po ON public.payments(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_unallocated ON public.payments(unallocated_amount);

-- ---------------------------------------------------------------------------
-- 3. Modify public.invoices Table
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_amount  numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  ADD COLUMN IF NOT EXISTS balance_due  numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance_due >= 0);

CREATE INDEX IF NOT EXISTS idx_invoices_paid_amount ON public.invoices(paid_amount);
CREATE INDEX IF NOT EXISTS idx_invoices_balance_due ON public.invoices(balance_due);

-- ---------------------------------------------------------------------------
-- 4. Create public.payment_allocations Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id       uuid NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  allocated_amount numeric(14, 2) NOT NULL CHECK (allocated_amount > 0),
  allocated_at     timestamptz NOT NULL DEFAULT now(),
  status           text NOT NULL DEFAULT 'ALLOCATED'
    CHECK (status IN ('ALLOCATED', 'VOIDED', 'REVERSED')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON public.payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON public.payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_status ON public.payment_allocations(status);

DROP TRIGGER IF EXISTS payment_allocations_updated_at ON public.payment_allocations;
CREATE TRIGGER payment_allocations_updated_at
  BEFORE UPDATE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Invariant & Concurrency Triggers
-- ---------------------------------------------------------------------------

-- Invariant Trigger: Validate payment and invoice allocation limits with pessimistic FOR UPDATE locks
CREATE OR REPLACE FUNCTION public.validate_payment_allocation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay_amount numeric(14, 2);
  v_inv_amount numeric(14, 2);
  v_pay_allocated numeric(14, 2);
  v_inv_allocated numeric(14, 2);
BEGIN
  -- Only validate active allocations
  IF NEW.status = 'ALLOCATED' THEN
    -- Pessimistic row lock on payment row to serialize concurrent allocations
    SELECT amount INTO v_pay_amount
    FROM public.payments
    WHERE id = NEW.payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Associated Payment not found (PAY-5C-01)';
    END IF;

    -- Pessimistic row lock on invoice row to serialize concurrent allocations
    SELECT amount INTO v_inv_amount
    FROM public.invoices
    WHERE id = NEW.invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Associated Invoice not found (PAY-5C-02)';
    END IF;

    -- 1. Validate payment cumulative allocation limit (Tolerance ₹0.05)
    SELECT COALESCE(SUM(allocated_amount), 0.00)
    INTO v_pay_allocated
    FROM public.payment_allocations
    WHERE payment_id = NEW.payment_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status = 'ALLOCATED';

    IF (v_pay_allocated + NEW.allocated_amount) > (v_pay_amount + 0.05) THEN
      RAISE EXCEPTION 'Payment allocation violation: Cumulative allocated amount (₹%) exceeds total payment amount (₹%) (PAY-5C-OVERALLOC)',
        (v_pay_allocated + NEW.allocated_amount), v_pay_amount;
    END IF;

    -- 2. Validate invoice cumulative allocation limit (Tolerance ₹0.05)
    SELECT COALESCE(SUM(allocated_amount), 0.00)
    INTO v_inv_allocated
    FROM public.payment_allocations
    WHERE invoice_id = NEW.invoice_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status = 'ALLOCATED';

    IF (v_inv_allocated + NEW.allocated_amount) > (v_inv_amount + 0.05) THEN
      RAISE EXCEPTION 'Invoice allocation violation: Cumulative allocated amount (₹%) exceeds invoice total amount (₹%) (PAY-5C-INVOICE-OVERALLOC)',
        (v_inv_allocated + NEW.allocated_amount), v_inv_amount;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_payment_allocation_integrity ON public.payment_allocations;
CREATE TRIGGER trg_validate_payment_allocation_integrity
  BEFORE INSERT OR UPDATE OF allocated_amount, payment_id, invoice_id, status ON public.payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_payment_allocation_integrity();

-- Synchronization Trigger: Recompute invoice paid_amount, balance_due, status, and payment unallocated_amount
CREATE OR REPLACE FUNCTION public.sync_invoice_payment_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_id uuid;
  v_pay_id uuid;
  v_inv RECORD;
  v_paid_amt numeric(14, 2);
  v_bal_due numeric(14, 2);
  v_new_status public.invoice_status;
  v_pay_amt numeric(14, 2);
  v_tot_allocated numeric(14, 2);
BEGIN
  -- Sync all affected invoices
  FOR v_inv_id IN
    SELECT DISTINCT unnest(ARRAY[NEW.invoice_id, OLD.invoice_id])
    WHERE unnest IS NOT NULL
  LOOP
    SELECT id, amount, status INTO v_inv FROM public.invoices WHERE id = v_inv_id;
    IF FOUND THEN
      SELECT COALESCE(SUM(allocated_amount), 0.00)
      INTO v_paid_amt
      FROM public.payment_allocations
      WHERE invoice_id = v_inv_id AND status = 'ALLOCATED';

      v_bal_due := GREATEST(0.00, v_inv.amount - v_paid_amt);

      IF v_paid_amt >= (v_inv.amount - 0.05) THEN
        v_new_status := 'PAID';
      ELSIF v_paid_amt > 0.00 THEN
        v_new_status := 'PARTIALLY_PAID';
      ELSE
        IF v_inv.status IN ('PAID', 'PARTIALLY_PAID') THEN
          v_new_status := 'APPROVED';
        ELSE
          v_new_status := v_inv.status;
        END IF;
      END IF;

      UPDATE public.invoices
      SET paid_amount = v_paid_amt,
          balance_due = v_bal_due,
          status = v_new_status,
          updated_at = now()
      WHERE id = v_inv_id;
    END IF;
  END LOOP;

  -- Sync all affected payments
  FOR v_pay_id IN
    SELECT DISTINCT unnest(ARRAY[NEW.payment_id, OLD.payment_id])
    WHERE unnest IS NOT NULL
  LOOP
    SELECT amount INTO v_pay_amt FROM public.payments WHERE id = v_pay_id;
    IF FOUND THEN
      SELECT COALESCE(SUM(allocated_amount), 0.00)
      INTO v_tot_allocated
      FROM public.payment_allocations
      WHERE payment_id = v_pay_id AND status = 'ALLOCATED';

      UPDATE public.payments
      SET unallocated_amount = GREATEST(0.00, v_pay_amt - v_tot_allocated),
          updated_at = now()
      WHERE id = v_pay_id;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_payment_state ON public.payment_allocations;
CREATE TRIGGER trg_sync_invoice_payment_state
  AFTER INSERT OR UPDATE OR DELETE ON public.payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_invoice_payment_state();

-- Refine line items protection function to protect PARTIALLY_PAID invoices as well
CREATE OR REPLACE FUNCTION public.protect_invoice_line_items_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv_status text;
  v_inv_num text;
BEGIN
  SELECT status::text, invoice_number INTO v_inv_status, v_inv_num
  FROM public.invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  IF v_inv_status IN ('APPROVED', 'PARTIALLY_PAID', 'PAID') THEN
    RAISE EXCEPTION 'Cannot insert, update, or delete line items of finalized invoice % (INV-5B-LINE-FROZEN)', v_inv_num;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Deterministic Historical Backfill Engine
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_pay RECORD;
  v_inv RECORD;
  v_paid numeric(14,2);
BEGIN
  -- 1. Initialize balance_due and paid_amount on invoices
  UPDATE public.invoices
  SET balance_due = CASE WHEN status = 'PAID' THEN 0.00 ELSE amount END,
      paid_amount = CASE WHEN status = 'PAID' THEN amount ELSE 0.00 END
  WHERE balance_due = 0.00 AND paid_amount = 0.00 AND status <> 'PAID';

  -- 2. Populate purchase_order_id on legacy payments
  UPDATE public.payments p
  SET purchase_order_id = COALESCE(i.purchase_order_id, wo.purchase_order_id)
  FROM public.invoices i
  LEFT JOIN public.work_orders wo ON wo.id = i.work_order_id
  WHERE p.invoice_id = i.id
    AND p.purchase_order_id IS NULL;

  -- 3. Backfill payment_allocations for historical payments with an invoice_id
  FOR v_pay IN
    SELECT id, invoice_id, amount, verified_at, recorded_at, status
    FROM public.payments
    WHERE invoice_id IS NOT NULL
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_allocations
      WHERE payment_id = v_pay.id AND invoice_id = v_pay.invoice_id
    ) THEN
      INSERT INTO public.payment_allocations (
        payment_id,
        invoice_id,
        allocated_amount,
        allocated_at,
        status,
        notes
      ) VALUES (
        v_pay.id,
        v_pay.invoice_id,
        v_pay.amount,
        COALESCE(v_pay.verified_at, v_pay.recorded_at, now()),
        'ALLOCATED',
        'Historical Phase 5C.1 backfill'
      );
    END IF;
  END LOOP;

  -- 4. Synchronize all invoices paid_amount, balance_due, and status
  FOR v_inv IN SELECT id, amount, status FROM public.invoices LOOP
    SELECT COALESCE(SUM(allocated_amount), 0.00)
    INTO v_paid
    FROM public.payment_allocations
    WHERE invoice_id = v_inv.id AND status = 'ALLOCATED';

    UPDATE public.invoices
    SET paid_amount = v_paid,
        balance_due = GREATEST(0.00, v_inv.amount - v_paid),
        status = CASE
          WHEN v_paid >= (v_inv.amount - 0.05) THEN 'PAID'::public.invoice_status
          WHEN v_paid > 0.00 THEN 'PARTIALLY_PAID'::public.invoice_status
          WHEN v_inv.status IN ('PAID'::public.invoice_status, 'PARTIALLY_PAID'::public.invoice_status) THEN 'APPROVED'::public.invoice_status
          ELSE v_inv.status
        END
    WHERE id = v_inv.id;
  END LOOP;

  -- 5. Synchronize all payments unallocated_amount
  FOR v_pay IN SELECT id, amount FROM public.payments LOOP
    SELECT COALESCE(SUM(allocated_amount), 0.00)
    INTO v_paid
    FROM public.payment_allocations
    WHERE payment_id = v_pay.id AND status = 'ALLOCATED';

    UPDATE public.payments
    SET unallocated_amount = GREATEST(0.00, v_pay.amount - v_paid)
    WHERE id = v_pay.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Row-Level Security (RLS) Policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

-- Payment Allocations SELECT Policy
DROP POLICY IF EXISTS payment_allocations_select ON public.payment_allocations;
CREATE POLICY payment_allocations_select ON public.payment_allocations
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.purchase_orders po ON po.id = i.purchase_order_id
      WHERE i.id = payment_allocations.invoice_id
        AND (
          private.is_org_member(po.organization_id)
          OR private.is_supplier_user_for(i.supplier_id)
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.work_orders wo ON wo.id = i.work_order_id
      JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
      WHERE i.id = payment_allocations.invoice_id
        AND (
          private.is_org_member(po.organization_id)
          OR private.is_supplier_user_for(i.supplier_id)
        )
    )
  );

-- Payment Allocations MODIFY Policy (Buyer Owners/Managers or Platform Admin)
DROP POLICY IF EXISTS payment_allocations_modify ON public.payment_allocations;
CREATE POLICY payment_allocations_modify ON public.payment_allocations
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.purchase_orders po ON po.id = i.purchase_order_id
      WHERE i.id = payment_allocations.invoice_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
    )
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.work_orders wo ON wo.id = i.work_order_id
      JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
      WHERE i.id = payment_allocations.invoice_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
    )
  );

-- Update public.payments RLS Policies
DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin()
    OR (
      payments.purchase_order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = payments.purchase_order_id
          AND (
            private.is_org_member(po.organization_id)
            OR private.is_supplier_user_for(po.supplier_id)
          )
      )
    )
    OR (
      payments.invoice_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.invoices i
        LEFT JOIN public.purchase_orders po ON po.id = i.purchase_order_id
        LEFT JOIN public.work_orders wo ON wo.id = i.work_order_id
        LEFT JOIN public.purchase_orders pow ON pow.id = wo.purchase_order_id
        WHERE i.id = payments.invoice_id
          AND (
            private.is_org_member(COALESCE(po.organization_id, pow.organization_id))
            OR private.is_supplier_user_for(i.supplier_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS payments_insert ON public.payments;
CREATE POLICY payments_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_platform_admin()
    OR (
      payments.purchase_order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = payments.purchase_order_id
          AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
      )
    )
    OR (
      payments.invoice_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.invoices i
        LEFT JOIN public.purchase_orders po ON po.id = i.purchase_order_id
        LEFT JOIN public.work_orders wo ON wo.id = i.work_order_id
        LEFT JOIN public.purchase_orders pow ON pow.id = wo.purchase_order_id
        WHERE i.id = payments.invoice_id
          AND private.get_org_role(COALESCE(po.organization_id, pow.organization_id)) IN ('OWNER', 'MANAGER')
      )
    )
  );

DROP POLICY IF EXISTS payments_update ON public.payments;
CREATE POLICY payments_update ON public.payments
  FOR UPDATE TO authenticated
  USING (
    private.is_platform_admin()
    OR (
      payments.purchase_order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = payments.purchase_order_id
          AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
      )
    )
    OR (
      payments.invoice_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.invoices i
        LEFT JOIN public.purchase_orders po ON po.id = i.purchase_order_id
        LEFT JOIN public.work_orders wo ON wo.id = i.work_order_id
        LEFT JOIN public.purchase_orders pow ON pow.id = wo.purchase_order_id
        WHERE i.id = payments.invoice_id
          AND private.get_org_role(COALESCE(po.organization_id, pow.organization_id)) IN ('OWNER', 'MANAGER')
      )
    )
  )
  WITH CHECK (true);

COMMIT;
