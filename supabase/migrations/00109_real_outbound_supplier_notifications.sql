-- Real outbound supplier notifications.
--
-- Every piece already existed — supplier_rfq_message_payload, the templates,
-- the provider abstraction, the supplier_notifications log — except the one
-- call that sends a message. An invited supplier's phone never rang; nothing
-- in the codebase called resolveProvider() outside the inbound webhook. This
-- wires the missing call in: every new rfq_invitations row fires an async
-- request to the messaging-outbound function, which resolves whichever
-- provider MESSAGING_PROVIDER names (MOCK until real credentials are set,
-- Twilio/Meta once they are — no further code change needed either way) and
-- sends the invitation for real.
--
-- Demo RFQs are excluded: they already have their own simulator
-- (demo_send_notification) and must never place a real call.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION private.dispatch_supplier_invitation_notification(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supabase_url text;
  v_service_key  text;
  v_inv          rfq_invitations%ROWTYPE;
  v_is_demo      boolean;
BEGIN
  SELECT * INTO v_inv FROM rfq_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT is_demo INTO v_is_demo FROM rfqs WHERE id = v_inv.rfq_id;
  IF COALESCE(v_is_demo, false) THEN RETURN; END IF;

  -- Nothing to call if the supplier never verified a phone; the edge function
  -- would reach the same conclusion, but skipping here saves the round trip.
  IF NOT EXISTS (
    SELECT 1 FROM supplier_messaging_channels
    WHERE supplier_id = v_inv.supplier_id AND status = 'VERIFIED'
  ) THEN
    RETURN;
  END IF;

  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  PERFORM net.http_post(
    url := COALESCE(v_supabase_url, 'http://127.0.0.1:54321') || '/functions/v1/messaging-outbound',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || COALESCE(v_service_key, ''),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'rfqId', v_inv.rfq_id,
      'supplierId', v_inv.supplier_id,
      'invitationId', v_inv.id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.dispatch_new_invitation_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM private.dispatch_supplier_invitation_notification(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_supplier_invitation_notification ON rfq_invitations;
CREATE TRIGGER trg_dispatch_supplier_invitation_notification
  AFTER INSERT ON rfq_invitations
  FOR EACH ROW EXECUTE FUNCTION private.dispatch_new_invitation_notification();

-- ---------------------------------------------------------------------------
-- RETRY_NOTIFICATIONS actually retries something now.
--
-- Body copied from 00101_fix_service_action_and_delivery_inspection_overloads
-- verbatim except for the RETRY_NOTIFICATIONS branch, which used to just write
-- an audit row and claim success without dispatching anything.
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

    -- Action 4: Retry Notifications Dispatch — for real now. Finds invitations
    -- that were never notified, or whose last attempt failed, for a verified
    -- supplier on a non-demo RFQ, and re-fires messaging-outbound for each.
    WHEN 'RETRY_NOTIFICATIONS' THEN
      DECLARE
        v_dispatched int := 0;
        v_inv_id uuid;
      BEGIN
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
          -- One at a time so a slow provider cannot starve the loop; retried
          -- rows are idempotent (messaging-outbound skips an invitation that
          -- already has a non-failed notification), so re-running this action
          -- costs nothing extra.
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
      END;

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
