-- Migration 00142: Sync GST Verification Badge on Registration Approval
-- Automatically sets organizations.gst_verified = true (Buyer) and
-- suppliers.gst_verified = true (Supplier) when a valid 15-digit GSTIN is provided on signup.

BEGIN;

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
  v_has_gst boolean;
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
  v_has_gst := (v_req.tax_registration_id IS NOT NULL AND length(btrim(v_req.tax_registration_id)) >= 15);

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
      id, auth_user_id, email, full_name, is_platform_admin, phone
    ) VALUES (
      v_profile_id,
      v_user_id,
      lower(v_req.email),
      v_req.contact_first_name || ' ' || v_req.contact_last_name,
      false,
      v_req.phone
    );
  ELSE
    UPDATE public.profiles
    SET phone = COALESCE(phone, v_req.phone)
    WHERE id = v_profile_id;
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
        id, name, org_type, tax_registration, gst_verified
      ) VALUES (
        v_org_id,
        v_org_name,
        COALESCE(v_req.buyer_type, 'INDIVIDUAL'::org_type),
        v_req.tax_registration_id,
        v_has_gst
      );
    ELSE
      UPDATE public.organizations
      SET tax_registration = COALESCE(tax_registration, v_req.tax_registration_id),
          gst_verified = CASE WHEN v_has_gst THEN true ELSE gst_verified END
      WHERE id = v_org_id;
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
        status,
        gst_verified,
        gst_status,
        gst_verified_at
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
        'ACTIVE',
        v_has_gst,
        CASE WHEN v_has_gst THEN 'Active' ELSE 'UNVERIFIED' END,
        CASE WHEN v_has_gst THEN now() ELSE NULL END
      );
    ELSE
      UPDATE public.suppliers
      SET gstin = COALESCE(gstin, v_req.tax_registration_id),
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

  -- 5. Create System Notification
  PERFORM public.create_system_notification(
    p_profile_id := v_profile_id,
    p_title := '🎉 Registration Approved & Account Activated',
    p_body := 'Welcome to OTP Platform! Your registration under reference ' || v_ref || ' for "' || COALESCE(v_org_name, v_req.business_name) || '" has been approved. You may now access your portal workspace.',
    p_link := CASE WHEN v_req.side = 'BUYER' THEN '/dashboard' ELSE '/supplier/capabilities' END,
    p_type := 'ONBOARDING'
  );

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES ('signup.approved', 'signup_request', p_request_id::text, v_admin_id,
          jsonb_build_object('reference', v_ref, 'user_id', v_user_id,
                             'side', v_req.side, 'email', v_req.email,
                             'org_id', v_org_id, 'supplier_id', v_supplier_id,
                             'gst_verified', v_has_gst));

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'ONBOARDED',
    'reference', v_ref,
    'side', v_req.side,
    'user_id', v_user_id,
    'temporary_password', p_initial_password,
    'gst_verified', v_has_gst,
    'message', 'Registration approved, workspace provisioned and temporary password issued'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_signup_request(uuid, text, text, text) TO authenticated;

COMMIT;
