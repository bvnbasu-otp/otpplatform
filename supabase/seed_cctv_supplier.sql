DO $$
DECLARE
  v_supplier_id uuid := '0d500000-0000-4000-8000-000000000099';
  v_auth_id     uuid := '11111111-0000-4000-8000-000000000099';
  v_profile_id  uuid := '22222222-0000-4000-8000-000000000099';
  v_email       text := 'supplier@cctv-pro.test';
  v_rfq_id      uuid := '99139580-7c67-4c58-b679-d69203f6a59b';
BEGIN
  -- 1. Create/Update Supplier
  INSERT INTO suppliers (
    id, business_name, source, status, verification_status,
    categories, capabilities, rating_avg, city, pincode, contact_email, contact_phone, is_demo
  ) VALUES (
    v_supplier_id, 'Bharat Smart CCTV & Security Solutions', 'DIRECT', 'ACTIVE', 'PLATFORM_VERIFIED',
    ARRAY['CCTV', 'Security', 'Surveillance', 'Camera', 'Installation', 'Smart Security'],
    '{"brands":["Hikvision","CP Plus","Dahua"],"cameras":["HD-IP","PTZ","Night Vision"],"maxWarrantyYears":3}'::jsonb,
    4.9, 'Bhavani', '638301', v_email, '+919888877771', true
  )
  ON CONFLICT (id) DO UPDATE
  SET business_name = EXCLUDED.business_name, categories = EXCLUDED.categories, capabilities = EXCLUDED.capabilities;

  -- 2. Create Auth User
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new,
    email_change_token_current, phone_change_token, reauthentication_token, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_auth_id, 'authenticated', 'authenticated', v_email,
    crypt('password', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', '', '', '', ''
  )
  ON CONFLICT (id) DO UPDATE
  SET encrypted_password = crypt('password', gen_salt('bf'));

  -- 3. Create Identity
  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
  ) VALUES (
    v_auth_id::text, v_auth_id,
    jsonb_build_object('sub', v_auth_id::text, 'email', v_email),
    'email', now(), now(), now(), gen_random_uuid()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- 4. Create Profile
  INSERT INTO profiles (id, auth_user_id, email, full_name, is_platform_admin, is_demo)
  VALUES (v_profile_id, v_auth_id, v_email, 'Bharat CCTV Lead Specialist', false, true)
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  -- 5. Link Supplier User
  INSERT INTO supplier_users (supplier_id, profile_id, role)
  VALUES (v_supplier_id, v_profile_id, 'OWNER')
  ON CONFLICT (supplier_id, profile_id) DO NOTHING;

  -- 6. Assign Profile Role
  INSERT INTO profile_roles (profile_id, role_code, is_demo)
  VALUES (v_profile_id, 'SUPPLIER_FOUNDER', true)
  ON CONFLICT (profile_id, role_code) DO NOTHING;

  -- 7. Invite to the active CCTV RFQ
  IF v_rfq_id IS NOT NULL THEN
    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
    ) VALUES (
      v_rfq_id, v_supplier_id, 'Supplier G', 'INVITED', 98.0, ARRAY['local_bhavani_cctv_specialist']
    )
    ON CONFLICT (rfq_id, supplier_id) DO NOTHING;
  END IF;
END;
$$;
