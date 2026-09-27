-- Migration 00202: Scope invoice / work order updates and close direct client
-- inserts into audit_events, notifications and supplier_notifications
--
-- R10. invoices_update and work_orders_update (00004) limited which rows a
--      caller could update (USING) but accepted any resulting row
--      (WITH CHECK (true)), so a supplier or buyer manager could re-point an
--      invoice or work order at another supplier, work order or purchase
--      order. WITH CHECK now mirrors USING, and a BEFORE UPDATE trigger on
--      each table rejects changes to linkage columns from API callers:
--        invoices:    work_order_id, supplier_id, purchase_order_id,
--                     milestone_id, is_demo
--        work_orders: purchase_order_id, supplier_id, is_demo
--      Neither table has organization_id or rfq_id; ownership is derived
--      through purchase_orders. Allowed through:
--        - service_role, and sessions with no JWT (migrations, direct DB);
--        - nested trigger / foreign-key actions (pg_trigger_depth() > 1),
--          e.g. invoices.milestone_id ON DELETE SET NULL;
--        - invoices.purchase_order_id NULL -> the work order's own PO, which
--          validate_invoice_allocation_integrity derives on update.
--      No client, edge or SQL update path changes these columns: client
--      updates set status / approved_at / paid_amount / balance_due /
--      progress_percent / completed_at / updated_at, and every SQL updater
--      (accept_delivery_inspection, admin_* tools, record_verified_payment,
--      reverse_payment_allocation_atomic, sync_invoice_payment_state,
--      apply_tds_withholding_atomic, touch_invoice_after_tds_change,
--      simulate_pilot_supplier_fulfillment) sets only status / financial /
--      timestamp fields.
--
-- R11. audit_events_insert (anon, authenticated), notifications_insert and
--      supplier_notifications_insert (authenticated) were WITH CHECK (true),
--      so any caller (audit: even anon) could forge audit rows with any
--      actor_id or notify any user or supplier. Every SQL writer of the three
--      tables is SECURITY DEFINER (runs as the owner) and edge functions use
--      service_role, so the policies are dropped with no replacement and
--      INSERT is revoked from anon and authenticated. No client inserts into
--      notifications or supplier_notifications. The four client audit writers
--      (all platform-admin tools) move to public.log_client_audit_event,
--      which sets actor_id from the session, accepts only admin.* events
--      from platform admins, checks organization membership and stamps the
--      payload with source = 'client_rpc'. audit_events stays append-only.
--
-- Idempotent and non-destructive: DROP POLICY / DROP TRIGGER IF EXISTS +
-- CREATE, CREATE OR REPLACE FUNCTION; no table, column or row is dropped.

BEGIN;

-- ---------------------------------------------------------------------------
-- R10.1 work_orders_update: WITH CHECK mirrors USING
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS work_orders_update ON public.work_orders;
CREATE POLICY work_orders_update ON public.work_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = work_orders.purchase_order_id
        AND (
          private.is_org_manager_or_above(po.organization_id)
          OR private.is_supplier_user_for(work_orders.supplier_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = work_orders.purchase_order_id
        AND (
          private.is_org_manager_or_above(po.organization_id)
          OR private.is_supplier_user_for(work_orders.supplier_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- R10.2 invoices_update: WITH CHECK mirrors USING
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS invoices_update ON public.invoices;
CREATE POLICY invoices_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    private.is_supplier_user_for(supplier_id)
    OR EXISTS (
      SELECT 1
      FROM public.work_orders wo
      JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = invoices.work_order_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER', 'APPROVER')
    )
  )
  WITH CHECK (
    private.is_supplier_user_for(supplier_id)
    OR EXISTS (
      SELECT 1
      FROM public.work_orders wo
      JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = invoices.work_order_id
        AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER', 'APPROVER')
    )
  );

-- ---------------------------------------------------------------------------
-- R10.3 Linkage columns are immutable for API callers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.guard_invoice_linkage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     AND NOT (
       OLD.purchase_order_id IS NULL
       AND NEW.purchase_order_id IS NOT DISTINCT FROM
         (SELECT wo.purchase_order_id FROM public.work_orders wo WHERE wo.id = OLD.work_order_id)
     ) THEN
    RAISE EXCEPTION 'An invoice cannot be moved to another purchase order (INV-LINKAGE-IMMUTABLE)';
  END IF;

  IF NEW.work_order_id IS DISTINCT FROM OLD.work_order_id
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.milestone_id IS DISTINCT FROM OLD.milestone_id
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'An invoice''s work order, supplier, milestone and mode cannot be changed (INV-LINKAGE-IMMUTABLE)';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_invoice_linkage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_aa_guard_invoice_linkage ON public.invoices;
CREATE TRIGGER trg_aa_guard_invoice_linkage
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_linkage();

CREATE OR REPLACE FUNCTION private.guard_work_order_linkage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'A work order''s purchase order, supplier and mode cannot be changed (WO-LINKAGE-IMMUTABLE)';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_work_order_linkage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_aa_guard_work_order_linkage ON public.work_orders;
CREATE TRIGGER trg_aa_guard_work_order_linkage
  BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_work_order_linkage();

-- ---------------------------------------------------------------------------
-- R11.1 No direct client INSERT into audit_events / notifications /
--       supplier_notifications (server functions and service_role only)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
REVOKE INSERT ON public.audit_events FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS notifications_insert ON public.notifications;
REVOKE INSERT ON public.notifications FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF to_regclass('public.supplier_notifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS supplier_notifications_insert ON public.supplier_notifications;
    REVOKE INSERT ON public.supplier_notifications FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- R11.2 Narrow audit writer for platform-admin client tools
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_client_audit_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_organization_id uuid DEFAULT NULL,
  p_is_demo boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  IF NOT COALESCE(private.is_platform_admin(), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  IF p_event_type IS NULL OR p_event_type !~ '^admin\.[a-z0-9_]+(\.[a-z0-9_]+)*$' OR length(p_event_type) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Event type not allowed');
  END IF;

  IF p_entity_type IS NULL OR p_entity_type NOT IN (
    'REQUIREMENT', 'RFQ', 'QUOTE', 'PURCHASE_ORDER', 'INVOICE', 'SUPPLIER', 'BUYER', 'SYSTEM',
    'DATABASE_RESET', 'AUDIT_SYSTEM', 'NOTIFICATION_SYSTEM'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entity type not allowed');
  END IF;

  IF p_entity_id IS NULL OR btrim(p_entity_id) = '' OR length(p_entity_id) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Entity id is required');
  END IF;

  IF p_payload IS NOT NULL AND (jsonb_typeof(p_payload) <> 'object' OR length(p_payload::text) > 16384) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Payload must be a JSON object under 16 KB');
  END IF;

  IF p_organization_id IS NOT NULL
     AND NOT COALESCE(private.is_platform_admin() OR private.is_org_member(p_organization_id), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  v_actor := private.get_profile_id();

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload, is_demo)
  VALUES (
    p_event_type,
    v_actor,
    p_organization_id,
    p_entity_type,
    p_entity_id,
    COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('source', 'client_rpc'),
    COALESCE(p_is_demo, false)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.log_client_audit_event(text, text, text, jsonb, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_client_audit_event(text, text, text, jsonb, uuid, boolean) TO authenticated;

COMMIT;
