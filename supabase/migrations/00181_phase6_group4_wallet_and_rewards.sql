-- =============================================================================
-- Migration 00181: Phase 6 Group 4 — Commercial Policy: Supplier Platform Fee,
-- Buyer Sourcing Rewards, Buyer Organization Wallet & Future Buyer Subscription
--
-- Features:
--   1. public.organization_wallets: Multi-tenant Buyer Wallet for earning & redeeming credits.
--   2. public.wallet_transactions: Append-only immutable ledger of wallet operations.
--   3. public.buyer_reward_allocations: Sourcing reward tracking tied to platform fee transactions.
--   4. Atomic RPCs:
--      - public.credit_buyer_settlement_reward_atomic(...)
--      - public.apply_wallet_credits_to_subscription_atomic(...)
--      - public.get_organization_wallet(...)
--      - public.get_wallet_transactions(...)
--   5. Multi-Tenant RLS & Immutability Triggers.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create public.organization_wallets Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_wallets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance_credits     numeric(14, 2) NOT NULL DEFAULT 0.00 CHECK (balance_credits >= 0),
  status              text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'SUSPENDED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_wallets_org_id ON public.organization_wallets(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_wallets_status ON public.organization_wallets(status);

DROP TRIGGER IF EXISTS trg_org_wallets_updated_at ON public.organization_wallets;
CREATE TRIGGER trg_org_wallets_updated_at
  BEFORE UPDATE ON public.organization_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Create public.wallet_transactions Table (Append-Only Ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  wallet_id           uuid NOT NULL REFERENCES public.organization_wallets(id) ON DELETE CASCADE,
  tx_type             text NOT NULL CHECK (tx_type IN ('REWARD_CREDIT', 'SUBSCRIPTION_REDEMPTION', 'REVERSAL', 'ADJUSTMENT', 'EXPIRY')),
  amount              numeric(14, 2) NOT NULL CHECK (amount > 0),
  opening_balance     numeric(14, 2) NOT NULL CHECK (opening_balance >= 0),
  closing_balance     numeric(14, 2) NOT NULL CHECK (closing_balance >= 0),
  source_entity_type  text NOT NULL,
  source_entity_id    uuid,
  idempotency_key     text UNIQUE,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_org_id ON public.wallet_transactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet_id ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_idempotency ON public.wallet_transactions(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON public.wallet_transactions(created_at DESC);

-- Prevent UPDATE or DELETE on wallet_transactions (append-only ledger immutability)
CREATE OR REPLACE FUNCTION private.trg_prevent_wallet_tx_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  RAISE EXCEPTION 'Wallet transaction ledger entries are strictly immutable and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_tx_immutable ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_tx_immutable
  BEFORE UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION private.trg_prevent_wallet_tx_mutation();

-- ---------------------------------------------------------------------------
-- 3. Create public.buyer_reward_allocations Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buyer_reward_allocations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  purchase_order_id       uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  invoice_id               uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  platform_fee_tx_id      uuid UNIQUE REFERENCES public.platform_fee_transactions(id) ON DELETE RESTRICT,
  settlement_id           uuid,
  procurement_base_amount numeric(14, 2) NOT NULL CHECK (procurement_base_amount >= 0),
  fee_rate                numeric(5, 2) NOT NULL CHECK (fee_rate >= 0 AND fee_rate <= 100),
  fee_amount              numeric(14, 2) NOT NULL CHECK (fee_amount >= 0),
  reward_share_rate       numeric(5, 2) NOT NULL CHECK (reward_share_rate >= 0 AND reward_share_rate <= 100),
  reward_amount           numeric(14, 2) NOT NULL CHECK (reward_amount >= 0),
  status                  text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CREDITED', 'REVERSED')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_buyer_reward_alloc_org ON public.buyer_reward_allocations(organization_id);
CREATE INDEX IF NOT EXISTS idx_buyer_reward_alloc_fee_tx ON public.buyer_reward_allocations(platform_fee_tx_id);
CREATE INDEX IF NOT EXISTS idx_buyer_reward_alloc_po ON public.buyer_reward_allocations(purchase_order_id);

DROP TRIGGER IF EXISTS trg_buyer_reward_allocations_updated_at ON public.buyer_reward_allocations;
CREATE TRIGGER trg_buyer_reward_allocations_updated_at
  BEFORE UPDATE ON public.buyer_reward_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Enable Multi-Tenant Row Level Security & Hardening
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_wallets FORCE ROW LEVEL SECURITY;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.buyer_reward_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_reward_allocations FORCE ROW LEVEL SECURITY;

-- SELECT Policies: Org Members or Platform Admin
DROP POLICY IF EXISTS org_wallets_select ON public.organization_wallets;
CREATE POLICY org_wallets_select ON public.organization_wallets
  FOR SELECT
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS wallet_tx_select ON public.wallet_transactions;
CREATE POLICY wallet_tx_select ON public.wallet_transactions
  FOR SELECT
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR private.is_platform_admin()
  );

DROP POLICY IF EXISTS buyer_reward_alloc_select ON public.buyer_reward_allocations;
CREATE POLICY buyer_reward_alloc_select ON public.buyer_reward_allocations
  FOR SELECT
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR private.is_platform_admin()
  );

