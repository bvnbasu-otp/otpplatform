-- Migration 00130: Clear Audit Logs, Notifications, and Bulletproof Mode Toggle RPCs
-- 1. Mode-scoped clean-up of audit logs and notifications.
-- 2. Implements mode-scoped admin_clear_audit_logs_and_notifications(p_mode) RPC.
-- 3. Hardens admin_toggle_demo_mode(), admin_get_system_mode(), admin_toggle_maintenance_mode().

-- ---------------------------------------------------------------------------
-- 1. Mode-Aware Clean-up of Audit Logs and Notifications
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_demo_mode boolean := false;
BEGIN
  SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_mode FROM public.demo_settings WHERE id = true;
  
  IF v_demo_mode THEN
    DELETE FROM public.audit_events WHERE is_demo = true;
    DELETE FROM public.notifications WHERE is_demo = true;
  ELSE
    DELETE FROM public.audit_events WHERE is_demo = false;
    DELETE FROM public.notifications WHERE is_demo = false;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Bulletproof mode-scoped admin_clear_audit_logs_and_notifications RPC
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
  v_target_demo boolean;
  v_audit_deleted int := 0;
  v_notifs_deleted int := 0;
  v_supp_notifs_deleted int := 0;
  v_admin_id uuid := NULL;
  v_admin_email text := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin privileges required';
  END IF;

  v_mode := private.resolve_admin_mode(p_mode);

  IF v_mode = 'PROD' THEN
    v_target_demo := false;

    DELETE FROM public.audit_events a
    WHERE NOT (
      COALESCE(a.is_demo, false)
      OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = a.organization_id AND o.is_demo)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.actor_id AND p.is_demo)
    );
    GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

    DELETE FROM public.notifications n
    WHERE NOT (
      COALESCE(n.is_demo, false)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = n.profile_id AND p.is_demo)
    );
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
      DELETE FROM public.supplier_notifications sn
      WHERE NOT COALESCE(sn.is_demo, false);
      GET DIAGNOSTICS v_supp_notifs_deleted = ROW_COUNT;
    END IF;

  ELSIF v_mode = 'DEMO' THEN
    v_target_demo := true;

    DELETE FROM public.audit_events a
    WHERE (
      COALESCE(a.is_demo, false)
      OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = a.organization_id AND o.is_demo)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = a.actor_id AND p.is_demo)
    );
    GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

    DELETE FROM public.notifications n
    WHERE (
      COALESCE(n.is_demo, false)
      OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = n.profile_id AND p.is_demo)
    );
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
      DELETE FROM public.supplier_notifications sn
      WHERE COALESCE(sn.is_demo, false);
      GET DIAGNOSTICS v_supp_notifs_deleted = ROW_COUNT;
    END IF;

  ELSE -- 'ALL'
    v_target_demo := false;

    DELETE FROM public.audit_events;
    GET DIAGNOSTICS v_audit_deleted = ROW_COUNT;

    DELETE FROM public.notifications;
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
      DELETE FROM public.supplier_notifications;
      GET DIAGNOSTICS v_supp_notifs_deleted = ROW_COUNT;
    END IF;
  END IF;

  -- Log the purge action in the primary audit trail with mode metadata
  BEGIN
    v_admin_id := private.get_profile_id();
  EXCEPTION WHEN OTHERS THEN
    v_admin_id := NULL;
  END;

  BEGIN
    SELECT email INTO v_admin_email FROM public.profiles WHERE id = v_admin_id;
  EXCEPTION WHEN OTHERS THEN
    v_admin_email := 'System Administrator';
  END;

  INSERT INTO public.audit_events (
    event_type,
    entity_type,
    entity_id,
    actor_id,
    payload,
    is_demo
  ) VALUES (
    'admin.audit_logs_purged',
    'AUDIT_SYSTEM',
    'mode_' || lower(v_mode),
    v_admin_id,
    jsonb_build_object(
      'action', 'CLEAR_AUDIT_LOGS_AND_NOTIFICATIONS',
      'cleared_mode', v_mode,
      'is_demo', v_target_demo,
      'audit_records_deleted', v_audit_deleted,
      'notifications_deleted', v_notifs_deleted,
      'supplier_notifications_deleted', v_supp_notifs_deleted,
      'triggered_by', coalesce(v_admin_email, 'System Administrator'),
      'timestamp', now()
    ),
    v_target_demo
  );

  RETURN jsonb_build_object(
    'ok', true,
    'cleared_mode', v_mode,
    'is_demo', v_target_demo,
    'audit_records_deleted', v_audit_deleted,
    'notifications_deleted', v_notifs_deleted,
    'message', format('Successfully purged all %s audit log and notification records.', CASE WHEN v_mode = 'PROD' THEN 'Live Production' WHEN v_mode = 'DEMO' THEN 'Staging & Demo' ELSE 'All' END),
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_audit_logs_and_notifications(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Bulletproof admin_toggle_demo_mode RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_toggle_demo_mode(
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  BEGIN
    v_admin_id := private.get_profile_id();
  EXCEPTION WHEN OTHERS THEN
    v_admin_id := NULL;
  END;

  -- Ensure demo_settings row exists with upsert
  INSERT INTO public.demo_settings (id, demo_mode_enabled, updated_at)
  VALUES (true, p_enabled, now())
  ON CONFLICT (id) DO UPDATE
  SET demo_mode_enabled = p_enabled,
      updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'demo_mode_enabled', p_enabled,
    'message', CASE WHEN p_enabled THEN 'Staging & Demo Mode enabled' ELSE 'Live Production Mode active' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_demo_mode(boolean) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Bulletproof admin_get_system_mode RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_system_mode()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_demo_enabled boolean := false;
  v_maint_enabled boolean := false;
  v_maint_msg text := NULL;
  v_stub_enabled boolean := true;
BEGIN
  SELECT 
    COALESCE(demo_mode_enabled, false),
    COALESCE(maintenance_mode_enabled, false),
    maintenance_message,
    COALESCE(supplier_network_stub_enabled, true)
  INTO 
    v_demo_enabled,
    v_maint_enabled,
    v_maint_msg,
    v_stub_enabled
  FROM public.demo_settings
  WHERE id = true;

  RETURN jsonb_build_object(
    'ok', true,
    'demo_mode_enabled', v_demo_enabled,
    'maintenance_mode_enabled', v_maint_enabled,
    'maintenance_message', v_maint_msg,
    'supplier_network_stub_enabled', v_stub_enabled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_system_mode() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Bulletproof admin_toggle_maintenance_mode RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_toggle_maintenance_mode(
  p_enabled boolean,
  p_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  INSERT INTO public.demo_settings (id, maintenance_mode_enabled, maintenance_message, updated_at)
  VALUES (true, p_enabled, p_message, now())
  ON CONFLICT (id) DO UPDATE
  SET maintenance_mode_enabled = p_enabled,
      maintenance_message = p_message,
      updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'maintenance_mode_enabled', p_enabled,
    'maintenance_message', p_message,
    'message', CASE WHEN p_enabled THEN 'Maintenance mode activated' ELSE 'Maintenance mode deactivated' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_maintenance_mode(boolean, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Bulletproof admin_toggle_supplier_network_stub RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_toggle_supplier_network_stub(
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  INSERT INTO public.demo_settings (id, supplier_network_stub_enabled, updated_at)
  VALUES (true, p_enabled, now())
  ON CONFLICT (id) DO UPDATE
  SET supplier_network_stub_enabled = p_enabled,
      updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'supplier_network_stub_enabled', p_enabled,
    'message', CASE WHEN p_enabled THEN 'Supplier network simulation stub enabled' ELSE 'Supplier network simulation stub disabled (Real Suppliers Only)' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_supplier_network_stub(boolean) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Add RLS DELETE policies so Supabase client can clear records directly
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_events' AND policyname = 'audit_events_delete') THEN
    CREATE POLICY audit_events_delete ON public.audit_events FOR DELETE TO authenticated, anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_delete') THEN
    CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated, anon USING (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
