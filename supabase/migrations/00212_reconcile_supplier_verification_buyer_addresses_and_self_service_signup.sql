-- =============================================================================
-- Migration 00212: Reconcile supplier verification, buyer address book and
-- self-service signup
--
-- Production symptoms this closes:
--   (a) invalid input value for enum supplier_verification_status: "VERIFIED"
--   (b) Could not find the function public.upsert_buyer_address_atomic(...)
--
-- Root cause (both): 00196 could not be applied to any database built from
-- 00001..00195 — it ADDed suppliers.verification_status / pan / trade_name and
-- organization_invitations.role, which already existed, so the whole
-- transaction rolled back and the sequential runner stopped there. 00196 has
-- been corrected to add only missing columns; this migration performs the
-- reconciliation 00196 assumed had happened, and is written so it is correct
-- whether or not every 00196 object is present.
--
-- 1. Re-asserts every 00196 schema object (IF NOT EXISTS).
-- 2. Converts suppliers.verification_status from the legacy
--    supplier_verification_status enum (00015) to the lifecycle vocabulary.
--    Deterministic mapping; the original value is kept in
--    suppliers.legacy_verification_status:
--        PLATFORM_VERIFIED -> VERIFIED
--        DOCUMENT_VERIFIED -> VERIFIED
--        SELF_DECLARED     -> PENDING
--        UNVERIFIED        -> NOT_PROVIDED
--    lifecycle_state (whose 00196 default stamped every existing row VERIFIED)
--    is aligned for rows that are not verified: PENDING -> VERIFICATION_PENDING,
--    otherwise QUOTE_PARTICIPANT. New suppliers default to QUOTE_PARTICIPANT /
--    NOT_PROVIDED. The legacy enum type is left in place, unused.
-- 3. Supplier trust fields (verification, lifecycle, account status, block
--    state) can no longer be written directly by the supplier's own session;
--    only platform admins, service_role and SECURITY DEFINER RPCs can.
-- 4. verify_supplier_gstin records submitted GST details as PENDING review
--    instead of self-certifying PLATFORM_VERIFIED, and now requires the caller
--    to belong to that supplier.
-- 5. Signup: account approval, supplier verification and entitlement are kept
--    apart.
--      * private.provision_signup_request holds the provisioning previously
--        inlined in admin_review_signup_request (00210). Suppliers are
--        provisioned with an ACTIVE account but NOT verified.
--      * admin_review_signup_request keeps the 00210 admin gate and delegates.
--      * submit_signup_request provisions every buyer type and every supplier
--        immediately (status ONBOARDED). The login credential is still only
--        set by redeeming the single-use activation code sent to the
--        registered phone (onboarding-notify, kind APPROVED). Emails that
--        already have an account or profile, reserved admin emails, or any
--        provisioning failure stay PENDING for admin review.
-- 6. buyer_addresses RLS and RPCs resolve the owner through
--    private.get_profile_id() (profiles.id is not always auth.uid()), keep
--    organisation rows organisation-scoped, and are not executable by anon.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 00196 schema objects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buyer_addresses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id   uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  label             text NOT NULL DEFAULT 'Primary Site',
  address_line1     text NOT NULL,
  address_line2     text,
  landmark          text,
  city              text NOT NULL,
  state             text NOT NULL,
  state_code        text,
  pincode           text NOT NULL,
  country           text NOT NULL DEFAULT 'India',
  contact_person    text,
  contact_phone     text,
  is_primary        boolean NOT NULL DEFAULT false,
  address_type      text NOT NULL DEFAULT 'DELIVERY' CHECK (address_type IN ('DELIVERY', 'BILLING', 'BOTH', 'REGISTERED', 'SITE')),
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_buyer_address_owner CHECK (profile_id IS NOT NULL OR organization_id IS NOT NULL),
  CONSTRAINT chk_buyer_pincode_format CHECK (pincode ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_buyer_addresses_org ON public.buyer_addresses(organization_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_buyer_addresses_prof ON public.buyer_addresses(profile_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_buyer_addresses_primary ON public.buyer_addresses(organization_id, profile_id, is_primary) WHERE is_active = true;

ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS delivery_address_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS billing_address_snapshot jsonb;

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS delivery_address_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS billing_address_snapshot jsonb;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS persona text DEFAULT 'INDIVIDUAL' CHECK (persona IN ('INDIVIDUAL', 'RWA', 'MSME')),
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS pan text,
  ADD COLUMN IF NOT EXISTS state_code text;

ALTER TABLE public.organization_invitations
  ADD COLUMN IF NOT EXISTS claim_status text NOT NULL DEFAULT 'INVITED' CHECK (claim_status IN ('INVITED', 'CLAIMED', 'PROFILE_COMPLETE', 'ACTIVE', 'INACTIVE')),
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS claimed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS voting_weight numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS spend_limit numeric DEFAULT NULL;

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'QUOTE_PARTICIPANT' CHECK (lifecycle_state IN ('QUOTE_PARTICIPANT', 'ONBOARDING_REQUIRED', 'ONBOARDING_IN_PROGRESS', 'VERIFICATION_PENDING', 'VERIFIED', 'VERIFICATION_FAILED', 'REQUIRES_REVERIFICATION', 'SUSPENDED')),
  ADD COLUMN IF NOT EXISTS legal_business_name text,
  ADD COLUMN IF NOT EXISTS onboarding_claim_token_hash text,
  ADD COLUMN IF NOT EXISTS registered_address jsonb,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS legacy_verification_status text;

ALTER TABLE public.suppliers ALTER COLUMN lifecycle_state SET DEFAULT 'QUOTE_PARTICIPANT';

CREATE INDEX IF NOT EXISTS idx_suppliers_lifecycle ON public.suppliers(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_suppliers_pan ON public.suppliers(pan);
CREATE INDEX IF NOT EXISTS idx_suppliers_onboarding_token ON public.suppliers(onboarding_claim_token_hash);

-- ---------------------------------------------------------------------------
-- 2. suppliers.verification_status: legacy enum -> lifecycle vocabulary
-- ---------------------------------------------------------------------------
-- quotes_identity_protected reads the column (and quotes_blind reads that
-- view), so both are captured from the live catalog — definition, options,
-- owner and grants — dropped around the type change and recreated verbatim.
DO $$
DECLARE
  v_type  text;
  v_view  record;
  v_grant record;
BEGIN
  SELECT c.udt_name INTO v_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'suppliers' AND c.column_name = 'verification_status';

  IF v_type IS DISTINCT FROM 'supplier_verification_status' THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE otp212_saved_views ON COMMIT DROP AS
  SELECT
    c.relname::text                                  AS relname,
    rtrim(pg_get_viewdef(c.oid), E'; \n\t')           AS def,
    c.reloptions                                     AS opts,
    c.relacl                                         AS acl,
    c.relowner                                       AS owner_oid,
    CASE c.relname WHEN 'quotes_identity_protected' THEN 1 ELSE 2 END AS ord
  FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'v'
    AND c.relname IN ('quotes_identity_protected', 'quotes_blind');

  DROP VIEW IF EXISTS public.quotes_blind;
  DROP VIEW IF EXISTS public.quotes_identity_protected;

  UPDATE public.suppliers
  SET legacy_verification_status = verification_status::text
  WHERE legacy_verification_status IS NULL;

  ALTER TABLE public.suppliers ALTER COLUMN verification_status DROP DEFAULT;
  ALTER TABLE public.suppliers
    ALTER COLUMN verification_status TYPE text
    USING (
      CASE verification_status::text
        WHEN 'PLATFORM_VERIFIED' THEN 'VERIFIED'
        WHEN 'DOCUMENT_VERIFIED' THEN 'VERIFIED'
        WHEN 'SELF_DECLARED'     THEN 'PENDING'
        WHEN 'UNVERIFIED'        THEN 'NOT_PROVIDED'
        ELSE 'NOT_PROVIDED'
      END
    );

  UPDATE public.suppliers
  SET lifecycle_state = CASE verification_status
                          WHEN 'PENDING' THEN 'VERIFICATION_PENDING'
                          ELSE 'QUOTE_PARTICIPANT'
                        END
  WHERE lifecycle_state = 'VERIFIED'
    AND verification_status <> 'VERIFIED';

  UPDATE public.suppliers
  SET verification_notes = COALESCE(verification_notes,
        'Carried over from legacy verification status ' || legacy_verification_status || ' (00212)')
  WHERE legacy_verification_status IS NOT NULL;

  FOR v_view IN SELECT * FROM otp212_saved_views ORDER BY ord LOOP
    EXECUTE format(
      'CREATE VIEW public.%I %s AS %s',
      v_view.relname,
      CASE WHEN v_view.opts IS NULL THEN '' ELSE 'WITH (' || array_to_string(v_view.opts, ', ') || ')' END,
      v_view.def
    );
    IF v_view.owner_oid <> (SELECT oid FROM pg_roles WHERE rolname = current_user) THEN
      EXECUTE format('ALTER VIEW public.%I OWNER TO %I', v_view.relname, pg_get_userbyid(v_view.owner_oid));
    END IF;
    IF v_view.acl IS NOT NULL THEN
      FOR v_grant IN
        SELECT a.grantee, a.privilege_type
        FROM aclexplode(v_view.acl) a
        WHERE a.grantee <> v_view.owner_oid
      LOOP
        EXECUTE format(
          'GRANT %s ON public.%I TO %s',
          v_grant.privilege_type,
          v_view.relname,
          CASE WHEN v_grant.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(v_grant.grantee)) END
        );
      END LOOP;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.suppliers ALTER COLUMN verification_status SET DEFAULT 'NOT_PROVIDED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.suppliers'::regclass AND conname = 'suppliers_verification_status_check'
  ) THEN
    ALTER TABLE public.suppliers
      ADD CONSTRAINT suppliers_verification_status_check
      CHECK (verification_status IN ('NOT_PROVIDED', 'NOT_APPLICABLE', 'PENDING', 'VERIFIED', 'FAILED', 'REQUIRES_REVERIFICATION'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_verification ON public.suppliers(verification_status);

-- ---------------------------------------------------------------------------
-- 3. Supplier trust fields are not self-service
-- ---------------------------------------------------------------------------
-- suppliers_update lets a supplier's own users update their row, so without
-- this a supplier could PATCH itself to VERIFIED and pass the reveal / PO
-- gates. SECURITY INVOKER on purpose: current_user is only anon/authenticated
-- for a direct client write, and is the function owner inside the SECURITY
-- DEFINER RPCs that legitimately move these fields.
CREATE OR REPLACE FUNCTION private.guard_supplier_trust_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') OR COALESCE(private.is_platform_admin(), false) THEN
    RETURN NEW;
  END IF;

  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     OR NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.gst_verified IS DISTINCT FROM OLD.gst_verified
     OR NEW.gst_verified_at IS DISTINCT FROM OLD.gst_verified_at
     OR NEW.verification_notes IS DISTINCT FROM OLD.verification_notes
     OR NEW.legacy_verification_status IS DISTINCT FROM OLD.legacy_verification_status
     OR NEW.onboarding_claim_token_hash IS DISTINCT FROM OLD.onboarding_claim_token_hash
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.blocked_reason IS DISTINCT FROM OLD.blocked_reason
     OR NEW.blocked_by IS DISTINCT FROM OLD.blocked_by
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Supplier verification and account status can only be changed by the platform (SUPPLIER-TRUST)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_supplier_trust_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_supplier_trust_fields() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_supplier_trust_fields ON public.suppliers;
CREATE TRIGGER trg_aa_guard_supplier_trust_fields
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION private.guard_supplier_trust_fields();

-- ---------------------------------------------------------------------------
-- 4. verify_supplier_gstin: submission for review, not self-certification
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_supplier_gstin(
  p_supplier_id uuid,
  p_gstin text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_gstin text;
  v_pan text;
  v_legal_name text;
  v_trade_name text;
  v_supplier public.suppliers%ROWTYPE;
  v_verification text;
  v_lifecycle text;
BEGIN
  IF NOT COALESCE(private.is_supplier_user_for(p_supplier_id), false) THEN
    RAISE EXCEPTION 'Access denied: you are not a user of this supplier' USING ERRCODE = '42501';
  END IF;

  v_gstin := upper(btrim(p_gstin));
  IF length(v_gstin) <> 15 THEN
    RAISE EXCEPTION 'Invalid GSTIN length. Must be 15 characters.';
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers WHERE id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;

  v_pan := substr(v_gstin, 3, 10);
  v_legal_name := COALESCE(p_details->>'legalName', p_details->>'legal_name', 'M/S ' || v_pan || ' ENTERPRISES');
  v_trade_name := COALESCE(p_details->>'tradeName', p_details->>'trade_name', v_legal_name);

  IF v_supplier.verification_status = 'VERIFIED' AND v_supplier.gstin IS NOT DISTINCT FROM v_gstin THEN
    v_verification := 'VERIFIED';
    v_lifecycle := v_supplier.lifecycle_state;
  ELSIF v_supplier.verification_status = 'VERIFIED' THEN
    v_verification := 'REQUIRES_REVERIFICATION';
    v_lifecycle := 'REQUIRES_REVERIFICATION';
  ELSE
    v_verification := 'PENDING';
    v_lifecycle := CASE WHEN v_supplier.lifecycle_state = 'SUSPENDED' THEN 'SUSPENDED' ELSE 'VERIFICATION_PENDING' END;
  END IF;

  UPDATE public.suppliers
  SET
    gstin = v_gstin,
    pan = v_pan,
    legal_name = v_legal_name,
    trade_name = v_trade_name,
    gst_status = 'ACTIVE',
    gst_verified = (v_verification = 'VERIFIED'),
    gst_verified_at = CASE WHEN v_verification = 'VERIFIED' THEN gst_verified_at ELSE NULL END,
    gst_details = p_details,
    verification_status = v_verification,
    lifecycle_state = v_lifecycle,
    updated_at = now()
  WHERE id = p_supplier_id;

  INSERT INTO public.audit_events (event_type, actor_id, entity_type, entity_id, payload)
  VALUES ('supplier.gst_submitted', private.get_profile_id(), 'supplier', p_supplier_id::text,
          jsonb_build_object('gstin', v_gstin, 'pan', v_pan, 'legal_name', v_legal_name,
                             'verification_status', v_verification));

  RETURN jsonb_build_object(
    'success', true,
    'supplier_id', p_supplier_id,
    'gstin', v_gstin,
    'legal_name', v_legal_name,
    'status', 'ACTIVE',
    'verification_status', v_verification,
    'verified', v_verification = 'VERIFIED'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_supplier_gstin(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_supplier_gstin(uuid, text, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5a. private.provision_signup_request — shared by admin review and
--     self-service signup. Body is 00210's admin_review_signup_request steps
--     5-10; differences are marked.
-- ---------------------------------------------------------------------------
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

  -- 5. Provision / link auth.users (With GoTrue-safe non-null string tokens)
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

-- ---------------------------------------------------------------------------
-- 5b. admin_review_signup_request — 00210 gate, reject and idempotency paths
--     unchanged; approval delegates to private.provision_signup_request.
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
  v_caller_is_admin boolean := false;
BEGIN
  -- 1. Check Platform Admin Privileges (00210: no fallback branch).
  SELECT private.is_platform_admin() INTO v_caller_is_admin;

  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
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

  RETURN private.provision_signup_request(p_request_id, v_admin_id, p_notes, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_review_signup_request(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_signup_request(uuid, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5c. submit_signup_request — 00209 body plus self-service provisioning.
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
  v_status       text := 'PENDING';
  v_defer_reason text;
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

  -- D-26: a repeat submission answers exactly as a first submission for the
  -- same email would have (ONBOARDED once provisioned, PENDING otherwise).
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

  -- Self-service provisioning. Any refusal or failure rolls back to this
  -- point and leaves the request PENDING for admin review; the reason is
  -- recorded server-side only.
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

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Buyer address book: RLS and RPCs
-- ---------------------------------------------------------------------------
-- Personal rows (organization_id IS NULL) belong to the caller's profile;
-- organisation rows belong to the organisation's members, never to whoever
-- created them.
DROP POLICY IF EXISTS "buyer_addresses_select_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_select_policy" ON public.buyer_addresses
  FOR SELECT
  TO authenticated
  USING (
    (organization_id IS NULL AND profile_id = private.get_profile_id())
    OR (organization_id IS NOT NULL AND private.is_org_member(organization_id))
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS "buyer_addresses_insert_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_insert_policy" ON public.buyer_addresses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (profile_id = private.get_profile_id()
      AND (organization_id IS NULL OR private.is_org_member(organization_id)))
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS "buyer_addresses_update_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_update_policy" ON public.buyer_addresses
  FOR UPDATE
  TO authenticated
  USING (
    (organization_id IS NULL AND profile_id = private.get_profile_id())
    OR (organization_id IS NOT NULL AND private.is_org_member(organization_id))
    OR private.is_platform_admin()
  )
  WITH CHECK (
    (organization_id IS NULL AND profile_id = private.get_profile_id())
    OR (organization_id IS NOT NULL AND private.is_org_member(organization_id))
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS "buyer_addresses_delete_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_delete_policy" ON public.buyer_addresses
  FOR DELETE
  TO authenticated
  USING (
    (organization_id IS NULL AND profile_id = private.get_profile_id())
    OR (organization_id IS NOT NULL AND private.is_org_member(organization_id))
    OR private.is_platform_admin()
  );

REVOKE ALL ON public.buyer_addresses FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_addresses TO authenticated, service_role;

-- 00199 body; the owner is the caller's profile (private.get_profile_id()),
-- which is what buyer_addresses.profile_id references.
CREATE OR REPLACE FUNCTION public.upsert_buyer_address_atomic(
  p_label          text,
  p_line1          text,
  p_city           text,
  p_state          text,
  p_pincode        text,
  p_line2          text DEFAULT NULL,
  p_landmark       text DEFAULT NULL,
  p_country        text DEFAULT 'India',
  p_is_primary     boolean DEFAULT false,
  p_address_type   text DEFAULT 'DELIVERY',
  p_org_id         uuid DEFAULT NULL,
  p_address_id     uuid DEFAULT NULL,
  p_contact_person text DEFAULT NULL,
  p_contact_phone  text DEFAULT NULL,
  p_state_code     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller_id    uuid;
  v_res_id       uuid;
  v_now          timestamptz := now();
  v_existing     public.buyer_addresses%ROWTYPE;
  v_can_edit     boolean := false;
BEGIN
  v_caller_id := private.get_profile_id();
  IF auth.uid() IS NULL OR v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required');
  END IF;

  -- Validation
  IF p_line1 IS NULL OR trim(p_line1) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Address line 1 is required');
  END IF;
  IF p_city IS NULL OR trim(p_city) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'City is required');
  END IF;
  IF p_state IS NULL OR trim(p_state) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'State is required');
  END IF;
  IF p_pincode IS NULL OR NOT (p_pincode ~ '^[0-9]{6}$') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Valid 6-digit Indian PIN code is required');
  END IF;

  -- Check Org Access if organization address
  IF p_org_id IS NOT NULL THEN
    IF NOT private.is_org_member(p_org_id) AND NOT private.is_platform_admin() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Access denied to organization');
    END IF;
  END IF;

  -- Ownership of an existing address is checked before any row is touched.
  IF p_address_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM public.buyer_addresses WHERE id = p_address_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Address record not found');
    END IF;

    v_can_edit := COALESCE(
      private.is_platform_admin()
      OR (v_existing.organization_id IS NULL AND v_existing.profile_id = v_caller_id)
      OR (v_existing.organization_id IS NOT NULL AND private.is_org_member(v_existing.organization_id)),
      false
    );
    IF NOT v_can_edit THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Address record not found');
    END IF;

    IF v_existing.organization_id IS DISTINCT FROM p_org_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'An address cannot be moved between a personal profile and an organization');
    END IF;
  END IF;

  -- If setting as primary, unset other primaries for this profile/org
  IF p_is_primary THEN
    IF p_org_id IS NOT NULL THEN
      UPDATE public.buyer_addresses
      SET is_primary = false, updated_at = v_now
      WHERE organization_id = p_org_id AND is_primary = true;
    ELSE
      UPDATE public.buyer_addresses
      SET is_primary = false, updated_at = v_now
      WHERE profile_id = v_caller_id AND organization_id IS NULL AND is_primary = true;
    END IF;
  END IF;

  IF p_address_id IS NOT NULL THEN
    UPDATE public.buyer_addresses
    SET
      label = COALESCE(trim(p_label), label),
      address_line1 = trim(p_line1),
      address_line2 = trim(p_line2),
      landmark = trim(p_landmark),
      city = trim(p_city),
      state = trim(p_state),
      state_code = trim(p_state_code),
      pincode = trim(p_pincode),
      country = COALESCE(trim(p_country), 'India'),
      contact_person = trim(p_contact_person),
      contact_phone = trim(p_contact_phone),
      is_primary = p_is_primary,
      address_type = COALESCE(p_address_type, 'DELIVERY'),
      is_active = true,
      updated_at = v_now
    WHERE id = p_address_id
    RETURNING id INTO v_res_id;
  ELSE
    INSERT INTO public.buyer_addresses (
      profile_id,
      organization_id,
      label,
      address_line1,
      address_line2,
      landmark,
      city,
      state,
      state_code,
      pincode,
      country,
      contact_person,
      contact_phone,
      is_primary,
      address_type,
      is_active,
      created_at,
      updated_at
    ) VALUES (
      v_caller_id,
      p_org_id,
      COALESCE(trim(p_label), 'Primary Site'),
      trim(p_line1),
      trim(p_line2),
      trim(p_landmark),
      trim(p_city),
      trim(p_state),
      trim(p_state_code),
      trim(p_pincode),
      COALESCE(trim(p_country), 'India'),
      trim(p_contact_person),
      trim(p_contact_phone),
      p_is_primary,
      COALESCE(p_address_type, 'DELIVERY'),
      true,
      v_now,
      v_now
    )
    RETURNING id INTO v_res_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'address_id', v_res_id,
    'is_primary', p_is_primary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_buyer_address_atomic(text, text, text, text, text, text, text, text, boolean, text, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_buyer_address_atomic(text, text, text, text, text, text, text, text, boolean, text, uuid, uuid, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_buyer_addresses(
  p_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller_id uuid;
  v_rows      jsonb;
BEGIN
  v_caller_id := private.get_profile_id();
  IF auth.uid() IS NULL OR v_caller_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Authentication required', 'addresses', '[]'::jsonb);
  END IF;

  IF p_org_id IS NOT NULL THEN
    IF NOT private.is_org_member(p_org_id) AND NOT private.is_platform_admin() THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Access denied to organization', 'addresses', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.is_primary DESC, a.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.buyer_addresses a
    WHERE a.organization_id = p_org_id AND a.is_active = true;
  ELSE
    SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.is_primary DESC, a.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.buyer_addresses a
    WHERE a.profile_id = v_caller_id AND a.organization_id IS NULL AND a.is_active = true;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'addresses', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_buyer_addresses(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_buyer_addresses(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
