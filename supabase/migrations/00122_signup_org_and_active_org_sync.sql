-- Migration 00122: Sync Buyer Signup Organisation & Active Organisation Context
--
-- 1. Updates submit_signup_request:
--    - When buyer_type is INDIVIDUAL and business_name is empty, null, or 'Self', defaults to 'Self'.
--    - When buyer_type is INDIVIDUAL, defaults role_code to 'PROPERTY_OWNER'.
-- 2. Updates admin_review_signup_request:
--    - When buyer_type is INDIVIDUAL and business_name is empty, null, or 'Self', provisions organisation name as 'Self'.
--    - Defaults role_code to 'PROPERTY_OWNER' for INDIVIDUAL buyers.
--    - Sets profiles.active_organization_id = v_org_id upon approval so the buyer immediately lands in their active org context.
-- 3. Backfills existing profiles:
--    - Sets active_organization_id for any buyer profile where it is currently NULL.

-- ---------------------------------------------------------------------------
-- 1. Update submit_signup_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_signup_request(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Role resolution
  SELECT ur.code INTO v_role
  FROM user_roles ur
  WHERE ur.code = NULLIF(btrim(COALESCE(p_request->>'role_code', '')), '')
    AND ur.side = v_side
    AND ur.is_active;

  -- Default INDIVIDUAL buyer role to PROPERTY_OWNER if not specified
  IF v_side = 'BUYER' AND v_buyer_type = 'INDIVIDUAL' AND v_role IS NULL THEN
    v_role := 'PROPERTY_OWNER';
  END IF;

  -- Resolve business / organisation name
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
    RETURN jsonb_build_object(
      'reference', 'REG-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'status', v_existing.status,
      'already_submitted', true
    );
  END IF;

  INSERT INTO signup_requests (
    side, business_name, contact_first_name, contact_last_name, designation,
    email, phone, verification_channel, buyer_type, referral_code,
    category_codes, tax_registration_id, coverage_city, coverage_pincode, role_code
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
    v_role
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

  RETURN jsonb_build_object('reference', v_ref, 'status', 'PENDING',
                            'already_submitted', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Update admin_review_signup_request
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
  v_role_code text;
BEGIN
  -- Verify admin privileges
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  v_admin_id := private.get_profile_id();

  SELECT * INTO v_req
  FROM public.signup_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signup request % not found', p_request_id;
  END IF;

  v_ref := 'REG-' || upper(substr(replace(v_req.id::text, '-', ''), 1, 8));

  -- Handle rejection
  IF upper(p_action) = 'REJECT' THEN
    UPDATE public.signup_requests
    SET status = 'REJECTED',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, 'Application rejected by platform administrator')
    WHERE id = p_request_id;

    INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
    VALUES ('signup.rejected', 'signup_request', p_request_id::text, v_admin_id,
            jsonb_build_object('reference', v_ref, 'email', v_req.email, 'notes', p_notes));

    RETURN jsonb_build_object(
      'ok', true,
      'status', 'REJECTED',
      'reference', v_ref,
      'message', 'Registration request rejected successfully'
    );
  END IF;

  -- Verify it can be approved
  IF v_req.status = 'ONBOARDED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'status', 'ONBOARDED',
      'reference', v_ref,
      'already_onboarded', true,
      'message', 'This registration has already been onboarded'
    );
  END IF;

  -- 1. Provision / link auth user
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_req.email);

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, phone_change, phone_change_token,
      reauthentication_token, is_super_admin, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      lower(v_req.email),
      extensions.crypt(p_initial_password, extensions.gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      false,
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_req.contact_first_name || ' ' || v_req.contact_last_name),
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
    -- Resolve organisation name
    v_org_name := v_req.business_name;
    IF v_req.buyer_type = 'INDIVIDUAL' AND (v_org_name IS NULL OR btrim(v_org_name) = '' OR lower(btrim(v_org_name)) = 'self') THEN
      v_org_name := 'Self';
    END IF;

    -- Create / link organization
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

    -- Update active organization context on profile
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

  -- 5. Create System Notification
  PERFORM public.create_system_notification(
    p_profile_id := v_profile_id,
    p_title := '🎉 Registration Approved & Account Activated',
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

GRANT EXECUTE ON FUNCTION public.admin_review_signup_request(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill active_organization_id for existing buyer profiles
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET active_organization_id = om.organization_id
FROM (
  SELECT DISTINCT ON (profile_id) profile_id, organization_id
  FROM public.organization_members
  ORDER BY profile_id, joined_at ASC
) om
WHERE p.id = om.profile_id
  AND p.active_organization_id IS NULL;
