-- Personal procurement lifecycle for Individual buyers (organization_id = NULL).
--
-- Completes 00281: an Individual is a "personal buyer" whose requirements, RFQs, purchase
-- orders and everything downstream are owned by owner_profile_id, never by a synthetic
-- organization. Existing "Self" organizations of legacy Individuals are NOT migrated here
-- (see public.individual_ownership_migration_report); they keep working as organizations.
--
--   * personal_buyer_accounts / personal_subscriptions: server-owned tables (no client
--     writes). Being a personal buyer is not a profile column a user could set.
--   * Scope helpers is_buyer_scope_member / manager / get_buyer_scope_role accept the
--     (organization_id, owner_profile_id) pair; personal rows resolve to their owner only.
--   * Existing lifecycle functions and RLS policies are patched in place, with every
--     replaced fragment asserted to match exactly once so a drifted definition fails loudly
--     instead of silently skipping an authorization change.
--   * The RFQ entitlement trigger now counts personal RFQs per owner (before this, a
--     NULL organization would have counted zero and allowed unlimited RFQs) and reads the
--     personal subscription.
--   * Signup provisioning, ensure_buyer_organization and my_role_context no longer create
--     a "Self" organization for personal buyers; complimentary onboarding is a personal
--     subscription row with no payment record and no invented amount.
--   * Personal buyers hold full buyer permissions over their own records only (RLS and
--     the owner checks above still bound every row).

BEGIN;

