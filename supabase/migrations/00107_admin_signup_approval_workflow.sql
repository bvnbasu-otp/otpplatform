-- Migration 00107: Admin Signup Request Review and Onboarding Workflow
-- Enables platform administrators to view, approve, and onboard self-serve registration requests.

CREATE OR REPLACE FUNCTION public.admin_get_signup_requests(
  p_status text DEFAULT 'ALL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_results jsonb;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      sr.id,
      'REG-' || upper(substr(replace(sr.id::text, '-', ''), 1, 8)) AS reference,
      sr.side,
      sr.status,
      sr.business_name,
      sr.contact_first_name,
      sr.contact_last_name,
      sr.contact_first_name || ' ' || sr.contact_last_name AS contact_full_name,
      sr.designation,
      sr.email,
      sr.phone,
      sr.verification_channel,
      sr.verified_at,
      sr.buyer_type,
      sr.role_code,
      ur.label AS role_label,
      sr.category_codes,
      sr.tax_registration_id,
      sr.coverage_city,
      sr.coverage_pincode,
      sr.organization_id,
      sr.supplier_id,
      sr.reviewed_by,
      rp.full_name AS reviewed_by_name,
      sr.reviewed_at,
      sr.review_notes,
      sr.created_at,
      sr.updated_at
    FROM public.signup_requests sr
    LEFT JOIN public.user_roles ur ON sr.role_code = ur.code
    LEFT JOIN public.profiles rp ON sr.reviewed_by = rp.id
    WHERE
      CASE
        WHEN p_status = 'PENDING' THEN sr.status = 'PENDING'
        WHEN p_status = 'ONBOARDED' THEN sr.status = 'ONBOARDED'
        WHEN p_status = 'REJECTED' THEN sr.status = 'REJECTED'
        ELSE true
      END
    ORDER BY
      CASE WHEN sr.status = 'PENDING' THEN 0 ELSE 1 END,
      sr.created_at DESC
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'count', jsonb_array_length(v_results),
    'requests', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_signup_requests(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Function: admin_review_signup_request
-- Approves or rejects a registration request. If approved, provisions auth user,
-- profile, roles, and buyer organization / supplier entity.
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
    CASE WHEN v_req.side = 'BUYER' THEN 'FACILITY_MANAGER' ELSE 'SUPPLIER_FOUNDER' END
  );

  INSERT INTO public.profile_roles (profile_id, role_code, assigned_by)
  VALUES (v_profile_id, v_role_code, v_admin_id)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  UPDATE public.profiles
  SET active_role_code = v_role_code
  WHERE id = v_profile_id;

  -- 4. Entity Provisioning
  IF v_req.side = 'BUYER' THEN
    -- Create / link organization
    v_org_id := v_req.organization_id;
    IF v_org_id IS NULL THEN
      v_org_id := gen_random_uuid();
      INSERT INTO public.organizations (
        id, name, org_type, tax_registration
      ) VALUES (
        v_org_id,
        v_req.business_name,
        COALESCE(v_req.buyer_type, 'INDIVIDUAL'::org_type),
        v_req.tax_registration_id
      );
    END IF;

    INSERT INTO public.organization_members (organization_id, profile_id, role)
    VALUES (v_org_id, v_profile_id, 'OWNER')
    ON CONFLICT (organization_id, profile_id) DO NOTHING;

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
    p_body := 'Welcome to OTP Platform! Your registration under reference ' || v_ref || ' for "' || v_req.business_name || '" has been approved. You may now access your portal workspace.',
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
