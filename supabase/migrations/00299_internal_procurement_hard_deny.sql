-- 00299_internal_procurement_hard_deny.sql
-- Step 2 of OTP Phase 2: Ablate Helper Bypasses, Enforce Ownership Immutability, Add Oversight SELECT Policies, and Attach Dual-Vector BEFORE Triggers

-- 1. Ablate OR private.is_platform_admin() from the 5 Customer Helpers

CREATE OR REPLACE FUNCTION private.is_supplier_user_for(p_supplier_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF p_supplier_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.supplier_users su
    JOIN public.suppliers s ON s.id = su.supplier_id
    WHERE su.supplier_id = p_supplier_id
      AND su.profile_id = private.get_profile_id()
      AND COALESCE(s.status::text, 'ACTIVE') NOT IN ('SUSPENDED', 'BLOCKED')
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    WHERE om.organization_id = p_org_id
      AND om.profile_id = private.get_profile_id()
      AND COALESCE(o.status, 'ACTIVE') <> 'BLOCKED'
  )
  OR private.demo_staging_for(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.is_org_manager_or_above(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE(private.get_org_role(p_org_id) IN ('OWNER', 'MANAGER'), false)
    OR private.demo_staging_for(p_org_id);
END;
$$;

CREATE OR REPLACE FUNCTION private.is_buyer_scope_member(p_org uuid, p_owner uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF p_org IS NOT NULL THEN
    RETURN private.is_org_member(p_org);
  ELSE
    RETURN p_owner IS NOT NULL AND p_owner = private.get_profile_id();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.is_buyer_scope_manager(p_org uuid, p_owner uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF p_org IS NOT NULL THEN
    RETURN private.is_org_manager_or_above(p_org);
  ELSE
    RETURN p_owner IS NOT NULL AND p_owner = private.get_profile_id();
  END IF;
END;
$$;

-- 2. Ablate Admin Bypass from Ownership Immutability
CREATE OR REPLACE FUNCTION private.guard_ownership_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF (OLD.organization_id IS DISTINCT FROM NEW.organization_id
      OR OLD.owner_profile_id IS DISTINCT FROM NEW.owner_profile_id)
     AND private.get_profile_id() IS NOT NULL THEN
    RAISE EXCEPTION 'Record ownership cannot be changed (OWNERSHIP_IMMUTABLE)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Dedicated Administrative Read-Only SELECT Policies
DROP POLICY IF EXISTS requirements_admin_select ON public.requirements;
CREATE POLICY requirements_admin_select ON public.requirements
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS rfqs_admin_select ON public.rfqs;
CREATE POLICY rfqs_admin_select ON public.rfqs
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS quotes_admin_select ON public.quotes;
CREATE POLICY quotes_admin_select ON public.quotes
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS quote_versions_admin_select ON public.quote_versions;
CREATE POLICY quote_versions_admin_select ON public.quote_versions
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS committee_votes_admin_select ON public.committee_votes;
CREATE POLICY committee_votes_admin_select ON public.committee_votes
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS awards_admin_select ON public.awards;
CREATE POLICY awards_admin_select ON public.awards
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS purchase_orders_admin_select ON public.purchase_orders;
CREATE POLICY purchase_orders_admin_select ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS work_orders_admin_select ON public.work_orders;
CREATE POLICY work_orders_admin_select ON public.work_orders
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS invoices_admin_select ON public.invoices;
CREATE POLICY invoices_admin_select ON public.invoices
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

DROP POLICY IF EXISTS payments_admin_select ON public.payments;
CREATE POLICY payments_admin_select ON public.payments
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

-- 4. Internal Profile Resolution Helper
CREATE OR REPLACE FUNCTION private.is_internal_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id
      AND (
        p.is_founder = true
        OR p.is_platform_admin = true
        OR p.active_portal_side = 'CONSOLE'::signup_side
        OR EXISTS (
          SELECT 1 FROM public.internal_user_assignments ua
          WHERE ua.profile_id = p.id
        )
      )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION private.is_internal_profile(uuid) TO authenticated, service_role, anon;

-- 5. Dual-Vector BEFORE Triggers on 11 Operations

-- Trigger Functions:
CREATE OR REPLACE FUNCTION private.trg_deny_internal_requirements_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  -- Vector A: Authenticated Session Isolation
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  -- Vector B: Actor Column Immutability / Forgery Protection
  IF private.is_internal_profile(NEW.created_by) OR private.is_internal_profile(NEW.owner_profile_id) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_rfqs_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.created_by) OR private.is_internal_profile(NEW.owner_profile_id) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_quotes_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.supplier_id = NEW.supplier_id
      AND private.is_internal_profile(su.profile_id)
  ) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_quote_versions_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.created_by) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_committee_votes_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.profile_id) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_awards_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.awarded_by) OR private.is_internal_profile(NEW.unmasked_by) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_po_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF private.is_internal_profile(NEW.owner_profile_id) OR private.is_internal_profile(NEW.cancelled_by) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_wo_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.supplier_id = NEW.supplier_id
      AND private.is_internal_profile(su.profile_id)
  ) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_invoices_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.supplier_id = NEW.supplier_id
      AND private.is_internal_profile(su.profile_id)
  ) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_payments_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  -- Vector A: Authenticated Session Isolation
  IF private.is_internal_profile(auth.uid()) THEN
    RAISE EXCEPTION 'Internal operators cannot participate in procurement (INTERNAL_OPERATOR_PROCUREMENT_DENIED)'
      USING ERRCODE = '42501';
  END IF;

  -- Vector B: Direct unauthenticated / service_role insertion of internal operator in recorded_by
  -- is strictly forbidden unless executing inside the authorized record_verified_payment RPC
  IF private.is_internal_profile(NEW.recorded_by) AND current_setting('otp.verified_payment_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  -- Vector B: Procurement Actor Isolation (Payment cannot settle for internal buyer or supplier)
  IF (NEW.purchase_order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = NEW.purchase_order_id
      AND private.is_internal_profile(po.owner_profile_id)
  )) OR (NEW.invoice_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invoices inv
    JOIN public.supplier_users su ON su.supplier_id = inv.supplier_id
    WHERE inv.id = NEW.invoice_id
      AND private.is_internal_profile(su.profile_id)
  )) THEN
    RAISE EXCEPTION 'Internal profile cannot be assigned as procurement actor (INTERNAL_ACTOR_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.trg_deny_internal_settlement_beneficiary_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
