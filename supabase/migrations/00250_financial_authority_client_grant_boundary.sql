-- =============================================================================
-- 00250: Close client authority over subscription entitlement, wallet mint,
--        and the supplier fee amount.
--
-- Does not edit 00004, 00150, 00233, 00243, 00247, 00248, or 00249.
-- Does not apply itself. Does not add a payment gateway or a second price,
-- fee, or tax table.
--
-- 1. Catalog prices. private.subscription_wallet_credit_inr (00216) comments
--    say it matches packages/domain SUBSCRIPTION_TIERS. Product docs and the
--    pricing page use that object: Individual 199/1999, RWA 1499/14999,
--    MSME 1999/19999, Enterprise 4999/49999. The 00216 yearly literals were
--    1990, 14990, 19990, and 49990. TIER_1_MSME stays the Individual alias.
--    TIER_2_ENTERPRISE follows the domain alias (RWA), not a fourth price.
--
-- 2. process_subscription_payment no longer writes subscription_plan,
--    subscription_status, subscription_expires_at, or a SUCCESS payment log.
--    A client reference is a pilot simulation. Replay cannot extend expiry
--    because nothing is extended. Authoritative YEARLY writes that remain
--    are service_role updates and apply_wallet_credits_to_subscription_atomic
--    after a catalog-priced debit. 00249 still freezes direct client updates.
--
-- 3. Platform-admin workspace verify. The admin screen set subscription_status
--    with the authenticated client, which 00249 rejects. This adds one
--    SECURITY DEFINER that sets status ACTIVE only when private.is_platform_admin()
--    is already true. It does not set plan or expiry and does not widen that
--    helper. An owner who is not a platform admin is rejected.
--
-- 4. Fee rows. A BEFORE INSERT/UPDATE/DELETE trigger rejects anon and
--    authenticated. Definer and service_role writes still pass. Buyer reward
--    EXECUTE is revoked from authenticated and left with service_role.
--    Supplier cashback RPCs are not changed.
--
-- 5. apply_platform_fee_deduction_atomic ignores p_gross_amount. Gross is the
--    invoice amount, otherwise the purchase-order total. Charged fee is 0
--    because PILOT_COMMERCIAL_MODE_POLICY.supplierPlatformFeeCharged is false
--    and calculateSupplierPlatformFeeWithPilotMode returns 0 in the default
--    pilot mode. The acknowledged snapshot rate stays disclosure only.
--    Existing fee rows are not rewritten.
--
-- 6. TDS rate: PRODUCT DECISION REQUIRED. The 00199 withholding function
--    still stores the client rate (0–20) on a server-derived base. Domain
--    lookupTdsRate is a preview the client can bypass. Copying those rates
--    into SQL would be a second tax table. This file does not replace that
--    function and does not invent a section map. A duplicate live row still
--    returns the first row, in the existing function.
--
-- 7. Verified settlement. 00247 revokes client EXECUTE. HMAC in the webhook
--    verifier covers the raw body, so notes and amount inside that body are
--    signature-bound. This file does not add a second verifier and does not
--    deploy the webhook.
--
-- Hosted apply: NOT APPLIED.
-- Rollback (manual): restore the 00233 payment body, the 00216 price body,
-- the 00174 fee body, re-grant buyer-reward EXECUTE to authenticated, and
-- drop trg_guard_platform_fee_client_write plus
-- platform_admin_set_organization_subscription_status(uuid).
-- =============================================================================
BEGIN;

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

  -- Same figures as SUBSCRIPTION_TIERS in pricing-entitlement.ts.
  CASE v_tier
    WHEN 'INDIVIDUAL', 'TIER_1_MSME' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 1999.00 ELSE 199.00 END;
    WHEN 'RWA', 'TIER_2_ENTERPRISE' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 14999.00 ELSE 1499.00 END;
    WHEN 'MSME' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 19999.00 ELSE 1999.00 END;
    WHEN 'ENTERPRISE' THEN
      RETURN CASE WHEN v_cycle = 'YEARLY' THEN 49999.00 ELSE 4999.00 END;
    ELSE
      RAISE EXCEPTION 'Subscription tier % is not eligible for wallet redemption', p_tier;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION private.subscription_wallet_credit_inr(text, text) FROM PUBLIC, anon, authenticated;

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
  v_profile_id uuid := private.get_profile_id();
