-- Human platform administration must not read or change customer procurement wallets.
-- service_role and database superuser sessions keep the existing ledger paths.
-- Referral display is unchanged. This does not add a reward.

BEGIN;

CREATE OR REPLACE FUNCTION private.is_human_platform_wallet_denied()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_role text := COALESCE(auth.role(), '');
  v_jwt_role text;
BEGIN
  IF v_role = 'service_role' THEN
    RETURN false;
  END IF;

  BEGIN
    v_jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
    IF v_jwt_role = 'service_role' THEN
      RETURN false;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := NULL;
  END;

  IF auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin') THEN
    RETURN false;
  END IF;

  IF private.is_founder() THEN
    RETURN true;
  END IF;

  IF private.is_platform_admin() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.is_human_platform_wallet_denied() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_human_platform_wallet_denied() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_organization_wallet(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_wallet organization_wallets%ROWTYPE;
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF private.is_human_platform_wallet_denied() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'PLATFORM_WALLET_DENIED: platform administration cannot use the customer procurement wallet'
    );
  END IF;

  IF v_role <> 'service_role'
     AND NOT (auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin'))
     AND NOT EXISTS (
       SELECT 1 FROM public.organization_members
       WHERE organization_id = p_organization_id AND profile_id = private.get_profile_id()
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied: caller is not a member of organization');
  END IF;

  SELECT * INTO v_wallet
  FROM public.organization_wallets
  WHERE organization_id = p_organization_id;

  IF NOT FOUND THEN
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
  v_role text := COALESCE(auth.role(), '');
BEGIN
  IF private.is_human_platform_wallet_denied() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'PLATFORM_WALLET_DENIED: platform administration cannot use the customer procurement wallet'
    );
  END IF;

  IF v_role <> 'service_role'
     AND NOT (auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin'))
     AND NOT EXISTS (
       SELECT 1 FROM public.organization_members
       WHERE organization_id = p_organization_id AND profile_id = private.get_profile_id()
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied: caller is not a member of organization');
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
  IF private.is_human_platform_wallet_denied() THEN
    RAISE EXCEPTION 'PLATFORM_WALLET_DENIED: platform administration cannot use the customer procurement wallet';
  END IF;

  -- service_role keeps the previous system path. Human platform roles are already denied above.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND COALESCE(nullif(current_setting('request.jwt.claim.role', true), ''), '') <> 'service_role' THEN
    IF v_profile_id IS NULL THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_organization_id AND profile_id = v_profile_id
    ) THEN
      RAISE EXCEPTION 'Access denied: caller is not a member of organization %', p_organization_id;
    END IF;
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = p_organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization % not found', p_organization_id; END IF;

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

CREATE OR REPLACE FUNCTION private.refuse_human_platform_wallet_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_human_platform_wallet_denied() THEN
    RAISE EXCEPTION 'PLATFORM_WALLET_DENIED: platform administration cannot use the customer procurement wallet';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refuse_platform_wallet_write ON public.organization_wallets;
CREATE TRIGGER trg_refuse_platform_wallet_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_wallets
  FOR EACH ROW
  EXECUTE FUNCTION private.refuse_human_platform_wallet_write();

DROP TRIGGER IF EXISTS trg_refuse_platform_wallet_tx_write ON public.wallet_transactions;
CREATE TRIGGER trg_refuse_platform_wallet_tx_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.refuse_human_platform_wallet_write();

DROP POLICY IF EXISTS org_wallets_select ON public.organization_wallets;
CREATE POLICY org_wallets_select ON public.organization_wallets
  FOR SELECT
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR (
      private.is_platform_admin()
      AND NOT private.is_human_platform_wallet_denied()
    )
  );

DROP POLICY IF EXISTS wallet_tx_select ON public.wallet_transactions;
CREATE POLICY wallet_tx_select ON public.wallet_transactions
  FOR SELECT
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR (
      private.is_platform_admin()
      AND NOT private.is_human_platform_wallet_denied()
    )
  );

DROP POLICY IF EXISTS org_wallets_mutate ON public.organization_wallets;
CREATE POLICY org_wallets_mutate ON public.organization_wallets
  FOR ALL
  USING (
    private.is_platform_admin()
    AND NOT private.is_human_platform_wallet_denied()
  )
  WITH CHECK (
    private.is_platform_admin()
    AND NOT private.is_human_platform_wallet_denied()
  );

DROP POLICY IF EXISTS wallet_tx_mutate ON public.wallet_transactions;
CREATE POLICY wallet_tx_mutate ON public.wallet_transactions
  FOR ALL
  USING (
    private.is_platform_admin()
    AND NOT private.is_human_platform_wallet_denied()
  )
  WITH CHECK (
    private.is_platform_admin()
    AND NOT private.is_human_platform_wallet_denied()
  );

DROP POLICY IF EXISTS buyer_reward_alloc_select ON public.buyer_reward_allocations;
CREATE POLICY buyer_reward_alloc_select ON public.buyer_reward_allocations
  FOR SELECT
  USING (
    organization_id IN (SELECT private.get_user_org_ids())
    OR (
      private.is_platform_admin()
      AND NOT private.is_human_platform_wallet_denied()
    )
  );

DROP POLICY IF EXISTS buyer_reward_alloc_mutate ON public.buyer_reward_allocations;
CREATE POLICY buyer_reward_alloc_mutate ON public.buyer_reward_allocations
  FOR ALL
  USING (
    private.is_platform_admin()
    AND NOT private.is_human_platform_wallet_denied()
  )
  WITH CHECK (
    private.is_platform_admin()
    AND NOT private.is_human_platform_wallet_denied()
  );

DROP TRIGGER IF EXISTS trg_refuse_platform_reward_write ON public.buyer_reward_allocations;
CREATE TRIGGER trg_refuse_platform_reward_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.buyer_reward_allocations
  FOR EACH ROW
  EXECUTE FUNCTION private.refuse_human_platform_wallet_write();

COMMIT;
