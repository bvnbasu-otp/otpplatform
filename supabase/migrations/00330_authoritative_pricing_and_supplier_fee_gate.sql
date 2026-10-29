-- =============================================================================
-- Migration 00330: Authoritative Canonical Pricing & Supplier Fee Gate (0.50%)
--
-- Features:
--   1. Authoritative published subscription pricing seeds in subscription_plans:
--      - INDIVIDUAL: ₹199/mo, ₹1,999/yr, ₹149 extra RFQ (+ 18% GST), 3 RFQs/mo
--      - RWA: ₹1,499/mo, ₹14,999/yr, ₹999 extra RFQ (+ 18% GST), 3 RFQs/mo
--      - MSME: ₹1,999/mo, ₹19,999/yr, ₹1,499 extra RFQ (+ 18% GST), 3 RFQs/mo
--      - ENTERPRISE: ₹4,999/mo, ₹49,999/yr, ₹1,499 extra RFQ (+ 18% GST), 3 RFQs/mo
--      - Deactivate/clean legacy unmapped plans so subscription_pricing_report() is clean.
--      - Backward compatibility alias normalization in private.canonical_subscription_price.
--   2. Supplier Platform Fee Orders Table (public.supplier_fee_orders):
--      - Tracks rfq_id, award_id, quote_id, supplier_id, agreed_transaction_value,
--        fee_rate (0.50%), fee_amount, gst_rate (18%), gst_amount, total_fee_payable,
--        status ('PENDING', 'SUCCEEDED', 'DISPUTED', 'REFUNDED'), terms acceptance.
--   3. Strict Server-Side Gate in lock_and_reveal_award_atomic:
--      - Establishes supplier_fee_orders on award lock.
--      - Blocks reveal: v_can_reveal is FALSE unless supplier_fee_orders.status = 'SUCCEEDED'.
--   4. Strict Server-Side Gate in reveal_award:
--      - Fails closed with 'FEE-NOT-PAID' (42501) if supplier fee has not been paid.
--   5. Supplier Fee Lifecycle RPCs:
--      - public.get_supplier_fee_details(p_rfq_id)
--      - public.accept_supplier_fee_terms(p_rfq_id, p_terms_version)
--      - public.record_verified_supplier_fee_payment(p_rfq_id, ...) [service_role only]
--      - public.pay_supplier_fee_simulated(p_rfq_id, ...) [for test/pilot verification]
--      - public.request_supplier_fee_refund(p_rfq_id, ...) [enforces non-refundable policy]
--   6. Personal Buyer Support & Protected Reveal View (public.rfq_buyer_revealed):
--      - LEFT JOIN organizations + fallback to profiles / delivery_location for Individuals.
--      - Hard defense-in-depth condition: fee order must be SUCCEEDED.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Canonical Subscription Plans Seed & Tier Aliases
-- ---------------------------------------------------------------------------

-- Upsert Canonical Plans matching published commercial rules
-- Clean legacy ENTERPRISE if it has a non-canonical ID to avoid seed.sql conflict
DELETE FROM public.subscription_plans WHERE code = 'ENTERPRISE' AND id <> 'a8000000-0000-4000-8000-000000000003';