BEGIN
  IF private.is_human_platform_wallet_denied() THEN
    RAISE EXCEPTION 'PLATFORM_WALLET_DENIED: platform administration cannot use the customer procurement wallet';
  END IF;

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

  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'Organization % not found', p_organization_id;
  END IF;

  -- Touch the arguments so a pilot request is acknowledged without becoming a ledger row.
  RETURN jsonb_build_object(
    'ok', true,
    'simulated', true,
    'entitlement_granted', false,
    'new_expires_at', NULL,
    'requested_tier', NULLIF(upper(btrim(COALESCE(p_tier, ''))), ''),
    'requested_cycle', NULLIF(upper(btrim(COALESCE(p_cycle, ''))), ''),
    'requested_amount', p_amount,
    'payment_reference_accepted', p_payment_ref IS NOT NULL AND btrim(p_payment_ref) <> '',
    'upi_id_ignored', p_upi_id,
    'message', 'Pilot payment request is a simulation. It does not activate or extend a subscription.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_admin_set_organization_subscription_status(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_plan text;
  v_expires timestamptz;
  v_status text;
BEGIN
  IF NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a platform admin can activate an organization workspace (SUBSCRIPTION-ADMIN-ACTIVATE)'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.organizations
  SET subscription_status = 'ACTIVE',
      updated_at = now()
  WHERE id = p_organization_id
  RETURNING subscription_plan, subscription_expires_at, subscription_status
  INTO v_plan, v_expires, v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization % not found', p_organization_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'subscription_status', v_status,
    'subscription_plan', v_plan,
    'subscription_expires_at', v_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_admin_set_organization_subscription_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_admin_set_organization_subscription_status(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.guard_platform_fee_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Platform fee rows can only be written by an authorized settlement function (PLATFORM-FEE-CLIENT-WRITE-DENIED)'
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION private.guard_platform_fee_client_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_platform_fee_client_write() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_guard_platform_fee_client_write ON public.platform_fee_transactions;
CREATE TRIGGER trg_guard_platform_fee_client_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.platform_fee_transactions
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_platform_fee_client_write();

REVOKE ALL ON FUNCTION public.credit_buyer_settlement_reward_atomic(uuid, uuid, uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_buyer_settlement_reward_atomic(uuid, uuid, uuid, numeric, numeric, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_platform_fee_deduction_atomic(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_invoice_id uuid,
  p_payment_id uuid DEFAULT NULL,
  p_payment_allocation_id uuid DEFAULT NULL,
  p_gross_amount numeric(14, 2) DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_caller_profile_id uuid := private.get_profile_id();
  v_is_admin boolean := private.is_platform_admin();
  v_caller_role text;
  v_po RECORD;
  v_snapshot RECORD;
  v_invoice RECORD;
  v_payment RECORD;
  v_has_invoice boolean := false;
  v_gross numeric(14, 2);
  v_fee_amount numeric(14, 2);
  v_net_settlement numeric(14, 2);
  v_tx_id uuid;
  v_existing_tx RECORD;
BEGIN
  IF NOT v_is_admin THEN
    v_caller_role := private.get_org_role(p_organization_id);
    IF v_caller_role NOT IN ('OWNER', 'MANAGER') THEN
      RAISE EXCEPTION 'Unauthorized: Only Buyer OWNER or MANAGER can apply platform fee deductions (RED-09/FEE-5C5-UNAUTHORIZED)';
    END IF;
  END IF;

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found', p_purchase_order_id;
  END IF;

  IF v_po.organization_id != p_organization_id THEN
    RAISE EXCEPTION 'Purchase order does not belong to organization % (RED-08: CROSS_TENANT_VIOLATION)', p_organization_id;
  END IF;

  SELECT * INTO v_snapshot
  FROM public.po_fee_snapshots
  WHERE purchase_order_id = p_purchase_order_id
  FOR UPDATE;

  IF NOT FOUND OR NOT v_snapshot.is_acknowledged THEN
    RAISE EXCEPTION 'Cannot apply platform fee: Supplier has not acknowledged the platform fee policy snapshot (RED-06: UNACKNOWLEDGED_FEE_SNAPSHOT)';
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invoice % not found', p_invoice_id;
    END IF;

    IF v_invoice.status IN ('REJECTED', 'CANCELLED') THEN
      RAISE EXCEPTION 'Cannot apply platform fee to % invoice % (RED-10: INVALID_INVOICE_STATUS)', v_invoice.status, p_invoice_id;
    END IF;
    v_has_invoice := true;
  END IF;

  IF p_payment_id IS NOT NULL THEN
    SELECT * INTO v_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment % not found', p_payment_id;
    END IF;

    IF v_payment.status IN ('FAILED', 'REVERSED', 'VOIDED') THEN
      RAISE EXCEPTION 'Cannot apply platform fee to % payment % (RED-10: INVALID_PAYMENT_STATUS)', v_payment.status, p_payment_id;
    END IF;
  END IF;

  IF p_payment_allocation_id IS NOT NULL THEN
    SELECT * INTO v_existing_tx
    FROM public.platform_fee_transactions
    WHERE purchase_order_id = p_purchase_order_id
      AND payment_allocation_id = p_payment_allocation_id
      AND status NOT IN ('VOIDED', 'REVERSED')
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'transaction_id', v_existing_tx.id,
        'fee_amount', v_existing_tx.fee_amount,
        'status', v_existing_tx.status,
        'message', 'Fee deduction already applied (idempotent)'
      );
    END IF;
  END IF;

  -- p_gross_amount is ignored. Invoice amount wins, then the PO total.
  IF v_has_invoice THEN
    v_gross := ROUND(COALESCE(v_invoice.amount, 0), 2);
  ELSE
    v_gross := ROUND(COALESCE(v_po.total_amount, 0), 2);
  END IF;

  IF v_gross <= 0 THEN
    RAISE EXCEPTION 'Gross settlement amount must be greater than zero';
  END IF;

  -- Pilot waiver: PILOT_COMMERCIAL_MODE_POLICY.supplierPlatformFeeCharged = false.
  -- Snapshot rate remains the disclosed commercial rate and is not collected.
  v_fee_amount := 0.00;
  v_net_settlement := v_gross;

  INSERT INTO public.platform_fee_transactions (
    organization_id,
    supplier_id,
    purchase_order_id,
    invoice_id,
    payment_id,
    payment_allocation_id,
    policy_id,
    policy_version,
    gross_amount,
    fee_rate,
    fee_amount,
    net_settlement_amount,
    status,
    notes,
    settled_at
  ) VALUES (
    p_organization_id,
    v_po.supplier_id,
    p_purchase_order_id,
    p_invoice_id,
    p_payment_id,
    p_payment_allocation_id,
    v_snapshot.policy_id,
    v_snapshot.policy_version,
    v_gross,
    0.00,
    v_fee_amount,
    v_net_settlement,
    'SETTLED',
    'Pilot waiver: supplier platform fee not charged',
    now()
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.audit_events (
    event_type,
    entity_type,
    entity_id,
    payload,
    actor_id
  ) VALUES (
    'PLATFORM_FEE_DEDUCTION_APPLIED',
    'PLATFORM_FEE_TRANSACTION',
    v_tx_id::text,
    jsonb_build_object(
      'purchase_order_id', p_purchase_order_id,
      'invoice_id', p_invoice_id,
      'gross_amount', v_gross,
      'ignored_client_gross_amount', p_gross_amount,
      'disclosed_snapshot_rate', v_snapshot.rate,
      'fee_rate', 0,
      'fee_amount', v_fee_amount,
      'net_settlement_amount', v_net_settlement,
      'pilot_waived', true
    ),
    v_caller_profile_id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'transaction_id', v_tx_id,
    'gross_amount', v_gross,
    'fee_rate', 0,
    'disclosed_snapshot_rate', v_snapshot.rate,
    'fee_amount', v_fee_amount,
    'net_settlement_amount', v_net_settlement,
    'pilot_waived', true,
    'status', 'SETTLED'
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
