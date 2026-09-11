-- ============================================================================
-- Migration 00135: Clean ASCII Notifications & Messaging Templates
--
-- Ensures all notification titles, bodies, and outbound templates use 100%
-- standard 7-bit ASCII plain text. Eliminates all emojis, em-dashes, and Unicode
-- symbols to guarantee zero character encoding corruption across email and WhatsApp.
-- ============================================================================

-- 1. Helper function: sanitize_ascii_text
CREATE OR REPLACE FUNCTION private.sanitize_ascii_text(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_text IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(p_text, '[\u2014\u2013]', '-', 'g'),
              '[\u2018\u2019]', '''', 'g'
            ),
            '[\u201C\u201D]', '"', 'g'
          ),
          '\u2022', '*', 'g'
        ),
        '\u20B9', 'Rs. ', 'g'
      ),
      '[^\x20-\x7E\r\n\t]', '', 'g'
    )
  );
END;
$$;

-- 2. Clean existing notification records
UPDATE public.notifications
SET title = private.sanitize_ascii_text(title),
    body  = private.sanitize_ascii_text(body)
WHERE (title ~ '[^\x20-\x7E]' OR body ~ '[^\x20-\x7E]');

UPDATE public.supplier_notifications
SET body = private.sanitize_ascii_text(body),
    failure_reason = private.sanitize_ascii_text(failure_reason)
WHERE (body ~ '[^\x20-\x7E]' OR coalesce(failure_reason, '') ~ '[^\x20-\x7E]');

-- 3. Upgrade create_system_notification to enforce clean ASCII
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
  v_clean_title text;
  v_clean_body text;
BEGIN
  SELECT COALESCE(demo_mode_enabled, false) INTO v_demo_active FROM public.demo_settings WHERE id = true;

  IF v_demo_active THEN
    v_is_demo := true;
  ELSE
    SELECT COALESCE(p.is_demo, false) INTO v_is_demo FROM public.profiles p WHERE p.id = p_profile_id;
  END IF;

  v_clean_title := private.sanitize_ascii_text(p_title);
  v_clean_body  := private.sanitize_ascii_text(p_body);

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
    v_clean_title,
    v_clean_body,
    p_link,
    coalesce(p_payload, '{}'::jsonb),
    coalesce(v_is_demo, false),
    now(),
    now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4. Upgrade review_signup_request to use clean ASCII
CREATE OR REPLACE FUNCTION public.review_signup_request(
  p_request_id uuid,
  p_action text,
  p_notes text DEFAULT NULL,
  p_initial_password text DEFAULT 'Welcome@OTP2026!'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_admin_id uuid;
  v_req record;
  v_user_id uuid;
  v_profile_id uuid;
  v_org_id uuid;
  v_supplier_id uuid;
  v_role_code text;
  v_ref text;
  v_encrypted_pw text;
  v_org_name text;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to review signup requests.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_admin_id AND is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Only platform administrators can review signup requests.';
  END IF;

  SELECT * INTO v_req
  FROM public.signup_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup request % not found.', p_request_id;
  END IF;

  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Signup request % is already %.', p_request_id, v_req.status;
  END IF;

  v_ref := v_req.reference;

  IF p_action = 'REJECT' THEN
    UPDATE public.signup_requests
    SET status = 'REJECTED',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, 'Application rejected by platform administrator')
    WHERE id = p_request_id;

    INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
    VALUES ('signup.rejected', 'signup_request', p_request_id::text, v_admin_id,
            jsonb_build_object('reference', v_ref, 'email', v_req.email, 'notes', p_notes));

    RETURN jsonb_build_object('ok', true, 'status', 'REJECTED', 'reference', v_ref);
  END IF;

  IF p_action <> 'APPROVE' THEN
    RAISE EXCEPTION 'Invalid action: %. Must be APPROVE or REJECT.', p_action;
  END IF;

  -- 1. Create / find auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_req.email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    v_encrypted_pw := extensions.crypt(p_initial_password, extensions.gen_salt('bf'));

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(v_req.email),
      v_encrypted_pw,
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
      jsonb_build_object(
        'full_name', v_req.contact_first_name || ' ' || v_req.contact_last_name,
        'first_name', v_req.contact_first_name,
        'last_name', v_req.contact_last_name,
        'phone', v_req.phone,
        'side', v_req.side
      ),
      now(),
      now()
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', lower(v_req.email)),
      'email',
      v_user_id::text,
      now(),
      now(),
      now()
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- 2. Provision / link public profile
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE auth_user_id = v_user_id;

  IF v_profile_id IS NULL THEN
    v_profile_id := gen_random_uuid();
    INSERT INTO public.profiles (
      id, auth_user_id, email, full_name, is_platform_admin
    ) VALUES (
      v_profile_id,
      v_user_id,
      lower(v_req.email),
      v_req.contact_first_name || ' ' || v_req.contact_last_name,
      false
    );
  END IF;

  -- 3. Assign role
  v_role_code := COALESCE(
    v_req.role_code,
    CASE
      WHEN v_req.side = 'BUYER' AND v_req.buyer_type = 'INDIVIDUAL' THEN 'PROPERTY_OWNER'
      WHEN v_req.side = 'BUYER' THEN 'FACILITY_MANAGER'
      ELSE 'SUPPLIER_FOUNDER'
    END
  );

  INSERT INTO public.profile_roles (profile_id, role_code, assigned_by)
  VALUES (v_profile_id, v_role_code, v_admin_id)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  UPDATE public.profiles
  SET active_role_code = v_role_code
  WHERE id = v_profile_id;

  -- 4. Entity Provisioning
  IF v_req.side = 'BUYER' THEN
    v_org_name := v_req.business_name;
    IF v_req.buyer_type = 'INDIVIDUAL' AND (v_org_name IS NULL OR btrim(v_org_name) = '' OR lower(btrim(v_org_name)) = 'self') THEN
      v_org_name := 'Self';
    END IF;

    v_org_id := v_req.organization_id;
    IF v_org_id IS NULL THEN
      v_org_id := gen_random_uuid();
      INSERT INTO public.organizations (
        id, name, org_type, tax_registration
      ) VALUES (
        v_org_id,
        v_org_name,
        COALESCE(v_req.buyer_type, 'INDIVIDUAL'::org_type),
        v_req.tax_registration_id
      );
    END IF;

    INSERT INTO public.organization_members (organization_id, profile_id, role)
    VALUES (v_org_id, v_profile_id, 'OWNER')
    ON CONFLICT (organization_id, profile_id) DO NOTHING;

    UPDATE public.profiles
    SET active_organization_id = v_org_id
    WHERE id = v_profile_id;

    UPDATE public.signup_requests
    SET status = 'ONBOARDED',
        organization_id = v_org_id,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, 'Approved and onboarded by platform administrator')
    WHERE id = p_request_id;

  ELSE -- SUPPLIER
    v_supplier_id := v_req.supplier_id;
    IF v_supplier_id IS NULL THEN
      v_supplier_id := gen_random_uuid();
      INSERT INTO public.suppliers (
        id,
        business_name,
        legal_name,
        trade_name,
        gstin,
        contact_phone,
        contact_email,
        city,
        pincode,
        categories,
        verification_status,
        status
      ) VALUES (
        v_supplier_id,
        v_req.business_name,
        v_req.business_name,
        v_req.business_name,
        v_req.tax_registration_id,
        v_req.phone,
        lower(v_req.email),
        v_req.coverage_city,
        v_req.coverage_pincode,
        v_req.category_codes,
        'VERIFIED',
        'ACTIVE'
      );
    END IF;

    INSERT INTO public.supplier_users (supplier_id, profile_id, role)
    VALUES (v_supplier_id, v_profile_id, 'OWNER')
    ON CONFLICT (supplier_id, profile_id) DO NOTHING;

    UPDATE public.signup_requests
    SET status = 'ONBOARDED',
        supplier_id = v_supplier_id,
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, 'Approved and onboarded by platform administrator')
    WHERE id = p_request_id;
  END IF;

  -- 5. Create Clean System Notification (100% 7-bit ASCII)
  PERFORM public.create_system_notification(
    p_profile_id := v_profile_id,
    p_title := '[OTP Platform] Registration Approved & Account Activated',
    p_body := 'Welcome to OTP Platform! Your registration under reference ' || v_ref || ' for "' || COALESCE(v_org_name, v_req.business_name) || '" has been approved. You may now access your portal workspace.',
    p_link := CASE WHEN v_req.side = 'BUYER' THEN '/dashboard' ELSE '/supplier/capabilities' END,
    p_event_type := 'signup.approved',
    p_action_type := 'SYSTEM_ALERT',
    p_payload := jsonb_build_object('reference', v_ref, 'side', v_req.side)
  );

  -- 6. Audit Event
  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES ('signup.approved', 'signup_request', p_request_id::text, v_admin_id,
          jsonb_build_object(
            'reference', v_ref,
            'email', v_req.email,
            'side', v_req.side,
            'profile_id', v_profile_id,
            'organization_id', v_org_id,
            'supplier_id', v_supplier_id
          ));

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ONBOARDED',
    'reference', v_ref,
    'side', v_req.side,
    'email', v_req.email,
    'full_name', v_req.contact_first_name || ' ' || v_req.contact_last_name,
    'organization_id', v_org_id,
    'supplier_id', v_supplier_id,
    'temporary_password', p_initial_password,
    'message', 'Registration approved and workspace provisioned successfully'
  );
END;
$$;

-- 5. Upgrade run_proactive_maintenance_scan to use clean ASCII
CREATE OR REPLACE FUNCTION public.run_proactive_maintenance_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq record;
  v_po record;
  v_supp record;
  v_admin_profile record;
  v_alerts_count integer := 0;
  v_alert_items jsonb := '[]'::jsonb;
BEGIN
  -- 1. Scan for Stalled RFQs (>48h idle in OPEN or IN_REVIEW)
  FOR v_rfq IN
    SELECT r.id, r.title, r.status, r.created_at, o.name AS org_name,
           ROUND(EXTRACT(EPOCH FROM (now() - r.updated_at)) / 3600, 1) AS idle_hours
    FROM rfqs r
    LEFT JOIN organizations o ON o.id = r.buyer_organization_id
    WHERE r.status IN ('OPEN', 'IN_REVIEW', 'AWAITING_QUOTES')
      AND (now() - r.updated_at) > interval '48 hours'
  LOOP
    v_alerts_count := v_alerts_count + 1;
    v_alert_items := v_alert_items || jsonb_build_object(
      'type', 'STALLED_RFQ',
      'title', 'Proactive Alert: Stalled RFQ in ' || v_rfq.status,
      'body', 'RFQ "' || coalesce(v_rfq.title, 'Untitled') || '" (' || coalesce(v_rfq.org_name, 'Buyer') || ') has been inactive for ' || coalesce(v_rfq.idle_hours, 0) || 'h. Proactive intervention recommended.',
      'link', '/admin/buyer-diagnostics?target=' || v_rfq.id,
      'entityId', v_rfq.id
    );

    FOR v_admin_profile IN
      SELECT id FROM profiles WHERE is_platform_admin = true OR email IN ('admin@otp.test', 'ops@otp.test')
    LOOP
      BEGIN
        PERFORM public.create_system_notification(
          v_admin_profile.id,
          '[ALERT] Proactive Alert: Stalled RFQ (' || coalesce(v_rfq.idle_hours, 0) || 'h idle)',
          'RFQ "' || coalesce(v_rfq.title, 'Untitled') || '" in ' || v_rfq.status || ' requires attention.',
          '/admin/buyer-diagnostics?target=' || v_rfq.id,
          'admin.proactive.stalled_rfq',
          'PROACTIVE_MAINTENANCE',
          jsonb_build_object('rfq_id', v_rfq.id, 'idle_hours', v_rfq.idle_hours, 'severity', 'WARN')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Gracefully skip notification insert if constraint fails
      END;
    END LOOP;
  END LOOP;

  -- 2. Scan for Unacknowledged POs (>24h idle)
  FOR v_po IN
    SELECT po.id, po.po_number, po.total_amount, po.created_at,
           ROUND(EXTRACT(EPOCH FROM (now() - po.created_at)) / 3600, 1) AS idle_hours
    FROM purchase_orders po
    WHERE po.status = 'ISSUED'
      AND (now() - po.created_at) > interval '24 hours'
  LOOP
    v_alerts_count := v_alerts_count + 1;
    v_alert_items := v_alert_items || jsonb_build_object(
      'type', 'UNACKNOWLEDGED_PO',
      'title', 'Proactive Alert: Unacknowledged PO ' || coalesce(v_po.po_number, 'N/A'),
      'body', 'Purchase order ' || coalesce(v_po.po_number, 'N/A') || ' pending supplier acceptance for ' || coalesce(v_po.idle_hours, 0) || 'h.',
      'link', '/admin?tab=seller-orders',
      'entityId', v_po.id
    );

    FOR v_admin_profile IN
      SELECT id FROM profiles WHERE is_platform_admin = true OR email IN ('admin@otp.test', 'ops@otp.test')
    LOOP
      BEGIN
        PERFORM public.create_system_notification(
          v_admin_profile.id,
          '[ALERT] Proactive Alert: PO Acceptance Delay',
          'Purchase Order ' || coalesce(v_po.po_number, 'N/A') || ' pending acceptance for ' || coalesce(v_po.idle_hours, 0) || 'h.',
          '/admin?tab=seller-orders',
          'admin.proactive.po_delay',
          'PROACTIVE_MAINTENANCE',
          jsonb_build_object('po_id', v_po.id, 'po_number', v_po.po_number, 'severity', 'WARN')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Gracefully skip
      END;
    END LOOP;
  END LOOP;

  -- 3. Scan for Inactive/Unverified Suppliers with Bids
  FOR v_supp IN
    SELECT DISTINCT s.id, s.business_name, s.legal_name
    FROM suppliers s
    JOIN quotes q ON q.supplier_id = s.id
    WHERE (NOT coalesce(s.gst_verified, false) OR coalesce(s.gst_status, '') <> 'Active')
  LOOP
    v_alerts_count := v_alerts_count + 1;
    v_alert_items := v_alert_items || jsonb_build_object(
      'type', 'UNVERIFIED_SUPPLIER_BID',
      'title', 'Proactive Alert: Unverified Supplier Bidding',
      'body', 'Supplier "' || coalesce(v_supp.business_name, v_supp.legal_name, 'Unknown') || '" has submitted bids but lacks active GST verification.',
      'link', '/admin/seller-diagnostics?target=' || v_supp.id,
      'entityId', v_supp.id
    );

    FOR v_admin_profile IN
      SELECT id FROM profiles WHERE is_platform_admin = true OR email IN ('admin@otp.test', 'ops@otp.test')
    LOOP
      BEGIN
        PERFORM public.create_system_notification(
          v_admin_profile.id,
          '[ALERT] Proactive Alert: Unverified Supplier GST',
          'Supplier "' || coalesce(v_supp.business_name, v_supp.legal_name, 'Unknown') || '" has active quotes without GST verification.',
          '/admin/seller-diagnostics?target=' || v_supp.id,
          'admin.proactive.unverified_supplier',
          'PROACTIVE_MAINTENANCE',
          jsonb_build_object('supplier_id', v_supp.id, 'severity', 'INFO')
        );
      EXCEPTION WHEN OTHERS THEN
        -- Gracefully skip
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'scanned_at', now(),
    'alerts_count', v_alerts_count,
    'alerts', v_alert_items
  );
END;
$$;

-- 6. Upgrade invoice & payment triggers to clean ASCII
CREATE OR REPLACE FUNCTION public.notify_invoice_submitted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_buyer_id uuid;
  v_po_id uuid;
  v_po_title text;
BEGIN
  IF NEW.status = 'SUBMITTED' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status <> 'SUBMITTED')) THEN
    SELECT r.created_by, po.id, r.title
    INTO v_buyer_id, v_po_id, v_po_title
    FROM work_orders wo
    JOIN purchase_orders po ON po.id = wo.purchase_order_id
    JOIN rfqs r ON r.id = po.rfq_id
    WHERE wo.id = NEW.work_order_id;

    IF v_buyer_id IS NOT NULL THEN
      PERFORM public.create_system_notification(
        v_buyer_id,
        '[INVOICE] GST Invoice Submitted for Settlement',
        'Official GST Invoice ' || NEW.invoice_number || ' (Rs. ' || to_char(NEW.amount, 'FM99,99,99,999') || ') has been submitted for payment settlement on ' || COALESCE(v_po_title, 'Purchase Order') || '.',
        '/purchase-orders/' || COALESCE(v_po_id::text, ''),
        'invoice.submitted',
        'INVOICE_SUBMITTED',
        jsonb_build_object(
          'invoiceId', NEW.id,
          'invoiceNumber', NEW.invoice_number,
          'amount', NEW.amount,
          'poId', v_po_id,
          'workOrderId', NEW.work_order_id
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_payment_recorded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supplier_user_id uuid;
  v_inv record;
BEGIN
  SELECT inv.id, inv.invoice_number, inv.amount, inv.work_order_id, wo.purchase_order_id, su.profile_id
  INTO v_inv
  FROM invoices inv
  JOIN work_orders wo ON wo.id = inv.work_order_id
  JOIN supplier_users su ON su.supplier_id = inv.supplier_id
  WHERE inv.id = NEW.invoice_id
  LIMIT 1;

  IF v_inv.profile_id IS NOT NULL THEN
    PERFORM public.create_system_notification(
      v_inv.profile_id,
      '[PAYMENT] Payment Remittance Recorded (Rs. ' || to_char(NEW.amount, 'FM99,99,99,999') || ')',
      'Buyer has recorded payment reference ' || COALESCE(NEW.reference, 'UTR/Ref') || ' for Invoice ' || v_inv.invoice_number || '.',
      '/purchase-orders/' || COALESCE(v_inv.purchase_order_id::text, ''),
      'payment.recorded',
      'PAYMENT_RECORDED',
      jsonb_build_object(
        'paymentId', NEW.id,
        'invoiceId', NEW.invoice_id,
        'amount', NEW.amount,
        'reference', NEW.reference,
        'method', NEW.method::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 7. Upgrade notify_unawarded_suppliers trigger to clean ASCII
CREATE OR REPLACE FUNCTION public.notify_unawarded_suppliers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rfq record;
  v_winning_quote record;
  v_inv record;
  v_has_quote boolean;
  v_user record;
  v_title text;
  v_body text;
  v_action_type text;
  v_event_type text;
BEGIN
  IF NEW.status <> 'ISSUED' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'ISSUED' THEN
    RETURN NEW;
  END IF;

  SELECT r.id, r.title, r.public_ref
  INTO v_rfq
  FROM rfqs r
  WHERE r.id = NEW.rfq_id;

  IF v_rfq.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT q.id, q.supplier_id
  INTO v_winning_quote
  FROM quotes q
  WHERE q.id = NEW.quote_id;

  IF v_winning_quote.id IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_inv IN
    SELECT DISTINCT ri.supplier_id
    FROM rfq_invitations ri
    WHERE ri.rfq_id = NEW.rfq_id
      AND ri.supplier_id <> v_winning_quote.supplier_id
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM quotes q
      WHERE q.rfq_id = NEW.rfq_id AND q.supplier_id = v_inv.supplier_id
    ) INTO v_has_quote;

    IF v_has_quote THEN
      v_title       := '[OTP] Tender Concluded: Not Awarded';
      v_body        := 'The buyer has concluded evaluation for "' || COALESCE(v_rfq.title, 'Requirement') || '" and placed the order with another supplier. Thank you for your submission.';
      v_action_type := 'RFQ_NOT_AWARDED';
      v_event_type  := 'rfq.not_awarded';
    ELSE
      v_title       := '[OTP] Bidding Closed: Requirement Awarded';
      v_body        := 'The requirement "' || COALESCE(v_rfq.title, 'Requirement') || '" is now closed and has been awarded. It is no longer accepting new quotes.';
      v_action_type := 'RFQ_CLOSED_UNRESPONSIVE';
      v_event_type  := 'rfq.closed_unresponsive';
    END IF;

    FOR v_user IN
      SELECT profile_id
      FROM supplier_users
      WHERE supplier_id = v_inv.supplier_id
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE profile_id = v_user.profile_id
          AND action_type IN ('RFQ_NOT_AWARDED', 'RFQ_CLOSED_UNRESPONSIVE')
          AND payload->>'rfq_id' = NEW.rfq_id::text
      ) THEN
        PERFORM public.create_system_notification(
          p_profile_id := v_user.profile_id,
          p_title      := v_title,
          p_body       := v_body,
          p_link       := '/seller',
          p_event_type := v_event_type,
          p_action_type:= v_action_type,
          p_payload    := jsonb_build_object(
            'rfq_id',     NEW.rfq_id,
            'po_id',      NEW.id,
            'supplier_id', v_inv.supplier_id
          )
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;
