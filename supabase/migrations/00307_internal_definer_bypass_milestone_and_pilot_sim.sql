-- 00307: Privileged (SECURITY DEFINER / superuser) work-order writes bypass client milestone
-- enforcement; pilot demo simulator sets session flags for PO/WO transitions.

BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_work_order_milestone_progression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_from integer := COALESCE(OLD.progress_percent, 0);
  v_to integer := COALESCE(NEW.progress_percent, 0);
  v_po public.purchase_orders%ROWTYPE;
  v_steps integer[];
  v_reached integer := 0;
  v_next integer;
  v_i integer;
  v_signoff boolean := COALESCE(current_setting('otp.wo_inspection_signoff', true), '') = 'on';
BEGIN
  IF v_to = v_from AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = NEW.purchase_order_id;
  v_steps := private.po_progress_step_targets(v_po.payment_structure, v_po.payment_schedule);

  IF OLD.status = 'COMPLETED' THEN
    IF v_signoff AND NEW.status = 'COMPLETED' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'This work order is already completed; its milestones can no longer change (WO-MILESTONE-LOCKED)';
  END IF;

  IF v_to <> v_from THEN
    IF NOT COALESCE(
      private.is_supplier_user_for(NEW.supplier_id)
      OR private.is_org_manager_or_above(v_po.organization_id)
      OR private.is_buyer_scope_manager(v_po.organization_id, v_po.owner_profile_id),
      false
    ) THEN
      RAISE EXCEPTION 'Only the supplier or a buyer owner/manager can record work progress (WO-MILESTONE-UNAUTHORIZED)';
    END IF;

    FOR v_i IN 1..array_length(v_steps, 1) LOOP
      IF v_from >= v_steps[v_i] THEN
        v_reached := v_steps[v_i];
      END IF;
    END LOOP;

    IF NOT (v_to = ANY (v_steps)) THEN
      RAISE EXCEPTION 'Progress must match payment-plan milestones % (WO-MILESTONE-STEP)', v_steps;
    END IF;
    IF v_to <= v_reached THEN
      RAISE EXCEPTION 'Progress cannot go back from % to % (WO-MILESTONE-BACKWARD)', v_reached, v_to;
    END IF;

    v_next := NULL;
    FOR v_i IN 1..array_length(v_steps, 1) LOOP
      IF v_steps[v_i] > v_reached THEN
        v_next := v_steps[v_i];
        EXIT;
      END IF;
    END LOOP;
    IF v_next IS NULL OR v_to <> v_next THEN
      RAISE EXCEPTION 'Complete the % milestone before recording % (WO-MILESTONE-SKIP)', COALESCE(v_next, v_reached), v_to;
    END IF;
  END IF;

  IF NEW.status = 'COMPLETED' THEN
    IF NOT v_signoff THEN
      RAISE EXCEPTION 'A work order is completed only by buyer delivery inspection sign-off (WO-COMPLETION-REQUIRES-INSPECTION)';
    END IF;
    IF v_to < 100 THEN
      RAISE EXCEPTION 'A work order can be completed only at 100%% progress (WO-COMPLETION-BEFORE-100)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.simulate_pilot_supplier_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_now timestamptz := now();
  v_invoice_number text;
  v_rfq_is_demo boolean;
BEGIN
  IF NOT private.supplier_network_stub_enabled() THEN RETURN NEW; END IF;
  IF NEW.status = 'COMPLETED' THEN RETURN NEW; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = NEW.purchase_order_id;
  IF NOT FOUND OR v_po.status IN ('COMPLETED', 'CANCELLED') THEN RETURN NEW; END IF;

  SELECT is_demo INTO v_rfq_is_demo FROM rfqs WHERE id = v_po.rfq_id;
  IF NOT (COALESCE(NEW.is_demo, false) OR COALESCE(v_po.is_demo, false) OR COALESCE(v_rfq_is_demo, false)) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.invoices WHERE work_order_id = NEW.id OR purchase_order_id = v_po.id) THEN
    RETURN NEW;
  END IF;

  PERFORM set_config('otp.po_transition_internal', '1', true);
  UPDATE purchase_orders
  SET status = 'ACCEPTED', acknowledged_at = COALESCE(acknowledged_at, v_now), updated_at = v_now
  WHERE id = v_po.id AND status = 'ISSUED';
  PERFORM set_config('otp.po_transition_internal', '', true);

  PERFORM set_config('otp.wo_inspection_signoff', 'on', true);
  UPDATE work_orders
  SET status = 'COMPLETED',
      progress_percent = 100,
      actual_start = COALESCE(actual_start, v_now),
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now
  WHERE id = NEW.id;
  PERFORM set_config('otp.wo_inspection_signoff', '', true);

  v_invoice_number := 'INV-' || to_char(v_now, 'YYYYMMDD')
    || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  INSERT INTO invoices (
    work_order_id, supplier_id, invoice_number, amount, currency, status, submitted_at
  ) VALUES (
    NEW.id, NEW.supplier_id, v_invoice_number, v_po.total_amount, v_po.currency, 'SUBMITTED', v_now
  );

  RETURN NEW;
END;
$$;

COMMIT;
