-- Personal buyers close evaluation through the same buyer-scope check as award.
-- Payable subscription amounts come only from subscription_plans. Unmapped or
-- non-matching client amounts fail closed and do not activate a subscription.

BEGIN;

CREATE OR REPLACE FUNCTION public.close_clarification_for_evaluation(p_rfq_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_final_count int;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_buyer_scope_manager(v_rfq.organization_id, v_rfq.owner_profile_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only managers or owners can close negotiation';
  END IF;

  IF v_rfq.status NOT IN ('CLARIFICATION', 'OPEN', 'CLOSED') THEN
    RAISE EXCEPTION 'RFQ must be in CLARIFICATION or OPEN to proceed to evaluation (current: %)', v_rfq.status;
  END IF;

  UPDATE quotes
  SET status = 'FINAL', updated_at = now()
  WHERE rfq_id = p_rfq_id AND status IN ('SUBMITTED', 'REVISED');

  SELECT count(*)::int INTO v_final_count
  FROM quotes
  WHERE rfq_id = p_rfq_id AND status = 'FINAL';

  IF v_final_count < v_rfq.min_quotes_required AND NOT v_rfq.min_quotes_waived THEN
    RAISE EXCEPTION 'Minimum % final quotes required (found %)', v_rfq.min_quotes_required, v_final_count;
  END IF;

  UPDATE rfqs SET status = 'EVALUATING', updated_at = now() WHERE id = p_rfq_id;

  UPDATE requirements
  SET status = 'EVALUATION', updated_at = now()
  WHERE id = v_rfq.requirement_id;

  IF v_rfq.organization_id IS NOT NULL THEN
    INSERT INTO committee_assignments (rfq_id, profile_id)
    SELECT p_rfq_id, om.profile_id
    FROM organization_members om
    WHERE om.organization_id = v_rfq.organization_id
      AND om.role IN ('COMMITTEE_MEMBER', 'MANAGER', 'OWNER', 'BUYER')
    ON CONFLICT (rfq_id, profile_id) DO NOTHING;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION private.subscription_wallet_credit_inr(p_tier text, p_cycle text)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  RETURN private.canonical_subscription_price(p_tier, p_cycle, 'INR');
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
  v_required numeric;
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

  v_required := private.canonical_subscription_price(p_tier, p_cycle, 'INR');
  IF p_amount IS NULL OR round(p_amount, 2) <> round(v_required, 2) THEN
    RAISE EXCEPTION 'Paid amount % does not equal the canonical % % price % (PAY-V-PRICE-MISMATCH)',
      p_amount, upper(btrim(p_tier)), upper(btrim(p_cycle)), v_required;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'simulated', true,
    'entitlement_granted', false,
    'new_expires_at', NULL,
    'canonical_amount', v_required,
    'requested_tier', NULLIF(upper(btrim(COALESCE(p_tier, ''))), ''),
    'requested_cycle', NULLIF(upper(btrim(COALESCE(p_cycle, ''))), ''),
    'requested_amount', p_amount,
    'payment_reference_accepted', p_payment_ref IS NOT NULL AND btrim(p_payment_ref) <> '',
    'upi_id_ignored', p_upi_id,
    'message', 'Pilot payment matches the canonical price and does not activate a subscription.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_subscription_payment(uuid, text, text, numeric, text, text) TO authenticated, service_role;

COMMIT;
