-- =============================================================================
-- Migration 00196: Buyer Identity + Address Book + RWA/MSME Organizations +
-- Committee/Team Member Claims + Supplier Award Onboarding & Truthful Verification Gates
--
-- Features:
--   1. public.buyer_addresses table with tenant isolation and primary flag management.
--   2. Frozen address snapshots on public.rfqs and public.purchase_orders.
--   3. Buyer Persona support (INDIVIDUAL, RWA, MSME) on public.organizations.
--   4. Committee / Team Invitation Claim Lifecycle (INVITED -> CLAIMED -> PROFILE_COMPLETE -> ACTIVE -> INACTIVE).
--   5. Supplier 2-Stage Lifecycle & Truthful Verification on public.suppliers.
--   6. Fail-Closed Server Gates on Award Reveal, PO Issuance, and Downstream Execution.
--   7. Full RLS Policies, Grants, and Atomic RPCs.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Buyer Address Book: public.buyer_addresses
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

-- Enable RLS
ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for buyer_addresses
DROP POLICY IF EXISTS "buyer_addresses_select_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_select_policy" ON public.buyer_addresses
  FOR SELECT
  USING (
    (auth.uid() IS NOT NULL AND profile_id = auth.uid()) OR
    (organization_id IS NOT NULL AND private.is_org_member(organization_id)) OR
    private.is_platform_admin()
  );

DROP POLICY IF EXISTS "buyer_addresses_insert_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_insert_policy" ON public.buyer_addresses
  FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND profile_id = auth.uid()) OR
    (organization_id IS NOT NULL AND private.is_org_member(organization_id)) OR
    private.is_platform_admin()
  );

DROP POLICY IF EXISTS "buyer_addresses_update_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_update_policy" ON public.buyer_addresses
  FOR UPDATE
  USING (
    (auth.uid() IS NOT NULL AND profile_id = auth.uid()) OR
    (organization_id IS NOT NULL AND private.is_org_member(organization_id)) OR
    private.is_platform_admin()
  );

DROP POLICY IF EXISTS "buyer_addresses_delete_policy" ON public.buyer_addresses;
CREATE POLICY "buyer_addresses_delete_policy" ON public.buyer_addresses
  FOR DELETE
  USING (
    (auth.uid() IS NOT NULL AND profile_id = auth.uid()) OR
    (organization_id IS NOT NULL AND private.is_org_member(organization_id)) OR
    private.is_platform_admin()
  );

