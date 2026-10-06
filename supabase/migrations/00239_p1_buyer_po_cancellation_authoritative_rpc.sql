-- =============================================================================
-- 00239: P1-C — Buyer PO cancellation enforced at the mutation boundary.
--
-- Discovery (both audit claims were true):
--   * purchase_orders (00002) has NO cancellation_reason / cancelled_at columns, so the
--     client's direct UPDATE ({status:'CANCELLED', cancellation_reason, cancelled_at})
--     could never succeed (PostgREST: column does not exist).
--   * RLS purchase_orders_update (00004) allows UPDATE to org manager+ OR a supplier user
--     of the PO, with no column / transition restriction. A supplier user could therefore
--     set status = 'CANCELLED' directly, and any buyer-org manager could cancel an
--     ACCEPTED/IN_PROGRESS PO, with no reason and no audit.
--
-- After:
--   * Columns cancellation_reason, cancelled_at, cancelled_by added.
--   * cancel_purchase_order_atomic(p_po_id, p_reason): the only path to CANCELLED.
--       - caller must be manager-or-above of the BUYER organisation of the PO (or platform admin);
--         a supplier user / non-manager member / outsider is refused;
--       - reason required (>= 5 chars);
--       - allowed only before supplier acceptance (DRAFT, PENDING_APPROVAL, APPROVED, ISSUED);
--         works after identity reveal (PO exists only after reveal) — reveal is not a block;
--       - writes audit_events 'po.cancelled' atomically.
--   * BEFORE UPDATE guard: a client (non-service) UPDATE cannot move a PO to CANCELLED or
--     touch the cancellation columns except through the RPC (session flag).
-- =============================================================================

BEGIN;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.guard_po_cancellation_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '')
     OR current_setting('otp.po_cancel_internal', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF (NEW.status = 'CANCELLED' AND OLD.status IS DISTINCT FROM 'CANCELLED')
     OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason
     OR NEW.cancelled_at        IS DISTINCT FROM OLD.cancelled_at
     OR NEW.cancelled_by        IS DISTINCT FROM OLD.cancelled_by THEN
    RAISE EXCEPTION 'Purchase orders must be cancelled via cancel_purchase_order_atomic (PO-CANCEL-DIRECT-WRITE)';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_po_cancellation_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_po_cancellation_write ON public.purchase_orders;
CREATE TRIGGER trg_guard_po_cancellation_write
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_po_cancellation_write();

CREATE OR REPLACE FUNCTION public.cancel_purchase_order_atomic(
  p_po_id  uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_po        public.purchase_orders%ROWTYPE;
  v_profile   uuid;
  v_reason    text := btrim(COALESCE(p_reason, ''));
  v_now       timestamptz := now();
BEGIN
  v_profile := private.get_profile_id();
  IF v_profile IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR COALESCE(private.get_org_role(v_po.organization_id) IN ('OWNER', 'MANAGER'), false)
  ) THEN
    RAISE EXCEPTION 'Only an owner or manager of the buying organisation can cancel this purchase order (PO-CANCEL-UNAUTHORIZED)';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'A valid cancellation reason is required (minimum 5 characters) (PO-CANCEL-REASON)';
  END IF;

  IF v_po.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Purchase order is already cancelled (PO-CANCEL-STATE)';
  END IF;

  IF v_po.status NOT IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ISSUED') OR v_po.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase order cannot be cancelled after supplier acceptance (current status: %) (PO-CANCEL-STATE)', v_po.status;
  END IF;

  PERFORM set_config('otp.po_cancel_internal', '1', true);
  UPDATE public.purchase_orders SET
    status = 'CANCELLED',
    cancellation_reason = v_reason,
    cancelled_at = v_now,
    cancelled_by = v_profile,
    updated_at = v_now
  WHERE id = p_po_id;

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES ('po.cancelled', v_profile, v_po.organization_id, 'purchase_order', p_po_id::text,
    jsonb_build_object('po_number', v_po.po_number, 'previous_status', v_po.status,
      'reason', v_reason, 'cancelled_at', v_now, 'supplier_id', v_po.supplier_id));

  RETURN jsonb_build_object('ok', true, 'po_id', p_po_id, 'status', 'CANCELLED',
    'previous_status', v_po.status, 'cancelled_at', v_now);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_purchase_order_atomic(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order_atomic(uuid, text) TO authenticated, service_role;

COMMIT;
