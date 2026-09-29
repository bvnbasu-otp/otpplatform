-- Migration 00216: Verified remediation phase — P0/P1 security and core integrity
-- Non-destructive: CREATE OR REPLACE, REVOKE/GRANT, additive triggers. No data deletes.
-- Anon EXECUTE allowlist (public schema only):
--   submit_signup_request, verify_profile_verification_otp, verify_whatsapp_password_reset, platform_heartbeat

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: subscription wallet credit amount (matches packages/domain pricing-entitlement.ts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.subscription_wallet_credit_inr(p_tier text, p_cycle text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier text := upper(btrim(p_tier));
  v_cycle text := upper(btrim(p_cycle));
BEGIN
  IF v_cycle NOT IN ('MONTHLY', 'YEARLY') THEN
    RAISE EXCEPTION 'Invalid billing cycle %', p_cycle;
  END IF;

  CASE v_tier
    WHEN 'INDIVIDUAL', 'TIER_1_MSME' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 1990.00 ELSE 199.00 END;
    WHEN 'RWA' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 14990.00 ELSE 1499.00 END;
    WHEN 'MSME' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 19990.00 ELSE 1999.00 END;
    WHEN 'ENTERPRISE', 'TIER_2_ENTERPRISE' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 49990.00 ELSE 4999.00 END;
    ELSE
      RAISE EXCEPTION 'Subscription tier % is not eligible for wallet redemption', p_tier;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.subscription_wallet_credit_inr(text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- AUD-SEC-001: credit_buyer_settlement_reward_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_buyer_settlement_reward_atomic(
  p_org_id uuid,
  p_platform_fee_tx_id uuid,
  p_settlement_id uuid DEFAULT NULL,
  p_base_amount numeric DEFAULT 0,
  p_fee_rate numeric DEFAULT 0.50,
  p_reward_share_rate numeric DEFAULT 20.00,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_wallet_id uuid;
  v_opening_bal numeric(14, 2);
  v_new_bal numeric(14, 2);
  v_fee_amount numeric(14, 2);
  v_reward_amount numeric(14, 2);
  v_tx_id uuid;
  v_alloc_id uuid;
  v_fee_tx record;
  v_po_id uuid;
  v_inv_id uuid;
  v_existing_tx record;
  v_existing_alloc record;
  v_base numeric(14, 2);
  v_fee_rate numeric(8, 4);
  v_reward_rate numeric(8, 4);
BEGIN
  IF p_platform_fee_tx_id IS NULL THEN
    RAISE EXCEPTION 'platform_fee_tx_id is required (WALLET-REWARD-FEE-REQUIRED)';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT private.is_platform_admin() THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Not authenticated (WALLET-REWARD-AUTH)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id AND profile_id = v_caller
    ) THEN
      RAISE EXCEPTION 'Access denied: not a member of organization %', p_org_id;
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      SELECT * INTO v_existing_alloc FROM public.buyer_reward_allocations WHERE platform_fee_tx_id = p_platform_fee_tx_id;
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'transaction_id', v_existing_tx.id,
        'wallet_id', v_existing_tx.wallet_id, 'reward_amount', v_existing_tx.amount,
        'opening_balance', v_existing_tx.opening_balance, 'closing_balance', v_existing_tx.closing_balance,
        'allocation_id', v_existing_alloc.id, 'message', 'Reward credit already processed (idempotent response)');
    END IF;
  END IF;

  SELECT * INTO v_existing_alloc FROM public.buyer_reward_allocations WHERE platform_fee_tx_id = p_platform_fee_tx_id;
  IF FOUND AND v_existing_alloc.status = 'CREDITED' THEN
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'allocation_id', v_existing_alloc.id,
      'reward_amount', v_existing_alloc.reward_amount, 'message', 'Reward allocation already credited for this platform fee transaction');
  END IF;

  SELECT * INTO v_fee_tx FROM public.platform_fee_transactions WHERE id = p_platform_fee_tx_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platform fee transaction % not found', p_platform_fee_tx_id;
  END IF;

  IF v_fee_tx.organization_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'Platform fee transaction does not belong to organization %', p_org_id;
  END IF;

  v_po_id := v_fee_tx.purchase_order_id;
  v_inv_id := v_fee_tx.invoice_id;
  v_base := COALESCE(v_fee_tx.gross_amount, 0);
  v_fee_rate := COALESCE(v_fee_tx.fee_rate, 0);
  v_reward_rate := 20.00;

  IF v_base <= 0 OR v_fee_rate < 0 OR v_reward_rate < 0 THEN
    RAISE EXCEPTION 'Platform fee transaction % is not eligible for reward credit', p_platform_fee_tx_id;
  END IF;

  v_fee_amount := round((v_base * v_fee_rate) / 100.0, 2);
  v_reward_amount := round((v_base * v_fee_rate * v_reward_rate) / 10000.0, 2);
  IF v_reward_amount > v_fee_amount THEN
    v_reward_amount := v_fee_amount;
  END IF;

  SELECT id, balance_credits INTO v_wallet_id, v_opening_bal
  FROM public.organization_wallets WHERE organization_id = p_org_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
    VALUES (p_org_id, 0.00, 'ACTIVE')
    RETURNING id, balance_credits INTO v_wallet_id, v_opening_bal;
  END IF;

  v_new_bal := v_opening_bal + v_reward_amount;
  UPDATE public.organization_wallets SET balance_credits = v_new_bal, updated_at = now() WHERE id = v_wallet_id;

  IF v_existing_alloc.id IS NOT NULL THEN
    UPDATE public.buyer_reward_allocations
    SET procurement_base_amount = v_base, fee_rate = v_fee_rate, fee_amount = v_fee_amount,
        reward_share_rate = v_reward_rate, reward_amount = v_reward_amount, status = 'CREDITED', updated_at = now()
    WHERE id = v_existing_alloc.id RETURNING id INTO v_alloc_id;
  ELSE
    INSERT INTO public.buyer_reward_allocations (
      organization_id, purchase_order_id, invoice_id, platform_fee_tx_id, settlement_id,
      procurement_base_amount, fee_rate, fee_amount, reward_share_rate, reward_amount, status
    ) VALUES (
      p_org_id, v_po_id, v_inv_id, p_platform_fee_tx_id, p_settlement_id,
      v_base, v_fee_rate, v_fee_amount, v_reward_rate, v_reward_amount, 'CREDITED'
    ) RETURNING id INTO v_alloc_id;
  END IF;

  INSERT INTO public.wallet_transactions (
    organization_id, wallet_id, tx_type, amount, opening_balance, closing_balance,
    source_entity_type, source_entity_id, idempotency_key, notes
  ) VALUES (
    p_org_id, v_wallet_id, 'REWARD_CREDIT', v_reward_amount, v_opening_bal, v_new_bal,
    'BUYER_REWARD_ALLOCATION', v_alloc_id, p_idempotency_key,
    'Buyer sourcing reward earned for settlement on PO ' || COALESCE(v_po_id::text, 'N/A')
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'buyer_reward.credited', 'organization_wallet', v_wallet_id::text, v_caller,
    jsonb_build_object(
      'organization_id', p_org_id, 'platform_fee_tx_id', p_platform_fee_tx_id,
      'reward_amount', v_reward_amount, 'transaction_id', v_tx_id, 'allocation_id', v_alloc_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'reward_amount', v_reward_amount, 'fee_amount', v_fee_amount,
    'opening_balance', v_opening_bal, 'closing_balance', v_new_bal,
    'wallet_id', v_wallet_id, 'transaction_id', v_tx_id, 'allocation_id', v_alloc_id,
    'message', 'Buyer sourcing reward credited successfully'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_buyer_settlement_reward_atomic(uuid, uuid, uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.credit_buyer_settlement_reward_atomic(uuid, uuid, uuid, numeric, numeric, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- N8: apply_wallet_credits_to_subscription_atomic — server tier pricing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_wallet_credits_to_subscription_atomic(
  p_org_id uuid,
  p_tier text,
  p_cycle text,
  p_credits_to_apply numeric,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_profile_id uuid := private.get_profile_id();
  v_required numeric(14, 2);
  v_wallet_id uuid;
  v_opening_bal numeric(14, 2);
  v_new_bal numeric(14, 2);
  v_tier_upper text := upper(btrim(p_tier));
  v_cycle_upper text := upper(btrim(p_cycle));
  v_validity_days integer;
  v_org record;
  v_now timestamptz := now();
  v_prev_expires timestamptz;
  v_new_expires timestamptz;
  v_tx_id uuid;
  v_existing_tx record;
BEGIN
  IF v_profile_id IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT private.is_platform_admin() AND COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id AND profile_id = v_profile_id
    ) THEN
      RAISE EXCEPTION 'Access denied: caller is not a member of organization %', p_org_id;
    END IF;
  END IF;

  v_required := private.subscription_wallet_credit_inr(v_tier_upper, v_cycle_upper);
  IF round(COALESCE(p_credits_to_apply, 0), 2) <> v_required THEN
    RAISE EXCEPTION 'Wallet redemption must equal catalog amount ₹% for % %, received ₹%',
      v_required, v_tier_upper, v_cycle_upper, p_credits_to_apply;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      SELECT subscription_expires_at INTO v_new_expires FROM public.organizations WHERE id = p_org_id;
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'credits_applied', v_existing_tx.amount,
        'opening_balance', v_existing_tx.opening_balance, 'remaining_balance', v_existing_tx.closing_balance,
        'new_expires_at', v_new_expires, 'transaction_id', v_existing_tx.id,
        'message', 'Subscription redemption already applied (idempotent response)');
    END IF;
  END IF;

  SELECT id, balance_credits INTO v_wallet_id, v_opening_bal
  FROM public.organization_wallets WHERE organization_id = p_org_id FOR UPDATE;
  IF NOT FOUND OR v_opening_bal < v_required THEN
    RAISE EXCEPTION 'Insufficient wallet balance for subscription redemption';
  END IF;

  v_new_bal := v_opening_bal - v_required;
  SELECT * INTO v_org FROM public.organizations WHERE id = p_org_id FOR UPDATE;
  v_validity_days := CASE WHEN v_cycle_upper = 'YEARLY' THEN 365 ELSE 30 END;
  v_prev_expires := v_org.subscription_expires_at;
  v_new_expires := CASE
    WHEN v_prev_expires IS NOT NULL AND v_prev_expires > v_now THEN v_prev_expires + (v_validity_days || ' days')::interval
    ELSE v_now + (v_validity_days || ' days')::interval
  END;

  UPDATE public.organization_wallets SET balance_credits = v_new_bal, updated_at = v_now WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    organization_id, wallet_id, tx_type, amount, opening_balance, closing_balance,
    source_entity_type, source_entity_id, idempotency_key, notes
  ) VALUES (
    p_org_id, v_wallet_id, 'SUBSCRIPTION_REDEMPTION', v_required, v_opening_bal, v_new_bal,
    'SUBSCRIPTION_PAYMENT', p_org_id, p_idempotency_key,
    'Redeemed wallet credits for ' || v_tier_upper || ' ' || v_cycle_upper
  ) RETURNING id INTO v_tx_id;

  UPDATE public.organizations
  SET subscription_tier = v_tier_upper, subscription_status = 'ACTIVE', subscription_plan = v_cycle_upper,
      subscription_started_at = COALESCE(subscription_started_at, v_now), subscription_expires_at = v_new_expires,
      payment_reference = 'WALLET-' || upper(substr(replace(v_tx_id::text, '-', ''), 1, 8)), updated_at = v_now
  WHERE id = p_org_id;

  INSERT INTO public.subscription_payment_logs (
    organization_id, profile_id, tier, billing_cycle, amount, currency, payment_method,
    upi_id, payment_reference, validity_days, previous_expires_at, new_expires_at, status
  ) VALUES (
    p_org_id, v_profile_id, v_tier_upper, v_cycle_upper, v_required, 'INR', 'WALLET_CREDITS',
    'wallet@otp', 'WALLET-' || upper(substr(replace(v_tx_id::text, '-', ''), 1, 8)),
    v_validity_days, v_prev_expires, v_new_expires, 'SUCCESS'
  );

  RETURN jsonb_build_object(
    'ok', true, 'credits_applied', v_required, 'opening_balance', v_opening_bal,
    'remaining_balance', v_new_bal, 'new_expires_at', v_new_expires, 'transaction_id', v_tx_id,
    'message', 'Subscription activated successfully using OTP Wallet Credits'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_wallet_credits_to_subscription_atomic(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_wallet_credits_to_subscription_atomic(uuid, text, text, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- N8 (payment path): process_subscription_payment — require catalog amount
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_subscription_payment(
  p_organization_id uuid,
  p_tier text,
  p_cycle text,
  p_amount numeric,
  p_payment_ref text,
  p_upi_id text DEFAULT 'pay@otp'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_org organizations%ROWTYPE;
  v_profile_id uuid := private.get_profile_id();
  v_now timestamptz := now();
  v_validity_days integer;
  v_prev_expires timestamptz;
  v_new_expires timestamptz;
  v_cycle_upper text := upper(btrim(p_cycle));
  v_tier_upper text := upper(btrim(p_tier));
  v_required numeric(14, 2);
BEGIN
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization % not found', p_organization_id; END IF;

  IF NOT private.is_platform_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id AND profile_id = v_profile_id
    ) THEN
      RAISE EXCEPTION 'Access denied: caller is not a member of organization %', p_organization_id;
    END IF;
  END IF;

  v_required := private.subscription_wallet_credit_inr(v_tier_upper, v_cycle_upper);
  IF round(COALESCE(p_amount, 0), 2) <> v_required THEN
    RAISE EXCEPTION 'Payment amount must equal catalog price ₹% for % %', v_required, v_tier_upper, v_cycle_upper;
  END IF;

  IF p_payment_ref IS NULL OR btrim(p_payment_ref) = '' THEN
    RAISE EXCEPTION 'Off-platform payment reference is required';
  END IF;

  v_validity_days := CASE WHEN v_cycle_upper = 'YEARLY' THEN 365 ELSE 30 END;
  v_prev_expires := v_org.subscription_expires_at;
  v_new_expires := CASE
    WHEN v_prev_expires IS NOT NULL AND v_prev_expires > v_now THEN v_prev_expires + (v_validity_days || ' days')::interval
    ELSE v_now + (v_validity_days || ' days')::interval
  END;

  UPDATE public.organizations
  SET subscription_tier = v_tier_upper, subscription_status = 'ACTIVE', subscription_plan = v_cycle_upper,
      subscription_started_at = COALESCE(subscription_started_at, v_now), subscription_expires_at = v_new_expires,
      payment_reference = p_payment_ref, updated_at = v_now
  WHERE id = p_organization_id;

  INSERT INTO public.subscription_payment_logs (
    organization_id, profile_id, tier, billing_cycle, amount, currency, payment_method,
    upi_id, payment_reference, validity_days, previous_expires_at, new_expires_at, status
  ) VALUES (
    p_organization_id, v_profile_id, v_tier_upper, v_cycle_upper, v_required, 'INR', 'UPI_QR',
    COALESCE(p_upi_id, 'pay@otp'), p_payment_ref, v_validity_days, v_prev_expires, v_new_expires, 'SUCCESS'
  );

  RETURN jsonb_build_object('ok', true, 'new_expires_at', v_new_expires, 'amount', v_required);
END;
$$;

REVOKE ALL ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) TO authenticated, service_role;


-- 2. Atomic Digital Sign-Off RPC: submit_rfq_tier_approval_atomic
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_rfq_tier_approval_atomic(
  p_rfq_id        uuid,
  p_tier_level    text,
  p_notes         text DEFAULT NULL,
  p_delegation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller_id          uuid;
  v_is_admin           boolean := false;
  v_rfq                public.rfqs%ROWTYPE;
  v_caller_role        text;
  v_policy             public.organization_approval_policies%ROWTYPE;
  v_route_eval         public.rfq_approval_route_evaluations%ROWTYPE;
  v_stage              public.rfq_approval_stages%ROWTYPE;
  v_prior_pending      integer := 0;
  v_sig_mode           text := 'DIRECT';
  v_delegation         public.organization_delegations%ROWTYPE;
  v_delegator_role     text;
  v_delegator_id       uuid := NULL;
  v_all_approved       boolean := false;
  v_now                timestamptz := now();
  v_required_perm      text;
  v_sig_hash           text;
BEGIN
  -- 1. Caller Authentication
  v_caller_id := private.get_profile_id();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller.';
  END IF;

  v_is_admin := private.is_platform_admin();

  -- 2. Lock & Fetch RFQ
  SELECT * INTO v_rfq
  FROM public.rfqs
  WHERE id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found.', p_rfq_id;
  END IF;

  -- 3. Tenant Isolation Check
  IF NOT v_is_admin THEN
    IF NOT private.is_org_member(v_rfq.organization_id) THEN
      RAISE EXCEPTION 'Cross-tenant violation: Caller does not belong to RFQ organization %.', v_rfq.organization_id;
    END IF;
  END IF;

  -- 4. Anti-Self-Approval Check (Direct)
  IF (v_rfq.created_by = v_caller_id) AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Anti-bypass policy violation: Procurement creator cannot approve their own RFQ.';
  END IF;

  -- 5. Lock & Fetch Target Stage
  SELECT * INTO v_stage
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND tier_level = p_tier_level
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval stage % not found for RFQ %.', p_tier_level, p_rfq_id;
  END IF;

  -- 6. No Replay Invariant: Stage must be PENDING
  IF v_stage.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Stage % is already APPROVED (replay prevented).', p_tier_level;
  END IF;

  IF v_stage.status != 'PENDING' THEN
    RAISE EXCEPTION 'Stage % is not in PENDING state (current: %).', p_tier_level, v_stage.status;
  END IF;

  -- 7. Sequential Progression Invariant: Prior stages must all be APPROVED
  SELECT COUNT(*) INTO v_prior_pending
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id
    AND stage_order < v_stage.stage_order
    AND status != 'APPROVED';

  IF v_prior_pending > 0 THEN
    RAISE EXCEPTION 'Sequential governance violation: Prior approval stage(s) are not yet approved.';
  END IF;

  -- Fetch caller base org role
  v_caller_role := COALESCE(private.get_org_role(v_rfq.organization_id)::text, 'COMMITTEE_MEMBER');

  -- 8. Authority & Delegation Validation
  IF p_delegation_id IS NOT NULL THEN
    v_sig_mode := 'DELEGATED';

    SELECT * INTO v_delegation
    FROM public.organization_delegations
    WHERE id = p_delegation_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Delegation proxy % not found.', p_delegation_id;
    END IF;

    -- Delegation Org Match
    IF v_delegation.organization_id != v_rfq.organization_id THEN
      RAISE EXCEPTION 'Delegation organization does not match RFQ organization.';
    END IF;

    -- Delegatee Match
    IF v_delegation.delegatee_id != v_caller_id THEN
      RAISE EXCEPTION 'Delegation proxy delegatee does not match authenticated caller.';
    END IF;

    -- Anti-Self-Delegation
    IF v_delegation.delegator_id = v_delegation.delegatee_id THEN
      RAISE EXCEPTION 'Self-delegation is prohibited.';
    END IF;

    -- Anti-Self-Approval via Proxy: RFQ Creator cannot be the delegator
    IF v_delegation.delegator_id = v_rfq.created_by THEN
      RAISE EXCEPTION 'Anti-bypass policy violation: RFQ creator cannot delegate authority to approve their own RFQ.';
    END IF;

    -- Active & Revocation Check
    IF NOT v_delegation.is_active OR v_delegation.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Delegation proxy is inactive or revoked.';
    END IF;

    -- Time Window Check
    IF v_now < v_delegation.starts_at THEN
      RAISE EXCEPTION 'Delegation proxy validity period has not started yet (starts at %).', v_delegation.starts_at;
    END IF;

    IF v_now > v_delegation.expires_at THEN
      RAISE EXCEPTION 'Delegation proxy has expired (expired at %).', v_delegation.expires_at;
    END IF;

    -- Spend Cap Check
    IF v_delegation.spend_cap_amount IS NOT NULL AND v_stage.procurement_amount > v_delegation.spend_cap_amount THEN
      RAISE EXCEPTION 'Delegation spend cap exceeded: RFQ amount ₹% exceeds spend cap ₹%.',
        v_stage.procurement_amount, v_delegation.spend_cap_amount;
    END IF;

    -- Permission Check
    v_required_perm := CASE p_tier_level
      WHEN 'TIER_1_MANAGER' THEN 'APPROVE_TIER_1'
      WHEN 'TIER_2_DEPT_HEAD' THEN 'APPROVE_TIER_2'
      WHEN 'TIER_3_EXECUTIVE' THEN 'APPROVE_TIER_3'
      ELSE 'APPROVE_TIER_1'
    END;

    IF NOT (v_required_perm = ANY(v_delegation.permissions)) THEN
      RAISE EXCEPTION 'Delegation proxy does not grant permission % for tier %.', v_required_perm, p_tier_level;
    END IF;

    -- Executive Gate Invariant: Tier 3 (>₹25L) cannot be delegated to non-executives
    IF p_tier_level = 'TIER_3_EXECUTIVE' THEN
      IF NOT (v_caller_role IN ('OWNER', 'DIRECTOR', 'EXECUTIVE', 'CFO') OR v_is_admin) THEN
        RAISE EXCEPTION 'Tier 3 Executive Gate (>₹25L) cannot be delegated to non-executive personnel.';
      END IF;
    END IF;

    v_delegator_id := v_delegation.delegator_id;
  ELSE
    -- Direct Role Authority Check
    v_sig_mode := 'DIRECT';

    IF p_tier_level = 'TIER_1_MANAGER' THEN
      IF NOT (v_caller_role IN ('BUYER', 'MANAGER', 'APPROVER', 'OWNER') OR v_is_admin) THEN
        RAISE EXCEPTION 'Unauthorized: Caller role % is not authorized for Tier 1 approval.', v_caller_role;
      END IF;
    ELSIF p_tier_level = 'TIER_2_DEPT_HEAD' THEN
      IF NOT (v_caller_role IN ('MANAGER', 'APPROVER', 'OWNER') OR v_is_admin) THEN
        RAISE EXCEPTION 'Unauthorized: Caller role % is not authorized for Tier 2 approval.', v_caller_role;
      END IF;
    ELSIF p_tier_level = 'TIER_3_EXECUTIVE' THEN
      IF NOT (v_caller_role IN ('OWNER') OR v_is_admin) THEN
        RAISE EXCEPTION 'Unauthorized: Caller role % is not authorized for Tier 3 Executive sign-off.', v_caller_role;
      END IF;
    END IF;
  END IF;

  -- 9. Compute Digital Signature Hash
  v_sig_hash := encode(digest(p_rfq_id::text || ':' || p_tier_level || ':' || v_caller_id::text || ':' || v_now::text, 'sha256'), 'hex');

  -- 10. Update Stage Record
  UPDATE public.rfq_approval_stages
  SET
    status = 'APPROVED',
    approver_profile_id = v_caller_id,
    approver_role = v_caller_role,
    approver_comments = p_notes,
    notes = p_notes,
    delegation_id = p_delegation_id,
    delegator_profile_id = v_delegator_id,
    signature_mode = v_sig_mode,
    digital_signature_hash = v_sig_hash,
    approved_at = v_now,
    updated_at = v_now
  WHERE id = v_stage.id;

  -- 11. Check if all stages for this RFQ are now approved
  SELECT bool_and(status = 'APPROVED') INTO v_all_approved
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id;

  -- 12. Append-Only Audit Logging
  INSERT INTO public.audit_events (
    event_type,
    actor_id,
    organization_id,
    entity_type,
    entity_id,
    payload
  ) VALUES (
    'rfq.tier_approved',
    v_caller_id,
    v_rfq.organization_id,
    'rfq_approval_stage',
    v_stage.id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'tier_level', p_tier_level,
      'stage_order', v_stage.stage_order,
      'signature_mode', v_sig_mode,
      'delegation_id', p_delegation_id,
      'delegator_profile_id', v_delegator_id,
      'procurement_amount', v_stage.procurement_amount,
      'all_stages_approved', v_all_approved,
      'approved_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'stageId', v_stage.id,
    'rfqId', p_rfq_id,
    'tierLevel', p_tier_level,
    'stageOrder', v_stage.stage_order,
    'status', 'APPROVED',
    'signatureMode', v_sig_mode,
    'approverProfileId', v_caller_id,
    'delegationId', p_delegation_id,
    'delegatorProfileId', v_delegator_id,
    'digitalSignatureHash', v_sig_hash,
    'allStagesApproved', v_all_approved
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rfq_tier_approval_atomic(uuid, text, text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Overloaded / Backwards-Compatible submit_rfq_tier_approval_atomic (stage_order)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_rfq_tier_approval_atomic(
  p_rfq_id        uuid,
  p_stage_order   integer,
  p_decision      text,
  p_comments      text DEFAULT NULL,
  p_signature_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_stage public.rfq_approval_stages%ROWTYPE;
BEGIN
  SELECT * INTO v_stage
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND stage_order = p_stage_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval stage order % not found for RFQ %.', p_stage_order, p_rfq_id;
  END IF;

  IF p_decision = 'APPROVED' THEN
    RETURN public.submit_rfq_tier_approval_atomic(p_rfq_id, v_stage.tier_level, p_comments, NULL);
  ELSE
    -- Handle rejection
    UPDATE public.rfq_approval_stages
    SET
      status = 'REJECTED',
      approver_profile_id = private.get_profile_id(),
      approver_role = COALESCE(private.get_org_role(v_stage.organization_id)::text, 'APPROVER'),
      approver_comments = p_comments,
      notes = p_comments,
      rejected_at = now(),
      updated_at = now()
    WHERE id = v_stage.id;

    RETURN jsonb_build_object(
      'ok', true,
      'stageId', v_stage.id,
      'rfqId', p_rfq_id,
      'tierLevel', v_stage.tier_level,
      'stageOrder', p_stage_order,
      'status', 'REJECTED'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_rfq_tier_approval_atomic(uuid, integer, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------


-- ---------------------------------------------------------------------------
-- N4: appoint_org_role_atomic — executive appointments OWNER-only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appoint_org_role_atomic(
  p_organization_id         uuid,
  p_person_id               uuid,
  p_role_id                 text,
  p_role_name               text,
  p_role_category           text DEFAULT 'RWA_GOVERNANCE',
  p_responsibility_scope    text DEFAULT 'GENERAL',
  p_authority_scope         jsonb DEFAULT '{}'::jsonb,
  p_effective_from          timestamptz DEFAULT now(),
  p_effective_to            timestamptz DEFAULT NULL,
  p_appointment_event       text DEFAULT 'DIRECT_APPOINTMENT',
  p_term_duration_days      integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_caller_role text;
  v_status text;
  v_assignment_id uuid;
  v_from timestamptz := COALESCE(p_effective_from, now());
  v_to timestamptz := p_effective_to;
  v_days int := COALESCE(p_term_duration_days, 365);
  v_exec_role boolean := p_role_id IN ('PRESIDENT', 'PRIMARY_OWNER', 'OWNER', 'VICE_PRESIDENT', 'SECRETARY', 'TREASURER');
BEGIN
  IF v_caller IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT om.role::text INTO v_caller_role
  FROM public.organization_members om
  WHERE om.profile_id = v_caller AND om.organization_id = p_organization_id;

  IF v_caller_role IS DISTINCT FROM 'OWNER' AND NOT private.is_platform_admin()
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    IF v_exec_role THEN
      RAISE EXCEPTION 'Only an Organization Owner or Platform Admin can appoint executive governance roles.';
    END IF;
    IF v_caller_role NOT IN ('MANAGER') THEN
      RAISE EXCEPTION 'Only an Organization Owner, Manager, or Platform Admin can appoint roles.';
    END IF;
  END IF;

  IF v_to IS NULL AND p_role_category = 'RWA_GOVERNANCE' THEN
    v_to := v_from + (v_days || ' days')::interval;
  END IF;

  IF p_person_id IS NULL THEN
    v_status := 'VACANT';
  ELSE
    v_status := 'ACTIVE';
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_person_id) THEN
      RAISE EXCEPTION 'Person profile % not found.', p_person_id;
    END IF;
  END IF;

  IF v_status = 'ACTIVE' THEN
    UPDATE public.org_role_assignments
    SET status = 'SUPERSEDED', effective_to = v_from, removal_event = 'SUPERSEDED_BY_NEW_APPOINTMENT',
        removal_reason = format('Superseded by appointment of %s', p_role_name), updated_at = now()
    WHERE organization_id = p_organization_id AND role_id = p_role_id AND status = 'ACTIVE'
      AND id <> COALESCE(v_assignment_id, '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  INSERT INTO public.org_role_assignments (
    organization_id, person_id, role_id, role_name, role_category, responsibility_scope,
    authority_scope, effective_from, effective_to, term_duration_days, status, appointed_by, appointment_event
  ) VALUES (
    p_organization_id, p_person_id, p_role_id, p_role_name, COALESCE(p_role_category, 'RWA_GOVERNANCE'),
    COALESCE(p_responsibility_scope, 'GENERAL'), COALESCE(p_authority_scope, '{}'::jsonb),
    v_from, v_to, v_days, v_status, v_caller, COALESCE(p_appointment_event, 'DIRECT_APPOINTMENT')
  ) RETURNING id INTO v_assignment_id;

  IF p_person_id IS NOT NULL THEN
    INSERT INTO public.organization_members (organization_id, profile_id, role)
    VALUES (
      p_organization_id, p_person_id,
      CASE
        WHEN p_role_id IN ('PRESIDENT', 'PRIMARY_OWNER', 'OWNER') THEN 'OWNER'::org_member_role
        WHEN p_role_id IN ('VICE_PRESIDENT', 'SECRETARY', 'TREASURER', 'MANAGER', 'ESTATE_MANAGER') THEN 'MANAGER'::org_member_role
        WHEN p_role_id IN ('BUYER', 'PROCUREMENT_LEAD') THEN 'BUYER'::org_member_role
        WHEN p_role_id IN ('FINANCE_APPROVER', 'APPROVER') THEN 'APPROVER'::org_member_role
        ELSE 'COMMITTEE_MEMBER'::org_member_role
      END
    ) ON CONFLICT (organization_id, profile_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;

  INSERT INTO public.org_governance_action_audits (
    actor_person_id, organization_id, role_assignment_id, role_at_time, responsibility_at_time,
    authority_at_time, action, entity_type, entity_id, payload
  ) VALUES (
    v_caller, p_organization_id, v_assignment_id, COALESCE(v_caller_role, 'PLATFORM_ADMIN'),
    'GOVERNANCE_APPOINTMENT', jsonb_build_object('appointedRoleId', p_role_id, 'appointedRoleName', p_role_name),
    'ROLE_APPOINTED', 'org_role_assignment', v_assignment_id::text,
    jsonb_build_object('assignmentId', v_assignment_id, 'roleId', p_role_id, 'personId', p_person_id, 'status', v_status)
  );

  RETURN jsonb_build_object('ok', true, 'assignmentId', v_assignment_id, 'roleId', p_role_id, 'status', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.appoint_org_role_atomic(uuid, uuid, text, text, text, text, jsonb, timestamptz, timestamptz, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appoint_org_role_atomic(uuid, uuid, text, text, text, text, jsonb, timestamptz, timestamptz, text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- N11: rfq_invitations_manager — expose decline_reason
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.rfq_invitations_manager CASCADE;
CREATE VIEW public.rfq_invitations_manager
WITH (security_barrier = true) AS
SELECT
  ri.id AS invitation_id,
  ri.rfq_id,
  ri.anonymous_label,
  ri.status,
  ri.match_score,
  ri.match_reasons,
  ri.invited_at,
  ri.viewed_at,
  ri.declined_at,
  CASE WHEN r.reveal_status = 'REVEALED' THEN ri.supplier_id ELSE NULL::uuid END AS supplier_id,
  ri.decline_reason
FROM public.rfq_invitations ri
JOIN public.rfqs r ON r.id = ri.rfq_id
WHERE private.is_org_manager_or_above(r.organization_id);

GRANT SELECT ON public.rfq_invitations_manager TO authenticated;

-- ---------------------------------------------------------------------------
-- N2: invoice balance_due on insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.init_invoice_balance_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.balance_due IS NULL OR NEW.balance_due = 0 THEN
      NEW.balance_due := GREATEST(0.00, COALESCE(NEW.amount, 0) - COALESCE(NEW.paid_amount, 0));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.init_invoice_balance_due() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_init_invoice_balance_due ON public.invoices;
CREATE TRIGGER trg_init_invoice_balance_due
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.init_invoice_balance_due();

-- ---------------------------------------------------------------------------
-- N3: supplier cannot self-approve invoice to APPROVED/PAID
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_invoice_supplier_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF private.is_supplier_user_for(OLD.supplier_id)
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('APPROVED', 'PAID', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Suppliers cannot mark invoices as approved or paid (INV-SUPPLIER-STATUS)';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_invoice_supplier_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_invoice_supplier_status ON public.invoices;
CREATE TRIGGER trg_guard_invoice_supplier_status
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.guard_invoice_supplier_status();

-- ---------------------------------------------------------------------------
-- N12: RFQ / PO status transition guards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_rfq_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'AWARDED' AND NEW.status <> OLD.status AND NEW.status NOT IN ('CANCELLED', 'CLOSED') THEN
      RAISE EXCEPTION 'Cannot regress RFQ status from AWARDED to %', NEW.status;
    END IF;
    IF NEW.status = 'AWARDED' AND OLD.status = 'OPEN' THEN
      RAISE EXCEPTION 'Cannot award RFQ while still OPEN without evaluation closure';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_rfq_status_transition() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_rfq_status ON public.rfqs;
CREATE TRIGGER trg_guard_rfq_status
  BEFORE UPDATE OF status ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.guard_rfq_status_transition();

CREATE OR REPLACE FUNCTION private.guard_po_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') IN ('service_role', '') OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND OLD.status IN ('COMPLETED', 'CANCELLED')
     AND NEW.status NOT IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot reopen purchase order from terminal status %', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_po_status_transition() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_po_status ON public.purchase_orders;
CREATE TRIGGER trg_guard_po_status
  BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_po_status_transition();

-- ---------------------------------------------------------------------------
-- N7: milestone inspection — server digest + buyer authorization on approve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_milestone_inspection_atomic(
  p_work_order_id uuid,
  p_milestone_id uuid,
  p_organization_id uuid,
  p_inspector_id uuid,
  p_inspection_type text,
  p_checklist_template_code text,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_inspection_id uuid;
  v_wo public.work_orders%ROWTYPE;
  v_milestone public.work_order_milestones%ROWTYPE;
  v_item jsonb;
  v_passed_count integer := 0;
  v_total_count integer := 0;
  v_overall_score numeric(5, 2) := 0.00;
  v_passed boolean := true;
  v_score_sum numeric(10, 2) := 0.00;
  v_profile uuid := private.get_profile_id();
  v_digest text;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order % not found', p_work_order_id; END IF;

  IF NOT private.is_supplier_user_for(v_wo.supplier_id) AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only the assigned supplier may submit milestone inspections';
  END IF;

  SELECT * INTO v_milestone FROM public.work_order_milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Milestone % not found', p_milestone_id; END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Inspection must include at least one checklist item';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_total_count := v_total_count + 1;
    IF (v_item->>'status') = 'PASSED' THEN v_passed_count := v_passed_count + 1;
    ELSIF (v_item->>'status') = 'FAILED' THEN v_passed := false; END IF;
    IF v_item ? 'score' AND (v_item->>'score') IS NOT NULL THEN
      v_score_sum := v_score_sum + (v_item->>'score')::numeric;
    END IF;
  END LOOP;
  IF v_total_count > 0 THEN v_overall_score := round(v_score_sum / v_total_count, 2); END IF;

  v_digest := encode(digest(p_work_order_id::text || ':' || p_milestone_id::text || ':' || p_items::text, 'sha256'), 'hex');

  INSERT INTO public.work_order_inspections (
    work_order_id, milestone_id, organization_id, inspector_id, inspection_type, status,
    checklist_template_code, overall_score, passed, notes, digital_signoff_hash
  ) VALUES (
    p_work_order_id, p_milestone_id, p_organization_id, COALESCE(v_profile, p_inspector_id),
    p_inspection_type, 'SUBMITTED', p_checklist_template_code, v_overall_score, v_passed, p_notes, v_digest
  ) RETURNING id INTO v_inspection_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.work_order_inspection_items (
      inspection_id, item_code, category, description, status, score, evidence_urls, evidence_metadata, notes
    ) VALUES (
      v_inspection_id, v_item->>'item_code', v_item->>'category', v_item->>'description', v_item->>'status',
      CASE WHEN v_item ? 'score' THEN (v_item->>'score')::numeric ELSE NULL END,
      CASE WHEN v_item ? 'evidence_urls' THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'evidence_urls')) ELSE '{}'::text[] END,
      COALESCE(v_item->'evidence_metadata', '[]'::jsonb), v_item->>'notes'
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'inspection_id', v_inspection_id, 'signoff_hash', v_digest);
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_milestone_inspection_atomic(
  p_inspection_id uuid,
  p_approver_id uuid,
  p_digital_signoff_hash text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_insp public.work_order_inspections%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
  v_profile uuid := private.get_profile_id();
BEGIN
  SELECT * INTO v_insp FROM public.work_order_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inspection % not found', p_inspection_id; END IF;

  SELECT po.* INTO v_po FROM public.work_orders wo
  JOIN public.purchase_orders po ON po.id = wo.purchase_order_id
  WHERE wo.id = v_insp.work_order_id;

  IF NOT private.is_org_member(v_po.organization_id) AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only authorized buyer organization members can approve milestone inspections';
  END IF;

  IF v_insp.status = 'APPROVED' THEN
    RETURN jsonb_build_object('success', true, 'idempotent_replay', true, 'inspection_id', p_inspection_id);
  END IF;

  IF v_insp.digital_signoff_hash IS NULL OR length(v_insp.digital_signoff_hash) < 16 THEN
    RAISE EXCEPTION 'Inspection is missing a server signoff digest';
  END IF;

  IF p_digital_signoff_hash IS NOT NULL AND p_digital_signoff_hash <> v_insp.digital_signoff_hash THEN
    RAISE EXCEPTION 'Signoff hash does not match server inspection digest';
  END IF;

  UPDATE public.work_order_inspections
  SET status = 'APPROVED', passed = true, approved_at = now(),
      notes = COALESCE(p_notes, notes), updated_at = now()
  WHERE id = p_inspection_id;

  UPDATE public.work_order_milestones
  SET status = 'VERIFIED_BY_BUYER', verified_at = now(), updated_at = now()
  WHERE id = v_insp.milestone_id;

  RETURN jsonb_build_object('success', true, 'inspection_id', p_inspection_id, 'signoff_hash', v_insp.digital_signoff_hash);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_milestone_inspection_atomic FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_milestone_inspection_atomic(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_milestone_inspection_atomic TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_milestone_inspection_atomic(uuid, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- N2: collapse record_invoice_payment_atomic to one signature; fix audit column
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.record_invoice_payment_atomic(uuid, numeric, public.payment_method, text, text, uuid, text, text);
DROP FUNCTION IF EXISTS public.record_invoice_payment_atomic(uuid, numeric, public.payment_method, text, text, uuid, text, text, uuid);

-- Re-create from 00175 with audit event_type and no p_allocated_by impersonation
CREATE OR REPLACE FUNCTION public.record_invoice_payment_atomic(
  p_invoice_id uuid,
  p_amount numeric(14, 2),
  p_method public.payment_method,
  p_reference text DEFAULT NULL,
  p_currency text DEFAULT 'INR',
  p_purchase_order_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_inv RECORD;
  v_po_id uuid := p_purchase_order_id;
  v_cur_bal_due numeric(14, 2);
  v_now timestamptz := now();
  v_payment_id uuid;
  v_allocation_id uuid;
  v_existing_payment_id uuid;
  v_final_inv RECORD;
  v_final_pay RECORD;
BEGIN
  IF v_caller_profile_id IS NULL AND NOT v_is_admin AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated (PAY-5C-AUTH)';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0.00 THEN
    RAISE EXCEPTION 'Payment amount must be strictly greater than 0 (PAY-5C-INVALID-AMOUNT)';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_payment_id FROM public.payments WHERE gateway_event_id = p_idempotency_key LIMIT 1;
    IF v_existing_payment_id IS NOT NULL THEN
      SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
      SELECT * INTO v_final_pay FROM public.payments WHERE id = v_existing_payment_id;
      RETURN jsonb_build_object('ok', true, 'idempotent_replay', true, 'payment_id', v_existing_payment_id,
        'invoice', jsonb_build_object('id', v_final_inv.id, 'balance_due', v_final_inv.balance_due, 'status', v_final_inv.status));
    END IF;
  END IF;

  SELECT id, amount, status, paid_amount, balance_due, purchase_order_id, work_order_id
  INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target Invoice % not found', p_invoice_id; END IF;

  IF v_inv.status NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
    RAISE EXCEPTION 'Invoice % is not payable in status %', p_invoice_id, v_inv.status;
  END IF;

  IF v_po_id IS NULL THEN
    v_po_id := COALESCE(v_inv.purchase_order_id,
      (SELECT purchase_order_id FROM public.work_orders WHERE id = v_inv.work_order_id));
  END IF;

  v_cur_bal_due := v_inv.balance_due;
  IF p_amount > v_cur_bal_due THEN
    RAISE EXCEPTION 'Payment amount exceeds invoice balance due';
  END IF;

  IF NOT v_is_admin AND COALESCE(auth.role(), '') <> 'service_role' THEN
    IF v_po_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = v_po_id AND private.get_org_role(po.organization_id) IN ('OWNER', 'MANAGER', 'APPROVER')
    ) THEN
      RAISE EXCEPTION 'Caller is not authorized to record payment for this invoice';
    END IF;
  END IF;

  INSERT INTO public.payments (
    invoice_id, purchase_order_id, amount, unallocated_amount, currency, method, status,
    reference, gateway_event_id, recorded_by, recorded_at
  ) VALUES (
    p_invoice_id, v_po_id, p_amount, 0.00, COALESCE(p_currency, 'INR'), p_method, 'RECORDED',
    p_reference, COALESCE(p_idempotency_key, p_reference), v_caller_profile_id, v_now
  ) RETURNING id INTO v_payment_id;

  INSERT INTO public.payment_allocations (
    payment_id, invoice_id, allocated_amount, allocated_at, status, allocated_by, notes
  ) VALUES (
    v_payment_id, p_invoice_id, p_amount, v_now, 'ALLOCATED', v_caller_profile_id, p_notes
  ) RETURNING id INTO v_allocation_id;

  SELECT * INTO v_final_inv FROM public.invoices WHERE id = p_invoice_id;
  SELECT * INTO v_final_pay FROM public.payments WHERE id = v_payment_id;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload, actor_id)
  VALUES ('PAYMENT_RECORDED_ATOMIC', 'PAYMENT', v_payment_id,
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount, 'allocation_id', v_allocation_id),
    v_caller_profile_id);

  RETURN jsonb_build_object('ok', true, 'payment_id', v_payment_id, 'allocation_id', v_allocation_id,
    'invoice', jsonb_build_object('id', v_final_inv.id, 'balance_due', v_final_inv.balance_due, 'status', v_final_inv.status));
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment_atomic(uuid, numeric, public.payment_method, text, text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment_atomic(uuid, numeric, public.payment_method, text, text, uuid, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- N1/N13: lock_and_reveal_award_atomic — quote/RFQ gates + RWA quorum (patch 00199 body)
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
AS $$
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
BEGIN
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found'); END IF;

  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (private.get_profile_id() IS NOT NULL AND COALESCE(private.is_org_manager_or_above(v_rfq.organization_id), false))
  ) THEN
    RAISE EXCEPTION 'Only an owner or manager of the buying organization can lock an award (AWARD-UNAUTHORIZED)';
  END IF;

  IF v_rfq.status = 'OPEN' THEN
    RAISE EXCEPTION 'Cannot lock award while RFQ is still OPEN';
  END IF;

  IF v_rfq.status NOT IN ('CLARIFICATION', 'CLOSED', 'EVALUATING', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;

  SELECT COUNT(*) INTO v_pending_stages FROM public.rfq_approval_stages WHERE rfq_id = p_rfq_id AND status != 'APPROVED';
  IF v_pending_stages > 0 THEN
    RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction.';
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_rfq.organization_id;

  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ'); END IF;

  IF v_quote.status = 'WITHDRAWN' THEN
    RAISE EXCEPTION 'Cannot award a withdrawn quote';
  END IF;

  IF v_org.org_type = 'COMMUNITY' THEN
    SELECT COUNT(DISTINCT cv.profile_id) INTO v_vote_count
    FROM public.committee_votes cv
    WHERE cv.rfq_id = p_rfq_id
      AND cv.recommended_quote_id = p_quote_id
      AND cv.choice = 'RECOMMEND'::public.vote_choice
      AND NOT EXISTS (
        SELECT 1 FROM public.conflict_of_interest_declarations coi
        WHERE coi.rfq_id = p_rfq_id AND coi.profile_id = cv.profile_id AND coi.status = 'DECLARED_CONFLICT'
      );

    IF v_vote_count < 2 THEN
      RAISE EXCEPTION 'Committee quorum not met: at least 2 unconflicted votes required for this award';
    END IF;
  END IF;

  SELECT * INTO v_supplier FROM public.suppliers WHERE id = v_quote.supplier_id;
  IF v_supplier.lifecycle_state = 'VERIFIED' AND v_supplier.verification_status = 'VERIFIED' THEN
    v_can_reveal := p_auto_reveal;
  ELSE
    v_can_reveal := false;
    IF v_supplier.lifecycle_state = 'QUOTE_PARTICIPANT' THEN
      UPDATE public.suppliers SET lifecycle_state = 'ONBOARDING_REQUIRED', updated_at = v_now WHERE id = v_supplier.id;
    END IF;
  END IF;

  SELECT * INTO v_existing_award FROM public.awards WHERE rfq_id = p_rfq_id;
  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    SELECT jsonb_build_object('locked_at', v_now, 'votes', COALESCE(jsonb_agg(jsonb_build_object(
      'quote_id', v.recommended_quote_id, 'choice', v.choice, 'voting_power', v.voting_power)), '[]'::jsonb))
    INTO v_tally
    FROM (
      SELECT DISTINCT ON (cv.profile_id) cv.* FROM public.committee_votes cv
      WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
      ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
    ) v;

    INSERT INTO public.awards (rfq_id, quote_id, awarded_by, justification, status, awarded_at, revealed_at, votes_locked_at, vote_snapshot)
    VALUES (
      p_rfq_id, p_quote_id, COALESCE(private.get_profile_id(), v_rfq.created_by),
      jsonb_build_object('text', p_justification),
      CASE WHEN v_can_reveal THEN 'REVEALED'::public.award_status ELSE 'PENDING_REVEAL'::public.award_status END,
      v_now, CASE WHEN v_can_reveal THEN v_now ELSE NULL END, v_now, COALESCE(v_tally, '{}'::jsonb)
    ) RETURNING id INTO v_award_id;
  END IF;

  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;
  UPDATE rfqs SET status = 'AWARDED',
    reveal_status = CASE WHEN v_can_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;

  PERFORM private.notify_bidders_of_outcome(p_rfq_id);

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

    RETURN jsonb_build_object('ok', true, 'award_id', v_award_id, 'revealed', true, 'po_id', v_po_id,
      'business_name', v_business, 'contact_phone', v_phone, 'contact_email', v_email);
  END IF;

  RETURN jsonb_build_object('ok', true, 'award_id', v_award_id, 'revealed', false,
    'supplier_verification_required', (v_supplier.lifecycle_state <> 'VERIFIED'));
END;
$$;

REVOKE ALL ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_purchase_order_from_award(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_from_award(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reveal_award(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_award(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Anon EXECUTE allowlist (defence in depth after 00194 blanket grant)
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM anon;

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_profile_verification_otp(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_whatsapp_password_reset(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.platform_heartbeat() TO anon;
-- Public signup form reads (no PII); required before authenticated session exists.
GRANT EXECUTE ON FUNCTION public.service_categories() TO anon;
GRANT EXECUTE ON FUNCTION public.served_cities() TO anon;

-- ---------------------------------------------------------------------------
-- COI: align SQL with domain ERR_COI_RECUSAL (DECLARED_CONFLICT recusal)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cast_committee_vote(
  p_rfq_id uuid,
  p_recommended_quote_id uuid,
  p_choice vote_choice,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_profile uuid;
  v_previous uuid;
  v_vote_id uuid;
BEGIN
  v_profile := private.get_profile_id();
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.conflict_of_interest_declarations coi
    WHERE coi.rfq_id = p_rfq_id AND coi.profile_id = v_profile AND coi.status = 'DECLARED_CONFLICT'
  ) THEN
    RAISE EXCEPTION 'Voter has declared a Conflict of Interest (COI) and is recused from voting on this RFQ.';
  END IF;

  IF NOT private.can_access_rfq_as_committee(p_rfq_id)
     AND NOT private.is_org_manager_or_above(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'You are not on this evaluation committee';
  END IF;

  IF EXISTS (SELECT 1 FROM awards WHERE rfq_id = p_rfq_id) THEN
    RAISE EXCEPTION 'Voting is closed: the award for this RFQ is locked';
  END IF;

  IF v_rfq.status NOT IN ('EVALUATING', 'CLARIFICATION', 'CLOSED') THEN
    RAISE EXCEPTION 'Voting is open only while the RFQ is under evaluation (currently %)', v_rfq.status;
  END IF;

  IF p_choice = 'RECOMMEND' THEN
    IF p_recommended_quote_id IS NULL THEN
      RAISE EXCEPTION 'A recommendation must name a quote';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM quotes
      WHERE id = p_recommended_quote_id AND rfq_id = p_rfq_id AND status NOT IN ('DRAFT', 'WITHDRAWN')
    ) THEN
      RAISE EXCEPTION 'That quote is not open for recommendation on this RFQ';
    END IF;
  END IF;

  SELECT id INTO v_previous FROM private.current_votes(p_rfq_id) cv WHERE cv.profile_id = v_profile;

  INSERT INTO committee_votes (rfq_id, profile_id, recommended_quote_id, choice, comment, cast_at)
  VALUES (
    p_rfq_id, v_profile, p_recommended_quote_id, p_choice, p_comment,
    GREATEST(clock_timestamp(), COALESCE(
      (SELECT max(cv.cast_at) + interval '10 milliseconds' FROM committee_votes cv
       WHERE cv.rfq_id = p_rfq_id AND cv.profile_id = v_profile), clock_timestamp()))
  ) RETURNING id INTO v_vote_id;

  INSERT INTO audit_events (event_type, actor_id, organization_id, entity_type, entity_id, payload)
  VALUES (
    CASE WHEN v_previous IS NULL THEN 'vote.cast' ELSE 'vote.revised' END,
    v_profile, v_rfq.organization_id, 'rfq', p_rfq_id::text,
    jsonb_build_object('vote_id', v_vote_id, 'choice', p_choice, 'recommended_quote_id', p_recommended_quote_id)
  );

  RETURN jsonb_build_object('vote_id', v_vote_id, 'supersedes', v_previous, 'revised', v_previous IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.cast_committee_vote(uuid, uuid, vote_choice, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cast_committee_vote(uuid, uuid, vote_choice, text) TO authenticated, service_role;

COMMIT;