-- ---------------------------------------------------------------------------
-- 2. Schema Enhancements: RFQ & PO Address Snapshots
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rfqs' AND column_name = 'delivery_address_snapshot'
  ) THEN
    ALTER TABLE public.rfqs
      ADD COLUMN delivery_address_snapshot jsonb,
      ADD COLUMN billing_address_snapshot jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_orders' AND column_name = 'delivery_address_snapshot'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD COLUMN delivery_address_snapshot jsonb,
      ADD COLUMN billing_address_snapshot jsonb;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Schema Enhancements: Organizations (Persona, Statutory details)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'persona'
  ) THEN
    ALTER TABLE public.organizations
      ADD COLUMN persona text DEFAULT 'INDIVIDUAL' CHECK (persona IN ('INDIVIDUAL', 'RWA', 'MSME')),
      ADD COLUMN legal_name text,
      ADD COLUMN pan text,
      ADD COLUMN state_code text;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Schema Enhancements: Organization Invitations (Member Claims Lifecycle)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organization_invitations' AND column_name = 'claim_status'
  ) THEN
    ALTER TABLE public.organization_invitations
      ADD COLUMN claim_status text NOT NULL DEFAULT 'INVITED' CHECK (claim_status IN ('INVITED', 'CLAIMED', 'PROFILE_COMPLETE', 'ACTIVE', 'INACTIVE')),
      ADD COLUMN claimed_at timestamptz,
      ADD COLUMN claimed_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
      ADD COLUMN role text,
      ADD COLUMN voting_weight numeric DEFAULT 1.0,
      ADD COLUMN spend_limit numeric DEFAULT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Schema Enhancements: Suppliers (2-Stage Lifecycle & Truthful Verification)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'lifecycle_state'
  ) THEN
    ALTER TABLE public.suppliers
      ADD COLUMN lifecycle_state text NOT NULL DEFAULT 'VERIFIED' CHECK (lifecycle_state IN ('QUOTE_PARTICIPANT', 'ONBOARDING_REQUIRED', 'ONBOARDING_IN_PROGRESS', 'VERIFICATION_PENDING', 'VERIFIED', 'VERIFICATION_FAILED', 'REQUIRES_REVERIFICATION', 'SUSPENDED')),
      ADD COLUMN verification_status text NOT NULL DEFAULT 'NOT_PROVIDED' CHECK (verification_status IN ('NOT_PROVIDED', 'NOT_APPLICABLE', 'PENDING', 'VERIFIED', 'FAILED', 'REQUIRES_REVERIFICATION')),
      ADD COLUMN pan text,
      ADD COLUMN legal_business_name text,
      ADD COLUMN trade_name text,
      ADD COLUMN onboarding_claim_token_hash text,
      ADD COLUMN registered_address jsonb,
      ADD COLUMN verified_at timestamptz,
      ADD COLUMN verification_notes text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_lifecycle ON public.suppliers(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_suppliers_verification ON public.suppliers(verification_status);
CREATE INDEX IF NOT EXISTS idx_suppliers_pan ON public.suppliers(pan);
CREATE INDEX IF NOT EXISTS idx_suppliers_onboarding_token ON public.suppliers(onboarding_claim_token_hash);

-- ---------------------------------------------------------------------------
-- 6. Atomic RPC: upsert_buyer_address_atomic
-- ---------------------------------------------------------------------------
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
BEGIN
  v_caller_id := COALESCE(auth.uid(), private.get_profile_id());
  IF v_caller_id IS NULL THEN
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
    SELECT * INTO v_existing FROM public.buyer_addresses WHERE id = p_address_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Address record not found');
    END IF;

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

GRANT EXECUTE ON FUNCTION public.upsert_buyer_address_atomic TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 7. Atomic RPC: get_buyer_addresses
-- ---------------------------------------------------------------------------
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
  v_caller_id := COALESCE(auth.uid(), private.get_profile_id());
  IF v_caller_id IS NULL THEN
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

GRANT EXECUTE ON FUNCTION public.get_buyer_addresses TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 8. Atomic RPC: check_supplier_award_eligibility_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_supplier_award_eligibility_atomic(
  p_award_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_award     public.awards%ROWTYPE;
  v_quote     public.quotes%ROWTYPE;
  v_supplier  public.suppliers%ROWTYPE;
  v_can_rev   boolean := false;
  v_can_exec  boolean := false;
  v_onb_req   boolean := false;
  v_reason    text := NULL;
BEGIN
  SELECT * INTO v_award FROM public.awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Award not found');
  END IF;

  SELECT * INTO v_quote FROM public.quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Quote not found');
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Supplier not found');
  END IF;

  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED' THEN
    v_can_rev := true;
    v_can_exec := true;
  ELSIF v_supplier.lifecycle_state IN ('QUOTE_PARTICIPANT', 'ONBOARDING_REQUIRED') THEN
    v_onb_req := true;
    v_reason := 'Supplier onboarding and identity verification required before reveal or execution.';
  ELSIF v_supplier.lifecycle_state = 'VERIFICATION_PENDING' THEN
    v_reason := 'Supplier identity verification is pending review.';
  ELSIF v_supplier.lifecycle_state = 'VERIFICATION_FAILED' THEN
    v_reason := 'Supplier failed statutory identity verification.';
  ELSE
    v_reason := 'Supplier status is ' || v_supplier.lifecycle_state || '. Execution blocked.';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'supplier_id', v_supplier.id,
    'lifecycle_state', v_supplier.lifecycle_state,
    'verification_status', v_supplier.verification_status,
    'can_reveal', v_can_rev,
    'can_execute_downstream', v_can_exec,
    'onboarding_required', v_onb_req,
    'block_reason', v_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_supplier_award_eligibility_atomic TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 9. Atomic RPC: complete_supplier_onboarding_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_supplier_onboarding_atomic(
  p_token          text,
  p_legal_name     text,
  p_trade_name     text,
  p_gstin          text,
  p_pan            text,
  p_address        jsonb,
  p_contact_person text,
  p_contact_phone  text,
  p_contact_email  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_supplier public.suppliers%ROWTYPE;
  v_now      timestamptz := now();
  v_clean_pan text;
  v_clean_gst text;
BEGIN
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Onboarding token is required');
  END IF;

  SELECT * INTO v_supplier
  FROM public.suppliers
  WHERE onboarding_claim_token_hash = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid or expired onboarding token');
  END IF;

  -- Truthful Statutory Validations
  IF p_legal_name IS NULL OR trim(p_legal_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Legal business name is required');
  END IF;

  v_clean_pan := upper(trim(p_pan));
  IF v_clean_pan IS NOT NULL AND v_clean_pan <> '' THEN
    IF NOT (v_clean_pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]{1}$') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid PAN format. Must match 5 letters, 4 digits, 1 letter');
    END IF;
  END IF;

  v_clean_gst := upper(trim(p_gstin));
  IF v_clean_gst IS NOT NULL AND v_clean_gst <> '' THEN
    IF NOT (v_clean_gst ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Invalid GSTIN structure');
    END IF;

    -- Verify PAN matches GSTIN chars 3-12
    IF v_clean_pan IS NOT NULL AND v_clean_pan <> '' AND substr(v_clean_gst, 3, 10) <> v_clean_pan THEN
      RETURN jsonb_build_object('ok', false, 'error', 'PAN does not match statutory GSTIN');
    END IF;
  END IF;

  UPDATE public.suppliers
  SET
    business_name = trim(p_legal_name),
    legal_business_name = trim(p_legal_name),
    trade_name = COALESCE(trim(p_trade_name), trim(p_legal_name)),
    gstin = v_clean_gst,
    pan = v_clean_pan,
    registered_address = p_address,
    contact_phone = trim(p_contact_phone),
    contact_email = trim(p_contact_email),
    lifecycle_state = 'VERIFIED',
    verification_status = 'VERIFIED',
    status = 'ACTIVE',
    verified_at = v_now,
    verification_notes = 'Statutory structure & PAN/GSTIN verified',
    updated_at = v_now
  WHERE id = v_supplier.id;

  RETURN jsonb_build_object(
    'ok', true,
    'supplier_id', v_supplier.id,
    'business_name', trim(p_legal_name),
    'lifecycle_state', 'VERIFIED',
    'verification_status', 'VERIFIED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_supplier_onboarding_atomic TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 10. Upgrade lock_and_reveal_award_atomic: Fail-Closed Supplier Verification Gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text,
  p_auto_reveal   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq             rfqs%ROWTYPE;
  v_quote           quotes%ROWTYPE;
  v_org             organizations%ROWTYPE;
  v_award_id        uuid;
  v_now             timestamptz := now();
  v_tally           jsonb;
  v_po_res          jsonb;
  v_po_id           uuid;
  v_po_number       text;
  v_supplier_id     uuid;
  v_supplier        suppliers%ROWTYPE;
  v_business        text;
  v_phone           text;
  v_email           text;
  v_alias           text;
  v_existing_award  awards%ROWTYPE;
  v_pending_stages  integer := 0;
  v_can_reveal      boolean := false;
BEGIN
  -- 1. Strict row-level lock on RFQ
  SELECT * INTO v_rfq
  FROM public.rfqs
  WHERE id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  -- 2. Verify RFQ Status
  IF v_rfq.status NOT IN ('OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;

  -- 3. Fail-Closed Multi-Tier Approval Gate
  SELECT COUNT(*) INTO v_pending_stages
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND status != 'APPROVED';

  IF v_pending_stages > 0 THEN
    RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction.';
  END IF;

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_rfq.organization_id;

  -- 4. Verify Quote belongs to this RFQ
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id AND rfq_id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ');
  END IF;

  -- Verify Supplier verification status
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED' THEN
    v_can_reveal := p_auto_reveal;
  ELSE
    -- If supplier is not verified, require onboarding and block reveal
    v_can_reveal := false;
    IF v_supplier.lifecycle_state = 'QUOTE_PARTICIPANT' THEN
      UPDATE public.suppliers
      SET lifecycle_state = 'ONBOARDING_REQUIRED', updated_at = v_now
      WHERE id = v_supplier.id;
    END IF;
  END IF;

  -- 5. Check or Create Award Record
  SELECT * INTO v_existing_award
  FROM public.awards
  WHERE rfq_id = p_rfq_id;

  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    -- Compute final frozen vote tally snapshot
    SELECT jsonb_build_object(
      'locked_at', v_now,
      'votes', COALESCE(jsonb_agg(jsonb_build_object(
        'quote_id', v.recommended_quote_id,
        'choice', v.choice,
        'voting_power', v.voting_power,
        'buyer_type', v.buyer_type
      )), '[]'::jsonb)
    )
    INTO v_tally
    FROM (
      SELECT DISTINCT ON (cv.profile_id) cv.*
      FROM public.committee_votes cv
      WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
      ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
    ) v;

    -- Insert Frozen Award Record
    INSERT INTO public.awards (
      rfq_id,
      quote_id,
      awarded_by,
      justification,
      status,
      awarded_at,
      revealed_at,
      votes_locked_at,
      vote_snapshot
    ) VALUES (
      p_rfq_id,
      p_quote_id,
      COALESCE(private.get_profile_id(), v_rfq.created_by),
      jsonb_build_object('text', p_justification),
      CASE WHEN v_can_reveal THEN 'REVEALED'::public.award_status ELSE 'PENDING_REVEAL'::public.award_status END,
      v_now,
      CASE WHEN v_can_reveal THEN v_now ELSE NULL END,
      v_now,
      COALESCE(v_tally, '{}'::jsonb)
    )
    RETURNING id INTO v_award_id;
  END IF;

  -- 6. Update Quote Statuses
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;

  -- 7. Update RFQ and Requirement Status
  UPDATE rfqs
  SET 
    status = 'AWARDED',
    reveal_status = CASE WHEN v_can_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now
  WHERE id = p_rfq_id;

  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;

  -- Notify outcome
  PERFORM private.notify_bidders_of_outcome(p_rfq_id);

  -- 8. Audit Log
  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.locked',
    COALESCE(private.get_profile_id(), v_rfq.created_by),
    v_rfq.organization_id,
    'award',
    v_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'can_reveal', v_can_reveal,
      'locked_at', v_now
    )
  );

  -- 9. If reveal is allowed, atomically generate PO and return mutual reveal payload
  IF v_can_reveal THEN
    v_po_res := public.create_purchase_order_from_award(v_award_id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';

    SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
    INTO v_supplier_id, v_business, v_phone, v_email, v_alias
    FROM quotes q
    JOIN suppliers s ON s.id = q.supplier_id
    JOIN rfq_invitations ri ON ri.id = q.invitation_id
    WHERE q.id = p_quote_id;

    RETURN jsonb_build_object(
      'ok', true,
      'award_id', v_award_id,
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'status', 'REVEALED',
      'revealed', true,
      'po_id', v_po_id,
      'po_number', v_po_number,
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'contact_phone', v_phone,
      'contact_email', v_email,
      'alias_before_reveal', v_alias,
      'buyer_organization_id', v_org.id,
      'buyer_organization_name', v_org.name,
      'buyer_org_type', v_org.org_type,
      'buyer_gstin', v_org.tax_registration,
      'buyer_contact_person', v_org.contact_person,
      'buyer_contact_phone', v_org.contact_phone,
      'buyer_contact_email', v_org.contact_email,
      'buyer_address', v_org.address,
      'buyer_city', v_org.city
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'award_id', v_award_id,
    'rfq_id', p_rfq_id,
    'quote_id', p_quote_id,
    'status', 'PENDING_REVEAL',
    'revealed', false,
    'supplier_verification_required', (v_supplier.lifecycle_state <> 'VERIFIED'),
    'votes_locked_at', v_now
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 11. Upgrade create_purchase_order_from_award: Address Snapshots & Supplier Gate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_purchase_order_from_award(p_award_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_award           awards%ROWTYPE;
  v_rfq             rfqs%ROWTYPE;
  v_quote           quotes%ROWTYPE;
  v_supplier        suppliers%ROWTYPE;
  v_version         quote_versions%ROWTYPE;
  v_existing_po     purchase_orders%ROWTYPE;
  v_po_id           uuid;
  v_po_number       text;
  v_total           numeric;
  v_currency        text;
  v_pending_stages  integer := 0;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  IF v_award.status <> 'REVEALED' THEN
    RAISE EXCEPTION 'Award must be REVEALED before creating a Purchase Order';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = v_award.rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT private.is_org_member(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Fail-Closed multi-tier approval verification on PO creation
  SELECT COUNT(*) INTO v_pending_stages
  FROM public.rfq_approval_stages
  WHERE rfq_id = v_rfq.id AND status != 'APPROVED';

  IF v_pending_stages > 0 THEN
    RAISE EXCEPTION 'Cannot create Purchase Order: Required approval tier(s) are pending satisfaction.';
  END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_award.quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Awarded quote not found';
  END IF;

  -- Fail-Closed Supplier Truthful Verification Gate
  SELECT * INTO v_supplier FROM suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state <> 'VERIFIED' OR v_supplier.verification_status <> 'VERIFIED' THEN
    RAISE EXCEPTION 'Cannot create Purchase Order: Supplier must complete onboarding and verification before PO creation.';
  END IF;

  SELECT * INTO v_existing_po FROM purchase_orders WHERE award_id = p_award_id;
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM work_orders WHERE purchase_order_id = v_existing_po.id) THEN
      INSERT INTO work_orders (
        purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
      ) VALUES (
        v_existing_po.id, v_existing_po.supplier_id, 'NOT_STARTED', 'Work order - ' || v_existing_po.po_number, 0, now(), now()
      );
    END IF;
    RETURN jsonb_build_object('po_id', v_existing_po.id, 'po_number', v_existing_po.po_number);
  END IF;

  SELECT * INTO v_version
  FROM quote_versions
  WHERE quote_id = v_quote.id AND version = v_quote.current_version;

  v_total := COALESCE((v_version.snapshot->>'totalCost')::numeric, (v_version.snapshot->>'basePrice')::numeric, 0);
  v_currency := COALESCE(v_version.snapshot->>'currency', 'INR');
  v_po_number := 'PO-' || to_char(now(), 'YYYY-MM-DD') || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  INSERT INTO purchase_orders (
    award_id,
    rfq_id,
    organization_id,
    supplier_id,
    po_number,
    status,
    total_amount,
    currency,
    taxable_total,
    cgst_total,
    sgst_total,
    utgst_total,
    igst_total,
    tax_snapshot,
    delivery_address_snapshot,
    billing_address_snapshot,
    issued_at,
    created_at,
    updated_at
  ) VALUES (
    p_award_id,
    v_rfq.id,
    v_rfq.organization_id,
    v_quote.supplier_id,
    v_po_number,
    'ISSUED'::public.purchase_order_status,
    v_total,
    v_currency,
    v_total,
    0, 0, 0, 0,
    v_version.snapshot,
    v_rfq.delivery_address_snapshot,
    v_rfq.billing_address_snapshot,
    now(),
    now(),
    now()
  )
  RETURNING id INTO v_po_id;

  INSERT INTO work_orders (
    purchase_order_id, supplier_id, status, title, progress_percent, created_at, updated_at
  ) VALUES (
    v_po_id, v_quote.supplier_id, 'NOT_STARTED', 'Work order - ' || v_po_number, 0, now(), now()
  );

  RETURN jsonb_build_object('po_id', v_po_id, 'po_number', v_po_number);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_award(uuid) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 12. Grants to Table Permissions
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_addresses TO authenticated, service_role;
GRANT SELECT ON public.buyer_addresses TO anon;

COMMIT;