-- MUTATE Policies: Strict Platform Admin only (Direct mutations blocked for users; mutations must use atomic RPCs)
DROP POLICY IF EXISTS org_wallets_mutate ON public.organization_wallets;
CREATE POLICY org_wallets_mutate ON public.organization_wallets
  FOR ALL
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS wallet_tx_mutate ON public.wallet_transactions;
CREATE POLICY wallet_tx_mutate ON public.wallet_transactions
  FOR ALL
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

DROP POLICY IF EXISTS buyer_reward_alloc_mutate ON public.buyer_reward_allocations;
CREATE POLICY buyer_reward_alloc_mutate ON public.buyer_reward_allocations
  FOR ALL
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 5. Backfill Existing Buyer Organizations with Wallets
-- ---------------------------------------------------------------------------
INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
SELECT id, 0.00, 'ACTIVE'
FROM public.organizations
ON CONFLICT (organization_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Atomic RPC: credit_buyer_settlement_reward_atomic
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
  v_wallet_id         uuid;
  v_opening_bal       numeric(14, 2);
  v_new_bal           numeric(14, 2);
  v_fee_amount        numeric(14, 2);
  v_reward_amount     numeric(14, 2);
  v_tx_id             uuid;
  v_alloc_id          uuid;
  v_fee_tx            record;
  v_po_id             uuid;
  v_inv_id            uuid;
  v_existing_tx       record;
  v_existing_alloc    record;
BEGIN
  -- 1. Idempotency check via idempotency key
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx
    FROM public.wallet_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      SELECT * INTO v_existing_alloc
      FROM public.buyer_reward_allocations
      WHERE platform_fee_tx_id = p_platform_fee_tx_id;

      RETURN jsonb_build_object(
        'ok', true,
        'replayed', true,
        'transaction_id', v_existing_tx.id,
        'wallet_id', v_existing_tx.wallet_id,
        'reward_amount', v_existing_tx.amount,
        'opening_balance', v_existing_tx.opening_balance,
        'closing_balance', v_existing_tx.closing_balance,
        'allocation_id', v_existing_alloc.id,
        'message', 'Reward credit already processed (idempotent response)'
      );
    END IF;
  END IF;

  -- 2. Check if reward allocation already exists for this platform fee transaction
  SELECT * INTO v_existing_alloc
  FROM public.buyer_reward_allocations
  WHERE platform_fee_tx_id = p_platform_fee_tx_id;

  IF FOUND AND v_existing_alloc.status = 'CREDITED' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'replayed', true,
      'allocation_id', v_existing_alloc.id,
      'reward_amount', v_existing_alloc.reward_amount,
      'message', 'Reward allocation already credited for this platform fee transaction'
    );
  END IF;

  -- 3. Inspect platform fee transaction if present in database
  IF p_platform_fee_tx_id IS NOT NULL THEN
    SELECT * INTO v_fee_tx
    FROM public.platform_fee_transactions
    WHERE id = p_platform_fee_tx_id;

    IF FOUND THEN
      v_po_id := v_fee_tx.purchase_order_id;
      v_inv_id := v_fee_tx.invoice_id;
      IF p_base_amount <= 0 THEN
        p_base_amount := v_fee_tx.gross_amount;
      END IF;
      IF p_fee_rate <= 0 THEN
        p_fee_rate := v_fee_tx.fee_rate;
      END IF;
    END IF;
  END IF;

  -- 4. Validate calculations
  IF p_base_amount <= 0 THEN
    RAISE EXCEPTION 'Procurement base amount must be greater than zero, received %', p_base_amount;
  END IF;

  IF p_fee_rate < 0 OR p_fee_rate > 100 THEN
    RAISE EXCEPTION 'Invalid platform fee rate %, must be between 0 and 100', p_fee_rate;
  END IF;

  IF p_reward_share_rate < 0 OR p_reward_share_rate > 100 THEN
    RAISE EXCEPTION 'Invalid buyer reward share rate %, must be between 0 and 100', p_reward_share_rate;
  END IF;

  -- Exact paise rounding
  v_fee_amount := round((p_base_amount * p_fee_rate) / 100.0, 2);
  v_reward_amount := round((p_base_amount * p_fee_rate * p_reward_share_rate) / 10000.0, 2);

  -- Invariant: reward cannot exceed fee collected
  IF v_reward_amount > v_fee_amount THEN
    v_reward_amount := v_fee_amount;
  END IF;

  -- 5. Lock or create buyer organization wallet
  SELECT id, balance_credits INTO v_wallet_id, v_opening_bal
  FROM public.organization_wallets
  WHERE organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
    VALUES (p_org_id, 0.00, 'ACTIVE')
    RETURNING id, balance_credits INTO v_wallet_id, v_opening_bal;
  END IF;

  v_new_bal := v_opening_bal + v_reward_amount;

  -- 6. Update wallet balance
  UPDATE public.organization_wallets
  SET balance_credits = v_new_bal,
      updated_at = now()
  WHERE id = v_wallet_id;

  -- 7. Insert allocation record
  IF v_existing_alloc.id IS NOT NULL THEN
    UPDATE public.buyer_reward_allocations
    SET procurement_base_amount = p_base_amount,
        fee_rate = p_fee_rate,
        fee_amount = v_fee_amount,
        reward_share_rate = p_reward_share_rate,
        reward_amount = v_reward_amount,
        status = 'CREDITED',
        updated_at = now()
    WHERE id = v_existing_alloc.id
    RETURNING id INTO v_alloc_id;
  ELSE
    INSERT INTO public.buyer_reward_allocations (
      organization_id,
      purchase_order_id,
      invoice_id,
      platform_fee_tx_id,
      settlement_id,
      procurement_base_amount,
      fee_rate,
      fee_amount,
      reward_share_rate,
      reward_amount,
      status
    ) VALUES (
      p_org_id,
      v_po_id,
      v_inv_id,
      p_platform_fee_tx_id,
      p_settlement_id,
      p_base_amount,
      p_fee_rate,
      v_fee_amount,
      p_reward_share_rate,
      v_reward_amount,
      'CREDITED'
    )
    RETURNING id INTO v_alloc_id;
  END IF;

  -- 8. Append to immutable wallet transaction ledger
  INSERT INTO public.wallet_transactions (
    organization_id,
    wallet_id,
    tx_type,
    amount,
    opening_balance,
    closing_balance,
    source_entity_type,
    source_entity_id,
    idempotency_key,
    notes
  ) VALUES (
    p_org_id,
    v_wallet_id,
    'REWARD_CREDIT',
    v_reward_amount,
    v_opening_bal,
    v_new_bal,
    'BUYER_REWARD_ALLOCATION',
    v_alloc_id,
    p_idempotency_key,
    'Buyer sourcing reward earned for settlement on PO ' || COALESCE(v_po_id::text, 'N/A')
  )
  RETURNING id INTO v_tx_id;

  -- 9. Emit audit event
  INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload)
  VALUES (
    'buyer_reward.credited',
    'organization_wallet',
    v_wallet_id::text,
    jsonb_build_object(
      'organization_id', p_org_id,
      'platform_fee_tx_id', p_platform_fee_tx_id,
      'settlement_id', p_settlement_id,
      'procurement_base_amount', p_base_amount,
      'fee_amount', v_fee_amount,
      'reward_amount', v_reward_amount,
      'opening_balance', v_opening_bal,
      'closing_balance', v_new_bal,
      'transaction_id', v_tx_id,
      'allocation_id', v_alloc_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'reward_amount', v_reward_amount,
    'fee_amount', v_fee_amount,
    'opening_balance', v_opening_bal,
    'closing_balance', v_new_bal,
    'wallet_id', v_wallet_id,
    'transaction_id', v_tx_id,
    'allocation_id', v_alloc_id,
    'message', 'Buyer sourcing reward credited successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_buyer_settlement_reward_atomic(uuid, uuid, uuid, numeric, numeric, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Atomic RPC: apply_wallet_credits_to_subscription_atomic
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
  v_profile_id        uuid;
  v_wallet_id         uuid;
  v_opening_bal       numeric(14, 2);
  v_new_bal           numeric(14, 2);
  v_tier_upper        text := upper(btrim(p_tier));
  v_cycle_upper       text := upper(btrim(p_cycle));
  v_validity_days     integer;
  v_org               record;
  v_now               timestamptz := now();
  v_prev_expires      timestamptz;
  v_new_expires       timestamptz;
  v_tx_id             uuid;
  v_existing_tx       record;
BEGIN
  v_profile_id := private.get_profile_id();

  -- 1. Authorization check: caller must be member of organization or platform admin
  IF NOT private.is_platform_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id AND profile_id = v_profile_id
    ) THEN
      RAISE EXCEPTION 'Access denied: caller is not a member of organization %', p_org_id;
    END IF;
  END IF;

  -- 2. Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx
    FROM public.wallet_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      SELECT subscription_expires_at INTO v_new_expires
      FROM public.organizations
      WHERE id = p_org_id;

      RETURN jsonb_build_object(
        'ok', true,
        'replayed', true,
        'credits_applied', v_existing_tx.amount,
        'opening_balance', v_existing_tx.opening_balance,
        'remaining_balance', v_existing_tx.closing_balance,
        'new_expires_at', v_new_expires,
        'transaction_id', v_existing_tx.id,
        'message', 'Subscription redemption already applied (idempotent response)'
      );
    END IF;
  END IF;

  -- 3. Parameter validation
  IF p_credits_to_apply <= 0 THEN
    RAISE EXCEPTION 'Credits to apply must be greater than zero, received %', p_credits_to_apply;
  END IF;

  p_credits_to_apply := round(p_credits_to_apply, 2);

  -- 4. Lock organization wallet and check balance
  SELECT id, balance_credits INTO v_wallet_id, v_opening_bal
  FROM public.organization_wallets
  WHERE organization_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization wallet not found for %', p_org_id;
  END IF;

  IF v_opening_bal < p_credits_to_apply THEN
    RAISE EXCEPTION 'Insufficient wallet balance: available ₹%, requested ₹%',
      v_opening_bal, p_credits_to_apply;
  END IF;

  v_new_bal := v_opening_bal - p_credits_to_apply;

  -- 5. Lock organization record for subscription update
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found', p_org_id;
  END IF;

  -- 6. Calculate subscription extension
  IF v_cycle_upper = 'YEARLY' THEN
    v_validity_days := 365;
  ELSE
    v_validity_days := 30;
  END IF;

  v_prev_expires := v_org.subscription_expires_at;

  IF v_prev_expires IS NOT NULL AND v_prev_expires > v_now THEN
    v_new_expires := v_prev_expires + (v_validity_days || ' days')::interval;
  ELSE
    v_new_expires := v_now + (v_validity_days || ' days')::interval;
  END IF;

  -- 7. Debit organization wallet
  UPDATE public.organization_wallets
  SET balance_credits = v_new_bal,
      updated_at = v_now
  WHERE id = v_wallet_id;

  -- 8. Append to immutable transaction ledger
  INSERT INTO public.wallet_transactions (
    organization_id,
    wallet_id,
    tx_type,
    amount,
    opening_balance,
    closing_balance,
    source_entity_type,
    source_entity_id,
    idempotency_key,
    notes
  ) VALUES (
    p_org_id,
    v_wallet_id,
    'SUBSCRIPTION_REDEMPTION',
    p_credits_to_apply,
    v_opening_bal,
    v_new_bal,
    'SUBSCRIPTION_PAYMENT',
    p_org_id,
    p_idempotency_key,
    'Redeemed ₹' || p_credits_to_apply || ' OTP Wallet Credits for ' || v_tier_upper || ' ' || v_cycle_upper || ' subscription'
  )
  RETURNING id INTO v_tx_id;

  -- 9. Update organization subscription state
  UPDATE public.organizations
  SET subscription_tier = v_tier_upper,
      subscription_status = 'ACTIVE',
      subscription_plan = v_cycle_upper,
      subscription_started_at = COALESCE(subscription_started_at, v_now),
      subscription_expires_at = v_new_expires,
      payment_reference = 'WALLET-' || upper(substr(replace(v_tx_id::text, '-', ''), 1, 8)),
      updated_at = v_now
  WHERE id = p_org_id;

  -- 10. Record in subscription payment logs
  INSERT INTO public.subscription_payment_logs (
    organization_id,
    profile_id,
    tier,
    billing_cycle,
    amount,
    currency,
    payment_method,
    upi_id,
    payment_reference,
    validity_days,
    previous_expires_at,
    new_expires_at,
    status
  ) VALUES (
    p_org_id,
    v_profile_id,
    v_tier_upper,
    v_cycle_upper,
    p_credits_to_apply,
    'INR',
    'WALLET_CREDITS',
    'wallet@otp',
    'WALLET-' || upper(substr(replace(v_tx_id::text, '-', ''), 1, 8)),
    v_validity_days,
    v_prev_expires,
    v_new_expires,
    'SUCCESS'
  );

  -- 11. Emit audit event
  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'subscription.wallet_redeemed',
    'organization',
    p_org_id::text,
    v_profile_id,
    jsonb_build_object(
      'tier', v_tier_upper,
      'cycle', v_cycle_upper,
      'credits_redeemed', p_credits_to_apply,
      'opening_balance', v_opening_bal,
      'remaining_balance', v_new_bal,
      'new_expires_at', v_new_expires,
      'wallet_transaction_id', v_tx_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'credits_applied', p_credits_to_apply,
    'opening_balance', v_opening_bal,
    'remaining_balance', v_new_bal,
    'new_expires_at', v_new_expires,
    'validity_days_added', v_validity_days,
    'transaction_id', v_tx_id,
    'message', 'Subscription activated successfully using OTP Wallet Credits'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_wallet_credits_to_subscription_atomic(uuid, text, text, numeric, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Read Model RPC: get_organization_wallet
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_organization_wallet(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_wallet organization_wallets%ROWTYPE;
BEGIN
  -- Verify caller is a member of this organization or platform admin
  IF NOT private.is_platform_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id AND profile_id = private.get_profile_id()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Access denied: caller is not a member of organization');
    END IF;
  END IF;

  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
    -- Ensure wallet exists with 0 balance
    INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
    VALUES (p_organization_id, 0.00, 'ACTIVE')
    ON CONFLICT (organization_id) DO UPDATE SET updated_at = now()
    RETURNING * INTO v_wallet;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'wallet_id', v_wallet.id,
    'organization_id', v_wallet.organization_id,
    'balance_credits', v_wallet.balance_credits,
    'status', v_wallet.status,
    'created_at', v_wallet.created_at,
    'updated_at', v_wallet.updated_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_wallet(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Read Model RPC: get_wallet_transactions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wallet_transactions(
  p_organization_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_records jsonb;
BEGIN
  -- Verify caller is a member of this organization or platform admin
  IF NOT private.is_platform_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id AND profile_id = private.get_profile_id()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Access denied: caller is not a member of organization');
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'organization_id', t.organization_id,
      'wallet_id', t.wallet_id,
      'tx_type', t.tx_type,
      'amount', t.amount,
      'opening_balance', t.opening_balance,
      'closing_balance', t.closing_balance,
      'source_entity_type', t.source_entity_type,
      'source_entity_id', t.source_entity_id,
      'idempotency_key', t.idempotency_key,
      'notes', t.notes,
      'created_at', t.created_at
    ) ORDER BY t.created_at DESC
  ), '[]'::jsonb) INTO v_records
  FROM (
    SELECT *
    FROM public.wallet_transactions
    WHERE organization_id = p_organization_id
    ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(1, p_limit), 200)
    OFFSET GREATEST(0, p_offset)
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'organization_id', p_organization_id,
    'transactions', v_records
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_wallet_transactions(uuid, integer, integer) TO authenticated, service_role;

COMMIT;
