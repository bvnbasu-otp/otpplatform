-- Migration 00166: Instant Buyer Auto-Approval and 1 Free RFQ Starter Credit
-- 1. Adds free_rfq_credits and rfq_credits_used columns to public.organizations.
-- 2. Updates submit_signup_request RPC to auto-approve buyer registrations instantly:
--    - Automatically provisions auth.users and public.profiles.
--    - Automatically provisions public.organizations with Active 30-day starter plan and 1 Free RFQ Credit.
--    - Links organization_members and profile_roles with appropriate buyer roles (e.g. PROPERTY_OWNER / FACILITY_MANAGER).
--    - Dispatches instant onboarding state with zero wait time.
-- 3. Updates get_organization_subscription RPC to return free_rfq_credits and rfq_credits_used.
-- 4. Updates publish_requirement RPC to record credit utilization when an RFQ is published.

BEGIN;

-- 1. Schema Enhancements on public.organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS free_rfq_credits integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS rfq_credits_used integer DEFAULT 0;

-- Backfill existing organizations with at least 1 free RFQ credit if NULL
UPDATE public.organizations
SET free_rfq_credits = 1
WHERE free_rfq_credits IS NULL;

UPDATE public.organizations
SET rfq_credits_used = 0
WHERE rfq_credits_used IS NULL;

