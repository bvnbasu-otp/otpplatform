-- Migration 00220: Supplier wallet ledger events (referral + first settlement success)
-- Local only — do not apply to production without release review.
-- Uses existing wallet_transactions (tx_type REWARD_CREDIT) with source_entity_type event keys.
-- Amount is always server-derived (₹100); client amounts are rejected.

BEGIN;

-- One credit per (org, event type, source entity); prevents concurrent double-credit races.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_supplier_event_source
  ON public.wallet_transactions (organization_id, source_entity_type, source_entity_id)
  WHERE source_entity_type IN ('SUPPLIER_REFERRAL_BONUS', 'SUPPLIER_SUCCESS_REWARD');

CREATE OR REPLACE FUNCTION public.credit_supplier_wallet_event_atomic(
  p_beneficiary_org_id uuid,
  p_event_type text,
  p_source_entity_id uuid,
  p_idempotency_key text DEFAULT NULL,
  p_client_amount numeric DEFAULT NULL
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

  v_amount := CASE p_event_type
    WHEN 'SUPPLIER_REFERRAL_BONUS' THEN 100.00
    WHEN 'SUPPLIER_SUCCESS_REWARD' THEN 100.00
    ELSE 0.00
  END;

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
      'transaction_id', v_tx_id
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

REVOKE ALL ON FUNCTION public.credit_supplier_wallet_event_atomic(uuid, text, uuid, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_supplier_wallet_event_atomic(uuid, text, uuid, text, numeric) TO service_role;

COMMIT;