BEGIN
  IF (NEW.supplier_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.supplier_users su
    WHERE su.supplier_id = NEW.supplier_id
      AND private.is_internal_profile(su.profile_id)
  )) OR (NEW.organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = NEW.organization_id
      AND private.is_internal_profile(om.profile_id)
  )) THEN
    RAISE EXCEPTION 'Internal operator cannot be beneficiary of settlement reconciliation (INTERNAL_BENEFICIARY_FORBIDDEN)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger Attachments (prefixed with trg_00_ to execute before downstream business triggers):
DROP TRIGGER IF EXISTS trg_deny_internal_requirements_write ON public.requirements;
DROP TRIGGER IF EXISTS trg_00_deny_internal_requirements_write ON public.requirements;
CREATE TRIGGER trg_00_deny_internal_requirements_write
  BEFORE INSERT OR UPDATE ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_requirements_write();

DROP TRIGGER IF EXISTS trg_deny_internal_rfqs_write ON public.rfqs;
DROP TRIGGER IF EXISTS trg_00_deny_internal_rfqs_write ON public.rfqs;
CREATE TRIGGER trg_00_deny_internal_rfqs_write
  BEFORE INSERT OR UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_rfqs_write();

DROP TRIGGER IF EXISTS trg_deny_internal_quotes_write ON public.quotes;
DROP TRIGGER IF EXISTS trg_00_deny_internal_quotes_write ON public.quotes;
CREATE TRIGGER trg_00_deny_internal_quotes_write
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_quotes_write();

DROP TRIGGER IF EXISTS trg_deny_internal_quote_versions_write ON public.quote_versions;
DROP TRIGGER IF EXISTS trg_00_deny_internal_quote_versions_write ON public.quote_versions;
CREATE TRIGGER trg_00_deny_internal_quote_versions_write
  BEFORE INSERT OR UPDATE ON public.quote_versions
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_quote_versions_write();