-- 2. Updated submit_signup_request with Instant Buyer Auto-Approval
CREATE OR REPLACE FUNCTION public.submit_signup_request(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_side             signup_side;
  v_buyer_type       org_type;
  v_channel          verification_channel;
  v_codes            text[];
  v_role             text;
  v_id               uuid;
  v_ref              text;
  v_business         text;
  v_email            text;
  v_phone            text;
  v_first_name       text;
  v_last_name        text;
  v_full_name        text;
  v_designation      text;
  v_tax_id           text;
  v_has_gst          boolean;
  v_sub_tier         text;
  v_user_id          uuid;
  v_profile_id       uuid;
  v_org_id           uuid;
  v_initial_password text := 'Welcome@OTP2026!';
  v_existing         signup_requests%ROWTYPE;
BEGIN
  v_side := upper(COALESCE(p_request->>'side', ''))::signup_side;
  v_channel := upper(COALESCE(NULLIF(p_request->>'verification_channel', ''), 'EMAIL'))::verification_channel;
  v_email := lower(btrim(COALESCE(p_request->>'email', '')));
  v_phone := btrim(COALESCE(p_request->>'phone', ''));
  v_first_name := btrim(COALESCE(p_request->>'contact_first_name', ''));
  v_last_name := btrim(COALESCE(p_request->>'contact_last_name', ''));
  v_full_name := COALESCE(NULLIF(btrim(v_first_name || ' ' || v_last_name), ''), 'User');
  v_designation := NULLIF(btrim(COALESCE(p_request->>'designation', '')), '');
  v_tax_id := NULLIF(btrim(COALESCE(p_request->>'tax_registration_id', '')), '');
  v_has_gst := (v_tax_id IS NOT NULL AND length(v_tax_id) >= 15);

  IF v_side = 'BUYER' THEN
    v_buyer_type := NULLIF(p_request->>'buyer_type', '')::org_type;
    IF v_buyer_type IS NULL THEN
      v_buyer_type := 'INDIVIDUAL'::org_type;
    END IF;
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

  -- Default buyer roles
  IF v_side = 'BUYER' AND v_role IS NULL THEN
    IF v_buyer_type = 'INDIVIDUAL' THEN
      v_role := 'PROPERTY_OWNER';
    ELSE
      v_role := 'FACILITY_MANAGER';
    END IF;
  END IF;

  -- Resolve business / organisation name
  v_business := btrim(COALESCE(p_request->>'business_name', ''));
  IF v_side = 'BUYER' THEN
    IF v_buyer_type = 'INDIVIDUAL' AND (v_business = '' OR lower(v_business) = 'self') THEN
      v_business := 'Self';
    ELSIF v_business = '' THEN
      v_business := v_full_name || ' Procurement';
    END IF;
  END IF;

  -- Check existing signup request
  SELECT * INTO v_existing
  FROM signup_requests
  WHERE lower(email) = v_email
    AND side = v_side
    AND status <> 'REJECTED';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'reference', 'REG-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'status', v_existing.status,
      'already_submitted', true,
      'auto_approved', (v_existing.status = 'ONBOARDED'),
      'email', v_existing.email
    );
  END IF;

  v_id := gen_random_uuid();
  v_ref := 'REG-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

  -- -------------------------------------------------------------------------
  -- BUYER FLOW: AUTOMATIC ONBOARDING & 1 FREE RFQ CREDIT
  -- -------------------------------------------------------------------------
  IF v_side = 'BUYER' THEN
    v_sub_tier := CASE 
      WHEN v_buyer_type IN ('COMMUNITY', 'ENTERPRISE', 'INSTITUTION') THEN 'TIER_2_ENTERPRISE'
      ELSE 'TIER_1_MSME'
    END;

    -- 1. Provision / Link auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = v_email;

    IF v_user_id IS NULL THEN
      v_user_id := gen_random_uuid();
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
        v_email,
        extensions.crypt(v_initial_password, extensions.gen_salt('bf')),
        now(),
        '', '', '', '', '', '', '', '',
        false, false, false,
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_full_name, 'phone', v_phone),
        now(),
        now()
      );

      BEGIN
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
          v_user_id,
          v_user_id,
          jsonb_build_object('sub', v_user_id::text, 'email', v_email),
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
      SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_user_id;
    END IF;

    -- 2. Provision / Link public.profiles
    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE auth_user_id = v_user_id OR lower(email) = v_email
    LIMIT 1;

    IF v_profile_id IS NULL THEN
      v_profile_id := v_user_id;
      INSERT INTO public.profiles (
        id, auth_user_id, email, full_name, is_platform_admin, phone, is_demo, created_at, updated_at
      ) VALUES (
        v_profile_id,
        v_user_id,
        v_email,
        v_full_name,
        false,
        v_phone,
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
          phone = COALESCE(phone, v_phone),
          email = v_email,
          full_name = COALESCE(full_name, v_full_name),
          is_demo = false,
          updated_at = now()
      WHERE id = v_profile_id;
    END IF;

    -- 3. Provision public.organizations with 1 Free RFQ Credit & 30-day Starter validity
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
      free_rfq_credits,
      rfq_credits_used,
      subscription_started_at,
      subscription_expires_at,
      payment_reference,
      created_at,
      updated_at
    ) VALUES (
      v_org_id,
      v_business,
      v_buyer_type,
      v_full_name,
      v_email,
      v_phone,
      v_tax_id,
      v_has_gst,
      v_sub_tier,
      'ACTIVE',
      'MONTHLY',
      1,
      0,
      now(),
      now() + interval '30 days',
      'FREE-STARTER-1RFQ',
      now(),
      now()
    );

    -- 4. Link Organization Membership & Role
    INSERT INTO public.organization_members (organization_id, profile_id, role, joined_at)
    VALUES (v_org_id, v_profile_id, 'OWNER', now())
    ON CONFLICT (organization_id, profile_id) DO UPDATE
    SET role = 'OWNER';

    INSERT INTO public.profile_roles (profile_id, role_code, assigned_by)
    VALUES (v_profile_id, v_role, v_profile_id)
    ON CONFLICT (profile_id, role_code) DO NOTHING;

    UPDATE public.profiles
    SET active_organization_id = v_org_id,
        active_role_code = v_role
    WHERE id = v_profile_id;

    -- 5. Record Registration Request as ONBOARDED
    INSERT INTO signup_requests (
      id, side, business_name, contact_first_name, contact_last_name, designation,
      email, phone, verification_channel, buyer_type, referral_code,
      category_codes, tax_registration_id, coverage_city, coverage_pincode, role_code,
      status, organization_id, reviewed_at, review_notes
    ) VALUES (
      v_id,
      v_side,
      v_business,
      v_first_name,
      v_last_name,
      v_designation,
      v_email,
      v_phone,
      v_channel,
      v_buyer_type,
      NULLIF(btrim(COALESCE(p_request->>'referral_code', '')), ''),
      v_codes,
      v_tax_id,
      NULLIF(btrim(COALESCE(p_request->>'coverage_city', '')), ''),
      NULLIF(btrim(COALESCE(p_request->>'coverage_pincode', '')), ''),
      v_role,
      'ONBOARDED',
      v_org_id,
      now(),
      'Auto-approved on registration with 1 Free RFQ Credit & 30-day Starter Plan'
    );

    -- 6. Audit Logging
    INSERT INTO audit_events (event_type, entity_type, entity_id, actor_id, payload)
    VALUES (
      'signup.auto_approved',
      'signup_request',
      v_id::text,
      v_profile_id,
      jsonb_build_object(
        'side', v_side,
        'reference', v_ref,
        'organization_id', v_org_id,
        'role', v_role,
        'business_name', v_business,
        'free_rfq_credits', 1,
        'tier', v_sub_tier
      )
    );

    RETURN jsonb_build_object(
      'reference', v_ref,
      'status', 'ONBOARDED',
      'already_submitted', false,
      'auto_approved', true,
      'side', 'BUYER',
      'email', v_email,
      'temporary_password', v_initial_password,
      'organization_id', v_org_id,
      'free_rfq_credits', 1,
      'message', 'Buyer account auto-approved and activated with 1 Free RFQ Credit.'
    );

  -- -------------------------------------------------------------------------
  -- SUPPLIER FLOW: STANDARD APPLICATION QUEUE
  -- -------------------------------------------------------------------------
  ELSE
    INSERT INTO signup_requests (
      id, side, business_name, contact_first_name, contact_last_name, designation,
      email, phone, verification_channel, buyer_type, referral_code,
      category_codes, tax_registration_id, coverage_city, coverage_pincode, role_code,
      status
    ) VALUES (
      v_id,
      v_side,
      v_business,
      v_first_name,
      v_last_name,
      v_designation,
      v_email,
      v_phone,
      v_channel,
      v_buyer_type,
      NULLIF(btrim(COALESCE(p_request->>'referral_code', '')), ''),
      v_codes,
      v_tax_id,
      NULLIF(btrim(COALESCE(p_request->>'coverage_city', '')), ''),
      NULLIF(btrim(COALESCE(p_request->>'coverage_pincode', '')), ''),
      v_role,
      'PENDING'
    );

    INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'signup.requested',
      'signup_request',
      v_id::text,
      jsonb_build_object(
        'side', v_side,
        'reference', v_ref,
        'verification_channel', v_channel,
        'role', v_role,
        'business_name', v_business
      )
    );

    RETURN jsonb_build_object(
      'reference', v_ref,
      'status', 'PENDING',
      'already_submitted', false,
      'auto_approved', false
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated, service_role;

-- 3. Update get_organization_subscription RPC to return free_rfq_credits and rfq_credits_used
CREATE OR REPLACE FUNCTION public.get_organization_subscription(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_now timestamptz := now();
  v_is_expired boolean;
  v_days_left integer;
  v_tier text;
BEGIN
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_organization_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization not found');
  END IF;

  v_tier := COALESCE(v_org.subscription_tier, 
    CASE WHEN v_org.org_type::text IN ('COMMUNITY', 'ENTERPRISE', 'INSTITUTION') 
      THEN 'TIER_2_ENTERPRISE' 
      ELSE 'TIER_1_MSME' 
    END
  );

  v_is_expired := (v_org.subscription_expires_at IS NOT NULL AND v_org.subscription_expires_at < v_now);
  
  IF v_org.subscription_expires_at IS NOT NULL THEN
    v_days_left := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_org.subscription_expires_at - v_now)) / 86400)::integer);
  ELSE
    v_days_left := 0;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', v_org.id,
    'organization_name', v_org.name,
    'org_type', v_org.org_type,
    'tier', v_tier,
    'status', CASE WHEN v_is_expired THEN 'EXPIRED' ELSE COALESCE(v_org.subscription_status, 'ACTIVE') END,
    'plan', COALESCE(v_org.subscription_plan, 'MONTHLY'),
    'started_at', v_org.subscription_started_at,
    'expires_at', v_org.subscription_expires_at,
    'days_remaining', v_days_left,
    'is_expired', v_is_expired,
    'free_rfq_credits', COALESCE(v_org.free_rfq_credits, 1),
    'rfq_credits_used', COALESCE(v_org.rfq_credits_used, 0),
    'payment_reference', v_org.payment_reference
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_subscription(uuid) TO authenticated, anon, service_role;

