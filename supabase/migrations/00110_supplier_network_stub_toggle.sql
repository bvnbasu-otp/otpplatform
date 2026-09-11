-- One switch for "the supplier network isn't real yet."
--
-- Right now every supplier on the platform is a seeded pilot account, not a
-- business that will actually see an invitation or type back a price. Two
-- things follow from that, and they have to move together:
--
--   1. Quotes, PO acceptance, work completion and invoicing must keep being
--      simulated so a real buyer can walk the whole lifecycle without waiting
--      on a phone that will never ring.
--   2. The real WhatsApp/SMS dispatcher (messaging-outbound, wired in
--      00109) must NOT actually text these suppliers — a real person
--      receiving "you've been invited to quote" for an enquiry the platform
--      already fabricated a quote for on their behalf is worse than sending
--      nothing.
--
-- Both are one flag, so turning on ONDC/BNI/local-association supply is one
-- admin action — flip this off, and auto-quoting and auto-fulfilment stop
-- while real dispatch starts, with no further deploy.

ALTER TABLE demo_settings
  ADD COLUMN IF NOT EXISTS supplier_network_stub_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION private.supplier_network_stub_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT supplier_network_stub_enabled FROM demo_settings WHERE id), true);
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_supplier_network_stub(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  v_admin_id := private.get_profile_id();

  UPDATE public.demo_settings
  SET supplier_network_stub_enabled = p_enabled,
      updated_at = now()
  WHERE id = true;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'system.supplier_network_stub_toggled',
    'demo_settings',
    'global',
    v_admin_id,
    jsonb_build_object('supplier_network_stub_enabled', p_enabled)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'supplier_network_stub_enabled', p_enabled,
    'message', CASE WHEN p_enabled
      THEN 'Supplier side is simulated: quotes, PO acceptance, work and invoicing auto-complete.'
      ELSE 'Supplier side is live: suppliers must quote, accept, work and invoice for real.' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_supplier_network_stub(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_system_mode()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_row demo_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.demo_settings WHERE id = true;

  RETURN jsonb_build_object(
    'ok', true,
    'demo_mode_enabled', COALESCE(v_row.demo_mode_enabled, false),
    'maintenance_mode_enabled', COALESCE(v_row.maintenance_mode_enabled, false),
    'maintenance_message', v_row.maintenance_message,
    'supplier_network_stub_enabled', COALESCE(v_row.supplier_network_stub_enabled, true),
    'current_run_id', v_row.current_run_id,
    'last_reset_at', v_row.last_reset_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_system_mode() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Auto-quoting stops being unconditional.
--
-- Body copied from 00084_auto_generate_pilot_supplier_quotes verbatim except
-- step 4, which now only fabricates quotes while the supplier network is
-- stubbed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq record;
  v_req record;
  v_cat_code text;
  v_sub_code text;
  v_cat_name text;
  v_sub_name text;
  v_supplier record;
  v_invited integer := 0;
  v_existing integer := 0;
  v_label text;
  v_score numeric;
  v_reasons text[];
  v_hp numeric := 0;
  v_total integer := 0;
  v_quotes_res jsonb;
BEGIN
  -- Get RFQ and requirement
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'RFQ not found');
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Requirement not found');
  END IF;

  -- Resolve category and subcategory codes & names
  SELECT code, name INTO v_cat_code, v_cat_name FROM requirement_categories WHERE id = v_req.category_id;
  SELECT code, name INTO v_sub_code, v_sub_name FROM requirement_subcategories WHERE id = v_req.subcategory_id;

  -- Extract HP if applicable
  IF v_req.attributes ? 'hp' THEN
    BEGIN
      v_hp := (v_req.attributes->>'hp')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_hp := 0;
    END;
  END IF;

  -- Count existing invitations
  SELECT count(*)::int INTO v_existing FROM rfq_invitations WHERE rfq_id = p_rfq_id;

  -- 1. Pass 1: Match suppliers by category, subcategory keywords, capability flags, or title/description
  FOR v_supplier IN
    SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories, s.business_name
    FROM suppliers s
    WHERE s.status = 'ACTIVE'
      AND (
        v_cat_code = ANY(s.categories)
        OR (v_cat_code IS NOT NULL AND s.categories::text ILIKE '%' || v_cat_code || '%')
        OR (v_sub_code IS NOT NULL AND (
             s.capabilities ? v_sub_code
             OR s.categories::text ILIKE '%' || v_sub_code || '%'
             OR s.capabilities::text ILIKE '%' || v_sub_code || '%'
           ))
        -- Domain-specific capability matching
        OR (v_req.title ILIKE '%chair%' AND (s.capabilities::text ILIKE '%chair%' OR s.capabilities::text ILIKE '%furniture%' OR s.business_name ILIKE '%furniture%' OR s.business_name ILIKE '%chair%'))
        OR (v_req.title ILIKE '%furniture%' AND (s.capabilities::text ILIKE '%furniture%' OR s.business_name ILIKE '%furniture%'))
        OR (v_req.title ILIKE '%table%' AND (s.capabilities::text ILIKE '%furniture%' OR s.business_name ILIKE '%furniture%'))
        OR (v_req.title ILIKE '%solar%' AND (s.capabilities::text ILIKE '%solar%' OR s.business_name ILIKE '%solar%'))
        OR (v_req.title ILIKE '%cctv%' AND (s.capabilities::text ILIKE '%cctv%' OR s.business_name ILIKE '%cctv%' OR s.capabilities::text ILIKE '%camera%'))
        OR (v_req.title ILIKE '%water%' AND (s.capabilities::text ILIKE '%water%' OR s.business_name ILIKE '%water%' OR s.capabilities::text ILIKE '%ro%'))
        OR (v_req.title ILIKE '%gas%' AND (s.capabilities::text ILIKE '%gas%' OR s.business_name ILIKE '%gas%' OR s.capabilities::text ILIKE '%pipe%'))
      )
    ORDER BY s.rating_avg DESC NULLS LAST
    LIMIT 6
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier.id
    ) THEN
      IF v_hp = 0 OR COALESCE((v_supplier.capabilities->>'maxHp')::numeric, 0) >= v_hp THEN
        v_label := 'Supplier ' || chr(65 + v_existing + v_invited);
        v_score := LEAST(100, 75 + COALESCE(v_supplier.rating_avg, 3.5) * 5);
        v_reasons := ARRAY[
          'category_match:' || COALESCE(v_cat_name, 'General'),
          'source:' || v_supplier.source::text
        ];

        INSERT INTO rfq_invitations (
          rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
        ) VALUES (
          p_rfq_id, v_supplier.id, v_label, 'INVITED', v_score, v_reasons
        );

        v_invited := v_invited + 1;
      END IF;
    END IF;
  END LOOP;

  -- 2. Pass 2: Fallback to ensure at least 4 active suppliers are invited
  SELECT count(*)::int INTO v_total FROM rfq_invitations WHERE rfq_id = p_rfq_id;
  IF v_total < 4 THEN
    FOR v_supplier IN
      SELECT s.id, s.source, s.capabilities, s.rating_avg, s.categories
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST
      LIMIT (4 - v_total)
    LOOP
      v_label := 'Supplier ' || chr(65 + v_existing + v_invited);
      v_score := 75.0;
      v_reasons := ARRAY['open_network_discovery', 'source:' || v_supplier.source::text];

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id, v_supplier.id, v_label, 'INVITED', v_score, v_reasons
      );

      v_invited := v_invited + 1;
    END LOOP;
  END IF;

  -- 3. Transition RFQ to OPEN if in DRAFT
  IF v_rfq.status = 'DRAFT' THEN
    UPDATE rfqs
    SET status = 'OPEN',
        quote_deadline = COALESCE(quote_deadline, now() + interval '5 days'),
        updated_at = now()
    WHERE id = p_rfq_id;

    UPDATE requirements
    SET status = 'QUOTING'::requirement_status,
        updated_at = now()
    WHERE id = v_rfq.requirement_id;
  END IF;

  -- 4. Fabricate quotes only while the supplier network is stubbed. Once real
  -- suppliers exist (ONDC/BNI/local associations), this stays quiet and the
  -- real messaging dispatcher (gated the same way) takes over instead.
  IF private.supplier_network_stub_enabled() THEN
    SELECT public.auto_submit_pilot_quotes(p_rfq_id) INTO v_quotes_res;
  ELSE
    v_quotes_res := jsonb_build_object('skipped', true, 'reason', 'Supplier network is live');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invited_count', v_invited,
    'total_invitations', v_existing + v_invited,
    'rfq_status', 'OPEN',
    'quotes_result', v_quotes_res
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Real dispatch only once the stub is switched off.
--
-- dispatch_supplier_invitation_notification (00109) already skips demo RFQs
-- and suppliers with no verified channel; this adds the third gate.
-- ---------------------------------------------------------------------------

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
  IF private.supplier_network_stub_enabled() THEN RETURN; END IF;

  SELECT * INTO v_inv FROM rfq_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT is_demo INTO v_is_demo FROM rfqs WHERE id = v_inv.rfq_id;
  IF COALESCE(v_is_demo, false) THEN RETURN; END IF;

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