DROP TRIGGER IF EXISTS trg_deny_internal_committee_votes_write ON public.committee_votes;
DROP TRIGGER IF EXISTS trg_00_deny_internal_committee_votes_write ON public.committee_votes;
CREATE TRIGGER trg_00_deny_internal_committee_votes_write
  BEFORE INSERT OR UPDATE ON public.committee_votes
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_committee_votes_write();

DROP TRIGGER IF EXISTS trg_deny_internal_awards_write ON public.awards;
DROP TRIGGER IF EXISTS trg_00_deny_internal_awards_write ON public.awards;
CREATE TRIGGER trg_00_deny_internal_awards_write
  BEFORE INSERT OR UPDATE ON public.awards
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_awards_write();

DROP TRIGGER IF EXISTS trg_deny_internal_po_write ON public.purchase_orders;
DROP TRIGGER IF EXISTS trg_00_deny_internal_po_write ON public.purchase_orders;
CREATE TRIGGER trg_00_deny_internal_po_write
  BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_po_write();

DROP TRIGGER IF EXISTS trg_deny_internal_wo_write ON public.work_orders;
DROP TRIGGER IF EXISTS trg_00_deny_internal_wo_write ON public.work_orders;
CREATE TRIGGER trg_00_deny_internal_wo_write
  BEFORE INSERT OR UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_wo_write();

DROP TRIGGER IF EXISTS trg_deny_internal_invoices_write ON public.invoices;
DROP TRIGGER IF EXISTS trg_00_deny_internal_invoices_write ON public.invoices;
CREATE TRIGGER trg_00_deny_internal_invoices_write
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_invoices_write();

DROP TRIGGER IF EXISTS trg_deny_internal_payments_write ON public.payments;
DROP TRIGGER IF EXISTS trg_00_deny_internal_payments_write ON public.payments;
CREATE TRIGGER trg_00_deny_internal_payments_write
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_payments_write();

DROP TRIGGER IF EXISTS trg_deny_internal_settlement_beneficiary_write ON public.settlement_reconciliations;
DROP TRIGGER IF EXISTS trg_00_deny_internal_settlement_beneficiary_write ON public.settlement_reconciliations;
CREATE TRIGGER trg_00_deny_internal_settlement_beneficiary_write
  BEFORE INSERT OR UPDATE ON public.settlement_reconciliations
  FOR EACH ROW EXECUTE FUNCTION private.trg_deny_internal_settlement_beneficiary_write();