-- 4. Update publish_requirement to record credit deduction
CREATE OR REPLACE FUNCTION public.publish_requirement(
  p_requirement_id      uuid,
  p_sourcing_mode       sourcing_mode DEFAULT 'IDENTITY_PROTECTED',
  p_min_quotes_required integer DEFAULT 3,
  p_quote_deadline_days integer DEFAULT 7,
  p_weights             jsonb DEFAULT '{}'::jsonb,
  p_weights_source      text DEFAULT 'SUGGESTED'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req              requirements%ROWTYPE;
  v_rfq_id           uuid;
  v_public_ref       text;
  v_quote_deadline   timestamptz;
  v_subcategory_code text;
  v_category_code    text;
  v_snapshot         jsonb;
BEGIN
  SELECT * INTO v_req FROM requirements WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requirement not found';
  END IF;

  IF NOT private.is_org_member(v_req.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF private.get_org_role(v_req.organization_id) NOT IN ('OWNER', 'MANAGER', 'BUYER')
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Insufficient role to publish a requirement';
  END IF;

  IF v_req.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a DRAFT requirement can be published; this one is %',
      v_req.status;
  END IF;

  IF v_req.subcategory_id IS NULL THEN
    RAISE EXCEPTION 'A requirement needs a subcategory before it can be published, or discovery has nothing to match on';
  END IF;

  IF EXISTS (SELECT 1 FROM rfqs WHERE requirement_id = p_requirement_id) THEN
    RAISE EXCEPTION 'This requirement already has an RFQ';
  END IF;

  IF p_min_quotes_required < 1 THEN
    RAISE EXCEPTION 'At least one quote must be required';
  END IF;

  IF p_quote_deadline_days < 1 THEN
    RAISE EXCEPTION 'The quote deadline must be at least a day away';
  END IF;

  v_quote_deadline := now() + make_interval(days => p_quote_deadline_days);

  SELECT s.code, c.code
    INTO v_subcategory_code, v_category_code
  FROM requirement_subcategories s
  JOIN requirement_categories c ON c.id = s.category_id
  WHERE s.id = v_req.subcategory_id;

  v_snapshot := public.lookup_market_intelligence(
    v_subcategory_code, v_category_code, v_req.delivery_city
  );

  -- Track credit usage on organization
  UPDATE public.organizations
  SET free_rfq_credits = GREATEST(0, COALESCE(free_rfq_credits, 1) - 1),
      rfq_credits_used = COALESCE(rfq_credits_used, 0) + 1,
      updated_at = now()
  WHERE id = v_req.organization_id;

  -- Transition requirement
  UPDATE requirements
  SET status = 'SUBMITTED',
      published_at = COALESCE(published_at, now()),
      market_intel_snapshot = COALESCE(market_intel_snapshot, v_snapshot),
      updated_at = now()
  WHERE id = p_requirement_id;

  INSERT INTO rfqs (
    requirement_id, organization_id, status, reveal_status, title,
    quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers,
    sourcing_mode, min_quotes_required, created_by
  ) VALUES (
    p_requirement_id,
    v_req.organization_id,
    'DRAFT',
    'BLIND',
    'RFQ: ' || v_req.title,
    v_quote_deadline,
    v_quote_deadline + interval '7 days',
    p_sourcing_mode <> 'OPEN_RFQ',
    p_sourcing_mode,
    p_min_quotes_required,
    private.get_profile_id()
  )
  RETURNING id, public_ref INTO v_rfq_id, v_public_ref;

  UPDATE requirements
  SET status = 'RFQ_CREATED', updated_at = now()
  WHERE id = p_requirement_id;

  IF p_weights IS NOT NULL AND p_weights <> '{}'::jsonb THEN
    PERFORM public.set_rfq_evaluation_weights(v_rfq_id, p_weights, p_weights_source);
  END IF;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'requirement.published',
    private.get_profile_id(),
    v_req.organization_id,
    'requirement',
    p_requirement_id::text,
    jsonb_build_object(
      'rfqId', v_rfq_id,
      'publicRef', v_public_ref,
      'sourcingMode', p_sourcing_mode,
      'minQuotesRequired', p_min_quotes_required,
      'quoteDeadline', v_quote_deadline
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'requirementId', p_requirement_id,
    'rfqId', v_rfq_id,
    'publicRef', v_public_ref
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_requirement(uuid, sourcing_mode, integer, integer, jsonb, text) TO authenticated;

COMMIT;