CREATE TABLE IF NOT EXISTS public.personal_buyer_accounts (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.personal_subscriptions (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_tier text NOT NULL DEFAULT 'INDIVIDUAL',
  subscription_plan text NOT NULL DEFAULT 'MONTHLY' CHECK (subscription_plan IN ('MONTHLY', 'YEARLY')),
  subscription_status text NOT NULL DEFAULT 'ACTIVE',
  subscription_started_at timestamptz NOT NULL DEFAULT now(),
  subscription_expires_at timestamptz,
  payment_reference text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.personal_buyer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_buyer_accounts_own ON public.personal_buyer_accounts;
CREATE POLICY personal_buyer_accounts_own ON public.personal_buyer_accounts FOR SELECT TO authenticated
  USING (profile_id = private.get_profile_id() OR private.is_platform_admin());
DROP POLICY IF EXISTS personal_subscriptions_own ON public.personal_subscriptions;
CREATE POLICY personal_subscriptions_own ON public.personal_subscriptions FOR SELECT TO authenticated
  USING (profile_id = private.get_profile_id() OR private.is_platform_admin());

REVOKE ALL ON public.personal_buyer_accounts, public.personal_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.personal_buyer_accounts, public.personal_subscriptions TO authenticated;
GRANT ALL ON public.personal_buyer_accounts, public.personal_subscriptions TO service_role;

CREATE OR REPLACE FUNCTION private.is_personal_buyer_profile(p_profile uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.personal_buyer_accounts WHERE profile_id = p_profile);
$$;

CREATE OR REPLACE FUNCTION private.is_buyer_scope_member(p_org uuid, p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE WHEN p_org IS NOT NULL THEN private.is_org_member(p_org)
              ELSE p_owner IS NOT NULL
                   AND (p_owner = private.get_profile_id() OR private.is_platform_admin()) END;
$$;

CREATE OR REPLACE FUNCTION private.is_buyer_scope_manager(p_org uuid, p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE WHEN p_org IS NOT NULL THEN private.is_org_manager_or_above(p_org)
              ELSE p_owner IS NOT NULL
                   AND (p_owner = private.get_profile_id() OR private.is_platform_admin()) END;
$$;

CREATE OR REPLACE FUNCTION private.get_buyer_scope_role(p_org uuid, p_owner uuid)
RETURNS org_member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE WHEN p_org IS NOT NULL THEN private.get_org_role(p_org)
              WHEN p_owner IS NOT NULL AND p_owner = private.get_profile_id() THEN 'OWNER'::org_member_role
              ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION private.is_buyer_scope_member_for_rfq(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT COALESCE((SELECT private.is_buyer_scope_member(r.organization_id, r.owner_profile_id)
                   FROM public.rfqs r WHERE r.id = p_rfq_id), false);
$$;

CREATE OR REPLACE FUNCTION private.is_buyer_scope_manager_for_rfq(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT COALESCE((SELECT private.is_buyer_scope_manager(r.organization_id, r.owner_profile_id)
                   FROM public.rfqs r WHERE r.id = p_rfq_id), false);
$$;

REVOKE ALL ON FUNCTION private.is_personal_buyer_profile(uuid),
  private.is_buyer_scope_member(uuid, uuid), private.is_buyer_scope_manager(uuid, uuid),
  private.get_buyer_scope_role(uuid, uuid), private.is_buyer_scope_member_for_rfq(uuid),
  private.is_buyer_scope_manager_for_rfq(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_personal_buyer_profile(uuid),
  private.is_buyer_scope_member(uuid, uuid), private.is_buyer_scope_manager(uuid, uuid),
  private.get_buyer_scope_role(uuid, uuid), private.is_buyer_scope_member_for_rfq(uuid),
  private.is_buyer_scope_manager_for_rfq(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_access_rfq_as_buyer(p_rfq_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
  SELECT private.is_buyer_scope_member_for_rfq(p_rfq_id);
$$;

-- Personal rows may only be created for personal buyers; the owner defaults to the caller
-- so a client cannot leave a record ownerless. Named a_* so it fires before the other
-- BEFORE triggers on these tables.
CREATE OR REPLACE FUNCTION private.default_personal_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    IF NEW.owner_profile_id IS NULL THEN
      NEW.owner_profile_id := private.get_profile_id();
    END IF;
    IF NEW.owner_profile_id IS NULL
       OR NOT private.is_personal_buyer_profile(NEW.owner_profile_id) THEN
      RAISE EXCEPTION 'Only an Individual buyer account can own a personal record (PERSONAL_OWNER_REQUIRES_INDIVIDUAL)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.default_personal_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS a_personal_owner_default ON public.requirements;
CREATE TRIGGER a_personal_owner_default BEFORE INSERT ON public.requirements
  FOR EACH ROW EXECUTE FUNCTION private.default_personal_owner();
DROP TRIGGER IF EXISTS a_personal_owner_default ON public.rfqs;
CREATE TRIGGER a_personal_owner_default BEFORE INSERT ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.default_personal_owner();
DROP TRIGGER IF EXISTS a_personal_owner_default ON public.purchase_orders;
CREATE TRIGGER a_personal_owner_default BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.default_personal_owner();

-- Entitlement: 3 RFQs per UTC month, plus one non-carrying quarterly bonus on an active
-- yearly plan. Counting is scoped to the owner (organization or personal buyer).
CREATE OR REPLACE FUNCTION private.enforce_pilot_rfq_allowance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'pg_temp'
AS $$
DECLARE
  v_allowance CONSTANT integer := 3;
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_quarter_start timestamptz := date_trunc('quarter', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_used integer;
  v_bonus_used integer := 0;
  v_plan text := '';
  v_status text := '';
  v_expires timestamptz;
  v_org_type text := '';
  v_yearly boolean := false;
  v_found boolean := false;
BEGIN
  IF private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.created_at < v_month_start OR NEW.created_at >= v_month_start + interval '1 month' THEN
    RAISE EXCEPTION 'Pilot Allowance: an RFQ counts in the current UTC calendar month and cannot be recorded outside that month.'
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
  END IF;

  IF NEW.organization_id IS NOT NULL THEN
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at,
           upper(btrim(COALESCE(org_type::text, '')))
      INTO v_plan, v_status, v_expires, v_org_type
    FROM public.organizations
    WHERE id = NEW.organization_id
    FOR UPDATE;
    v_found := FOUND;
  ELSE
    -- Serialize concurrent personal RFQs of one owner, then read the personal subscription.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.owner_profile_id::text, 0));
    SELECT upper(btrim(COALESCE(subscription_plan, ''))),
           COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
           subscription_expires_at,
           'INDIVIDUAL'
      INTO v_plan, v_status, v_expires, v_org_type
    FROM public.personal_subscriptions
    WHERE profile_id = NEW.owner_profile_id;
    v_found := FOUND;
  END IF;

  IF v_found THEN
    v_yearly := v_plan = 'YEARLY'
      AND v_status = 'ACTIVE'
      AND (v_expires IS NULL OR v_expires >= now())
      AND v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME');
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.rfqs
  WHERE organization_id IS NOT DISTINCT FROM NEW.organization_id
    AND owner_profile_id IS NOT DISTINCT FROM NEW.owner_profile_id
    AND created_at >= v_month_start
    AND created_at < v_month_start + interval '1 month'
    AND status IS DISTINCT FROM 'CANCELLED'::public.rfq_status;

  IF v_used < v_allowance THEN
    RETURN NEW;
  END IF;

  IF v_yearly AND v_used = v_allowance THEN
    SELECT COALESCE(SUM(GREATEST(month_count - v_allowance, 0)), 0)::integer
      INTO v_bonus_used
    FROM (
      SELECT count(*)::integer AS month_count
      FROM public.rfqs
      WHERE organization_id IS NOT DISTINCT FROM NEW.organization_id
        AND owner_profile_id IS NOT DISTINCT FROM NEW.owner_profile_id
        AND created_at >= v_quarter_start
        AND created_at < v_quarter_start + interval '3 months'
        AND status IS DISTINCT FROM 'CANCELLED'::public.rfq_status
      GROUP BY date_trunc('month', created_at AT TIME ZONE 'UTC')
    ) quarter_months;

    IF COALESCE(v_bonus_used, 0) < 1 THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_yearly THEN
    RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). The yearly plan quarterly bonus RFQ for this UTC calendar quarter is already used and does not carry into the next month.', v_allowance
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
  END IF;

  RAISE EXCEPTION 'Pilot Allowance: 0 of % RFQs remaining this month (₹0 charged in Pilot Mode). You have used all RFQs in this month''s pilot allowance. It resets on the 1st of next month.', v_allowance
    USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
END;
$$;

-- Whitespace-insensitive, exactly-once patcher for existing function definitions.
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(p_proc regprocedure, p_old text[], p_new text[], p_marker text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_def text := pg_get_functiondef(p_proc);
  v_rx text;
  v_count integer;
  i integer;
BEGIN
  IF position(p_marker IN v_def) > 0 THEN
    RETURN;
  END IF;
  FOR i IN 1 .. array_length(p_old, 1) LOOP
    v_rx := regexp_replace(
              regexp_replace(p_old[i], '([.\[\]\(\)\{\}\*\+\?\^\$\|\\])', '\\\1', 'g'),
              '\s+', '\s+', 'g');
    SELECT count(*) INTO v_count FROM regexp_matches(v_def, v_rx, 'g');
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'patch % fragment % matched % times (expected exactly 1)', p_proc, i, v_count;
    END IF;
    v_def := regexp_replace(v_def, v_rx, replace(replace(p_new[i], '\', '\\'), '&', '\&'));
  END LOOP;
  EXECUTE v_def;
END;
$$;

SELECT pg_temp.patch_fn(
  'public.publish_requirement(uuid, sourcing_mode, integer, integer, jsonb, text)'::regprocedure,
  ARRAY[
    'IF NOT private.is_org_member(v_req.organization_id) THEN',
    'IF private.get_org_role(v_req.organization_id) NOT IN (''OWNER'', ''MANAGER'', ''BUYER'')',
    'requirement_id, organization_id, status, reveal_status, title,',
    '    ''DRAFT'',
    ''BLIND'','
  ],
  ARRAY[
    'IF NOT private.is_buyer_scope_member(v_req.organization_id, v_req.owner_profile_id) THEN',
    'IF private.get_buyer_scope_role(v_req.organization_id, v_req.owner_profile_id) NOT IN (''OWNER'', ''MANAGER'', ''BUYER'')',
    'requirement_id, organization_id, owner_profile_id, status, reveal_status, title,',
    '    v_req.owner_profile_id, ''DRAFT'',
    ''BLIND'','
  ],
  'is_buyer_scope_member(v_req.organization_id');

SELECT pg_temp.patch_fn(
  'public.create_purchase_order_from_award(uuid)'::regprocedure,
  ARRAY[
    'OR private.is_org_member(v_rfq.organization_id)',
    'award_id, rfq_id, organization_id, supplier_id, po_number,',
    'p_award_id, v_rfq.id, v_rfq.organization_id, v_quote.supplier_id,'
  ],
  ARRAY[
    'OR private.is_buyer_scope_member(v_rfq.organization_id, v_rfq.owner_profile_id)',
    'award_id, rfq_id, organization_id, owner_profile_id, supplier_id, po_number,',
    'p_award_id, v_rfq.id, v_rfq.organization_id, v_rfq.owner_profile_id, v_quote.supplier_id,'
  ],
  'is_buyer_scope_member(v_rfq.organization_id');

SELECT pg_temp.patch_fn(
  'public.lock_and_reveal_award_atomic(uuid, uuid, text, boolean)'::regprocedure,
  ARRAY['COALESCE(private.is_org_manager_or_above(v_rfq.organization_id), false)'],
  ARRAY['COALESCE(private.is_buyer_scope_manager(v_rfq.organization_id, v_rfq.owner_profile_id), false)'],
  'is_buyer_scope_manager(v_rfq.organization_id');

SELECT pg_temp.patch_fn(
  'public.record_invoice_payment_atomic(uuid, numeric, payment_method, text, text, uuid, text, text)'::regprocedure,
  ARRAY['private.get_org_role(po.organization_id) IN'],
  ARRAY['private.get_buyer_scope_role(po.organization_id, po.owner_profile_id) IN'],
  'get_buyer_scope_role(po.organization_id');

SELECT pg_temp.patch_fn(
  'public.process_rfq_cancellation(uuid, exit_reason_code, text, uuid)'::regprocedure,
  ARRAY[
    'IF NOT private.is_org_manager_or_above(v_rfq.organization_id)',
    'PERFORM private.recalculate_buyer_reliability_score(v_rfq.organization_id);'
  ],
  ARRAY[
    'IF NOT private.is_buyer_scope_manager(v_rfq.organization_id, v_rfq.owner_profile_id)',
    'IF v_rfq.organization_id IS NOT NULL THEN PERFORM private.recalculate_buyer_reliability_score(v_rfq.organization_id); END IF;'
  ],
  'is_buyer_scope_manager(v_rfq.organization_id');

SELECT pg_temp.patch_fn(
  'public.cancel_purchase_order_atomic(uuid, text)'::regprocedure,
  ARRAY['private.get_org_role(v_po.organization_id) IN'],
  ARRAY['private.get_buyer_scope_role(v_po.organization_id, v_po.owner_profile_id) IN'],
  'get_buyer_scope_role(v_po.organization_id');

SELECT pg_temp.patch_fn(
  'public.initialize_work_order(uuid)'::regprocedure,
  ARRAY['IF NOT private.is_org_member(v_po.organization_id)'],
  ARRAY['IF NOT private.is_buyer_scope_member(v_po.organization_id, v_po.owner_profile_id)'],
  'is_buyer_scope_member(v_po.organization_id');

SELECT pg_temp.patch_fn(
  'public.approve_milestone_inspection_atomic(uuid, uuid, text, text)'::regprocedure,
  ARRAY['IF NOT private.is_org_member(v_po.organization_id) AND'],
  ARRAY['IF NOT private.is_buyer_scope_member(v_po.organization_id, v_po.owner_profile_id) AND'],
  'is_buyer_scope_member(v_po.organization_id');

SELECT pg_temp.patch_fn(
  'public.get_purchase_order_invoicing_summary(uuid)'::regprocedure,
  ARRAY['OR private.is_org_member(v_po.organization_id)'],
  ARRAY['OR private.is_buyer_scope_member(v_po.organization_id, v_po.owner_profile_id)'],
  'is_buyer_scope_member(v_po.organization_id');

SELECT pg_temp.patch_fn(
  'public.discover_and_invite_for_rfq(uuid, integer, uuid[], text)'::regprocedure,
  ARRAY['OR private.is_org_member(v_rfq.organization_id)'],
  ARRAY['OR private.is_buyer_scope_member(v_rfq.organization_id, v_rfq.owner_profile_id)'],
  'is_buyer_scope_member(v_rfq.organization_id');

-- Personal buyers hold the buyer permissions over their own records (rows stay owner-scoped).
SELECT pg_temp.patch_fn(
  'private.has_role_permission(role_permission)'::regprocedure,
  ARRAY['IF v_is_owner THEN RETURN true; END IF;'],
  ARRAY['IF v_is_owner OR private.is_personal_buyer_profile(v_profile) THEN RETURN true; END IF;'],
  'is_personal_buyer_profile(v_profile)');

-- No synthetic organization for personal buyers in the role context.
SELECT pg_temp.patch_fn(
  'public.my_role_context()'::regprocedure,
  ARRAY[
    'IF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name, org_type, status, free_rfq_credits, rfq_credits_used)'
  ],
  ARRAY[
    'IF v_org_id IS NULL AND private.is_personal_buyer_profile(v_profile) THEN
      v_org_role := ''OWNER'';
      v_org_type := ''INDIVIDUAL'';
    ELSIF v_org_id IS NULL THEN
      INSERT INTO public.organizations (name, org_type, status, free_rfq_credits, rfq_credits_used)'
  ],
  'is_personal_buyer_profile(v_profile)');

-- Signup provisioning: Individuals become personal buyers with NO organization and a
-- complimentary personal subscription (no payment record, no amount).
SELECT pg_temp.patch_fn(
  'private.provision_signup_request(uuid, uuid, text, boolean)'::regprocedure,
  ARRAY[
    'IF v_req.side = ''BUYER'' THEN
    v_org_name := COALESCE(',
    'ELSE -- SUPPLIER'
  ],
  ARRAY[
    'IF v_req.side = ''BUYER'' AND v_req.buyer_type = ''INDIVIDUAL'' THEN
    INSERT INTO public.personal_buyer_accounts (profile_id) VALUES (v_profile_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.personal_subscriptions (
      profile_id, subscription_tier, subscription_plan, subscription_status,
      subscription_started_at, subscription_expires_at, payment_reference
    ) VALUES (
      v_profile_id, ''INDIVIDUAL'', ''MONTHLY'', ''ACTIVE'',
      now(), now() + interval ''30 days'', ''REG-ONBOARD-COMPLIMENTARY''
    ) ON CONFLICT (profile_id) DO NOTHING;
    UPDATE public.profiles
    SET active_organization_id = NULL,
        active_portal_side = COALESCE(active_portal_side, ''BUYER''),
        updated_at = now()
    WHERE id = v_profile_id;
    UPDATE public.signup_requests
    SET status = ''ONBOARDED'',
        organization_id = NULL,
        reviewed_by = p_admin_id,
        reviewed_at = now(),
        review_notes = COALESCE(p_notes, ''Individual buyer provisioned with personal ownership'')
    WHERE id = p_request_id;
  ELSIF v_req.side = ''BUYER'' THEN
    v_org_name := COALESCE(',
    'ELSE -- SUPPLIER'
  ],
  'INSERT INTO public.personal_buyer_accounts');

CREATE OR REPLACE FUNCTION public.ensure_buyer_organization()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'auth', 'extensions'
AS $function$
DECLARE
  v_profile uuid := private.get_profile_id();
  v_auth_uid uuid := auth.uid();
  v_org_id uuid;
  v_org_name text;
  v_org_type text;
  v_role text;
  v_full_name text;
  v_buyer_role text;
BEGIN
  IF v_profile IS NULL THEN
    IF v_auth_uid IS NOT NULL THEN
      SELECT id, full_name INTO v_profile, v_full_name
      FROM public.profiles
      WHERE auth_user_id = v_auth_uid;

      IF v_profile IS NULL THEN
        INSERT INTO public.profiles (auth_user_id, email, full_name)
        SELECT id, COALESCE(email, 'user@otp.local'), COALESCE(raw_user_meta_data->>'full_name', 'User')
        FROM auth.users WHERE id = v_auth_uid
        RETURNING id, full_name INTO v_profile, v_full_name;
      END IF;
    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
    END IF;
  ELSE
    SELECT full_name INTO v_full_name FROM public.profiles WHERE id = v_profile;
  END IF;

  -- Personal buyers own their records directly; never create an organization for them.
  IF private.is_personal_buyer_profile(v_profile) THEN
    RETURN jsonb_build_object(
      'ok', true, 'personal', true, 'organizationId', NULL,
      'organizationName', NULL, 'orgType', 'INDIVIDUAL', 'role', 'OWNER'
    );
  END IF;

  SELECT om.organization_id, o.name, o.org_type::text, om.role::text
  INTO v_org_id, v_org_name, v_org_type, v_role
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.profile_id = v_profile OR (v_auth_uid IS NOT NULL AND om.profile_id = v_auth_uid)
  ORDER BY (o.org_type::text = 'INDIVIDUAL') DESC, o.name
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO public.organizations (name, org_type, status, free_rfq_credits, rfq_credits_used)
    VALUES (COALESCE(NULLIF(btrim(v_full_name), ''), 'Self'), 'INDIVIDUAL', 'ACTIVE', 1, 0)
    RETURNING id, name, org_type::text INTO v_org_id, v_org_name, v_org_type;

    v_role := 'OWNER';

    INSERT INTO public.organization_members (organization_id, profile_id, role)
    VALUES (v_org_id, v_profile, 'OWNER')
    ON CONFLICT DO NOTHING;

    UPDATE public.profiles
    SET active_organization_id = v_org_id,
        active_portal_side = COALESCE(active_portal_side, 'BUYER'),
        updated_at = now()
    WHERE id = v_profile;
  END IF;

  SELECT pr.role_code INTO v_buyer_role
  FROM public.profile_roles pr
  JOIN public.user_roles ur ON ur.code = pr.role_code
  WHERE pr.profile_id = v_profile AND ur.side = 'BUYER'
  LIMIT 1;

  IF v_buyer_role IS NULL THEN
    v_buyer_role := 'PROPERTY_OWNER';
    INSERT INTO public.profile_roles (profile_id, role_code)
    VALUES (v_profile, v_buyer_role)
    ON CONFLICT (profile_id, role_code) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'organizationId', v_org_id,
    'organizationName', v_org_name,
    'orgType', v_org_type,
    'role', v_role
  );
END;
$function$;

-- Downstream RLS: policies that resolve the buyer through a purchase order (alias po),
-- an rfq alias or private.rfq_org_id now use the owner-aware scope helpers.
DO $$
DECLARE
  p record;
  v_q text;
  v_wc text;
  v_sql text;
  v_changed integer := 0;
  v_rx_member constant text := 'private\.is_org_member\(((?:po|r))\.organization_id\)';
  v_rx_manager constant text := 'private\.is_org_manager_or_above\(((?:po|r))\.organization_id\)';
  v_rx_role constant text := 'private\.get_org_role\(((?:po|r))\.organization_id\)';
  v_rx_rfq_member constant text := 'private\.is_org_member\(private\.rfq_org_id\(([a-z_\.]+)\)\)';
  v_rx_rfq_manager constant text := 'private\.is_org_manager_or_above\(private\.rfq_org_id\(([a-z_\.]+)\)\)';
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('invoice_line_items', 'invoices', 'payment_allocations', 'payments',
                        'purchase_order_line_items', 'work_orders', 'suppliers',
                        'procurement_stage_events', 'rfq_invitations', 'rfq_clarification_messages')
  LOOP
    v_q := p.qual;
    v_wc := p.with_check;
    IF v_q IS NOT NULL THEN
      v_q := regexp_replace(v_q, v_rx_member, 'private.is_buyer_scope_member(\1.organization_id, \1.owner_profile_id)', 'g');
      v_q := regexp_replace(v_q, v_rx_manager, 'private.is_buyer_scope_manager(\1.organization_id, \1.owner_profile_id)', 'g');
      v_q := regexp_replace(v_q, v_rx_role, 'private.get_buyer_scope_role(\1.organization_id, \1.owner_profile_id)', 'g');
      v_q := regexp_replace(v_q, v_rx_rfq_member, 'private.is_buyer_scope_member_for_rfq(\1)', 'g');
      v_q := regexp_replace(v_q, v_rx_rfq_manager, 'private.is_buyer_scope_manager_for_rfq(\1)', 'g');
    END IF;
    IF v_wc IS NOT NULL THEN
      v_wc := regexp_replace(v_wc, v_rx_member, 'private.is_buyer_scope_member(\1.organization_id, \1.owner_profile_id)', 'g');
      v_wc := regexp_replace(v_wc, v_rx_manager, 'private.is_buyer_scope_manager(\1.organization_id, \1.owner_profile_id)', 'g');
      v_wc := regexp_replace(v_wc, v_rx_role, 'private.get_buyer_scope_role(\1.organization_id, \1.owner_profile_id)', 'g');
      v_wc := regexp_replace(v_wc, v_rx_rfq_member, 'private.is_buyer_scope_member_for_rfq(\1)', 'g');
      v_wc := regexp_replace(v_wc, v_rx_rfq_manager, 'private.is_buyer_scope_manager_for_rfq(\1)', 'g');
    END IF;
    IF v_q IS DISTINCT FROM p.qual OR v_wc IS DISTINCT FROM p.with_check THEN
      v_sql := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
      IF v_q IS NOT NULL THEN v_sql := v_sql || ' USING (' || v_q || ')'; END IF;
      IF v_wc IS NOT NULL THEN v_sql := v_sql || ' WITH CHECK (' || v_wc || ')'; END IF;
      EXECUTE v_sql;
      v_changed := v_changed + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'owner-aware policies rewritten: %', v_changed;
END $$;

COMMIT;