-- 6. Harden record_verified_payment with transaction-local trusted payment authorization flag
CREATE OR REPLACE FUNCTION private.record_verified_payment_bound(
  p_payment_type text,
  p_organization_id uuid DEFAULT NULL::uuid,
  p_invoice_id uuid DEFAULT NULL::uuid,
  p_amount numeric DEFAULT 0,
  p_currency text DEFAULT 'INR'::text,
  p_gateway text DEFAULT 'RAZORPAY'::text,
  p_gateway_event_id text DEFAULT NULL::text,
  p_payment_reference text DEFAULT NULL::text,
  p_tier text DEFAULT 'TIER_1_MSME'::text,
  p_billing_cycle text DEFAULT 'MONTHLY'::text,
  p_gateway_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_org organizations%ROWTYPE;
  v_inv RECORD;
  v_po_org uuid;
  v_po_id uuid;
  v_now timestamptz := now();
  v_validity_days integer;
  v_prev_expires timestamptz;
  v_new_expires timestamptz;
  v_cycle_upper text := upper(coalesce(btrim(p_billing_cycle), 'MONTHLY'));
  v_tier_upper text := upper(coalesce(btrim(p_tier), 'TIER_1_MSME'));
  v_currency text := upper(coalesce(btrim(p_currency), 'INR'));
  v_type text := upper(coalesce(btrim(p_payment_type), ''));
  v_existing_log_id uuid;
  v_existing_payment_id uuid;
  v_recorder uuid;
BEGIN
  -- Mark this transaction as authorized system-verified payment write
  PERFORM set_config('otp.verified_payment_write', 'on', true);

  IF p_gateway_event_id IS NULL OR btrim(p_gateway_event_id) = '' THEN
    RAISE EXCEPTION 'gateway_event_id is required for idempotent settlement (PAY-V-EVENT-ID-REQUIRED)';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Verified payment amount must be greater than 0 (PAY-V-INVALID-AMOUNT)';
  END IF;

  SELECT id INTO v_existing_log_id
  FROM public.subscription_payment_logs
  WHERE gateway_event_id = p_gateway_event_id;
  IF v_existing_log_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Payment webhook already processed (idempotent duplicate)',
      'log_id', v_existing_log_id,
      'duplicate', true
    );
  END IF;

  SELECT id INTO v_existing_payment_id
  FROM public.payments
  WHERE gateway_event_id = p_gateway_event_id;
  IF v_existing_payment_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Invoice payment webhook already processed (idempotent duplicate)',
      'payment_id', v_existing_payment_id,
      'duplicate', true
    );
  END IF;

  IF v_type = 'SUBSCRIPTION' THEN
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'organization_id is required for subscription payments';
    END IF;
    IF v_currency <> 'INR' THEN
      RAISE EXCEPTION 'Unsupported subscription currency % (PAY-V-CURRENCY-MISMATCH)', v_currency;
    END IF;
    IF v_tier_upper NOT IN ('TIER_1_MSME', 'TIER_2_ENTERPRISE') THEN
      RAISE EXCEPTION 'Unknown subscription tier % (PAY-V-UNKNOWN-TIER)', v_tier_upper;
    END IF;
    IF v_cycle_upper NOT IN ('MONTHLY', 'YEARLY') THEN
      RAISE EXCEPTION 'Unknown billing cycle % (PAY-V-UNKNOWN-CYCLE)', v_cycle_upper;
    END IF;

    SELECT * INTO v_org
    FROM public.organizations
    WHERE id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Organization % not found', p_organization_id;
    END IF;
    IF v_org.blocked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Organization % is blocked and cannot take payments (PAY-V-ORG-BLOCKED)', p_organization_id;
    END IF;

    v_validity_days := CASE WHEN v_cycle_upper = 'YEARLY' THEN 365 ELSE 30 END;

    v_prev_expires := v_org.subscription_expires_at;
    IF v_prev_expires IS NULL OR v_prev_expires < v_now THEN
      v_new_expires := v_now + (v_validity_days || ' days')::interval;
    ELSE
      v_new_expires := v_prev_expires + (v_validity_days || ' days')::interval;
    END IF;

    UPDATE public.organizations
    SET subscription_tier = v_tier_upper,
        subscription_status = 'ACTIVE',
        subscription_plan = v_cycle_upper,
        subscription_expires_at = v_new_expires,
        payment_reference = COALESCE(p_payment_reference, p_gateway_event_id),
        updated_at = v_now
    WHERE id = p_organization_id;

    INSERT INTO public.subscription_payment_logs (
      organization_id, tier, billing_cycle, amount, currency, payment_method,
      payment_reference, validity_days, previous_expires_at, new_expires_at,
      status, gateway, gateway_event_id, gateway_payload, created_at
    ) VALUES (
      p_organization_id, v_tier_upper, v_cycle_upper, p_amount, v_currency,
      coalesce(p_gateway, 'GATEWAY_WEBHOOK'),
      coalesce(p_payment_reference, p_gateway_event_id),
      v_validity_days, v_prev_expires, v_new_expires,
      'SUCCESS', p_gateway, p_gateway_event_id, p_gateway_payload, v_now
    ) RETURNING id INTO v_existing_log_id;

    INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload, actor_id)
    VALUES (
      'SUBSCRIPTION_PAYMENT_VERIFIED',
      'ORGANIZATION',
      p_organization_id,
      jsonb_build_object(
        'tier', v_tier_upper, 'cycle', v_cycle_upper, 'amount', p_amount,
        'currency', v_currency, 'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id, 'expires_at', v_new_expires
      ),
      coalesce(
        (SELECT om.profile_id FROM public.organization_members om
         WHERE om.organization_id = p_organization_id AND om.role = 'OWNER'
         ORDER BY om.joined_at LIMIT 1),
        (SELECT id FROM public.profiles WHERE is_platform_admin = true ORDER BY created_at LIMIT 1)
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Subscription payment verified and activated successfully',
      'log_id', v_existing_log_id,
      'organization_id', p_organization_id,
      'tier', v_tier_upper,
      'plan', v_cycle_upper,
      'expires_at', v_new_expires,
      'validity_days', v_validity_days
    );

  ELSIF v_type = 'INVOICE' THEN
    IF p_invoice_id IS NULL THEN
      RAISE EXCEPTION 'invoice_id is required for invoice payments';
    END IF;

    SELECT id, amount, currency, status, balance_due, purchase_order_id, work_order_id
    INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target invoice % not found (PAY-V-INVOICE-NOT-FOUND)', p_invoice_id;
    END IF;
    IF v_inv.status::text NOT IN ('APPROVED', 'PARTIALLY_PAID') THEN
      RAISE EXCEPTION 'Invoice % is not payable in status % (PAY-V-INVOICE-NOT-PAYABLE)', p_invoice_id, v_inv.status;
    END IF;
    IF upper(v_inv.currency) <> v_currency THEN
      RAISE EXCEPTION 'Payment currency % does not match invoice currency % (PAY-V-CURRENCY-MISMATCH)', v_currency, v_inv.currency;
    END IF;
    IF p_amount > v_inv.balance_due THEN
      RAISE EXCEPTION 'Payment amount % exceeds invoice balance due % (PAY-V-AMOUNT-EXCEEDS-BALANCE)', p_amount, v_inv.balance_due;
    END IF;

    v_po_id := COALESCE(
      v_inv.purchase_order_id,
      (SELECT wo.purchase_order_id FROM public.work_orders wo WHERE wo.id = v_inv.work_order_id)
    );
    SELECT po.organization_id INTO v_po_org FROM public.purchase_orders po WHERE po.id = v_po_id;
    IF p_organization_id IS NOT NULL AND v_po_org IS DISTINCT FROM p_organization_id THEN
      RAISE EXCEPTION 'Payment organization does not own this invoice (PAY-V-ORG-MISMATCH)';
    END IF;

    v_recorder := (SELECT id FROM public.profiles WHERE is_platform_admin = true ORDER BY created_at LIMIT 1);

    INSERT INTO public.payments (
      invoice_id, purchase_order_id, amount, unallocated_amount, currency, method,
      status, gateway_status, reference, gateway, gateway_event_id, gateway_payload,
      recorded_by, recorded_at, verified_at
    ) VALUES (
      p_invoice_id, v_po_id, p_amount, 0.00, v_currency, 'OTHER'::public.payment_method,
      'VERIFIED'::public.payment_status, 'SUCCEEDED'::public.payment_gateway_status,
      coalesce(p_payment_reference, p_gateway_event_id), p_gateway, p_gateway_event_id,
      p_gateway_payload, v_recorder, v_now, v_now
    ) RETURNING id INTO v_existing_payment_id;

    INSERT INTO public.payment_allocations (
      payment_id, invoice_id, allocated_amount, allocated_at, status, allocated_by, notes
    ) VALUES (
      v_existing_payment_id, p_invoice_id, p_amount, v_now, 'ALLOCATED', v_recorder,
      'Verified gateway payment'
    );

    INSERT INTO public.audit_events (event_type, entity_type, entity_id, payload)
    VALUES (
      'INVOICE_PAYMENT_VERIFIED',
      'INVOICE',
      p_invoice_id,
      jsonb_build_object(
        'amount', p_amount, 'currency', v_currency, 'gateway', p_gateway,
        'gateway_event_id', p_gateway_event_id, 'payment_id', v_existing_payment_id
      )
    );

    RETURN jsonb_build_object(
      'ok', true,
      'message', 'Invoice payment verified and settled successfully',
      'payment_id', v_existing_payment_id,
      'invoice_id', p_invoice_id
    );
  ELSE
    RAISE EXCEPTION 'Unsupported payment_type: %', p_payment_type;
  END IF;

EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Payment webhook already processed (idempotent duplicate)',
    'duplicate', true
  );
END;
$function$;

REVOKE ALL ON FUNCTION private.record_verified_payment_bound(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.record_verified_payment_bound(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) TO service_role;


