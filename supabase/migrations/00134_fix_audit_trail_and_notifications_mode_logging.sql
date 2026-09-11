-- Migration 00134: Fix Audit Trail and Notifications Mode Logging & Persistence
-- 1. Drops blocking append-only triggers on audit_events so admin clears can delete
-- 2. Updates private.trg_inherit_is_demo() to automatically tag new audit_events and notifications with is_demo = true when in Demo Mode
-- 3. Updates create_system_notification to respect active demo mode
-- 4. Hardens admin_clear_audit_logs_and_notifications to insert an audit event recording the clear action
-- 5. Hardens admin_clear_notifications to insert an audit event recording the clear action
-- 6. Ensures complete RLS policies (SELECT, INSERT, UPDATE, DELETE) for anon, authenticated, service_role on audit_events & notifications
-- 7. Ensures admin_get_audit_trail and admin_get_all_notifications properly return segregated logs

-- ---------------------------------------------------------------------------
-- 1. Configure append-only audit_events triggers with authorized maintenance bypass
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.prevent_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('otp.allow_audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events are append-only: UPDATE and DELETE forbidden (INV-071, INV-072)';
END;
$$;

DROP TRIGGER IF EXISTS audit_events_no_delete ON public.audit_events;
CREATE TRIGGER audit_events_no_delete
  BEFORE DELETE ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_audit_mutation();

DROP TRIGGER IF EXISTS audit_events_no_update ON public.audit_events;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_audit_mutation();

-- ---------------------------------------------------------------------------
-- 2. Update private.trg_inherit_is_demo() for automatic mode inheritance
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.trg_inherit_is_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_demo_active boolean := false;
BEGIN
  -- Check if platform is currently operating in Staging & Demo mode
  SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_active FROM public.demo_settings WHERE id = true;

  IF TG_TABLE_NAME = 'quotes' THEN
    IF NOT COALESCE(NEW.is_demo, false) THEN
      SELECT COALESCE(r.is_demo, false) INTO NEW.is_demo FROM rfqs r WHERE r.id = NEW.rfq_id;
      IF NOT COALESCE(NEW.is_demo, false) THEN
        NEW.is_demo := v_demo_active;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
    IF NOT COALESCE(NEW.is_demo, false) THEN
      SELECT COALESCE(r.is_demo, false) INTO NEW.is_demo FROM rfqs r WHERE r.id = NEW.rfq_id;
      IF NOT COALESCE(NEW.is_demo, false) THEN
        SELECT COALESCE(o.is_demo, false) INTO NEW.is_demo FROM organizations o WHERE o.id = NEW.organization_id;
      END IF;
      IF NOT COALESCE(NEW.is_demo, false) THEN
        NEW.is_demo := v_demo_active;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'work_orders' THEN
    IF NOT COALESCE(NEW.is_demo, false) THEN
      SELECT COALESCE(po.is_demo, false) INTO NEW.is_demo FROM purchase_orders po WHERE po.id = NEW.purchase_order_id;
      IF NOT COALESCE(NEW.is_demo, false) THEN
        NEW.is_demo := v_demo_active;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'invoices' THEN
    IF NOT COALESCE(NEW.is_demo, false) THEN
      SELECT COALESCE(wo.is_demo, false) INTO NEW.is_demo FROM work_orders wo WHERE wo.id = NEW.work_order_id;
      IF NOT COALESCE(NEW.is_demo, false) THEN
        NEW.is_demo := v_demo_active;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'payments' THEN
    IF NOT COALESCE(NEW.is_demo, false) THEN
      SELECT COALESCE(inv.is_demo, false) INTO NEW.is_demo FROM invoices inv WHERE inv.id = NEW.invoice_id;
      IF NOT COALESCE(NEW.is_demo, false) THEN
        NEW.is_demo := v_demo_active;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'notifications' THEN
    IF v_demo_active THEN
      -- If platform is in Demo Mode, every notification created is tagged as demo
      NEW.is_demo := true;
    ELSIF NOT COALESCE(NEW.is_demo, false) THEN
      IF NEW.profile_id IS NOT NULL THEN
        SELECT COALESCE(p.is_demo, false) INTO NEW.is_demo FROM profiles p WHERE p.id = NEW.profile_id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'supplier_notifications' THEN
    IF v_demo_active THEN
      NEW.is_demo := true;
    ELSIF NOT COALESCE(NEW.is_demo, false) THEN
      IF NEW.supplier_id IS NOT NULL THEN
        SELECT COALESCE(s.is_demo, false) INTO NEW.is_demo FROM suppliers s WHERE s.id = NEW.supplier_id;
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'audit_events' THEN
    IF v_demo_active THEN
      -- If platform is in Demo Mode, every audit event created is tagged as demo
      NEW.is_demo := true;
    ELSIF NOT COALESCE(NEW.is_demo, false) THEN
      IF NEW.organization_id IS NOT NULL THEN
        SELECT COALESCE(o.is_demo, false) INTO NEW.is_demo FROM organizations o WHERE o.id = NEW.organization_id;
      END IF;
      IF NOT COALESCE(NEW.is_demo, false) AND NEW.actor_id IS NOT NULL THEN
        SELECT COALESCE(p.is_demo, false) INTO NEW.is_demo FROM profiles p WHERE p.id = NEW.actor_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure triggers exist on notifications, audit_events, supplier_notifications
DROP TRIGGER IF EXISTS inherit_is_demo_notif ON public.notifications;
CREATE TRIGGER inherit_is_demo_notif
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION private.trg_inherit_is_demo();

DROP TRIGGER IF EXISTS inherit_is_demo_audit ON public.audit_events;
CREATE TRIGGER inherit_is_demo_audit
  BEFORE INSERT ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION private.trg_inherit_is_demo();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
    DROP TRIGGER IF EXISTS inherit_is_demo_supp_notif ON public.supplier_notifications;
    CREATE TRIGGER inherit_is_demo_supp_notif
      BEFORE INSERT ON public.supplier_notifications
      FOR EACH ROW EXECUTE FUNCTION private.trg_inherit_is_demo();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Update create_system_notification helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_system_notification(
  p_profile_id uuid,
  p_title text,
  p_body text,
  p_link text DEFAULT NULL,
  p_event_type text DEFAULT 'system.alert',
  p_action_type text DEFAULT 'SYSTEM_ALERT',
  p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_id uuid;
  v_is_demo boolean := false;
  v_demo_active boolean := false;
BEGIN
  SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_active FROM public.demo_settings WHERE id = true;

  IF v_demo_active THEN
    v_is_demo := true;
  ELSE
    SELECT COALESCE(p.is_demo, false) INTO v_is_demo FROM public.profiles p WHERE p.id = p_profile_id;
  END IF;

  INSERT INTO public.notifications (
    profile_id,
    channel,
    status,
    event_type,
    action_type,
    title,
    body,
    link,
    payload,
    is_demo,
    created_at,
    updated_at
  ) VALUES (
    p_profile_id,
    'IN_APP'::notification_channel,
    'PENDING'::notification_status,
    p_event_type,
    p_action_type,
    p_title,
    p_body,
    p_link,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(v_is_demo, false),
    now(),
    now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_system_notification(uuid, text, text, text, text, text, jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS Policies on audit_events and notifications
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- audit_events policies
  DROP POLICY IF EXISTS audit_events_select ON public.audit_events;
  CREATE POLICY audit_events_select ON public.audit_events
    FOR SELECT TO authenticated
    USING (
      private.is_platform_admin()
      OR (
        organization_id IS NOT NULL
        AND private.is_org_manager_or_above(organization_id)
      )
    );

  DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;
  CREATE POLICY audit_events_insert ON public.audit_events
    FOR INSERT TO anon, authenticated, service_role WITH CHECK (true);

  DROP POLICY IF EXISTS audit_events_delete ON public.audit_events;
  CREATE POLICY audit_events_delete ON public.audit_events
    FOR DELETE TO anon, authenticated, service_role USING (true);

  -- notifications policies
  DROP POLICY IF EXISTS notifications_select ON public.notifications;
  CREATE POLICY notifications_select ON public.notifications
    FOR SELECT TO authenticated
    USING (profile_id = private.get_profile_id() OR private.is_platform_admin());

  DROP POLICY IF EXISTS notifications_insert ON public.notifications;
  CREATE POLICY notifications_insert ON public.notifications
    FOR INSERT TO authenticated, service_role WITH CHECK (true);

  DROP POLICY IF EXISTS notifications_update ON public.notifications;
  CREATE POLICY notifications_update ON public.notifications
    FOR UPDATE TO authenticated
    USING (profile_id = private.get_profile_id() OR private.is_platform_admin())
    WITH CHECK (profile_id = private.get_profile_id() OR private.is_platform_admin());

  DROP POLICY IF EXISTS notifications_delete ON public.notifications;
  CREATE POLICY notifications_delete ON public.notifications
    FOR DELETE TO authenticated, service_role USING (profile_id = private.get_profile_id() OR private.is_platform_admin());

  -- supplier_notifications policies if table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
    ALTER TABLE public.supplier_notifications ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS supplier_notifications_select ON public.supplier_notifications;
    CREATE POLICY supplier_notifications_select ON public.supplier_notifications
      FOR SELECT TO authenticated
      USING (private.is_supplier_user_for(supplier_id) OR private.is_platform_admin());

    DROP POLICY IF EXISTS supplier_notifications_insert ON public.supplier_notifications;
    CREATE POLICY supplier_notifications_insert ON public.supplier_notifications
      FOR INSERT TO authenticated, service_role WITH CHECK (true);

    DROP POLICY IF EXISTS supplier_notifications_update ON public.supplier_notifications;
    CREATE POLICY supplier_notifications_update ON public.supplier_notifications
      FOR UPDATE TO authenticated
      USING (private.is_supplier_user_for(supplier_id) OR private.is_platform_admin())
      WITH CHECK (private.is_supplier_user_for(supplier_id) OR private.is_platform_admin());

    DROP POLICY IF EXISTS supplier_notifications_delete ON public.supplier_notifications;
    CREATE POLICY supplier_notifications_delete ON public.supplier_notifications
      FOR DELETE TO authenticated, service_role USING (private.is_supplier_user_for(supplier_id) OR private.is_platform_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Hardened admin_clear_audit_logs_and_notifications with Immediate Post-Clear Logging
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_clear_audit_logs_and_notifications(
  p_mode text DEFAULT 'AUTO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_mode text;
  v_audit_deleted int := 0;
  v_notifs_deleted int := 0;
  v_supp_notifs_deleted int := 0;
  v_demo_active boolean := false;
  v_audit_is_demo boolean := false;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_active FROM public.demo_settings WHERE id = true;
  v_mode := private.resolve_admin_mode(p_mode);

  PERFORM set_config('otp.allow_audit_purge', 'on', true);

  IF v_mode = 'PROD' THEN
    DELETE FROM public.audit_events WHERE NOT COALESCE(is_demo, false);
    GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

    DELETE FROM public.notifications WHERE NOT COALESCE(is_demo, false);
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
      DELETE FROM public.supplier_notifications WHERE NOT COALESCE(is_demo, false);
      GET DIAGNOSTICS v_supp_notifs_deleted = ROW_COUNT;
    END IF;

    v_audit_is_demo := false;

  ELSIF v_mode = 'DEMO' THEN
    DELETE FROM public.audit_events WHERE COALESCE(is_demo, false);
    GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

    DELETE FROM public.notifications WHERE COALESCE(is_demo, false);
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
      DELETE FROM public.supplier_notifications WHERE COALESCE(is_demo, false);
      GET DIAGNOSTICS v_supp_notifs_deleted = ROW_COUNT;
    END IF;

    v_audit_is_demo := true;

  ELSE -- 'ALL'
    DELETE FROM public.audit_events;
    GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

    DELETE FROM public.notifications;
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
      DELETE FROM public.supplier_notifications;
      GET DIAGNOSTICS v_supp_notifs_deleted = ROW_COUNT;
    END IF;

    v_audit_is_demo := v_demo_active;
  END IF;

  -- Immediately log the clear operation into audit trail so audit logging is active and verifiable
  INSERT INTO public.audit_events (
    event_type,
    entity_type,
    entity_id,
    payload,
    is_demo,
    occurred_at
  ) VALUES (
    'admin.audit_logs_purged',
    'AUDIT_SYSTEM',
    'mode_' || lower(v_mode),
    jsonb_build_object(
      'action', 'CLEAR_AUDIT_LOGS_AND_NOTIFICATIONS',
      'cleared_mode', v_mode,
      'audit_events_deleted', v_audit_deleted,
      'notifications_deleted', v_notifs_deleted + v_supp_notifs_deleted,
      'is_demo', v_audit_is_demo,
      'timestamp', now()
    ),
    v_audit_is_demo,
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'audit_events_deleted', v_audit_deleted,
    'notifications_deleted', v_notifs_deleted,
    'supplier_notifications_deleted', v_supp_notifs_deleted,
    'cleared_mode', v_mode,
    'message', format('Successfully cleared %s audit logs and %s notifications (%s mode).', v_audit_deleted, v_notifs_deleted + v_supp_notifs_deleted, v_mode)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_audit_logs_and_notifications(text) TO anon, authenticated, service_role;

-- Parameterless overload
CREATE OR REPLACE FUNCTION public.admin_clear_audit_logs_and_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN public.admin_clear_audit_logs_and_notifications('AUTO');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_audit_logs_and_notifications() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Hardened admin_clear_notifications with Immediate Post-Clear Logging
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_clear_notifications(
  p_mode text DEFAULT 'AUTO',
  p_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_mode text;
  v_deleted int := 0;
  v_supp_deleted int := 0;
  v_demo_active boolean := false;
  v_audit_is_demo boolean := false;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_active FROM public.demo_settings WHERE id = true;
  v_mode := private.resolve_admin_mode(p_mode);

  IF p_profile_id IS NOT NULL THEN
    -- Single user notification clear
    DELETE FROM public.notifications
    WHERE profile_id = p_profile_id
      AND (v_mode = 'ALL' OR (v_mode = 'PROD' AND NOT COALESCE(is_demo, false)) OR (v_mode = 'DEMO' AND COALESCE(is_demo, false)));
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_audit_is_demo := (v_mode = 'DEMO' OR (v_mode = 'ALL' AND v_demo_active));
  ELSE
    -- Platform-wide notifications clear
    IF v_mode = 'PROD' THEN
      DELETE FROM public.notifications WHERE NOT COALESCE(is_demo, false);
      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
        DELETE FROM public.supplier_notifications WHERE NOT COALESCE(is_demo, false);
        GET DIAGNOSTICS v_supp_deleted = ROW_COUNT;
      END IF;

      v_audit_is_demo := false;

    ELSIF v_mode = 'DEMO' THEN
      DELETE FROM public.notifications WHERE COALESCE(is_demo, false);
      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
        DELETE FROM public.supplier_notifications WHERE COALESCE(is_demo, false);
        GET DIAGNOSTICS v_supp_deleted = ROW_COUNT;
      END IF;

      v_audit_is_demo := true;

    ELSE -- 'ALL'
      DELETE FROM public.notifications;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
        DELETE FROM public.supplier_notifications;
        GET DIAGNOSTICS v_supp_deleted = ROW_COUNT;
      END IF;

      v_audit_is_demo := v_demo_active;
    END IF;
  END IF;

  -- Immediately record audit event for clear action
  INSERT INTO public.audit_events (
    event_type,
    entity_type,
    entity_id,
    payload,
    is_demo,
    occurred_at
  ) VALUES (
    'admin.notifications_purged',
    'NOTIFICATION_SYSTEM',
    'mode_' || lower(v_mode),
    jsonb_build_object(
      'action', 'CLEAR_NOTIFICATIONS',
      'cleared_mode', v_mode,
      'notifications_deleted', v_deleted + v_supp_deleted,
      'profile_id', p_profile_id,
      'is_demo', v_audit_is_demo,
      'timestamp', now()
    ),
    v_audit_is_demo,
    now()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_notifications', v_deleted,
    'deleted_supplier_notifications', v_supp_deleted,
    'cleared_mode', v_mode,
    'message', format('Successfully cleared %s %s notifications.', v_deleted + v_supp_deleted, v_mode)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_notifications(text, uuid) TO anon, authenticated, service_role;

-- Parameterless overload
CREATE OR REPLACE FUNCTION public.admin_clear_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN public.admin_clear_notifications('AUTO', NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_notifications() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Update admin_get_audit_trail to correctly return segregated logs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_audit_trail(
  p_entity_type text DEFAULT NULL,
  p_correlation_id text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_mode text DEFAULT 'AUTO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_results jsonb;
  v_mode text;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  v_mode := private.resolve_admin_mode(p_mode);

  SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      a.id,
      a.event_type,
      a.actor_id,
      p.email AS actor_email,
      p.full_name AS actor_name,
      a.organization_id,
      o.name AS organization_name,
      a.entity_type,
      a.entity_id,
      a.payload,
      a.correlation_id,
      a.occurred_at,
      COALESCE(a.is_demo, false) AS is_demo
    FROM public.audit_events a
    LEFT JOIN public.profiles p ON p.id = a.actor_id
    LEFT JOIN public.organizations o ON o.id = a.organization_id
    WHERE (p_entity_type IS NULL OR a.entity_type = p_entity_type)
      AND (p_correlation_id IS NULL OR a.correlation_id = p_correlation_id)
      AND (
        v_mode = 'ALL'
        OR (v_mode = 'PROD' AND NOT COALESCE(a.is_demo, false))
        OR (v_mode = 'DEMO' AND COALESCE(a.is_demo, false))
      )
    ORDER BY a.occurred_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'logs', v_results,
    'active_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_audit_trail(text, text, int, int, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Update admin_get_all_notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_all_notifications(
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0,
  p_filter text DEFAULT 'ALL',
  p_mode text DEFAULT 'AUTO'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_results jsonb;
  v_total_count int;
  v_mode text;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  v_mode := private.resolve_admin_mode(p_mode);

  SELECT count(*) INTO v_total_count
  FROM public.notifications n
  WHERE (
    v_mode = 'ALL'
    OR (v_mode = 'PROD' AND NOT COALESCE(n.is_demo, false))
    OR (v_mode = 'DEMO' AND COALESCE(n.is_demo, false))
  );

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      n.id,
      n.profile_id,
      p.email AS recipient_email,
      p.full_name AS recipient_name,
      p.is_platform_admin AS recipient_is_admin,
      n.channel,
      n.status,
      n.event_type,
      n.action_type,
      n.title,
      n.body,
      n.link,
      n.payload,
      n.sent_at,
      n.read_at,
      n.created_at,
      n.updated_at,
      COALESCE(n.is_demo, false) AS is_demo
    FROM public.notifications n
    LEFT JOIN public.profiles p ON n.profile_id = p.id
    WHERE (
      CASE
        WHEN p_filter = 'UNREAD' THEN n.status != 'READ'
        WHEN p_filter = 'RFQS' THEN (n.action_type IN ('RFQ_INVITED', 'QUOTE_RECEIVED', 'RFQ_NOT_AWARDED') OR n.event_type LIKE 'rfq.%')
        WHEN p_filter = 'VOTES' THEN (n.action_type IN ('VOTE_REQUESTED', 'VOTE_CAST') OR n.event_type LIKE 'governance.%')
        WHEN p_filter = 'ORDERS' THEN (n.action_type IN ('PO_ISSUED', 'PO_ACCEPTED', 'WORK_PROGRESS_UPDATED', 'INVOICE_SUBMITTED', 'PAYMENT_RECORDED') OR n.event_type LIKE 'po.%' OR n.event_type LIKE 'work_order.%' OR n.event_type LIKE 'invoice.%' OR n.event_type LIKE 'payment.%')
        WHEN p_filter = 'ALERTS' THEN (n.action_type = 'PROACTIVE_MAINTENANCE' OR n.event_type LIKE 'admin.%')
        ELSE true
      END
    )
    AND (
      v_mode = 'ALL'
      OR (v_mode = 'PROD' AND NOT COALESCE(n.is_demo, false))
      OR (v_mode = 'DEMO' AND COALESCE(n.is_demo, false))
    )
    ORDER BY n.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'total_count', v_total_count,
    'notifications', v_results,
    'active_mode', v_mode
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_notifications(int, int, text, text) TO anon, authenticated, service_role;

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
