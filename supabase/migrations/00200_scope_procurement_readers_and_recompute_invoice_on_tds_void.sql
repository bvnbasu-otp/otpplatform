-- Migration 00200: Per-RFQ caller checks on procurement readers and invoice
-- recompute when TDS is voided
--
-- Every function below is re-created from its latest definition in the chain
-- (00148, 00196, 00199); only the stated fix changes.
--
-- 1. get_current_procurement_step (00148) and
--    check_supplier_award_eligibility_atomic (00196) had no caller check; 00199
--    only removed the anon grant. Neither has a client or SQL caller, and no
--    supplier path needs them, so access is limited to members of the buying
--    organization, platform admins and service_role.
-- 2. private.enforce_invoice_tds_balance (00199) returned early once live TDS
--    reached 0, so voiding a deduction left balance_due netted and a PAID
--    invoice PAID. It now recomputes for every invoice that has ever carried
--    TDS and moves PAID back to PARTIALLY_PAID / APPROVED when the balance
--    reopens (same rule as sync_invoice_payment_state). A void writes a
--    'tds.voided' audit event.
--
-- Idempotent and non-destructive: no table, column or row is dropped or
-- deleted.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Procurement readers: buying organization, platform admin, service_role
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_current_procurement_step(
  p_requirement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_latest_step int;
  v_latest_code text;
  v_latest_title text;
  v_rfq_id uuid;
  v_po_id uuid;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.requirements WHERE id = p_requirement_id;
  IF NOT COALESCE(
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (v_org_id IS NOT NULL AND private.is_org_member(v_org_id)),
    false
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  -- Look for highest completed stage event
  SELECT step_number, step_code, step_title, rfq_id, order_id
  INTO v_latest_step, v_latest_code, v_latest_title, v_rfq_id, v_po_id
  FROM public.procurement_stage_events
  WHERE requirement_id = p_requirement_id
  ORDER BY step_number DESC, created_at DESC
  LIMIT 1;

  -- Default to Step 1 if no stage event exists yet
  IF v_latest_step IS NULL THEN
    v_latest_step := 1;
    v_latest_code := 'STEP_1_SPEC_SUBMITTED';
    v_latest_title := 'Once Spec is Submitted';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'step_number', v_latest_step,
    'step_code', v_latest_code,
    'step_title', v_latest_title,
    'rfq_id', v_rfq_id,
    'order_id', v_po_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_current_procurement_step(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_procurement_step(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_supplier_award_eligibility_atomic(
  p_award_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_award     public.awards%ROWTYPE;
  v_quote     public.quotes%ROWTYPE;
  v_supplier  public.suppliers%ROWTYPE;
  v_can_rev   boolean := false;
  v_can_exec  boolean := false;
  v_onb_req   boolean := false;
  v_reason    text := NULL;
  v_org_id    uuid;
BEGIN
  SELECT * INTO v_award FROM public.awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Award not found');
  END IF;

  SELECT organization_id INTO v_org_id FROM public.rfqs WHERE id = v_award.rfq_id;
  IF NOT COALESCE(
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (v_org_id IS NOT NULL AND private.is_org_member(v_org_id)),
    false
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Quote not found');
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Supplier not found');
  END IF;

  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED' THEN
    v_can_rev := true;
    v_can_exec := true;
  ELSIF v_supplier.lifecycle_state IN ('QUOTE_PARTICIPANT', 'ONBOARDING_REQUIRED') THEN
    v_onb_req := true;
    v_reason := 'Supplier onboarding and identity verification required before reveal or execution.';
  ELSIF v_supplier.lifecycle_state = 'VERIFICATION_PENDING' THEN
    v_reason := 'Supplier identity verification is pending review.';
  ELSIF v_supplier.lifecycle_state = 'VERIFICATION_FAILED' THEN
    v_reason := 'Supplier failed statutory identity verification.';
  ELSE
    v_reason := 'Supplier status is ' || v_supplier.lifecycle_state || '. Execution blocked.';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'supplier_id', v_supplier.id,
    'lifecycle_state', v_supplier.lifecycle_state,
    'verification_status', v_supplier.verification_status,
    'can_reveal', v_can_rev,
    'can_execute_downstream', v_can_exec,
    'onboarding_required', v_onb_req,
    'block_reason', v_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_supplier_award_eligibility_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_supplier_award_eligibility_atomic(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Invoice balance / status follow live TDS in both directions
-- ---------------------------------------------------------------------------
-- Invoices that never carried a TDS row are untouched, so allocation sync and
-- reversals keep their 00178 / 00172 / 00175 behaviour for them.

CREATE OR REPLACE FUNCTION private.enforce_invoice_tds_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_tds numeric(14, 2);
  v_rows integer;
  v_paid numeric(14, 2) := COALESCE(NEW.paid_amount, 0);
  v_amount numeric(14, 2) := COALESCE(NEW.amount, 0);
BEGIN
  SELECT COALESCE(SUM(tds_amount) FILTER (WHERE status <> 'VOIDED'), 0.00), count(*)
  INTO v_tds, v_rows
  FROM public.tds_deductions
  WHERE invoice_id = NEW.id;

  IF v_rows = 0 THEN
    RETURN NEW;
  END IF;

  NEW.balance_due := GREATEST(0.00, v_amount - v_paid - v_tds);

  IF NEW.status::text IN ('APPROVED', 'PARTIALLY_PAID') AND v_paid + v_tds >= v_amount THEN
    NEW.status := 'PAID';
  ELSIF NEW.status::text = 'PAID' AND v_paid + v_tds < v_amount THEN
    NEW.status := CASE
      WHEN v_paid > 0 THEN 'PARTIALLY_PAID'::public.invoice_status
      ELSE 'APPROVED'::public.invoice_status
    END;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_invoice_tds_balance() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.touch_invoice_after_tds_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_inv RECORD;
BEGIN
  UPDATE public.invoices SET updated_at = now() WHERE id = NEW.invoice_id;
  IF TG_OP = 'UPDATE' AND OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
    UPDATE public.invoices SET updated_at = now() WHERE id = OLD.invoice_id;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'VOIDED' AND OLD.status IS DISTINCT FROM 'VOIDED' THEN
    SELECT id, status, balance_due, paid_amount, amount INTO v_inv
    FROM public.invoices WHERE id = NEW.invoice_id;

    INSERT INTO public.audit_events (
      event_type, actor_id, organization_id, entity_type, entity_id, payload
    ) VALUES (
      'tds.voided',
      private.get_profile_id(),
      NEW.organization_id,
      'tds_deduction',
      NEW.id::text,
      jsonb_build_object(
        'invoice_id', NEW.invoice_id,
        'tds_amount', NEW.tds_amount,
        'previous_status', OLD.status,
        'invoice_status_after', v_inv.status,
        'invoice_balance_due_after', v_inv.balance_due,
        'invoice_paid_amount', v_inv.paid_amount,
        'invoice_amount', v_inv.amount
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.touch_invoice_after_tds_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_touch_invoice_after_tds_change ON public.tds_deductions;
CREATE TRIGGER trg_touch_invoice_after_tds_change
  AFTER INSERT OR UPDATE OF status, tds_amount, invoice_id ON public.tds_deductions
  FOR EACH ROW EXECUTE FUNCTION private.touch_invoice_after_tds_change();

COMMIT;
