-- Migration 00221: Server-authoritative referral bonus amounts by referred profile
-- Why: Production already applied 00220 (flat ₹100 supplier referral). Profile-tier amounts
-- (Individual ₹10, RWA ₹25, MSME ₹50, Supplier ₹100) require a new migration — not editing 00220.
-- Local / future deploy only — do NOT apply to hosted production without release review.

BEGIN;

CREATE OR REPLACE FUNCTION private.otp_referral_bonus_inr(p_referred_profile_kind text)
RETURNS numeric(14, 2)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_kind text := upper(btrim(COALESCE(p_referred_profile_kind, 'INDIVIDUAL')));
BEGIN
  IF v_kind IN ('SUPPLIER', 'VENDOR') THEN
    RETURN 100.00;
  ELSIF v_kind = 'MSME' THEN
    RETURN 50.00;
  ELSIF v_kind = 'RWA' THEN
    RETURN 25.00;
  END IF;
  RETURN 10.00;
END;
$$;

CREATE OR REPLACE FUNCTION private.supplier_referrer_has_settled_otp_tx(p_supplier_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_fee_transactions pft
    WHERE pft.supplier_id = p_supplier_id
      AND upper(pft.status) = 'SETTLED'
    LIMIT 1
  );
$$;

CREATE OR REPLACE FUNCTION private.org_type_to_otp_referred_profile_kind(p_org_type org_type)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_raw text := upper(btrim(COALESCE(p_org_type::text, 'INDIVIDUAL')));
BEGIN
  IF v_raw IN ('COMMUNITY', 'ENTERPRISE', 'INSTITUTION', 'RWA', 'SOCIETY') THEN
    RETURN 'RWA';
  ELSIF v_raw = 'MSME' THEN
    RETURN 'MSME';
  END IF;
  RETURN 'INDIVIDUAL';
END;
$$;

-- Authoritative referred participant profile — never trust caller-supplied profile kind for amounts.
CREATE OR REPLACE FUNCTION private.otp_referred_profile_kind_authoritative(
  p_referred_org_id uuid,
  p_source_entity_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_signup public.signup_requests%ROWTYPE;
  v_org public.organizations%ROWTYPE;
BEGIN
  IF p_source_entity_id IS NOT NULL THEN
    SELECT * INTO v_signup
    FROM public.signup_requests
    WHERE id = p_source_entity_id
    LIMIT 1;

    IF FOUND THEN
      IF v_signup.side = 'SUPPLIER' THEN
        RETURN 'SUPPLIER';
      END IF;
      RETURN private.org_type_to_otp_referred_profile_kind(
        COALESCE(v_signup.buyer_type, 'INDIVIDUAL'::org_type)
      );
    END IF;

    IF EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = p_source_entity_id) THEN
      RETURN 'SUPPLIER';
    END IF;

    SELECT * INTO v_signup
    FROM public.signup_requests
    WHERE supplier_id = p_source_entity_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN 'SUPPLIER';
    END IF;
  END IF;

  IF p_referred_org_id IS NOT NULL THEN
    SELECT * INTO v_signup
    FROM public.signup_requests
    WHERE organization_id = p_referred_org_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND v_signup.side = 'SUPPLIER' THEN
      RETURN 'SUPPLIER';
    END IF;

    IF FOUND AND v_signup.side = 'BUYER' THEN
      RETURN private.org_type_to_otp_referred_profile_kind(
        COALESCE(v_signup.buyer_type, 'INDIVIDUAL'::org_type)
      );
    END IF;

    SELECT * INTO v_org FROM public.organizations WHERE id = p_referred_org_id;
    IF FOUND THEN
      RETURN private.org_type_to_otp_referred_profile_kind(v_org.org_type);
    END IF;
  END IF;

  RAISE EXCEPTION 'Cannot resolve referred profile kind from server state (OTP-REFERRAL-PROFILE)';
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_otp_referral_source
  ON public.wallet_transactions (organization_id, source_entity_type, source_entity_id)
  WHERE source_entity_type = 'OTP_REFERRAL_BONUS';