-- ---------------------------------------------------------------------------
-- 3. The rest of the supplier lifecycle, stubbed: accept the PO, finish the
-- work, raise the invoice. The buyer's own steps — inspection sign-off,
-- invoice approval, recording and verifying payment — stay real and manual,
-- because those are the buyer's actual money and actual decision.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.simulate_pilot_supplier_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_now timestamptz := now();
  v_invoice_number text;
BEGIN
  IF NOT private.supplier_network_stub_enabled() THEN RETURN NEW; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = NEW.purchase_order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- The supplier accepts the PO immediately: nobody real is waiting to click it.
  UPDATE purchase_orders
  SET status = 'ACCEPTED', acknowledged_at = COALESCE(acknowledged_at, v_now), updated_at = v_now
  WHERE id = v_po.id AND status = 'ISSUED';

  -- The supplier finishes the work immediately.
  UPDATE work_orders
  SET status = 'COMPLETED',
      progress_percent = 100,
      actual_start = COALESCE(actual_start, v_now),
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now
  WHERE id = NEW.id;

  -- The supplier raises the invoice for the buyer to actually approve and pay.
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

DROP TRIGGER IF EXISTS trg_simulate_pilot_supplier_fulfillment ON work_orders;
CREATE TRIGGER trg_simulate_pilot_supplier_fulfillment
  AFTER INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION private.simulate_pilot_supplier_fulfillment();

-- ---------------------------------------------------------------------------
-- 4. RETRY_NOTIFICATIONS must not fire real sends while stubbed either.
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
        jsonb_build_object('action', p_action, 'forced_by_admin', true)
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

GRANT EXECUTE ON FUNCTION public.admin_execute_service_action(text, text, jsonb) TO anon, authenticated;
