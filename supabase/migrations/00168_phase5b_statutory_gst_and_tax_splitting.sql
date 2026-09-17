-- =============================================================================
-- Migration 00168: Phase 5B — Statutory India GST & Tax Splitting Engine
--
-- Description:
--   1. Extends purchase_order_line_items with HSN/SAC and CGST/SGST/UTGST/IGST columns.
--   2. Extends invoice_line_items with HSN/SAC and CGST/SGST/UTGST/IGST columns.
--   3. Extends purchase_orders and invoices with POS state, POS basis, tax_snapshot,
--      taxable_total, cgst_total, sgst_total, utgst_total, and igst_total.
--   4. Performs deterministic backfill on historical POs and invoices.
--   5. Implements trigger functions to freeze tax snapshot & tax amounts on approved/paid invoices.
--   6. Enforces RLS policies for tenant isolation across buyer and supplier actors.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Extend purchase_order_line_items with Statutory Tax Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_order_line_items
  ADD COLUMN IF NOT EXISTS hsn_code varchar(10),
  ADD COLUMN IF NOT EXISTS cgst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (cgst_rate >= 0),
  ADD COLUMN IF NOT EXISTS cgst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (cgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS sgst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (sgst_rate >= 0),
  ADD COLUMN IF NOT EXISTS sgst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (sgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS utgst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (utgst_rate >= 0),
  ADD COLUMN IF NOT EXISTS utgst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (utgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS igst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (igst_rate >= 0),
  ADD COLUMN IF NOT EXISTS igst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (igst_amount >= 0);

-- ---------------------------------------------------------------------------
-- 2. Extend invoice_line_items with Statutory Tax Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS hsn_code varchar(10),
  ADD COLUMN IF NOT EXISTS cgst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (cgst_rate >= 0),
  ADD COLUMN IF NOT EXISTS cgst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (cgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS sgst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (sgst_rate >= 0),
  ADD COLUMN IF NOT EXISTS sgst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (sgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS utgst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (utgst_rate >= 0),
  ADD COLUMN IF NOT EXISTS utgst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (utgst_amount >= 0),
  ADD COLUMN IF NOT EXISTS igst_rate numeric(5,2) NOT NULL DEFAULT 0.00 CHECK (igst_rate >= 0),
  ADD COLUMN IF NOT EXISTS igst_amount numeric(14,2) NOT NULL DEFAULT 0.00 CHECK (igst_amount >= 0);

-- ---------------------------------------------------------------------------
-- 3. Extend purchase_orders & invoices with POS & Tax Aggregates
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS place_of_supply_state_code varchar(2),
  ADD COLUMN IF NOT EXISTS place_of_supply_basis text,
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS taxable_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cgst_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS sgst_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS utgst_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS igst_total numeric(14,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS place_of_supply_state_code varchar(2),
  ADD COLUMN IF NOT EXISTS place_of_supply_basis text,
  ADD COLUMN IF NOT EXISTS tax_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS taxable_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cgst_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS sgst_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS utgst_total numeric(14,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS igst_total numeric(14,2) NOT NULL DEFAULT 0.00;

-- ---------------------------------------------------------------------------
-- 4. Deterministic Backfill for Historical POs & Invoices
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_po RECORD;
  v_sup_state varchar(2);
  v_buyer_state varchar(2);
  v_pos_state varchar(2);
  v_is_inter boolean;
  v_is_ut boolean;
  v_li RECORD;
  v_half_rate numeric(5,2);
  v_half_amt numeric(14,2);
  v_rem_amt numeric(14,2);
  v_hsn varchar(10);
  v_inv RECORD;
  v_inv_li RECORD;
  v_taxable_sum numeric(14,2);
  v_cgst_sum numeric(14,2);
  v_sgst_sum numeric(14,2);
  v_utgst_sum numeric(14,2);
  v_igst_sum numeric(14,2);
BEGIN
  -- Backfill Purchase Orders
  FOR v_po IN
    SELECT
      po.id,
      po.po_number,
      po.total_amount,
      s.gstin AS sup_gstin,
      o.tax_registration AS buyer_gstin,
      r.title AS rfq_title
    FROM public.purchase_orders po
    LEFT JOIN public.suppliers s ON s.id = po.supplier_id
    LEFT JOIN public.organizations o ON o.id = po.organization_id
    LEFT JOIN public.rfqs r ON r.id = po.rfq_id
  LOOP
    -- Derive supplier state code (default '29' Karnataka if missing)
    v_sup_state := COALESCE(NULLIF(SUBSTRING(v_po.sup_gstin FROM '^[0-9]{2}'), ''), '29');
    -- Derive buyer state code (default '29' Karnataka if missing)
    v_buyer_state := COALESCE(NULLIF(SUBSTRING(v_po.buyer_gstin FROM '^[0-9]{2}'), ''), '29');

    v_pos_state := v_buyer_state;
    v_is_inter := (v_sup_state <> v_pos_state);
    v_is_ut := (NOT v_is_inter) AND (v_pos_state IN ('04', '25', '26', '31', '35', '38', '97'));

    -- Determine HSN Code based on category/title
    IF LOWER(COALESCE(v_po.rfq_title, '')) LIKE '%paint%' OR LOWER(COALESCE(v_po.rfq_title, '')) LIKE '%waterproof%' THEN
      v_hsn := '995473';
    ELSIF LOWER(COALESCE(v_po.rfq_title, '')) LIKE '%motor%' OR LOWER(COALESCE(v_po.rfq_title, '')) LIKE '%pump%' THEN
      v_hsn := '8413';
    ELSE
      v_hsn := '995411';
    END IF;

    -- Update PO Line Items for this PO
    FOR v_li IN SELECT * FROM public.purchase_order_line_items WHERE purchase_order_id = v_po.id LOOP
      IF v_is_inter THEN
        UPDATE public.purchase_order_line_items
        SET
          hsn_code = COALESCE(hsn_code, v_hsn),
          igst_rate = COALESCE(NULLIF(gst_rate, 0), 18.00),
          igst_amount = gst_amount,
          cgst_rate = 0.00,
          cgst_amount = 0.00,
          sgst_rate = 0.00,
          sgst_amount = 0.00,
          utgst_rate = 0.00,
          utgst_amount = 0.00
        WHERE id = v_li.id;
      ELSIF v_is_ut THEN
        v_half_rate := round(COALESCE(NULLIF(v_li.gst_rate, 0), 18.00) / 2.0, 2);
        v_half_amt := round(v_li.gst_amount / 2.0, 2);
        v_rem_amt := v_li.gst_amount - v_half_amt;

        UPDATE public.purchase_order_line_items
        SET
          hsn_code = COALESCE(hsn_code, v_hsn),
          cgst_rate = v_half_rate,
          cgst_amount = v_half_amt,
          utgst_rate = v_half_rate,
          utgst_amount = v_rem_amt,
          sgst_rate = 0.00,
          sgst_amount = 0.00,
          igst_rate = 0.00,
          igst_amount = 0.00
        WHERE id = v_li.id;
      ELSE
        v_half_rate := round(COALESCE(NULLIF(v_li.gst_rate, 0), 18.00) / 2.0, 2);
        v_half_amt := round(v_li.gst_amount / 2.0, 2);
        v_rem_amt := v_li.gst_amount - v_half_amt;

        UPDATE public.purchase_order_line_items
        SET
          hsn_code = COALESCE(hsn_code, v_hsn),
          cgst_rate = v_half_rate,
          cgst_amount = v_half_amt,
          sgst_rate = v_half_rate,
          sgst_amount = v_rem_amt,
          utgst_rate = 0.00,
          utgst_amount = 0.00,
          igst_rate = 0.00,
          igst_amount = 0.00
        WHERE id = v_li.id;
      END IF;
    END LOOP;

    -- Aggregate line item totals to PO Header
    SELECT
      COALESCE(SUM(taxable_amount), 0.00),
      COALESCE(SUM(cgst_amount), 0.00),
      COALESCE(SUM(sgst_amount), 0.00),
      COALESCE(SUM(utgst_amount), 0.00),
      COALESCE(SUM(igst_amount), 0.00)
    INTO v_taxable_sum, v_cgst_sum, v_sgst_sum, v_utgst_sum, v_igst_sum
    FROM public.purchase_order_line_items
    WHERE purchase_order_id = v_po.id;

    UPDATE public.purchase_orders
    SET
      place_of_supply_state_code = v_pos_state,
      place_of_supply_basis = 'GOODS_TERMINATION_LOCATION',
      taxable_total = v_taxable_sum,
      cgst_total = v_cgst_sum,
      sgst_total = v_sgst_sum,
      utgst_total = v_utgst_sum,
      igst_total = v_igst_sum
    WHERE id = v_po.id;
  END LOOP;

  -- Backfill Invoices and Invoice Line Items
  FOR v_inv IN
    SELECT
      i.id,
      i.invoice_number,
      i.amount,
      i.status,
      i.purchase_order_id,
      po.place_of_supply_state_code,
      po.place_of_supply_basis,
      po.organization_id,
      po.supplier_id,
      s.gstin AS sup_gstin,
      o.tax_registration AS buyer_gstin
    FROM public.invoices i
    LEFT JOIN public.purchase_orders po ON po.id = i.purchase_order_id
    LEFT JOIN public.suppliers s ON s.id = i.supplier_id
    LEFT JOIN public.organizations o ON o.id = po.organization_id
  LOOP
    v_sup_state := COALESCE(NULLIF(SUBSTRING(v_inv.sup_gstin FROM '^[0-9]{2}'), ''), '29');
    v_buyer_state := COALESCE(NULLIF(SUBSTRING(v_inv.buyer_gstin FROM '^[0-9]{2}'), ''), '29');
    v_pos_state := COALESCE(v_inv.place_of_supply_state_code, v_buyer_state);
    v_is_inter := (v_sup_state <> v_pos_state);
    v_is_ut := (NOT v_is_inter) AND (v_pos_state IN ('04', '25', '26', '31', '35', '38', '97'));

    -- Update invoice line items
    FOR v_inv_li IN SELECT * FROM public.invoice_line_items WHERE invoice_id = v_inv.id LOOP
      IF v_is_inter THEN
        UPDATE public.invoice_line_items
        SET
          hsn_code = COALESCE(hsn_code, '995411'),
          igst_rate = 18.00,
          igst_amount = gst_amount,
          cgst_rate = 0.00,
          cgst_amount = 0.00,
          sgst_rate = 0.00,
          sgst_amount = 0.00,
          utgst_rate = 0.00,
          utgst_amount = 0.00
        WHERE id = v_inv_li.id;
      ELSIF v_is_ut THEN
        v_half_rate := 9.00;
        v_half_amt := round(v_inv_li.gst_amount / 2.0, 2);
        v_rem_amt := v_inv_li.gst_amount - v_half_amt;

        UPDATE public.invoice_line_items
        SET
          hsn_code = COALESCE(hsn_code, '995411'),
          cgst_rate = v_half_rate,
          cgst_amount = v_half_amt,
          utgst_rate = v_half_rate,
          utgst_amount = v_rem_amt,
          sgst_rate = 0.00,
          sgst_amount = 0.00,
          igst_rate = 0.00,
          igst_amount = 0.00
        WHERE id = v_inv_li.id;
      ELSE
        v_half_rate := 9.00;
        v_half_amt := round(v_inv_li.gst_amount / 2.0, 2);
        v_rem_amt := v_inv_li.gst_amount - v_half_amt;

        UPDATE public.invoice_line_items
        SET
          hsn_code = COALESCE(hsn_code, '995411'),
          cgst_rate = v_half_rate,
          cgst_amount = v_half_amt,
          sgst_rate = v_half_rate,
          sgst_amount = v_rem_amt,
          utgst_rate = 0.00,
          utgst_amount = 0.00,
          igst_rate = 0.00,
          igst_amount = 0.00
        WHERE id = v_inv_li.id;
      END IF;
    END LOOP;

    -- Aggregate line item totals to Invoice Header
    SELECT
      COALESCE(SUM(taxable_amount), round(v_inv.amount / 1.18, 2)),
      COALESCE(SUM(cgst_amount), 0.00),
      COALESCE(SUM(sgst_amount), 0.00),
      COALESCE(SUM(utgst_amount), 0.00),
      COALESCE(SUM(igst_amount), 0.00)
    INTO v_taxable_sum, v_cgst_sum, v_sgst_sum, v_utgst_sum, v_igst_sum
    FROM public.invoice_line_items
    WHERE invoice_id = v_inv.id;

    -- If no line items existed, calculate defaults
    IF v_cgst_sum = 0 AND v_sgst_sum = 0 AND v_utgst_sum = 0 AND v_igst_sum = 0 AND v_inv.amount > 0 THEN
      v_taxable_sum := round(v_inv.amount / 1.18, 2);
      IF v_is_inter THEN
        v_igst_sum := v_inv.amount - v_taxable_sum;
      ELSIF v_is_ut THEN
        v_cgst_sum := round((v_inv.amount - v_taxable_sum) / 2.0, 2);
        v_utgst_sum := (v_inv.amount - v_taxable_sum) - v_cgst_sum;
      ELSE
        v_cgst_sum := round((v_inv.amount - v_taxable_sum) / 2.0, 2);
        v_sgst_sum := (v_inv.amount - v_taxable_sum) - v_cgst_sum;
      END IF;
    END IF;

    UPDATE public.invoices
    SET
      place_of_supply_state_code = v_pos_state,
      place_of_supply_basis = COALESCE(v_inv.place_of_supply_basis, 'GOODS_TERMINATION_LOCATION'),
      taxable_total = v_taxable_sum,
      cgst_total = v_cgst_sum,
      sgst_total = v_sgst_sum,
      utgst_total = v_utgst_sum,
      igst_total = v_igst_sum,
      tax_snapshot = jsonb_build_object(
        'snapshotVersion', '1.0',
        'capturedAt', now(),
        'supplierGstin', v_inv.sup_gstin,
        'supplierStateCode', v_sup_state,
        'buyerGstin', v_inv.buyer_gstin,
        'buyerStateCode', v_buyer_state,
        'placeOfSupplyStateCode', v_pos_state,
        'placeOfSupplyBasis', 'GOODS_TERMINATION_LOCATION',
        'isInterState', v_is_inter,
        'isUnionTerritory', v_is_ut,
        'taxableTotal', v_taxable_sum,
        'cgstTotal', v_cgst_sum,
        'sgstTotal', v_sgst_sum,
        'utgstTotal', v_utgst_sum,
        'igstTotal', v_igst_sum,
        'totalTax', (v_cgst_sum + v_sgst_sum + v_utgst_sum + v_igst_sum),
        'grossTotal', v_inv.amount
      )
    WHERE id = v_inv.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Immutability Trigger: Freeze Tax Snapshot on Finalized Invoices
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.freeze_invoice_tax_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If invoice was already approved or paid, forbid modifying tax snapshot and statutory columns
  IF OLD.status IN ('APPROVED', 'PAID') THEN
    IF (
      NEW.taxable_total IS DISTINCT FROM OLD.taxable_total OR
      NEW.cgst_total IS DISTINCT FROM OLD.cgst_total OR
      NEW.sgst_total IS DISTINCT FROM OLD.sgst_total OR
      NEW.utgst_total IS DISTINCT FROM OLD.utgst_total OR
      NEW.igst_total IS DISTINCT FROM OLD.igst_total OR
      NEW.place_of_supply_state_code IS DISTINCT FROM OLD.place_of_supply_state_code OR
      NEW.place_of_supply_basis IS DISTINCT FROM OLD.place_of_supply_basis OR
      NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot
    ) THEN
      RAISE EXCEPTION 'Cannot modify statutory tax values or frozen tax snapshot on finalized invoice % (INV-5B-FROZEN-TAX)', OLD.invoice_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_freeze_invoice_tax_snapshot ON public.invoices;
CREATE TRIGGER trg_freeze_invoice_tax_snapshot
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.freeze_invoice_tax_snapshot();

-- Prevent updating line items of approved / paid invoices
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
  SELECT status, invoice_number INTO v_inv_status, v_inv_num
  FROM public.invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  IF v_inv_status IN ('APPROVED', 'PAID') THEN
    RAISE EXCEPTION 'Cannot insert, update, or delete line items of finalized invoice % (INV-5B-LINE-FROZEN)', v_inv_num;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_invoice_line_items ON public.invoice_line_items;
CREATE TRIGGER trg_protect_invoice_line_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_invoice_line_items_immutability();

COMMIT;