CREATE OR REPLACE FUNCTION public.credit_otp_referral_bonus_atomic(
  p_beneficiary_org_id uuid,
  p_referrer_persona text,
  p_referred_profile_kind text,
  p_source_entity_id uuid,
  p_referrer_org_id uuid,
  p_referred_org_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_client_amount numeric DEFAULT NULL,
  p_referrer_supplier_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_persona text := upper(btrim(COALESCE(p_referrer_persona, 'BUYER')));
  v_referred_kind text;
  v_amount numeric(14, 2);
  v_wallet_id uuid;
  v_opening_bal numeric(14, 2);
  v_new_bal numeric(14, 2);
  v_tx_id uuid;
  v_existing_tx record;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Referral wallet credits require service_role or platform admin (OTP-REFERRAL-AUTH)';
  END IF;

  IF p_beneficiary_org_id IS NULL OR p_source_entity_id IS NULL THEN
    RAISE EXCEPTION 'beneficiary org and source entity are required';
  END IF;

  IF p_referred_org_id IS NULL THEN
    RAISE EXCEPTION 'referred organization id is required for server-authoritative referral profile';
  END IF;

  IF p_referrer_org_id IS NOT NULL AND p_referred_org_id IS NOT NULL
     AND p_referrer_org_id = p_referred_org_id THEN
    RAISE EXCEPTION 'Self-referral is not allowed';
  END IF;

  IF v_persona = 'SUPPLIER' THEN
    IF p_referrer_supplier_id IS NULL THEN
      RAISE EXCEPTION 'Supplier referrer requires p_referrer_supplier_id for transaction gate';
    END IF;
    IF NOT private.supplier_referrer_has_settled_otp_tx(p_referrer_supplier_id) THEN
      RAISE EXCEPTION 'Supplier referrer must complete at least one settled OTP transaction before referral credit';
    END IF;
  END IF;

  v_referred_kind := private.otp_referred_profile_kind_authoritative(p_referred_org_id, p_source_entity_id);

  IF p_referred_profile_kind IS NOT NULL
     AND upper(btrim(p_referred_profile_kind)) <> upper(btrim(v_referred_kind)) THEN
    RAISE EXCEPTION 'Client cannot override referred profile kind (expected %)', v_referred_kind;
  END IF;

  v_amount := private.otp_referral_bonus_inr(v_referred_kind);

  IF p_client_amount IS NOT NULL AND round(p_client_amount, 2) <> v_amount THEN
    RAISE EXCEPTION 'Client cannot override referral wallet amount (expected ₹%)', v_amount;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true, 'replayed', true, 'transaction_id', v_existing_tx.id,
        'amount', v_existing_tx.amount, 'message', 'Referral bonus already processed'
      );
    END IF;
  END IF;

  SELECT * INTO v_existing_tx
  FROM public.wallet_transactions
  WHERE organization_id = p_beneficiary_org_id
    AND source_entity_type = 'OTP_REFERRAL_BONUS'
    AND source_entity_id = p_source_entity_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'replayed', true, 'transaction_id', v_existing_tx.id,
      'amount', v_existing_tx.amount, 'message', 'Referral bonus already processed'
    );
  END IF;

  SELECT id, balance_credits INTO v_wallet_id, v_opening_bal
  FROM public.organization_wallets WHERE organization_id = p_beneficiary_org_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
    VALUES (p_beneficiary_org_id, 0.00, 'ACTIVE')
    RETURNING id, balance_credits INTO v_wallet_id, v_opening_bal;
  END IF;

  v_new_bal := v_opening_bal + v_amount;
  UPDATE public.organization_wallets SET balance_credits = v_new_bal, updated_at = now() WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    organization_id, wallet_id, tx_type, amount, opening_balance, closing_balance,
    source_entity_type, source_entity_id, idempotency_key, notes
  ) VALUES (
    p_beneficiary_org_id, v_wallet_id, 'REWARD_CREDIT', v_amount, v_opening_bal, v_new_bal,
    'OTP_REFERRAL_BONUS', p_source_entity_id, p_idempotency_key,
    'OTP referral bonus (' || upper(btrim(v_referred_kind)) || ')'
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'referral_wallet.credited', 'organization_wallet', v_wallet_id::text, v_caller,
    jsonb_build_object(
      'organization_id', p_beneficiary_org_id,
      'referrer_persona', v_persona,
      'referred_profile_kind', upper(btrim(v_referred_kind)),
      'source_entity_id', p_source_entity_id,
      'amount', v_amount,
      'transaction_id', v_tx_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'transaction_id', v_tx_id,
    'opening_balance', v_opening_bal,
    'closing_balance', v_new_bal,
    'message', 'Referral bonus credited'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_otp_referral_bonus_atomic(
  uuid, text, text, uuid, uuid, uuid, text, numeric, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_otp_referral_bonus_atomic(
  uuid, text, text, uuid, uuid, uuid, text, numeric, uuid
) TO service_role;

-- Replace 00220 signature (5-arg) so PostgREST does not see ambiguous overloads.
DROP FUNCTION IF EXISTS public.credit_supplier_wallet_event_atomic(uuid, text, uuid, text, numeric);

-- Extend 00220 supplier RPC: optional referred profile kind (default SUPPLIER = ₹100, production-compatible).
CREATE OR REPLACE FUNCTION public.credit_supplier_wallet_event_atomic(
  p_beneficiary_org_id uuid,
  p_event_type text,
  p_source_entity_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_client_amount numeric DEFAULT NULL,
  p_referred_profile_kind text DEFAULT 'SUPPLIER'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_caller uuid := private.get_profile_id();
  v_amount numeric(14, 2);
  v_wallet_id uuid;
  v_opening_bal numeric(14, 2);
  v_new_bal numeric(14, 2);
  v_tx_id uuid;
  v_existing_tx record;
  v_fee record;
  v_referred_kind text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Supplier wallet credits require service_role or platform admin (SUPPLIER-WALLET-AUTH)';
  END IF;

  IF p_event_type NOT IN ('SUPPLIER_REFERRAL_BONUS', 'SUPPLIER_SUCCESS_REWARD') THEN
    RAISE EXCEPTION 'Unsupported supplier wallet event %', p_event_type;
  END IF;

  IF p_event_type = 'SUPPLIER_CASHBACK' OR upper(p_event_type) LIKE '%CASHBACK%' THEN
    RAISE EXCEPTION 'Supplier cashback has been removed';
  END IF;

  IF p_event_type = 'SUPPLIER_REFERRAL_BONUS' THEN
    v_referred_kind := private.otp_referred_profile_kind_authoritative(NULL, p_source_entity_id);
    IF p_referred_profile_kind IS NOT NULL
       AND upper(btrim(p_referred_profile_kind)) <> upper(btrim(v_referred_kind)) THEN
      RAISE EXCEPTION 'Client cannot override referred profile kind (expected %)', v_referred_kind;
    END IF;
    v_amount := private.otp_referral_bonus_inr(v_referred_kind);
  ELSE
    v_amount := 100.00;
  END IF;

  IF p_client_amount IS NOT NULL AND round(p_client_amount, 2) <> v_amount THEN
    RAISE EXCEPTION 'Client cannot override supplier wallet amount (expected ₹%)', v_amount;
  END IF;

  IF p_event_type = 'SUPPLIER_SUCCESS_REWARD' THEN
    SELECT * INTO v_fee FROM public.platform_fee_transactions WHERE id = p_source_entity_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Platform fee transaction % not found for success reward', p_source_entity_id;
    END IF;
    IF upper(v_fee.status) <> 'SETTLED' THEN
      RAISE EXCEPTION 'Success reward requires SETTLED platform fee, found %', v_fee.status;
    END IF;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_tx FROM public.wallet_transactions WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'replayed', true, 'transaction_id', v_existing_tx.id,
        'amount', v_existing_tx.amount, 'message', 'Supplier wallet event already processed');
    END IF;
  END IF;

  SELECT id, balance_credits INTO v_wallet_id, v_opening_bal
  FROM public.organization_wallets WHERE organization_id = p_beneficiary_org_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.organization_wallets (organization_id, balance_credits, status)
    VALUES (p_beneficiary_org_id, 0.00, 'ACTIVE')
    RETURNING id, balance_credits INTO v_wallet_id, v_opening_bal;
  END IF;

  SELECT * INTO v_existing_tx
  FROM public.wallet_transactions
  WHERE organization_id = p_beneficiary_org_id
    AND source_entity_type = p_event_type
    AND source_entity_id = p_source_entity_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'replayed', true,
      'transaction_id', v_existing_tx.id,
      'amount', v_existing_tx.amount,
      'message', 'Supplier wallet event already processed'
    );
  END IF;

  v_new_bal := v_opening_bal + v_amount;
  UPDATE public.organization_wallets SET balance_credits = v_new_bal, updated_at = now() WHERE id = v_wallet_id;

  INSERT INTO public.wallet_transactions (
    organization_id, wallet_id, tx_type, amount, opening_balance, closing_balance,
    source_entity_type, source_entity_id, idempotency_key, notes
  ) VALUES (
    p_beneficiary_org_id, v_wallet_id, 'REWARD_CREDIT', v_amount, v_opening_bal, v_new_bal,
    p_event_type, p_source_entity_id, p_idempotency_key,
    'Supplier wallet ' || p_event_type
  ) RETURNING id INTO v_tx_id;

  INSERT INTO public.audit_events (event_type, entity_type, entity_id, actor_id, payload)
  VALUES (
    'supplier_wallet.credited', 'organization_wallet', v_wallet_id::text, v_caller,
    jsonb_build_object(
      'organization_id', p_beneficiary_org_id,
      'event_type', p_event_type,
      'source_entity_id', p_source_entity_id,
      'amount', v_amount,
      'transaction_id', v_tx_id,
      'referred_profile_kind', upper(btrim(COALESCE(v_referred_kind, 'SUPPLIER')))
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'transaction_id', v_tx_id,
    'opening_balance', v_opening_bal,
    'closing_balance', v_new_bal,
    'message', 'Supplier wallet event credited'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_supplier_wallet_event_atomic(uuid, text, uuid, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_supplier_wallet_event_atomic(uuid, text, uuid, text, numeric, text) TO service_role;

COMMIT;