INSERT INTO public.subscription_plans (
  id, code, tier_code, name, description,
  price_monthly, price_yearly, price_extra_rfq,
  gst_rate, supplier_state_code, currency, is_active, features
) VALUES
(
  'a8000000-0000-4000-8000-000000000010',
  'INDIVIDUAL', 'INDIVIDUAL', 'Individual Buyer',
  'For independent property owners, solo buyers & personal procurement',
  199.00, 1999.00, 149.00,
  18.00, '33', 'INR', true,
  '{"monthlyRfqs": 3, "quarterlyBonus": 1, "targetOrgTypes": ["INDIVIDUAL"]}'::jsonb
),
(
  'a8000000-0000-4000-8000-000000000011',
  'RWA', 'RWA', 'RWA & Society',
  'For housing societies, apartment committees & residential welfare',
  1499.00, 14999.00, 999.00,
  18.00, '33', 'INR', true,
  '{"monthlyRfqs": 3, "quarterlyBonus": 1, "targetOrgTypes": ["COMMUNITY", "RWA", "SOCIETY"]}'::jsonb
),
(
  'a8000000-0000-4000-8000-000000000012',
  'MSME', 'MSME', 'MSME & Commercial Business',
  'For small & medium enterprises, workshops, plants & commercial teams',
  1999.00, 19999.00, 1499.00,
  18.00, '33', 'INR', true,
  '{"monthlyRfqs": 3, "quarterlyBonus": 1, "targetOrgTypes": ["MSME"]}'::jsonb
),
(
  'a8000000-0000-4000-8000-000000000003',
  'ENTERPRISE', 'ENTERPRISE', 'Enterprise & Institutional',
  'For multi-location institutions, healthcare trusts, colleges & developer groups',
  4999.00, 49999.00, 1499.00,
  18.00, '33', 'INR', true,
  '{"monthlyRfqs": 3, "quarterlyBonus": 1, "targetOrgTypes": ["ENTERPRISE", "INSTITUTION", "TRUST", "GOVERNMENT"]}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  tier_code = EXCLUDED.tier_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  price_extra_rfq = EXCLUDED.price_extra_rfq,
  gst_rate = EXCLUDED.gst_rate,
  supplier_state_code = EXCLUDED.supplier_state_code,
  currency = EXCLUDED.currency,
  is_active = EXCLUDED.is_active,
  features = EXCLUDED.features,
  updated_at = now();

-- Ensure legacy unmapped plans (like COMMUNITY_FREE, MSME_STARTER from early seed) are removed or mapped
DELETE FROM public.subscription_plans WHERE tier_code IS NULL;

-- Normalize organizations having legacy subscription_tier codes
UPDATE public.organizations
SET subscription_tier = CASE
  WHEN subscription_tier = 'TIER_1_MSME' THEN 'INDIVIDUAL'
  WHEN subscription_tier = 'TIER_2_ENTERPRISE' THEN 'RWA'
  ELSE subscription_tier
END
WHERE subscription_tier IN ('TIER_1_MSME', 'TIER_2_ENTERPRISE');

-- Update private.canonical_subscription_price to handle aliases gracefully
CREATE OR REPLACE FUNCTION private.canonical_subscription_price(
  p_tier text,
  p_cycle text,
  p_currency text DEFAULT 'INR'
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_tier text := upper(coalesce(btrim(p_tier), ''));
  v_cycle text := upper(coalesce(btrim(p_cycle), ''));
  v_currency text := upper(coalesce(btrim(p_currency), 'INR'));
  v_plan public.subscription_plans;
  v_price numeric;
BEGIN
  IF v_cycle NOT IN ('MONTHLY', 'YEARLY') THEN
    RAISE EXCEPTION 'Unknown billing cycle % (PRICE-UNKNOWN-CYCLE)', v_cycle;
  END IF;

  -- Backward compatibility alias resolution
  v_tier := CASE v_tier
    WHEN 'TIER_1_MSME' THEN 'INDIVIDUAL'
    WHEN 'TIER_2_ENTERPRISE' THEN 'RWA'
    ELSE v_tier
  END;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE tier_code = v_tier;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription_plans row is mapped to tier % (PRICE-PLAN-NOT-CONFIGURED)', v_tier;
  END IF;
  IF NOT v_plan.is_active THEN
    RAISE EXCEPTION 'Subscription plan % for tier % is inactive (PRICE-PLAN-INACTIVE)', v_plan.code, v_tier;
  END IF;
  IF upper(v_plan.currency) <> v_currency THEN
    RAISE EXCEPTION 'Plan % is priced in % but % was presented (PRICE-CURRENCY-MISMATCH)', v_plan.code, v_plan.currency, v_currency;
  END IF;

  v_price := CASE v_cycle WHEN 'MONTHLY' THEN v_plan.price_monthly ELSE v_plan.price_yearly END;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Plan % has no % price (PRICE-CYCLE-NOT-CONFIGURED)', v_plan.code, v_cycle;
  END IF;
  IF v_price <= 0 THEN
    RAISE EXCEPTION 'Plan % has a non-payable % price % (PRICE-NOT-PAYABLE)', v_plan.code, v_cycle, v_price;
  END IF;
  RETURN v_price;
END;
$$;

REVOKE ALL ON FUNCTION private.canonical_subscription_price(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.canonical_subscription_price(text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Supplier Platform Fee Orders Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_fee_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE RESTRICT,
  award_id uuid NOT NULL REFERENCES public.awards(id) ON DELETE RESTRICT,
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  agreed_transaction_value numeric(14, 2) NOT NULL CHECK (agreed_transaction_value >= 0),
  fee_rate numeric(5, 4) NOT NULL DEFAULT 0.0050 CHECK (fee_rate = 0.0050),
  fee_amount numeric(14, 2) NOT NULL CHECK (fee_amount >= 0),
  gst_rate numeric(5, 2) NOT NULL DEFAULT 18.00 CHECK (gst_rate = 18.00),
  gst_amount numeric(14, 2) NOT NULL CHECK (gst_amount >= 0),
  total_fee_payable numeric(14, 2) NOT NULL CHECK (total_fee_payable >= 0),
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCEEDED', 'DISPUTED', 'REFUNDED')),
  non_refund_terms_accepted boolean NOT NULL DEFAULT false,
  terms_version text,
  terms_accepted_at timestamptz,
  paid_at timestamptz,
  payment_gateway text,
  payment_reference text,
  gateway_event_id text,
  gateway_payload jsonb DEFAULT '{}'::jsonb,
  refund_reason text,
  refund_exception_category text CHECK (refund_exception_category IS NULL OR refund_exception_category IN ('DUPLICATE_PAYMENT', 'GATEWAY_ERROR', 'PLATFORM_REVEAL_FAILURE')),
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_fee_orders_rfq_unique UNIQUE (rfq_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_fee_orders_supplier ON public.supplier_fee_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_fee_orders_award ON public.supplier_fee_orders(award_id);
CREATE INDEX IF NOT EXISTS idx_supplier_fee_orders_gateway_event ON public.supplier_fee_orders(gateway_event_id) WHERE gateway_event_id IS NOT NULL;

ALTER TABLE public.supplier_fee_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_fee_orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_fee_orders_select ON public.supplier_fee_orders;
CREATE POLICY supplier_fee_orders_select ON public.supplier_fee_orders
  FOR SELECT
  USING (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR supplier_id IN (SELECT private.get_user_supplier_ids())
    OR EXISTS (
      SELECT 1 FROM public.rfqs r
      WHERE r.id = supplier_fee_orders.rfq_id
        AND private.is_buyer_scope_member(r.organization_id, r.owner_profile_id)
    )
  );

DROP POLICY IF EXISTS supplier_fee_orders_admin_modify ON public.supplier_fee_orders;
CREATE POLICY supplier_fee_orders_admin_modify ON public.supplier_fee_orders
  FOR ALL
  USING (COALESCE(auth.role(), '') = 'service_role' OR private.is_platform_admin())
  WITH CHECK (COALESCE(auth.role(), '') = 'service_role' OR private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. Upgrade lock_and_reveal_award_atomic: Calculate Fee & Gate Reveal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_justification text,
  p_auto_reveal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $func$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_org organizations%ROWTYPE;
  v_award_id uuid;
  v_now timestamptz := now();
  v_tally jsonb;
  v_po_res jsonb;
  v_po_id uuid;
  v_po_number text;
  v_supplier_id uuid;
  v_supplier suppliers%ROWTYPE;
  v_business text;
  v_phone text;
  v_email text;
  v_alias text;
  v_existing_award awards%ROWTYPE;
  v_pending_stages integer := 0;
  v_can_reveal boolean := false;
  v_vote_count integer := 0;
  v_awarded_by uuid;
  v_gross numeric;
  v_fee numeric;
  v_gst numeric;
  v_total_fee numeric;
  v_fee_order public.supplier_fee_orders%ROWTYPE;
BEGIN
  PERFORM private.enforce_rwa_award_quorum(p_rfq_id, p_quote_id);
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found'); END IF;
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (private.get_profile_id() IS NOT NULL AND COALESCE(private.is_buyer_scope_manager(v_rfq.organization_id, v_rfq.owner_profile_id), false))
  ) THEN
    RAISE EXCEPTION 'Only an owner or manager of the buying organization can lock an award (AWARD-UNAUTHORIZED)';
  END IF;
  IF v_rfq.status = 'OPEN' THEN RAISE EXCEPTION 'Cannot lock award while RFQ is still OPEN'; END IF;
  IF v_rfq.status NOT IN ('CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;
  SELECT COUNT(*) INTO v_pending_stages FROM public.rfq_approval_stages WHERE rfq_id = p_rfq_id AND status != 'APPROVED';
  IF v_pending_stages > 0 THEN RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction.'; END IF;
  SELECT * INTO v_org FROM public.organizations WHERE id = v_rfq.organization_id;
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ'); END IF;
  IF v_quote.status = 'WITHDRAWN' THEN RAISE EXCEPTION 'Cannot award a withdrawn quote'; END IF;
  IF v_org.org_type::text IN ('COMMUNITY', 'RWA', 'SOCIETY') THEN
    SELECT COUNT(DISTINCT cv.profile_id) INTO v_vote_count
    FROM public.committee_votes cv
    WHERE cv.rfq_id = p_rfq_id AND cv.recommended_quote_id = p_quote_id
      AND cv.choice = 'RECOMMEND'::public.vote_choice
      AND NOT EXISTS (
        SELECT 1 FROM public.conflict_of_interest_declarations coi
        WHERE coi.rfq_id = p_rfq_id AND coi.profile_id = cv.profile_id AND coi.status = 'DECLARED_CONFLICT'
      );
    IF v_vote_count < 2 THEN RAISE EXCEPTION 'Committee quorum not met: at least 2 unconflicted votes required for this award'; END IF;
  END IF;
  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;

  -- Internal operators cannot be procurement actors: award must be recorded under buyer profile
  IF private.is_internal_profile(private.get_profile_id()) THEN
    v_awarded_by := COALESCE(v_rfq.created_by, v_rfq.owner_profile_id);
  ELSE
    v_awarded_by := COALESCE(private.get_profile_id(), v_rfq.created_by);
  END IF;

  SELECT * INTO v_existing_award FROM public.awards WHERE rfq_id = p_rfq_id;
  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    SELECT jsonb_build_object('locked_at', v_now, 'votes', COALESCE(jsonb_agg(jsonb_build_object(
      'quote_id', v.recommended_quote_id, 'choice', v.choice, 'voting_power', v.voting_power)), '[]'::jsonb))
    INTO v_tally FROM (
      SELECT DISTINCT ON (cv.profile_id) cv.* FROM public.committee_votes cv
      WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
      ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
    ) v;
    INSERT INTO public.awards (rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at, votes_locked_at, vote_snapshot)
    VALUES (
      p_rfq_id, p_quote_id, v_awarded_by,
      jsonb_build_object('text', p_justification),
      'PENDING_REVEAL'::public.award_status,
      v_now, NULL, v_now, COALESCE(v_tally, '{}'::jsonb)
    ) RETURNING id INTO v_award_id;
  END IF;

  -- Calculate Authoritative 0.50% Supplier Platform Fee (+ 18% GST)
  SELECT COALESCE(
    (qv.snapshot->>'totalCost')::numeric,
    (qv.snapshot->>'basePrice')::numeric,
    0
  ) INTO v_gross
  FROM public.quotes q
  LEFT JOIN public.quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
  WHERE q.id = p_quote_id;

  v_fee := round(v_gross * 0.0050, 2);
  v_gst := round(v_fee * 0.18, 2);
  v_total_fee := round(v_fee + v_gst, 2);

  -- Record or Update Supplier Fee Order
  INSERT INTO public.supplier_fee_orders (
    rfq_id, award_id, quote_id, supplier_id,
    agreed_transaction_value, fee_rate, fee_amount, gst_rate, gst_amount, total_fee_payable, status
  ) VALUES (
    p_rfq_id, v_award_id, p_quote_id, v_supplier.id,
    v_gross, 0.0050, v_fee, 18.00, v_gst, v_total_fee, 'PENDING'
  )
  ON CONFLICT (rfq_id) DO UPDATE SET
    award_id = EXCLUDED.award_id,
    quote_id = EXCLUDED.quote_id,
    supplier_id = EXCLUDED.supplier_id,
    agreed_transaction_value = EXCLUDED.agreed_transaction_value,
    fee_amount = EXCLUDED.fee_amount,
    gst_amount = EXCLUDED.gst_amount,
    total_fee_payable = EXCLUDED.total_fee_payable,
    updated_at = v_now
  WHERE supplier_fee_orders.status <> 'SUCCEEDED';

  -- Check whether supplier fee was already settled
  SELECT * INTO v_fee_order FROM public.supplier_fee_orders WHERE rfq_id = p_rfq_id;
  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED'
     AND v_fee_order.status = 'SUCCEEDED' THEN
    v_can_reveal := p_auto_reveal;
  ELSE
    v_can_reveal := false;
    IF v_supplier.lifecycle_state = 'QUOTE_PARTICIPANT' THEN
      UPDATE public.suppliers SET lifecycle_state = 'ONBOARDING_REQUIRED', updated_at = v_now WHERE id = v_supplier.id;
    END IF;
  END IF;

  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;
  UPDATE rfqs SET status = 'AWARDED',
    reveal_status = CASE WHEN v_can_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;
  PERFORM private.notify_bidders_of_outcome(p_rfq_id);
  PERFORM private.issue_decision_receipt_snapshots_for_award(v_award_id, 'PRE_REVEAL');

  IF v_can_reveal THEN
    UPDATE awards SET status = 'REVEALED', revealed_at = v_now WHERE id = v_award_id;
    PERFORM private.issue_decision_receipt_snapshots_for_award(v_award_id, 'POST_REVEAL');
    v_po_res := public.create_purchase_order_from_award(v_award_id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';
    IF v_po_id IS NULL THEN
      RAISE EXCEPTION 'Reveal failed: Purchase Order was not created';
    END IF;
    SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label
    INTO v_supplier_id, v_business, v_phone, v_email, v_alias
    FROM quotes q JOIN suppliers s ON s.id = q.supplier_id JOIN rfq_invitations ri ON ri.id = q.invitation_id
    WHERE q.id = p_quote_id;
    RETURN jsonb_build_object('ok', true, 'award_id', v_award_id, 'revealed', true, 'po_id', v_po_id,
      'business_name', v_business, 'contact_phone', v_phone, 'contact_email', v_email, 'fee_paid', true);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'award_id', v_award_id,
    'revealed', false,
    'supplier_verification_required', (v_supplier.lifecycle_state <> 'VERIFIED'),
    'supplier_fee_required', true,
    'agreed_transaction_value', v_gross,
    'fee_amount', v_fee,
    'gst_amount', v_gst,
    'total_fee_payable', v_total_fee,
    'fee_status', COALESCE(v_fee_order.status, 'PENDING')
  );
END;
$func$;

REVOKE ALL ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Upgrade reveal_award: Enforce Supplier Fee Succeeded Before Identity Reveal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reveal_award(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_award awards%ROWTYPE;
  v_supplier_id uuid;
  v_business text;
  v_phone text;
  v_email text;
  v_alias text;
  v_lifecycle text;
  v_verification text;
  v_po_id uuid;
  v_po_number text;
  v_po_res jsonb;
  v_now timestamptz := now();
  v_fee_order public.supplier_fee_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (private.get_profile_id() IS NOT NULL AND COALESCE(private.is_buyer_scope_manager(v_rfq.organization_id, v_rfq.owner_profile_id), false))
    OR private.is_awarded_supplier_for(p_rfq_id)
  ) THEN
    RAISE EXCEPTION 'Identity reveal is restricted to the buyer organization, platform admin, or the awarded supplier (REVEAL-UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_award FROM awards WHERE rfq_id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity can only be revealed after the award is locked'; END IF;

  SELECT s.id, s.business_name, s.contact_phone, s.contact_email, ri.anonymous_label,
         s.lifecycle_state::text, s.verification_status::text
  INTO v_supplier_id, v_business, v_phone, v_email, v_alias, v_lifecycle, v_verification
  FROM quotes q JOIN suppliers s ON s.id = q.supplier_id JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.id = v_award.quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Awarded supplier not found'; END IF;

  IF v_lifecycle IS DISTINCT FROM 'VERIFIED' OR v_verification IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'Cannot reveal identity: the awarded supplier must complete onboarding and verification first';
  END IF;

  -- 0.50% Supplier Platform Fee Gate
  SELECT * INTO v_fee_order FROM public.supplier_fee_orders WHERE rfq_id = p_rfq_id;
  IF NOT FOUND OR v_fee_order.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'Cannot reveal identity: supplier platform fee of 0.50%% has not been paid (FEE-NOT-PAID)'
      USING ERRCODE = '42501';
  END IF;

  IF v_rfq.reveal_status = 'REVEALED' THEN
    PERFORM private.issue_decision_receipt_snapshots_for_award(v_award.id, 'POST_REVEAL');
    SELECT id, po_number INTO v_po_id, v_po_number FROM purchase_orders WHERE award_id = v_award.id;
    IF v_po_id IS NULL THEN
      v_po_res := public.create_purchase_order_from_award(v_award.id);
      v_po_id := (v_po_res->>'po_id')::uuid;
      v_po_number := v_po_res->>'po_number';
    END IF;
    IF v_po_id IS NULL THEN
      RAISE EXCEPTION 'Reveal failed: no Purchase Order exists for the award';
    END IF;
    RETURN jsonb_build_object('already_revealed', true, 'supplier_id', v_supplier_id, 'business_name', v_business,
      'contact_phone', v_phone, 'contact_email', v_email, 'alias_before_reveal', v_alias,
      'po_id', v_po_id, 'po_number', v_po_number);
  END IF;

  UPDATE rfqs SET reveal_status = 'REVEALED', updated_at = v_now WHERE id = p_rfq_id;
  UPDATE awards SET status = 'REVEALED', revealed_at = v_now WHERE id = v_award.id;

  v_po_res := public.create_purchase_order_from_award(v_award.id);
  v_po_id := (v_po_res->>'po_id')::uuid;
  v_po_number := v_po_res->>'po_number';
  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Reveal failed: Purchase Order was not created';
  END IF;

  PERFORM private.issue_decision_receipt_snapshots_for_award(v_award.id, 'POST_REVEAL');
  INSERT INTO audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES ('identity.revealed', COALESCE(private.get_profile_id(), v_rfq.created_by), v_rfq.organization_id, 'award', v_award.id::text,
    jsonb_build_object('rfq_id', p_rfq_id, 'quote_id', v_award.quote_id, 'supplier_id', v_supplier_id,
      'business_name', v_business, 'alias_before_reveal', v_alias, 'awarded_at', v_award.awarded_at,
      'buyer_released_to_supplier', true, 'po_number', v_po_number, 'supplier_fee_order_id', v_fee_order.id));

  RETURN jsonb_build_object('supplier_id', v_supplier_id, 'business_name', v_business, 'contact_phone', v_phone,
    'contact_email', v_email, 'alias_before_reveal', v_alias, 'revealed_at', v_now,
    'buyer_released_to_supplier', true, 'po_id', v_po_id, 'po_number', v_po_number);
END;
$$;

REVOKE ALL ON FUNCTION public.reveal_award(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_award(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Supplier Fee Lifecycle RPCs
-- ---------------------------------------------------------------------------

-- Fetch fee calculation details and policy text
CREATE OR REPLACE FUNCTION public.get_supplier_fee_details(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_fee_order public.supplier_fee_orders%ROWTYPE;
  v_rfq public.rfqs%ROWTYPE;
BEGIN
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (private.get_profile_id() IS NOT NULL AND COALESCE(private.is_buyer_scope_manager(v_rfq.organization_id, v_rfq.owner_profile_id), false))
    OR private.is_awarded_supplier_for(p_rfq_id)
  ) THEN
    RAISE EXCEPTION 'Access denied to supplier fee details (FEE-DETAILS-UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fee_order FROM public.supplier_fee_orders WHERE rfq_id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No supplier fee order found for RFQ');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'rfq_id', v_fee_order.rfq_id,
    'award_id', v_fee_order.award_id,
    'quote_id', v_fee_order.quote_id,
    'supplier_id', v_fee_order.supplier_id,
    'agreed_transaction_value', v_fee_order.agreed_transaction_value,
    'fee_rate_percent', 0.50,
    'fee_amount', v_fee_order.fee_amount,
    'gst_rate_percent', 18.00,
    'gst_amount', v_fee_order.gst_amount,
    'total_fee_payable', v_fee_order.total_fee_payable,
    'currency', v_fee_order.currency,
    'status', v_fee_order.status,
    'non_refund_terms_accepted', v_fee_order.non_refund_terms_accepted,
    'terms_version', v_fee_order.terms_version,
    'paid_at', v_fee_order.paid_at,
    'non_refund_policy_summary', 'The OTP supplier platform fee of 0.50% (+ 18% GST) is strictly non-refundable once buyer identity is revealed. Exceptions are limited to duplicate charge, payment gateway error, or platform failure to reveal buyer details.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_supplier_fee_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_fee_details(uuid) TO authenticated, service_role;

-- Accept non-refundable platform fee terms
CREATE OR REPLACE FUNCTION public.accept_supplier_fee_terms(
  p_rfq_id uuid,
  p_terms_version text DEFAULT '2026-10-V1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_fee_order public.supplier_fee_orders%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR private.is_awarded_supplier_for(p_rfq_id)
  ) THEN
    RAISE EXCEPTION 'Only the awarded supplier can accept terms for this fee order'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fee_order FROM public.supplier_fee_orders WHERE rfq_id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No supplier fee order exists for RFQ %', p_rfq_id;
  END IF;

  UPDATE public.supplier_fee_orders
  SET non_refund_terms_accepted = true,
      terms_version = p_terms_version,
      terms_accepted_at = v_now,
      updated_at = v_now
  WHERE id = v_fee_order.id;

  RETURN jsonb_build_object(
    'ok', true,
    'rfq_id', p_rfq_id,
    'terms_accepted', true,
    'terms_version', p_terms_version,
    'accepted_at', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_supplier_fee_terms(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_supplier_fee_terms(uuid, text) TO authenticated, service_role;

-- Record verified payment (service_role only, called by payment webhook)
CREATE OR REPLACE FUNCTION public.record_verified_supplier_fee_payment(
  p_rfq_id uuid,
  p_amount numeric,
  p_currency text DEFAULT 'INR',
  p_gateway text DEFAULT 'RAZORPAY',
  p_gateway_event_id text DEFAULT NULL,
  p_payment_reference text DEFAULT NULL,
  p_gateway_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_fee_order public.supplier_fee_orders%ROWTYPE;
  v_now timestamptz := now();
  v_reveal_res jsonb;
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR private.is_platform_admin()) THEN
    RAISE EXCEPTION 'Only service_role or platform admin can record verified supplier fee payments'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fee_order FROM public.supplier_fee_orders WHERE rfq_id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No supplier fee order found for RFQ % (FEE-ORDER-NOT-FOUND)', p_rfq_id;
  END IF;

  -- Replay safety: if already succeeded with this gateway event, return success idempotently
  IF v_fee_order.status = 'SUCCEEDED' THEN
    RETURN jsonb_build_object('ok', true, 'already_recorded', true, 'rfq_id', p_rfq_id, 'status', 'SUCCEEDED');
  END IF;

  -- Exact amount verification
  IF p_amount IS DISTINCT FROM v_fee_order.total_fee_payable THEN
    RAISE EXCEPTION 'Paid amount % does not match expected supplier fee % (PAY-V-FEE-MISMATCH)',
      p_amount, v_fee_order.total_fee_payable;
  END IF;

  UPDATE public.supplier_fee_orders
  SET status = 'SUCCEEDED',
      paid_at = v_now,
      payment_gateway = upper(btrim(p_gateway)),
      payment_reference = p_payment_reference,
      gateway_event_id = p_gateway_event_id,
      gateway_payload = p_gateway_payload,
      updated_at = v_now
  WHERE id = v_fee_order.id;

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES ('supplier_fee.paid', NULL, NULL, 'supplier_fee_order', v_fee_order.id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'supplier_id', v_fee_order.supplier_id,
      'agreed_transaction_value', v_fee_order.agreed_transaction_value,
      'fee_amount', v_fee_order.fee_amount,
      'gst_amount', v_fee_order.gst_amount,
      'total_fee_payable', v_fee_order.total_fee_payable,
      'gateway', p_gateway,
      'payment_reference', p_payment_reference,
      'gateway_event_id', p_gateway_event_id
    )
  );

  -- Perform immediate atomic reveal if supplier verification criteria met
  BEGIN
    v_reveal_res := public.reveal_award(p_rfq_id);
  EXCEPTION WHEN OTHERS THEN
    v_reveal_res := jsonb_build_object('reveal_pending_reason', SQLERRM);
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'fee_order_id', v_fee_order.id,
    'rfq_id', p_rfq_id,
    'status', 'SUCCEEDED',
    'total_fee_paid', v_fee_order.total_fee_payable,
    'reveal_result', v_reveal_res
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_verified_supplier_fee_payment(uuid, numeric, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_verified_supplier_fee_payment(uuid, numeric, text, text, text, text, jsonb) TO service_role;

-- Simulated fee payment (for tests / pilot verification)
CREATE OR REPLACE FUNCTION public.pay_supplier_fee_simulated(
  p_rfq_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_payment_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_fee_order public.supplier_fee_orders%ROWTYPE;
  v_ref text := COALESCE(p_payment_reference, 'SIM_FEE_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
  v_evt text := COALESCE(p_idempotency_key, 'evt_sim_' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
BEGIN
  SELECT * INTO v_fee_order FROM public.supplier_fee_orders WHERE rfq_id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No supplier fee order found for RFQ %', p_rfq_id;
  END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR private.is_awarded_supplier_for(p_rfq_id)
  ) THEN
    RAISE EXCEPTION 'Only the awarded supplier or admin can pay the platform fee (FEE-UNAUTHORIZED)'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_fee_order.non_refund_terms_accepted THEN
    RAISE EXCEPTION 'Supplier must accept non-refundable platform fee terms before payment (TERMS-NOT-ACCEPTED)'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.record_verified_supplier_fee_payment(
    p_rfq_id,
    v_fee_order.total_fee_payable,
    'INR',
    'SIMULATED',
    v_evt,
    v_ref,
    jsonb_build_object('simulated', true, 'mode', 'PILOT_TEST')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pay_supplier_fee_simulated(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_supplier_fee_simulated(uuid, text, text) TO authenticated, service_role;

-- Request fee refund under exceptional terms
CREATE OR REPLACE FUNCTION public.request_supplier_fee_refund(
  p_rfq_id uuid,
  p_reason text,
  p_exception_category text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_fee_order public.supplier_fee_orders%ROWTYPE;
  v_now timestamptz := now();
  v_cat text := upper(btrim(COALESCE(p_exception_category, '')));
BEGIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR private.is_awarded_supplier_for(p_rfq_id)
  ) THEN
    RAISE EXCEPTION 'Only the awarded supplier or administrator can request a fee refund'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fee_order FROM public.supplier_fee_orders WHERE rfq_id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No supplier fee order found for RFQ';
  END IF;

  IF v_fee_order.status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'Cannot refund a fee order that is not paid (current status: %)', v_fee_order.status;
  END IF;

  -- Enforce Non-Refundable Policy Exception Terms
  IF v_cat NOT IN ('DUPLICATE_PAYMENT', 'GATEWAY_ERROR', 'PLATFORM_REVEAL_FAILURE') THEN
    RAISE EXCEPTION 'Supplier platform fee is non-refundable. Exception % is not recognized under OTP policy. Buyer withdrawal does not entitle supplier to fee refund (NON-REFUNDABLE-FEE-POLICY)', v_cat
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.supplier_fee_orders
  SET status = 'DISPUTED',
      refund_reason = p_reason,
      refund_exception_category = v_cat,
      updated_at = v_now
  WHERE id = v_fee_order.id;

  INSERT INTO public.audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES ('supplier_fee.refund_requested', private.get_profile_id(), NULL, 'supplier_fee_order', v_fee_order.id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'exception_category', v_cat,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'rfq_id', p_rfq_id,
    'status', 'DISPUTED',
    'exception_category', v_cat,
    'message', 'Refund dispute submitted for admin adjudication under exception policy.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_supplier_fee_refund(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_supplier_fee_refund(uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Update rfq_buyer_revealed: Support Individual Personal Buyers & Fee Gate
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.rfq_buyer_revealed CASCADE;

CREATE OR REPLACE VIEW public.rfq_buyer_revealed
WITH (security_barrier = true) AS
SELECT
  r.id                  AS rfq_id,
  r.public_ref,
  r.title,
  COALESCE(o.name, p_owner.full_name, 'Individual Buyer') AS buyer_organization,
  COALESCE(o.org_type::text, 'INDIVIDUAL')                AS buyer_type,
  COALESCE(o.contact_person, p_owner.full_name)          AS contact_person,
  COALESCE(o.contact_phone, p_owner.phone)               AS contact_phone,
  COALESCE(o.contact_email, p_owner.email)               AS contact_email,
  o.tax_registration,
  COALESCE(o.city, (r.delivery_address_snapshot->>'city')::text, req.delivery_city) AS city,
  COALESCE(o.address, r.delivery_address_snapshot, CASE WHEN req.delivery_city IS NOT NULL THEN jsonb_build_object('city', req.delivery_city, 'pincode', req.delivery_pincode, 'line1', req.delivery_line1) ELSE NULL END) AS address,
  aw.full_name          AS awarded_by_name,
  aw.email              AS awarded_by_email,
  a.awarded_at,
  a.revealed_at
FROM public.awards a
JOIN public.rfqs r                     ON r.id = a.rfq_id
LEFT JOIN public.requirements req      ON req.id = r.requirement_id
LEFT JOIN public.organizations o       ON o.id = r.organization_id
LEFT JOIN public.profiles p_owner      ON p_owner.id = COALESCE(r.owner_profile_id, r.created_by)
LEFT JOIN public.profiles aw           ON aw.id = a.awarded_by
WHERE r.reveal_status = 'REVEALED'
  AND private.is_awarded_supplier_for(r.id)
  AND EXISTS (
    SELECT 1 FROM public.supplier_fee_orders sfo
    WHERE sfo.rfq_id = r.id AND sfo.status = 'SUCCEEDED'
  );

COMMENT ON VIEW public.rfq_buyer_revealed IS
  'The buying organization or individual personal buyer, in full, to the one supplier that won and paid the required 0.50% platform fee, once the award is revealed.';

GRANT SELECT ON public.rfq_buyer_revealed TO authenticated, service_role;

COMMIT;
