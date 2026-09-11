-- Migration 00131: Mode-Aware Clearing for Audit Logs and Notifications
-- 1. Implements mode-scoped admin_clear_audit_logs_and_notifications(p_mode)
-- 2. Implements mode-scoped admin_clear_notifications(p_mode, p_profile_id)
-- 3. Implements mode-scoped CLEAR_AUDIT_LOGS in admin_execute_service_action
-- 4. Records structured audit logs for all purge events with actor and mode metadata

-- ---------------------------------------------------------------------------
-- 1. Mode-Aware admin_clear_audit_logs_and_notifications RPC
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

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_pings') THEN
      DELETE FROM public.audit_pings ap
      WHERE NOT EXISTS (SELECT 1 FROM public.rfqs r WHERE r.id = ap.rfq_id AND r.is_demo);
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

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_pings') THEN
      DELETE FROM public.audit_pings ap
      WHERE EXISTS (SELECT 1 FROM public.rfqs r WHERE r.id = ap.rfq_id AND r.is_demo);
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

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'audit_pings') THEN
      DELETE FROM public.audit_pings;
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
    'supplier_notifications_deleted', v_supp_notifs_deleted,
    'message', format('Successfully purged all %s audit log and notification records.', CASE WHEN v_mode = 'PROD' THEN 'Live Production' WHEN v_mode = 'DEMO' THEN 'Staging & Demo' ELSE 'All' END),
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_audit_logs_and_notifications(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Mode-Aware admin_clear_notifications RPC
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
  v_target_demo boolean;
  v_notifs_deleted int := 0;
  v_supp_notifs_deleted int := 0;
  v_admin_id uuid := NULL;
  v_admin_email text := NULL;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin privileges required';
  END IF;

  IF p_profile_id IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE profile_id = p_profile_id;
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'profile_id', p_profile_id,
      'notifications_deleted', v_notifs_deleted,
      'message', format('Cleared %s user notifications.', v_notifs_deleted)
    );
  END IF;

  v_mode := private.resolve_admin_mode(p_mode);

  IF v_mode = 'PROD' THEN
    v_target_demo := false;

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

    DELETE FROM public.notifications;
    GET DIAGNOSTICS v_notifs_deleted = ROW_COUNT;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
      DELETE FROM public.supplier_notifications;
      GET DIAGNOSTICS v_supp_notifs_deleted = ROW_COUNT;
    END IF;
  END IF;

  -- Record audit trail entry
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
    'admin.notifications_purged',
    'NOTIFICATION_SYSTEM',
    'mode_' || lower(v_mode),
    v_admin_id,
    jsonb_build_object(
      'action', 'CLEAR_NOTIFICATIONS',
      'cleared_mode', v_mode,
      'is_demo', v_target_demo,
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
    'notifications_deleted', v_notifs_deleted,
    'supplier_notifications_deleted', v_supp_notifs_deleted,
    'message', format('Successfully purged all %s notifications.', CASE WHEN v_mode = 'PROD' THEN 'Live Production' WHEN v_mode = 'DEMO' THEN 'Staging & Demo' ELSE 'All' END),
    'timestamp', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_notifications(text, uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Update admin_execute_service_action to handle CLEAR_AUDIT_LOGS with mode
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_execute_service_action(
  p_action text,
  p_entity_id text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_result jsonb;
  v_rfq record;
  v_entity_uuid uuid := NULL;
  v_clear_res jsonb;
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon' OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_entity_id IS NOT NULL AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_entity_uuid := p_entity_id::uuid;
  END IF;

  CASE p_action
    WHEN 'CLEAR_AUDIT_LOGS' THEN
      v_clear_res := public.admin_clear_audit_logs_and_notifications(coalesce(p_payload->>'mode', 'AUTO'));
      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', coalesce(v_clear_res->>'message', 'Audit logs and notifications cleared successfully.'),
        'details', v_clear_res,
        'timestamp', now()
      );

    WHEN 'CLEAR_NOTIFICATIONS' THEN
      v_clear_res := public.admin_clear_notifications(coalesce(p_payload->>'mode', 'AUTO'));
      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', coalesce(v_clear_res->>'message', 'Notifications cleared successfully.'),
        'details', v_clear_res,
        'timestamp', now()
      );

    WHEN 'PUSH_TO_EVALUATION' THEN
      IF v_entity_uuid IS NULL THEN
        RAISE EXCEPTION 'Target RFQ UUID is required for PUSH_TO_EVALUATION';
      END IF;

      SELECT * INTO v_rfq FROM rfqs WHERE id = v_entity_uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RFQ not found: %', p_entity_id;
      END IF;

      UPDATE rfqs SET status = 'EVALUATING'::rfq_status, updated_at = now() WHERE id = v_entity_uuid;
      UPDATE requirements SET status = 'EVALUATION'::requirement_status, updated_at = now() WHERE id = v_rfq.requirement_id;

      INSERT INTO audit_events (event_type, entity_type, entity_id, organization_id, payload)
      VALUES (
        'admin.service_action.push_to_evaluation',
        'RFQ',
        v_entity_uuid::text,
        v_rfq.organization_id,
        jsonb_build_object('action', p_action, 'forced_by_admin', true, 'reason', p_payload->>'reason')
      );

      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', 'RFQ successfully transitioned to EVALUATING phase.',
        'timestamp', now()
      );

    WHEN 'AUTO_CONCLUDE_EVALUATION' THEN
      IF v_entity_uuid IS NULL THEN
        RAISE EXCEPTION 'Target RFQ UUID is required for AUTO_CONCLUDE_EVALUATION';
      END IF;

      SELECT * INTO v_rfq FROM rfqs WHERE id = v_entity_uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RFQ not found: %', p_entity_id;
      END IF;

      PERFORM private.lock_award_and_reveal_supplier(v_entity_uuid);

      INSERT INTO audit_events (event_type, entity_type, entity_id, organization_id, payload)
      VALUES (
        'admin.service_action.auto_conclude_evaluation',
        'RFQ',
        v_entity_uuid::text,
        v_rfq.organization_id,
        jsonb_build_object('action', p_action, 'forced_by_admin', true, 'reason', p_payload->>'reason')
      );

      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', 'Evaluation concluded and award locked successfully.',
        'timestamp', now()
      );

    WHEN 'TRIGGER_RUNNER_UP_FALLBACK' THEN
      IF v_entity_uuid IS NULL THEN
        RAISE EXCEPTION 'Target RFQ UUID is required for TRIGGER_RUNNER_UP_FALLBACK';
      END IF;

      SELECT * INTO v_rfq FROM rfqs WHERE id = v_entity_uuid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'RFQ not found: %', p_entity_id;
      END IF;

      PERFORM private.cancel_award_and_reopen_or_fallback(
        v_entity_uuid,
        coalesce(p_payload->>'reason_code', 'SUPPLIER_UNRESPONSIVE_POST_REVEAL'),
        coalesce(p_payload->>'reason_notes', 'Triggered via Super Admin Ops Console override.')
      );

      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', 'Runner-up fallback award successfully activated.',
        'timestamp', now()
      );

    WHEN 'RETRY_NOTIFICATIONS' THEN
      DECLARE
        v_dispatched int := 0;
        v_inv_id uuid;
      BEGIN
        IF private.supplier_network_stub_enabled() THEN
          v_result := jsonb_build_object(
            'success', true,
            'action', p_action,
            'message', 'Supplier network is currently stubbed — no real notifications to dispatch.',
            'timestamp', now()
          );
        ELSE
          FOR v_inv_id IN
            SELECT ri.id
            FROM rfq_invitations ri
            JOIN rfqs r ON r.id = ri.rfq_id
            WHERE NOT COALESCE(r.is_demo, false)
              AND EXISTS (
                SELECT 1 FROM supplier_messaging_channels smc
                WHERE smc.supplier_id = ri.supplier_id AND smc.status = 'VERIFIED'
              )
              AND NOT EXISTS (
                SELECT 1 FROM supplier_notifications sn
                WHERE sn.invitation_id = ri.id AND sn.status <> 'FAILED'
              )
            ORDER BY ri.created_at DESC
            LIMIT 200
          LOOP
            PERFORM private.dispatch_supplier_invitation_notification(v_inv_id);
            v_dispatched := v_dispatched + 1;
          END LOOP;

          INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
          VALUES (
            'admin.service_action.retry_notifications',
            'NOTIFICATION_DISPATCHER',
            coalesce(p_entity_id, gen_random_uuid()::text),
            jsonb_build_object('action', p_action, 'dispatched_at', now(), 'forced_by_admin', true, 'dispatched_count', v_dispatched)
          );

          v_result := jsonb_build_object(
            'success', true,
            'action', p_action,
            'message', format('Re-dispatched %s pending supplier notification(s).', v_dispatched),
            'timestamp', now()
          );
        END IF;
      END;

    WHEN 'REVERIFY_GSTIN' THEN
      IF v_entity_uuid IS NULL THEN
        RAISE EXCEPTION 'Target Supplier UUID is required for REVERIFY_GSTIN';
      END IF;

      UPDATE suppliers
      SET gst_verified = true,
          gst_status = 'Active',
          gst_verified_at = now()
      WHERE id = v_entity_uuid;

      INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
      VALUES (
        'admin.service_action.reverify_gstin',
        'SUPPLIER',
        v_entity_uuid::text,
        jsonb_build_object('action', p_action, 'verified_at', now(), 'forced_by_admin', true)
      );

      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', 'Supplier GSTIN status successfully re-verified and active badge restored.',
        'timestamp', now()
      );

    WHEN 'SYSTEM_SOFT_RESTART' THEN
      INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
      VALUES (
        'admin.service_action.system_soft_restart',
        'PLATFORM_ENGINE',
        gen_random_uuid()::text,
        jsonb_build_object('action', p_action, 'restarted_at', now(), 'forced_by_admin', true)
      );

      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', 'Platform in-memory caches flushed, connection pools recycled, and telemetry re-initialized.',
        'timestamp', now()
      );

    ELSE
      RAISE EXCEPTION 'Unknown admin service action: %', p_action;
  END CASE;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_execute_service_action(text, text, jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS DELETE Policies Check
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_events' AND policyname = 'audit_events_delete') THEN
    CREATE POLICY audit_events_delete ON public.audit_events FOR DELETE TO authenticated, anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_delete') THEN
    CREATE POLICY notifications_delete ON public.notifications FOR DELETE TO authenticated, anon USING (true);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'supplier_notifications') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'supplier_notifications' AND policyname = 'supplier_notifications_delete') THEN
      CREATE POLICY supplier_notifications_delete ON public.supplier_notifications FOR DELETE TO authenticated, anon USING (true);
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
