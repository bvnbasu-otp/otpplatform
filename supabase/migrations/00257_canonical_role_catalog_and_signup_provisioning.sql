-- Restore canonical 12-role catalog (00039) and harden signup role resolution.
-- Incident: profile_roles_role_code_fkey when FACILITY_MANAGER / SUPPLIER_FOUNDER absent on hosted.

BEGIN;

INSERT INTO public.user_roles (code, side, label, description, permissions, sort_order, is_active)
VALUES
  ('FACILITY_MANAGER', 'BUYER', 'Facility Manager',
   'Runs the sourcing process end to end: raises requirements, sets deadlines and criteria, handles supplier questions.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE','AWARD']::role_permission[], 10, true),
  ('PROCUREMENT_LEAD', 'BUYER', 'Procurement Lead',
   'Full operational access to sourcing: creates and edits enquiries, sets weightage, manages Q&A, recommends a shortlist.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE','AWARD']::role_permission[], 20, true),
  ('COMMITTEE_MEMBER', 'BUYER', 'Managing Committee Member / Director',
   'Decision and governance: compares bids side by side, votes on the shortlist, signs off purchase orders. Does not raise enquiries.',
   ARRAY['READ','VOTE','APPROVE']::role_permission[], 30, true),
  ('OPERATIONS_MANAGER', 'BUYER', 'Operations Manager',
   'Day-to-day execution: raises requirements and tracks delivery. Does not authorise awards or payments.',
   ARRAY['READ','WRITE','PROPOSE']::role_permission[], 40, true),
  ('FINANCE_APPROVER', 'BUYER', 'Finance / Accounts Approver',
   'Financial view: budget allocations, itemised bid breakdowns, payment schedules, approved orders. Approves money, does not source.',
   ARRAY['READ','APPROVE']::role_permission[], 50, true),
  ('PROPERTY_OWNER', 'BUYER', 'Property Owner',
   'Read-only governance: follows progress, votes are visible, nothing can be changed.',
   ARRAY['READ']::role_permission[], 60, true),
  ('GENERAL_AUDITOR', 'BUYER', 'General Auditor',
   'Read-only oversight: the audit trail, committee votes and execution milestones. Cannot act anywhere.',
   ARRAY['READ']::role_permission[], 70, true),
  ('SUPPLIER_FOUNDER', 'SUPPLIER', 'Founder / Owner',
   'Commercial authority: authorises bids, negotiates, accepts awarded orders, sees the buyer once identities are revealed.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE']::role_permission[], 10, true),
  ('SUPPLIER_BD_HEAD', 'SUPPLIER', 'Business Development Head',
   'Commercial authority alongside the owner: authorises bids, negotiates, accepts awarded orders.',
   ARRAY['READ','WRITE','PROPOSE','APPROVE']::role_permission[], 20, true),
  ('SUPPLIER_SALES_MANAGER', 'SUPPLIER', 'Sales Manager',
   'Lead management: drafts and submits quotes, answers buyer questions, revises pricing. Cannot accept an awarded order.',
   ARRAY['READ','WRITE','PROPOSE']::role_permission[], 30, true),
  ('SUPPLIER_TECHNICAL_LEAD', 'SUPPLIER', 'Technical Lead / Project Manager',
   'Execution: uploads compliance and technical documents, submits milestone completions and proof. No commercial authority.',
   ARRAY['READ','WRITE']::role_permission[], 40, true),
  ('SUPPLIER_FINANCE', 'SUPPLIER', 'Billing & Finance Manager',
   'Billing: raises invoices against completed work and tracks payment. Does not price bids.',
   ARRAY['READ','WRITE','APPROVE']::role_permission[], 50, true)
ON CONFLICT (code) DO UPDATE
SET
  side = EXCLUDED.side,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  permissions = EXCLUDED.permissions,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active
