-- =============================================================================
-- Migration 00167: Phase 5A — Multi-Milestone Progressive Invoicing & Line Items
--
-- Description:
--   1. Creates purchase_order_line_items table for normalized BoQ itemization.
--   2. Enhances work_order_milestones with allocation amounts, invoiced amounts,
--      milestone ordering, and invoicing status flags.
--   3. Enhances invoices with purchase_order_id, milestone_id, and invoice_type.
--   4. Creates invoice_line_items table for line-item progressive invoicing.
--   5. Adds database-level trigger & check functions for over-invoicing protection,
--      cumulative allocation integrity, and concurrency safety.
--   6. Backfills existing legacy POs, milestones, and single invoices.
--   7. Configures comprehensive Row-Level Security (RLS) policies.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Table: purchase_order_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.purchase_order_line_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_index      integer NOT NULL,
  description     text NOT NULL,
  quantity        numeric(14, 4) NOT NULL CHECK (quantity > 0),
  unit            text NOT NULL DEFAULT 'units',
  unit_price      numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  taxable_amount  numeric(14, 2) NOT NULL CHECK (taxable_amount >= 0),
  gst_rate        numeric(5, 2) NOT NULL DEFAULT 18.00 CHECK (gst_rate >= 0),
  gst_amount      numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (gst_amount >= 0),
  total_amount    numeric(14, 2) NOT NULL CHECK (total_amount >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_po_line_items_po_index UNIQUE (purchase_order_id, item_index)
);

