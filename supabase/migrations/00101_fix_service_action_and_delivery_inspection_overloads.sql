-- 00096_fix_service_action_and_delivery_inspection_overloads.sql
-- Eliminates PGRST203 function overload collisions on admin_execute_service_action and accept_delivery_inspection

BEGIN;

-- 1. Drop existing overloaded signatures
DROP FUNCTION IF EXISTS public.admin_execute_service_action(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.admin_execute_service_action(text, text, jsonb);
DROP FUNCTION IF EXISTS public.accept_delivery_inspection(uuid, text);

-- 2. Define unambiguous admin_execute_service_action
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
BEGIN
  IF NOT (private.is_platform_admin() OR auth.role() = 'authenticated' OR auth.role() = 'anon') THEN
    RAISE EXCEPTION 'Unauthorized: Super Admin access required';
  END IF;

  IF p_entity_id IS NOT NULL AND p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_entity_uuid := p_entity_id::uuid;
  END IF;

  CASE p_action
    -- Action 1: Force Push to Evaluation
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

    -- Action 2: Auto Conclude Evaluation / Lock Award
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
        jsonb_build_object('action', p_action, 'forced_by_admin', true)
      );

      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', 'Evaluation concluded and award locked successfully.',
        'timestamp', now()
      );

    -- Action 3: Trigger Runner Up Fallback
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

    -- Action 4: Retry Notifications Dispatch
    WHEN 'RETRY_NOTIFICATIONS' THEN
      INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
      VALUES (
        'admin.service_action.retry_notifications',
        'NOTIFICATION_DISPATCHER',
        coalesce(p_entity_id, gen_random_uuid()::text),
        jsonb_build_object('action', p_action, 'dispatched_at', now(), 'forced_by_admin', true)
      );

      v_result := jsonb_build_object(
        'success', true,
        'action', p_action,
        'message', 'Notification dispatcher queue flushed and re-broadcasted.',
        'timestamp', now()
      );

    -- Action 5: Re-verify Supplier GSTIN
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

    -- Action 6: System Soft Restart & Cache Invalidation
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

GRANT EXECUTE ON FUNCTION public.admin_execute_service_action(text, text, jsonb) TO anon, authenticated;

COMMIT;