WHERE
  user_roles.side IS DISTINCT FROM EXCLUDED.side
  OR user_roles.label IS DISTINCT FROM EXCLUDED.label
  OR user_roles.description IS DISTINCT FROM EXCLUDED.description
  OR user_roles.permissions IS DISTINCT FROM EXCLUDED.permissions
  OR user_roles.sort_order IS DISTINCT FROM EXCLUDED.sort_order
  OR user_roles.is_active IS DISTINCT FROM EXCLUDED.is_active;

CREATE OR REPLACE FUNCTION private.resolve_signup_role(
  p_side signup_side,
  p_buyer_type org_type,
  p_requested_role text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested text;
  v_role text;
BEGIN
  v_requested := NULLIF(btrim(COALESCE(p_requested_role, '')), '');

  IF v_requested IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.code = v_requested AND ur.side = p_side AND NOT ur.is_active
    ) THEN
      RAISE EXCEPTION 'Requested role % is inactive (SIGNUP_ROLE_INVALID)', v_requested;
    END IF;

    SELECT ur.code INTO v_role
    FROM public.user_roles ur
    WHERE ur.code = v_requested
      AND ur.side = p_side
      AND ur.is_active;

    IF v_role IS NOT NULL THEN
      IF p_side = 'BUYER' AND p_buyer_type = 'INDIVIDUAL' AND v_role IS DISTINCT FROM 'PROPERTY_OWNER' THEN
        RAISE EXCEPTION 'Individual buyers must register as Property Owner (SIGNUP_INDIVIDUAL_ROLE_MISMATCH)';
      END IF;
      RETURN v_role;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.code = v_requested AND ur.side IS DISTINCT FROM p_side
    ) THEN
      RAISE EXCEPTION 'Requested role % is not valid for % signup (SIGNUP_ROLE_SIDE_MISMATCH)', v_requested, p_side;
    END IF;

    IF EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.code = v_requested) THEN
      RAISE EXCEPTION 'Requested role % is inactive (SIGNUP_ROLE_INVALID)', v_requested;
    END IF;

    RAISE EXCEPTION 'Requested role % is not recognized (SIGNUP_ROLE_UNKNOWN)', v_requested;
  END IF;

  IF p_side = 'BUYER' AND p_buyer_type = 'INDIVIDUAL' THEN
    SELECT ur.code INTO v_role
    FROM public.user_roles ur
    WHERE ur.code = 'PROPERTY_OWNER'
      AND ur.side = 'BUYER'
      AND ur.is_active;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'Individual buyer registration requires an active Property Owner role in the catalog (SIGNUP_INDIVIDUAL_ROLE_UNAVAILABLE)';
    END IF;

    RETURN v_role;
  END IF;

  IF p_side = 'BUYER' AND p_buyer_type = 'COMMUNITY' THEN
    SELECT ur.code INTO v_role
    FROM public.user_roles ur
    WHERE ur.code = 'COMMITTEE_MEMBER'
      AND ur.side = 'BUYER'
      AND ur.is_active;
  ELSIF p_side = 'BUYER' THEN
    SELECT ur.code INTO v_role
    FROM public.user_roles ur
    WHERE ur.code = 'FACILITY_MANAGER'
      AND ur.side = 'BUYER'
      AND ur.is_active;
  ELSE
    SELECT ur.code INTO v_role
    FROM public.user_roles ur
    WHERE ur.code = 'SUPPLIER_FOUNDER'
      AND ur.side = 'SUPPLIER'
      AND ur.is_active;
  END IF;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No default active role for % signup in catalog (SIGNUP_ROLE_UNAVAILABLE)', p_side;
  END IF;

  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_signup_role(signup_side, org_type, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.resolve_signup_role(signup_side, org_type, text) TO service_role;

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
  v_status       text := 'PENDING';
  v_defer_reason text;
BEGIN
  v_side := upper(COALESCE(p_request->>'side', ''))::signup_side;
  v_channel := upper(COALESCE(NULLIF(p_request->>'verification_channel', ''), 'EMAIL'))
               ::verification_channel;

  IF v_side = 'BUYER' THEN
    IF upper(btrim(COALESCE(p_request->>'buyer_type', ''))) NOT IN ('INDIVIDUAL', 'COMMUNITY', 'MSME') THEN
      RAISE EXCEPTION 'Buyer type is not a customer type (SIGNUP_BUYER_TYPE_REJECTED)';
    END IF;
    v_buyer_type := upper(btrim(p_request->>'buyer_type'))::org_type;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.code), '{}') INTO v_codes
  FROM jsonb_array_elements_text(COALESCE(p_request->'category_codes', '[]'::jsonb)) AS raw(code)
  JOIN requirement_categories c ON c.code = raw.code AND c.is_active;

  v_role := private.resolve_signup_role(
    v_side,
    CASE WHEN v_side = 'BUYER' THEN v_buyer_type ELSE NULL END,
    p_request->>'role_code'
  );

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

  IF FOUND THEN
    v_status := CASE WHEN v_existing.status = 'ONBOARDED' THEN 'ONBOARDED' ELSE 'PENDING' END;
    RETURN jsonb_build_object(
      'reference', 'REG-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'requestId', v_existing.id,
      'status', v_status,
      'already_submitted', false,
      'auto_approved', v_status = 'ONBOARDED',
      'activation_required', v_status = 'ONBOARDED'
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

  BEGIN
    PERFORM private.provision_signup_request(v_id, NULL, NULL, true);
    v_status := 'ONBOARDED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_defer_reason = MESSAGE_TEXT;
    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES ('signup.review_required', 'signup_request', v_id::text,
            jsonb_build_object('reference', v_ref, 'reason', v_defer_reason));
  END;

  RETURN jsonb_build_object(
    'reference', v_ref,
    'requestId', v_id,
    'status', v_status,
    'already_submitted', false,
    'auto_approved', v_status = 'ONBOARDED',
    'activation_required', v_status = 'ONBOARDED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_signup_request(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated, service_role;



CREATE OR REPLACE FUNCTION private.provision_signup_request(
  p_request_id   uuid,
  p_admin_id     uuid,
  p_notes        text,
  p_self_service boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_req signup_requests%ROWTYPE;
  v_ref text;
  v_user_id uuid;
  v_profile_id uuid;
  v_org_id uuid;
  v_org_name text;
  v_supplier_id uuid;
  v_supplier_name text;
  v_role_code text;
  v_has_gst boolean;
  v_gst_verified boolean;
  v_sub_tier text;
  v_sub_started_at timestamptz;
  v_sub_expires_at timestamptz;
  v_sub_status text;
  v_sub_amount numeric(12, 2);
  v_is_new_user boolean := false;
  v_unusable_password text;
BEGIN
  SELECT * INTO v_req
  FROM public.signup_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup request % not found', p_request_id;
  END IF;

  v_ref := COALESCE(v_req.id::text, 'REG-' || upper(substr(replace(v_req.id::text, '-', ''), 1, 8)));
  v_has_gst := (v_req.tax_registration_id IS NOT NULL AND length(btrim(v_req.tax_registration_id)) >= 15);
  -- A GSTIN of the right length is only format evidence. An admin approving
  -- the request keeps the 00210 behaviour; self-service never marks it
  -- verified.
  v_gst_verified := v_has_gst AND NOT p_self_service;

  -- Self-service may only create a brand-new identity: linking to an
  -- existing auth user or profile by email would let whoever typed that
  -- email (and their own phone) take the existing account over.
  IF p_self_service THEN
    IF v_req.status <> 'PENDING' THEN
      RAISE EXCEPTION 'SELF_SERVICE_INELIGIBLE: request is %', v_req.status;
    END IF;
    IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(v_req.email)) THEN
      RAISE EXCEPTION 'SELF_SERVICE_INELIGIBLE: an account already exists for this email';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = lower(v_req.email)) THEN
      RAISE EXCEPTION 'SELF_SERVICE_INELIGIBLE: a profile already exists for this email';
    END IF;
  END IF;

  -- 00257: resolve role before auth/profile writes (fail closed on catalog gaps)
  v_role_code := private.resolve_signup_role(v_req.side, v_req.buyer_type, v_req.role_code);

  -- 5. Provision (With GoTrue-safe non-null string tokens)
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_req.email);

  IF v_user_id IS NULL THEN
    v_is_new_user := true;
    v_user_id := gen_random_uuid();
    -- A-29: random, unusable password; the first real password is set by
    -- redeeming the activation code onboarding-notify sends.
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

  -- 7. Assign User Role (validated in 00257 before auth provisioning)
  INSERT INTO public.profile_roles (profile_id, role_code, assigned_by)
  VALUES (v_profile_id, v_role_code, p_admin_id)
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
        v_gst_verified,
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
          gst_verified = CASE WHEN v_gst_verified THEN true ELSE gst_verified END,
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
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, CASE WHEN p_self_service
          THEN 'Provisioned at signup with 1-month prepaid subscription'
          ELSE 'Approved and onboarded with 1-month prepaid subscription' END)
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
      -- 00212: account approval is not verification. The account is ACTIVE
      -- (can log in and quote); identity is verified later, before reveal/PO.
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
        lifecycle_state,
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
        CASE WHEN v_has_gst THEN 'PENDING' ELSE 'NOT_PROVIDED' END,
        CASE WHEN v_has_gst THEN 'VERIFICATION_PENDING' ELSE 'QUOTE_PARTICIPANT' END,
        'ACTIVE',
        v_gst_verified,
        CASE WHEN v_gst_verified THEN 'Active' ELSE 'UNVERIFIED' END,
        CASE WHEN v_gst_verified THEN now() ELSE NULL END
      );
    ELSE
      UPDATE public.suppliers
      SET business_name = COALESCE(business_name, v_supplier_name),
          gstin = COALESCE(gstin, v_req.tax_registration_id),
          gst_verified = CASE WHEN v_gst_verified THEN true ELSE gst_verified END,
          gst_status = CASE WHEN v_gst_verified THEN 'Active' ELSE gst_status END
      WHERE id = v_supplier_id;
    END IF;

    INSERT INTO public.supplier_users (supplier_id, profile_id, role)
    VALUES (v_supplier_id, v_profile_id, 'OWNER')
    ON CONFLICT (supplier_id, profile_id) DO NOTHING;

    UPDATE public.signup_requests
    SET status = 'ONBOARDED',
        supplier_id = v_supplier_id,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, CASE WHEN p_self_service
          THEN 'Provisioned at signup'
          ELSE 'Approved and onboarded by platform administrator' END)
    WHERE id = p_request_id;
  END IF;

  -- 9. In-App Notification (Protected with Exception Handler)
  BEGIN
    PERFORM public.create_system_notification(
      v_profile_id,
      (CASE WHEN p_self_service
        THEN 'Welcome to OTP Platform - 1-Month Prepaid Plan Active'
        ELSE 'Registration Approved & 1-Month Prepaid Plan Active' END)::text,
      ('Welcome to OTP Platform! Your registration for "' || COALESCE(v_org_name, v_supplier_name, 'your organization') || '" is active. You may now access your portal workspace.')::text,
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
    VALUES (CASE WHEN p_self_service THEN 'signup.self_provisioned' ELSE 'signup.approved' END,
            'signup_request', p_request_id::text, p_admin_id,
            jsonb_build_object('reference', v_ref, 'user_id', v_user_id,
                               'side', v_req.side, 'email', v_req.email,
                               'org_id', v_org_id, 'supplier_id', v_supplier_id,
                               'gst_verified', v_gst_verified,
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
    'activation_required', v_is_new_user,
    'gst_verified', v_gst_verified,
    'subscription_tier', v_sub_tier,
    'subscription_expires_at', v_sub_expires_at,
    'message', CASE
      WHEN v_is_new_user THEN 'Registration approved and workspace provisioned. An activation code will be sent so the applicant can set their own password.'
      ELSE 'Registration approved and workspace provisioned.'
    END
  );
END;
$$;


REVOKE ALL ON FUNCTION private.provision_signup_request(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.provision_signup_request(uuid, uuid, text, boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