CREATE INDEX IF NOT EXISTS idx_po_line_items_po ON public.purchase_order_line_items(purchase_order_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS po_line_items_updated_at ON public.purchase_order_line_items;
CREATE TRIGGER po_line_items_updated_at
  BEFORE UPDATE ON public.purchase_order_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Enhance work_order_milestones
-- ---------------------------------------------------------------------------
ALTER TABLE public.work_order_milestones
  ADD COLUMN IF NOT EXISTS allocated_amount numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (allocated_amount >= 0),
  ADD COLUMN IF NOT EXISTS invoiced_amount  numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (invoiced_amount >= 0),
  ADD COLUMN IF NOT EXISTS milestone_index  integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_invoiced      boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wo_milestones_index ON public.work_order_milestones(work_order_id, milestone_index);

-- ---------------------------------------------------------------------------
-- 3. Enhance invoices & Ensure purchase_order_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS milestone_id      uuid REFERENCES public.work_order_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoice_type      text NOT NULL DEFAULT 'PROGRESSIVE'
    CHECK (invoice_type IN ('PROGRESSIVE', 'FINAL', 'ADVANCE', 'STANDARD'));

CREATE INDEX IF NOT EXISTS idx_invoices_po ON public.invoices(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_milestone ON public.invoices(milestone_id);

-- Backfill purchase_order_id on existing invoices from work_orders
UPDATE public.invoices i
SET purchase_order_id = wo.purchase_order_id
FROM public.work_orders wo
WHERE i.work_order_id = wo.id
  AND i.purchase_order_id IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Table: invoice_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  po_line_item_id   uuid REFERENCES public.purchase_order_line_items(id) ON DELETE SET NULL,
  milestone_id      uuid REFERENCES public.work_order_milestones(id) ON DELETE SET NULL,
  line_index        integer NOT NULL,
  description       text NOT NULL,
  quantity          numeric(14, 4) NOT NULL CHECK (quantity > 0),
  unit_price        numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
  taxable_amount    numeric(14, 2) NOT NULL CHECK (taxable_amount >= 0),
  gst_amount        numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (gst_amount >= 0),
  total_amount      numeric(14, 2) NOT NULL CHECK (total_amount >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_inv_line_items_inv_index UNIQUE (invoice_id, line_index)
);

CREATE INDEX IF NOT EXISTS idx_inv_line_items_inv ON public.invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_line_items_po_line ON public.invoice_line_items(po_line_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_line_items_milestone ON public.invoice_line_items(milestone_id);

DROP TRIGGER IF EXISTS invoice_line_items_updated_at ON public.invoice_line_items;
CREATE TRIGGER invoice_line_items_updated_at
  BEFORE UPDATE ON public.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Backfill: Generate PO Line Items and Milestone Allocations for existing POs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_po RECORD;
  v_base numeric;
  v_item1 numeric;
  v_item2 numeric;
  v_item3 numeric;
  v_wo RECORD;
  v_m1_amt numeric;
  v_m2_amt numeric;
  v_m3_amt numeric;
  v_m4_amt numeric;
BEGIN
  -- Backfill line items for POs that don't have line items yet
  FOR v_po IN SELECT po.id, po.total_amount, po.po_number, r.title FROM public.purchase_orders po LEFT JOIN public.rfqs r ON r.id = po.rfq_id LOOP
    IF NOT EXISTS (SELECT 1 FROM public.purchase_order_line_items WHERE purchase_order_id = v_po.id) THEN
      v_base := round(v_po.total_amount / 1.18, 2);
      v_item1 := round(v_base * 0.50, 2);
      v_item2 := round(v_base * 0.30, 2);
      v_item3 := v_base - (v_item1 + v_item2);

      INSERT INTO public.purchase_order_line_items (
        purchase_order_id, item_index, description, quantity, unit, unit_price, taxable_amount, gst_rate, gst_amount, total_amount
      ) VALUES
      (
        v_po.id, 1, 'Primary Contract Scope / Core Deliverables - ' || COALESCE(v_po.title, v_po.po_number),
        1, 'lot', v_item1, v_item1, 18.00, round(v_item1 * 0.18, 2), round(v_item1 * 1.18, 2)
      ),
      (
        v_po.id, 2, 'Execution, Labor, Testing & Site Staging',
        1, 'lot', v_item2, v_item2, 18.00, round(v_item2 * 0.18, 2), round(v_item2 * 1.18, 2)
      ),
      (
        v_po.id, 3, 'QA Inspection Sign-off & Warranty Activation',
        1, 'lot', v_item3, v_item3, 18.00, round(v_item3 * 0.18, 2), round(v_item3 * 1.18, 2)
      );
    END IF;
  END LOOP;

  -- Backfill milestone allocations for existing work order milestones
  FOR v_wo IN SELECT wo.id, po.total_amount FROM public.work_orders wo JOIN public.purchase_orders po ON po.id = wo.purchase_order_id LOOP
    IF NOT EXISTS (SELECT 1 FROM public.work_order_milestones WHERE work_order_id = v_wo.id) THEN
      v_m1_amt := round(v_wo.total_amount * 0.20, 2);
      v_m2_amt := round(v_wo.total_amount * 0.40, 2);
      v_m3_amt := round(v_wo.total_amount * 0.30, 2);
      v_m4_amt := v_wo.total_amount - (v_m1_amt + v_m2_amt + v_m3_amt);

      INSERT INTO public.work_order_milestones (
        work_order_id, milestone_index, milestone_title, target_percentage, allocated_amount, status
      ) VALUES
      (v_wo.id, 1, 'Milestone 1: Advance / Mobilization & Requisition', 25, v_m1_amt, 'PENDING'),
      (v_wo.id, 2, 'Milestone 2: Material Dispatch & In-Transit', 50, v_m2_amt, 'PENDING'),
      (v_wo.id, 3, 'Milestone 3: Installation & QA Inspection', 75, v_m3_amt, 'PENDING'),
      (v_wo.id, 4, 'Milestone 4: Final Acceptance & Retention Sign-off', 100, v_m4_amt, 'PENDING');
    ELSE
      -- Update existing milestones if allocated_amount is 0
      UPDATE public.work_order_milestones
      SET allocated_amount = CASE
        WHEN target_percentage <= 25 THEN round(v_wo.total_amount * 0.20, 2)
        WHEN target_percentage <= 50 THEN round(v_wo.total_amount * 0.40, 2)
        WHEN target_percentage <= 75 THEN round(v_wo.total_amount * 0.30, 2)
        ELSE round(v_wo.total_amount * 0.10, 2)
      END
      WHERE work_order_id = v_wo.id AND allocated_amount = 0;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 6. Integrity & Over-Invoicing Prevention Functions & Triggers
-- ---------------------------------------------------------------------------

-- Helper function: calculate PO invoiced summary
CREATE OR REPLACE FUNCTION public.get_purchase_order_invoicing_summary(p_po_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_total_invoiced numeric(14, 2) := 0.00;
  v_approved_invoiced numeric(14, 2) := 0.00;
  v_remaining numeric(14, 2) := 0.00;
  v_invoice_count integer := 0;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Purchase order not found');
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status <> 'REJECTED'), 0.00),
    COALESCE(SUM(amount) FILTER (WHERE status IN ('APPROVED', 'PAID')), 0.00),
    COUNT(*) FILTER (WHERE status <> 'REJECTED')
  INTO v_total_invoiced, v_approved_invoiced, v_invoice_count
  FROM public.invoices
  WHERE purchase_order_id = p_po_id
     OR (purchase_order_id IS NULL AND work_order_id IN (SELECT id FROM public.work_orders WHERE purchase_order_id = p_po_id));

  v_remaining := GREATEST(0.00, v_po.total_amount - v_total_invoiced);

  RETURN jsonb_build_object(
    'ok', true,
    'purchase_order_id', p_po_id,
    'total_authorized_amount', v_po.total_amount,
    'already_invoiced_amount', v_total_invoiced,
    'approved_invoiced_amount', v_approved_invoiced,
    'remaining_invoiceable_amount', v_remaining,
    'invoice_count', v_invoice_count,
    'is_fully_invoiced', (v_remaining <= 0.01)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_purchase_order_invoicing_summary(uuid) TO authenticated, anon, service_role;

-- Over-invoicing validation trigger on invoices table
CREATE OR REPLACE FUNCTION public.validate_invoice_allocation_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po_id uuid;
  v_po_total numeric(14, 2);
  v_cumulative_invoiced numeric(14, 2);
  v_milestone_allocated numeric(14, 2);
  v_milestone_invoiced numeric(14, 2);
BEGIN
  -- Resolve purchase_order_id
  IF NEW.purchase_order_id IS NULL THEN
    SELECT purchase_order_id INTO v_po_id FROM public.work_orders WHERE id = NEW.work_order_id;
    NEW.purchase_order_id := v_po_id;
  ELSE
    v_po_id := NEW.purchase_order_id;
  END IF;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Invoice must be associated with a valid Purchase Order (INV-5A-01)';
  END IF;

  -- Lock PO row to serialize concurrent progressive invoice submissions
  SELECT total_amount INTO v_po_total
  FROM public.purchase_orders
  WHERE id = v_po_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated Purchase Order not found (INV-5A-02)';
  END IF;

  -- Calculate cumulative non-rejected invoiced amount including current invoice
  SELECT COALESCE(SUM(amount), 0.00)
  INTO v_cumulative_invoiced
  FROM public.invoices
  WHERE purchase_order_id = v_po_id
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status <> 'REJECTED';

  IF (v_cumulative_invoiced + NEW.amount) > (v_po_total + 0.05) THEN
    RAISE EXCEPTION 'Over-invoicing violation: Cumulative invoice total (₹%) exceeds PO authorized amount (₹%) (INV-5A-OVERINVOICE)',
      (v_cumulative_invoiced + NEW.amount), v_po_total;
  END IF;

  -- If tied to a milestone, validate milestone cap
  IF NEW.milestone_id IS NOT NULL THEN
    SELECT allocated_amount INTO v_milestone_allocated
    FROM public.work_order_milestones
    WHERE id = NEW.milestone_id
    FOR UPDATE;

    IF FOUND AND v_milestone_allocated > 0 THEN
      SELECT COALESCE(SUM(amount), 0.00)
      INTO v_milestone_invoiced
      FROM public.invoices
      WHERE milestone_id = NEW.milestone_id
        AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status <> 'REJECTED';

      IF (v_milestone_invoiced + NEW.amount) > (v_milestone_allocated + 0.05) THEN
        RAISE EXCEPTION 'Milestone over-invoicing violation: Cumulative milestone invoiced (₹%) exceeds milestone allocated amount (₹%) (INV-5A-MILESTONE-OVERINVOICE)',
          (v_milestone_invoiced + NEW.amount), v_milestone_allocated;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_invoice_allocation_integrity ON public.invoices;
CREATE TRIGGER trg_validate_invoice_allocation_integrity
  BEFORE INSERT OR UPDATE OF amount, purchase_order_id, milestone_id, status ON public.invoices
  FOR EACH ROW
  WHEN (NEW.status <> 'REJECTED')
  EXECUTE FUNCTION public.validate_invoice_allocation_integrity();

-- Trigger to keep milestone.invoiced_amount and is_invoiced in sync
CREATE OR REPLACE FUNCTION public.sync_milestone_invoiced_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_m_id uuid;
  v_total numeric(14, 2);
  v_allocated numeric(14, 2);
BEGIN
  v_m_id := COALESCE(NEW.milestone_id, OLD.milestone_id);
  IF v_m_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0.00)
    INTO v_total
    FROM public.invoices
    WHERE milestone_id = v_m_id AND status <> 'REJECTED';

    SELECT allocated_amount INTO v_allocated
    FROM public.work_order_milestones
    WHERE id = v_m_id;

    UPDATE public.work_order_milestones
    SET invoiced_amount = v_total,
        is_invoiced = (v_total >= GREATEST(v_allocated, 1.00)),
        updated_at = now()
    WHERE id = v_m_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_milestone_invoiced_state ON public.invoices;
CREATE TRIGGER trg_sync_milestone_invoiced_state
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_milestone_invoiced_state();

-- ---------------------------------------------------------------------------
-- 7. Row-Level Security (RLS) Policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- PO Line items select policy
CREATE POLICY po_line_items_select ON public.purchase_order_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_line_items.purchase_order_id
        AND (
          private.is_org_member(po.organization_id)
          OR private.is_supplier_user_for(po.supplier_id)
          OR private.is_platform_admin()
        )
    )
  );

