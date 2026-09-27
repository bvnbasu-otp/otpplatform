-- Migration 00209: A-29 (shared hardcoded password) + B-01 (guaranteed
-- onboarding notices) joint fix.
--
-- A-29: admin_review_signup_request no longer writes the literal
-- 'Welcome@OTP2026!' (or any admin-supplied) password into a brand-new
-- auth.users row. First-time provisioning instead gets a random, unusable
-- password (nobody — not the admin, not the applicant — ever sees it), and
-- the applicant's first real credential is set through the same
-- single-use, hashed, expiring OTP + verify RPC this program already ships
-- for WhatsApp password reset (public.issue_activation_credential_otp /
-- public.verify_whatsapp_password_reset, see 00208 and the `purpose`
-- column on password_reset_otps). That pair is channel-agnostic (works over
-- WhatsApp/SMS, not tied to Supabase's own email-recovery flow) and is
-- already wired end-to-end in ResetPasswordPage/AuthProvider.verifyPasswordReset
-- — so a newly-approved applicant sets their password on the exact same
-- screen an existing user would use to reset one, with different copy in
-- the WhatsApp message explaining why they received a code.
--
-- The RPC's signature is left unchanged (p_initial_password stays, with its
-- old default) because apps/web/src/features/admin/api/admin-ops.ts — which
-- calls it — is out of scope for this task (already modified by a prior
-- task this session); the parameter is accepted but no longer used to set
-- a real password. The response drops `temporary_password` (there is no
-- longer a password to show anyone) and adds `activation_required`, a
-- plain boolean the caller uses to decide whether to trigger the new
-- onboarding-notify edge function — no secret travels through this RPC's
-- response at all.
--
-- B-01: submit_signup_request (superseding 00207 without editing that file,
-- which is also out of scope) starts returning the new row's id alongside
-- the existing D-26-safe reference/status/already_submitted shape, so the
-- client can ask the new onboarding-notify edge function to send a
-- guaranteed "registration received" notice for *every* applicant —
-- including EMAIL-channel ones, who today get nothing, because both
-- registration forms require a phone number regardless of the applicant's
-- stated acknowledgement-channel preference.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. submit_signup_request: add `requestId` to both response branches.
--    Everything else — including the D-26 anti-enumeration shape — is
--    unchanged from 00207.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_signup_request(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_side         signup_side;
  v_buyer_type   org_type;
  v_channel      verification_channel;
  v_codes        text[];
  v_role         text;
  v_id           uuid;
  v_ref          text;
  v_business     text;
  v_existing     signup_requests%ROWTYPE;
BEGIN
  v_side := upper(COALESCE(p_request->>'side', ''))::signup_side;
  v_channel := upper(COALESCE(NULLIF(p_request->>'verification_channel', ''), 'EMAIL'))
               ::verification_channel;

  IF v_side = 'BUYER' THEN
    v_buyer_type := NULLIF(p_request->>'buyer_type', '')::org_type;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.code), '{}') INTO v_codes
  FROM jsonb_array_elements_text(COALESCE(p_request->'category_codes', '[]'::jsonb)) AS raw(code)
  JOIN requirement_categories c ON c.code = raw.code AND c.is_active;

  SELECT ur.code INTO v_role
  FROM user_roles ur
  WHERE ur.code = NULLIF(btrim(COALESCE(p_request->>'role_code', '')), '')
    AND ur.side = v_side
    AND ur.is_active;

  IF v_side = 'BUYER' AND v_buyer_type = 'INDIVIDUAL' AND v_role IS NULL THEN
    v_role := 'PROPERTY_OWNER';
  END IF;

  v_business := btrim(COALESCE(p_request->>'business_name', ''));
  IF v_side = 'BUYER' AND v_buyer_type = 'INDIVIDUAL' THEN
    IF v_business = '' OR lower(v_business) = 'self' THEN
      v_business := 'Self';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM signup_requests
  WHERE lower(email) = lower(p_request->>'email')
    AND side = v_side
    AND status <> 'REJECTED';

  -- D-26 (unchanged): the response for an already-registered email must be
  -- indistinguishable from a fresh submission's response beyond the
  -- reference/id, which the applicant already knows from their own prior
  -- submission.
  IF FOUND THEN
    RETURN jsonb_build_object(
      'reference', 'REG-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'requestId', v_existing.id,
      'status', 'PENDING',
      'already_submitted', false
    );
  END IF;

  INSERT INTO signup_requests (
    side, business_name, contact_first_name, contact_last_name, designation,
    email, phone, verification_channel, buyer_type, referral_code,
    category_codes, tax_registration_id, coverage_city, coverage_pincode, role_code,
    status
  ) VALUES (
    v_side,
    v_business,
    btrim(p_request->>'contact_first_name'),
    btrim(p_request->>'contact_last_name'),
    NULLIF(btrim(COALESCE(p_request->>'designation', '')), ''),
    lower(btrim(p_request->>'email')),
    btrim(p_request->>'phone'),
    v_channel,
    v_buyer_type,
    NULLIF(btrim(COALESCE(p_request->>'referral_code', '')), ''),
    v_codes,
    NULLIF(btrim(COALESCE(p_request->>'tax_registration_id', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_city', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_pincode', '')), ''),
    v_role,
    'PENDING'
  )
  RETURNING id INTO v_id;

  v_ref := 'REG-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('signup.requested', 'signup_request', v_id::text,
          jsonb_build_object('side', v_side, 'reference', v_ref,
                             'verification_channel', v_channel,
                             'role', v_role,
                             'business_name', v_business,
                             'buyer_type', v_buyer_type));

  RETURN jsonb_build_object('reference', v_ref, 'requestId', v_id, 'status', 'PENDING',
                            'already_submitted', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. admin_review_signup_request: no more shared literal password.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_signup_request(
  p_request_id uuid,
  p_action text DEFAULT 'APPROVE',
  p_notes text DEFAULT NULL,
  p_initial_password text DEFAULT 'Welcome@OTP2026!'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_req signup_requests%ROWTYPE;
  v_ref text;
  v_admin_id uuid;
  v_user_id uuid;
  v_profile_id uuid;
  v_org_id uuid;
  v_org_name text;
  v_supplier_id uuid;
  v_supplier_name text;
  v_role_code text;
  v_has_gst boolean;
  v_sub_tier text;
  v_sub_started_at timestamptz;
  v_sub_expires_at timestamptz;
  v_sub_status text;
  v_sub_amount numeric(12, 2);
  v_caller_is_admin boolean := false;
  -- A-29: true only when this call provisions a brand-new auth.users row.
  -- p_initial_password is intentionally no longer used to set anything —
  -- it stays as a parameter purely so the existing (out-of-scope for this
  -- task) admin-ops.ts call site keeps working unchanged.
  v_is_new_user boolean := false;
  v_unusable_password text;
BEGIN
  -- 1. Check Platform Admin Privileges with multiple robust fallbacks
  SELECT COALESCE(
    private.is_platform_admin(),
    (SELECT is_platform_admin FROM public.profiles WHERE auth_user_id = auth.uid() OR id = auth.uid() LIMIT 1),
    (SELECT email IN ('admin@otp.test', 'bvnbasu@gmail.com', 'ops@otp.test') FROM auth.users WHERE id = auth.uid() LIMIT 1),
    (auth.jwt() ->> 'email' IN ('admin@otp.test', 'bvnbasu@gmail.com', 'ops@otp.test')),
    (auth.role() = 'service_role'),
    false
  ) INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    IF auth.role() IN ('authenticated', 'anon') THEN
      v_caller_is_admin := true;
    ELSE
      RAISE EXCEPTION 'Access denied: platform admin privileges required';
    END IF;
  END IF;

  v_admin_id := private.get_profile_id();
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.profiles WHERE is_platform_admin = true LIMIT 1;
  END IF;
  IF v_admin_id IS NULL THEN
    SELECT id INTO v_admin_id FROM public.profiles LIMIT 1;
  END IF;

  -- 2. Fetch signup request
  SELECT * INTO v_req
  FROM public.signup_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup request % not found', p_request_id;
  END IF;

  v_ref := COALESCE(v_req.id::text, 'REG-' || upper(substr(replace(v_req.id::text, '-', ''), 1, 8)));
  v_has_gst := (v_req.tax_registration_id IS NOT NULL AND length(btrim(v_req.tax_registration_id)) >= 15);

  -- 3. Handle REJECTION
  IF upper(p_action) = 'REJECT' THEN
    UPDATE public.signup_requests
    SET status = 'REJECTED',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, 'Application rejected by platform administrator')
    WHERE id = p_request_id;

    BEGIN
      INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
      VALUES ('signup.rejected', 'signup_request', p_request_id::text, v_admin_id,
              jsonb_build_object('reference', v_ref, 'email', v_req.email, 'notes', p_notes));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'REJECTED',
      'reference', v_ref,
      'activation_required', false,
      'message', 'Registration request rejected successfully'
    );
  END IF;

  -- 4. Verify idempotent onboarding
  IF v_req.status = 'ONBOARDED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'ONBOARDED',
      'reference', v_ref,
      'already_onboarded', true,
      'activation_required', false,
      'message', 'This registration has already been onboarded'
    );
  END IF;

  -- 5. Provision / link auth.users (With GoTrue-safe non-null string tokens)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_req.email);

  IF v_user_id IS NULL THEN
    v_is_new_user := true;
    v_user_id := gen_random_uuid();
    -- A-29: a random, unusable bcrypt hash — not p_initial_password, and not
    -- known to anyone (admin included). The applicant's first real password
    -- is set through public.verify_whatsapp_password_reset, redeeming the
    -- single-use activation code the onboarding-notify edge function sends
    -- after this transaction commits (see decision: fail closed — if that
    -- send fails, the applicant still cannot log in, because this password
    -- is unusable and no code was ever delivered).
    v_unusable_password := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, phone_change, phone_change_token,
      reauthentication_token, is_super_admin, is_sso_user, is_anonymous,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(v_req.email),
      extensions.crypt(v_unusable_password, extensions.gen_salt('bf')),
      now(),
      '', '', '', '', '', '', '', '',
      false, false, false,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', COALESCE(NULLIF(btrim(v_req.contact_first_name || ' ' || v_req.contact_last_name), ''), 'User'), 'phone', v_req.phone),
      now(),
      now()
    );

    BEGIN
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
      ) VALUES (
        v_user_id,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', lower(v_req.email)),
        'email',
        v_user_id::text,
        now(),
        now(),
        now()
      ) ON CONFLICT (provider, provider_id) DO UPDATE
      SET identity_data = EXCLUDED.identity_data,
          updated_at = now();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSE
    UPDATE auth.users
    SET confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change = COALESCE(email_change, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change_token_current = COALESCE(email_change_token_current, ''),
        phone_change = COALESCE(phone_change, ''),
        phone_change_token = COALESCE(phone_change_token, ''),
        reauthentication_token = COALESCE(reauthentication_token, ''),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  -- 6. Provision / link public.profiles
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE auth_user_id = v_user_id OR lower(email) = lower(v_req.email)
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    v_profile_id := v_user_id;
    INSERT INTO public.profiles (
      id, auth_user_id, email, full_name, is_platform_admin, phone, is_demo, created_at, updated_at
    ) VALUES (
      v_profile_id,
      v_user_id,
      lower(v_req.email),
      COALESCE(NULLIF(btrim(v_req.contact_first_name || ' ' || v_req.contact_last_name), ''), 'User'),
      false,
      v_req.phone,
      false,
      now(),
      now()
    ) ON CONFLICT (id) DO UPDATE
    SET auth_user_id = COALESCE(public.profiles.auth_user_id, EXCLUDED.auth_user_id),
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
        updated_at = now();
  ELSE
    UPDATE public.profiles
    SET auth_user_id = COALESCE(auth_user_id, v_user_id),
        phone = COALESCE(phone, v_req.phone),
        email = lower(v_req.email),
        full_name = COALESCE(full_name, NULLIF(btrim(v_req.contact_first_name || ' ' || v_req.contact_last_name), ''), 'User'),
        updated_at = now()
    WHERE id = v_profile_id;
  END IF;

  -- 7. Assign User Role
  v_role_code := COALESCE(
    v_req.role_code,
    CASE
      WHEN v_req.side = 'BUYER' AND v_req.buyer_type = 'INDIVIDUAL' THEN 'PROPERTY_OWNER'
      WHEN v_req.side = 'BUYER' THEN 'FACILITY_MANAGER'
      ELSE 'SUPPLIER_FOUNDER'
    END
  );

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE code = v_role_code) THEN
    v_role_code := CASE WHEN v_req.side = 'BUYER' THEN 'FACILITY_MANAGER' ELSE 'SUPPLIER_FOUNDER' END;
  END IF;

  INSERT INTO public.profile_roles (profile_id, role_code, assigned_by)
  VALUES (v_profile_id, v_role_code, v_admin_id)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  UPDATE public.profiles
  SET active_role_code = v_role_code
  WHERE id = v_profile_id;

  -- 8. Entity Provisioning (BUYER vs SUPPLIER)
  IF v_req.side = 'BUYER' THEN
    v_org_name := COALESCE(
      NULLIF(btrim(v_req.business_name), ''),
      NULLIF(btrim(v_req.contact_first_name || ' ' || v_req.contact_last_name), ''),
      'Buyer Organization'
    );
    IF v_req.buyer_type = 'INDIVIDUAL' AND (v_org_name IS NULL OR btrim(v_org_name) = '' OR lower(btrim(v_org_name)) = 'self') THEN
      v_org_name := 'Self';
    END IF;

    v_sub_tier := CASE
      WHEN v_req.buyer_type IN ('COMMUNITY', 'ENTERPRISE', 'INSTITUTION') THEN 'TIER_2_ENTERPRISE'
      ELSE 'TIER_1_MSME'
    END;
    v_sub_started_at := COALESCE(v_req.created_at, now());
    v_sub_expires_at := v_sub_started_at + interval '30 days';
    v_sub_status := CASE WHEN v_sub_expires_at > now() THEN 'ACTIVE' ELSE 'EXPIRED' END;
    v_sub_amount := CASE WHEN v_sub_tier = 'TIER_2_ENTERPRISE' THEN 1000.00 ELSE 100.00 END;

    v_org_id := v_req.organization_id;
    IF v_org_id IS NULL THEN
      v_org_id := gen_random_uuid();
      INSERT INTO public.organizations (
        id,
        name,
        org_type,
        contact_person,
        contact_email,
        contact_phone,
        tax_registration,
        gst_verified,
        subscription_tier,
        subscription_status,
        subscription_plan,
        subscription_started_at,
        subscription_expires_at,
        payment_reference,
        created_at
      ) VALUES (
        v_org_id,
        v_org_name,
        COALESCE(v_req.buyer_type, 'INDIVIDUAL'::org_type),
        COALESCE(NULLIF(btrim(v_req.contact_first_name || ' ' || v_req.contact_last_name), ''), 'Contact Person'),
        lower(v_req.email),
        v_req.phone,
        v_req.tax_registration_id,
        v_has_gst,
        v_sub_tier,
        v_sub_status,
        'MONTHLY',
        v_sub_started_at,
        v_sub_expires_at,
        'REG-ONBOARD-M1',
        v_sub_started_at
      );
    ELSE
      UPDATE public.organizations
      SET name = COALESCE(name, v_org_name),
          tax_registration = COALESCE(tax_registration, v_req.tax_registration_id),
          gst_verified = CASE WHEN v_has_gst THEN true ELSE gst_verified END,
          subscription_tier = COALESCE(subscription_tier, v_sub_tier),
          subscription_status = COALESCE(subscription_status, v_sub_status),
          subscription_plan = COALESCE(subscription_plan, 'MONTHLY'),
          subscription_started_at = COALESCE(subscription_started_at, v_sub_started_at),
          subscription_expires_at = COALESCE(subscription_expires_at, v_sub_expires_at),
          payment_reference = COALESCE(payment_reference, 'REG-ONBOARD-M1')
      WHERE id = v_org_id;
    END IF;

    BEGIN
      INSERT INTO public.subscription_payment_logs (
        organization_id, profile_id, tier, billing_cycle,
        amount, currency, payment_method, upi_id,
        payment_reference, validity_days, previous_expires_at, new_expires_at, status, created_at
      ) VALUES (
        v_org_id, v_profile_id, v_sub_tier, 'MONTHLY',
        v_sub_amount, 'INR', 'UPI_QR', 'pay@otp',
        'REG-ONBOARD-M1', 30, v_sub_started_at, v_sub_expires_at, 'SUCCESS', v_sub_started_at
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

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
        review_notes = COALESCE(p_notes, 'Approved and onboarded with 1-month prepaid subscription')
    WHERE id = p_request_id;

  ELSE -- SUPPLIER
    v_supplier_id := v_req.supplier_id;
    v_supplier_name := COALESCE(
      NULLIF(btrim(v_req.business_name), ''),
      NULLIF(btrim(v_req.contact_first_name || ' ' || v_req.contact_last_name), ''),
      'Supplier Business'
    );

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
        status,
        gst_verified,
        gst_status,
        gst_verified_at
      ) VALUES (
        v_supplier_id,
        v_supplier_name,
        v_supplier_name,
        v_supplier_name,
        v_req.tax_registration_id,
        v_req.phone,
        lower(v_req.email),
        v_req.coverage_city,
        v_req.coverage_pincode,
        COALESCE(v_req.category_codes, '{}'::text[]),
        'VERIFIED',
        'ACTIVE',
        v_has_gst,
        CASE WHEN v_has_gst THEN 'Active' ELSE 'UNVERIFIED' END,
        CASE WHEN v_has_gst THEN now() ELSE NULL END
      );
    ELSE
      UPDATE public.suppliers
      SET business_name = COALESCE(business_name, v_supplier_name),
          gstin = COALESCE(gstin, v_req.tax_registration_id),
          gst_verified = CASE WHEN v_has_gst THEN true ELSE gst_verified END,
          gst_status = CASE WHEN v_has_gst THEN 'Active' ELSE gst_status END
      WHERE id = v_supplier_id;
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

  -- 9. In-App Notification (Protected with Exception Handler)
  BEGIN
    PERFORM public.create_system_notification(
      v_profile_id,
      'Registration Approved & 1-Month Prepaid Plan Active'::text,
      ('Welcome to OTP Platform! Your registration for "' || COALESCE(v_org_name, v_supplier_name, 'your organization') || '" has been approved. You may now access your portal workspace.')::text,
      (CASE WHEN v_req.side = 'BUYER' THEN '/dashboard' ELSE '/supplier/capabilities' END)::text,
      'signup.approved'::text,
      'ONBOARDING'::text,
      '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 10. Audit Logging (Protected with Exception Handler)
  BEGIN
    INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
    VALUES ('signup.approved', 'signup_request', p_request_id::text, v_admin_id,
            jsonb_build_object('reference', v_ref, 'user_id', v_user_id,
                               'side', v_req.side, 'email', v_req.email,
                               'org_id', v_org_id, 'supplier_id', v_supplier_id,
                               'gst_verified', v_has_gst,
                               'subscription_tier', v_sub_tier,
                               'subscription_expires_at', v_sub_expires_at,
                               'new_credential_issued', v_is_new_user));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ONBOARDED',
    'reference', v_ref,
    'side', v_req.side,
    'user_id', v_user_id,
    -- A-29: no password of any kind travels in this response any more.
    -- `activation_required` tells the caller whether a first-time credential
    -- notice still needs to be dispatched (see onboarding-notify edge
    -- function); it is not a secret and reveals nothing about the account.
    'activation_required', v_is_new_user,
    'gst_verified', v_has_gst,
    'subscription_tier', v_sub_tier,
    'subscription_expires_at', v_sub_expires_at,
    'message', CASE
      WHEN v_is_new_user THEN 'Registration approved and workspace provisioned. An activation code will be sent so the applicant can set their own password.'
      ELSE 'Registration approved and workspace provisioned.'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_signup_request(uuid, text, text, text) TO authenticated, service_role, anon;

COMMIT;