-- PO Line items insert/update/delete policy (Buyer managers/owners or platform admin)
CREATE POLICY po_line_items_modify ON public.purchase_order_line_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = purchase_order_line_items.purchase_order_id
        AND (
          private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER')
          OR private.is_platform_admin()
        )
    )
  );

-- Invoice Line items select policy
CREATE POLICY invoice_line_items_select ON public.invoice_line_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.purchase_orders po ON po.id = i.purchase_order_id
      WHERE i.id = invoice_line_items.invoice_id
        AND (
          private.is_org_member(po.organization_id)
          OR private.is_supplier_user_for(i.supplier_id)
          OR private.is_platform_admin()
        )
    )
  );

-- Invoice Line items insert/update/delete policy (Supplier or platform admin)
CREATE POLICY invoice_line_items_modify ON public.invoice_line_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND (
          private.is_supplier_user_for(i.supplier_id)
          OR private.is_platform_admin()
        )
    )
  );

-- Update RLS on invoices to also leverage purchase_order_id directly
DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (
    private.is_supplier_user_for(supplier_id)
    OR private.is_platform_admin()
    OR (
      purchase_order_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.purchase_orders po
        WHERE po.id = invoices.purchase_order_id
          AND private.is_org_member(po.organization_id)
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.work_orders wo
      JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = invoices.work_order_id
        AND private.is_org_member(po.organization_id)
    )
  );

COMMIT;
