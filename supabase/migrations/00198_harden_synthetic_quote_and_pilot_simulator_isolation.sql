-- Migration 00198: Harden synthetic-quote and pilot-simulator isolation
--
-- Real pilot RFQs must receive zero synthetic quotes and zero auto-completed
-- fulfillment, whatever the supplier-network stub flag says.
--
-- 1. private.supplier_network_stub_enabled(): fail closed (false) when no
--    demo_settings row exists (was: true).
-- 2. public.admin_toggle_supplier_network_stub(): platform admin or service_role
--    only (the 00130 check was always true for anon/authenticated); EXECUTE
--    revoked from anon/PUBLIC.
-- 3. public.discover_and_invite_for_rfq(): no longer calls
--    auto_submit_pilot_quotes. Everything else is carried over unchanged from
--    00188 (authorization, DRAFT/OPEN guard, ranked + fallback invitations,
--    anti-leak labels, OPEN/QUOTING transition, audit event, return shape).
-- 4. public.seed_simulated_quotes_for_rfq() / public.auto_submit_pilot_quotes():
--    original bodies move unchanged to private.*_impl; the public entry points
--    become guards that require platform admin / service_role / local superuser
--    AND an is_demo RFQ. EXECUTE revoked from anon/PUBLIC and on the impls.
-- 5. private.simulate_pilot_supplier_fulfillment(): returns early unless the
--    work order, its PO, or its RFQ is flagged is_demo.
--
-- Idempotent and non-destructive: no table, column, row or policy is dropped
-- or deleted.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Stub flag fails closed
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.supplier_network_stub_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT supplier_network_stub_enabled FROM demo_settings WHERE id), false);
$$;

-- ---------------------------------------------------------------------------
-- 2. Stub toggle: platform admin / service_role only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_toggle_supplier_network_stub(
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NOT (private.is_platform_admin() OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'Access denied: platform admin privileges required';
  END IF;

  INSERT INTO public.demo_settings (id, supplier_network_stub_enabled, updated_at)
  VALUES (true, p_enabled, now())
  ON CONFLICT (id) DO UPDATE
  SET supplier_network_stub_enabled = p_enabled,
      updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'supplier_network_stub_enabled', p_enabled,
    'message', CASE WHEN p_enabled THEN 'Supplier network simulation stub enabled' ELSE 'Supplier network simulation stub disabled (Real Suppliers Only)' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_supplier_network_stub(boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_toggle_supplier_network_stub(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_toggle_supplier_network_stub(boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Discovery never fabricates quotes
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(
  p_rfq_id  uuid,
  p_limit   integer DEFAULT 10,
  p_exclude uuid[] DEFAULT '{}'::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq       rfqs%ROWTYPE;
  v_req       requirements%ROWTYPE;
  v_candidate record;
  v_invited   int := 0;
  v_evaluated int := 0;
  v_label     text;
  v_limit     int := GREATEST(COALESCE(p_limit, 10), 1);
  v_quotes_res jsonb := NULL;
  v_is_staging boolean := COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';
  v_is_reset   boolean := COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on';
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;

  -- Authorization check: caller must belong to org, be platform admin, or run during demo reset/staging
  IF NOT (
    v_is_staging
    OR v_is_reset
    OR private.is_org_member(v_rfq.organization_id)
    OR private.is_platform_admin()
  ) THEN
    RAISE EXCEPTION 'Access denied: not an organization member';
  END IF;

  IF v_rfq.status NOT IN ('DRAFT', 'OPEN') THEN
    RAISE EXCEPTION 'Discovery only allowed while RFQ is DRAFT or OPEN';
  END IF;

  -- Pass 1: Canonical capability-based ranking
  FOR v_candidate IN
    SELECT * FROM private.rank_discovery_candidates(p_rfq_id, p_exclude)
    LIMIT v_limit
  LOOP
    v_evaluated := v_evaluated + 1;

    IF EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND supplier_id = v_candidate.supplier_id
    ) THEN
      CONTINUE;
    END IF;

    v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

    INSERT INTO rfq_invitations (
      rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
    ) VALUES (
      p_rfq_id,
      v_candidate.supplier_id,
      v_label,
      'INVITED',
      v_candidate.match_score,
      v_candidate.match_reasons
    );

    v_invited := v_invited + 1;
  END LOOP;

  -- Pass 2: Fallback for requirements without structured capabilities (strict anti-leak compliance: no source)
  IF (v_invited + (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id)) < 4 THEN
    FOR v_candidate IN
      SELECT s.id AS supplier_id, COALESCE(s.rating_avg, 4.0) * 20 AS match_score,
             ARRAY['category_match', 'verified_active'] AS match_reasons
      FROM suppliers s
      WHERE s.status = 'ACTIVE'
        AND NOT (s.id = ANY(COALESCE(p_exclude, '{}')))
        AND NOT EXISTS (
          SELECT 1 FROM rfq_invitations
          WHERE rfq_id = p_rfq_id AND supplier_id = s.id
        )
      ORDER BY s.rating_avg DESC NULLS LAST
      LIMIT (4 - (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id))
    LOOP
      v_label := private.assign_anonymous_label(p_rfq_id, v_candidate.supplier_id);

      INSERT INTO rfq_invitations (
        rfq_id, supplier_id, anonymous_label, status, match_score, match_reasons
      ) VALUES (
        p_rfq_id,
        v_candidate.supplier_id,
        v_label,
        'INVITED',
        v_candidate.match_score,
        v_candidate.match_reasons
      );

      v_invited := v_invited + 1;
    END LOOP;
  END IF;

  -- Transition RFQ to OPEN if in DRAFT
  IF v_rfq.status = 'DRAFT' THEN
    UPDATE rfqs
    SET status = 'OPEN',
        quote_deadline = COALESCE(quote_deadline, now() + interval '5 days'),
        updated_at = now()
    WHERE id = p_rfq_id;

    IF NOT v_is_staging AND NOT v_rfq.is_demo THEN
      UPDATE requirements
      SET status = 'QUOTING'::requirement_status,
          updated_at = now()
      WHERE id = v_rfq.requirement_id;
    END IF;
  END IF;

  -- Discovery only invites. Quotes come from suppliers (or, for demo RFQs, from
  -- the explicit demo seeders) — never from here.
  v_quotes_res := jsonb_build_object('skipped', true, 'reason', 'Discovery never generates quotes');

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'rfq.suppliers_discovered',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object('invited', v_invited, 'evaluated', v_evaluated)
  );

  RETURN jsonb_build_object(
    'success', true,
    'invited', v_invited,
    'evaluated', v_evaluated,
    'total', (SELECT count(*)::int FROM rfq_invitations WHERE rfq_id = p_rfq_id),
    'quotes_result', v_quotes_res
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[]) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 4. Simulated-quote RPCs: move bodies to private, guard public entry points
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('private.seed_simulated_quotes_for_rfq_impl(uuid, integer)') IS NULL
     AND to_regprocedure('public.seed_simulated_quotes_for_rfq(uuid, integer)') IS NOT NULL THEN
    ALTER FUNCTION public.seed_simulated_quotes_for_rfq(uuid, integer) RENAME TO seed_simulated_quotes_for_rfq_impl;
    ALTER FUNCTION public.seed_simulated_quotes_for_rfq_impl(uuid, integer) SET SCHEMA private;
  END IF;

  IF to_regprocedure('private.auto_submit_pilot_quotes_impl(uuid)') IS NULL
     AND to_regprocedure('public.auto_submit_pilot_quotes(uuid)') IS NOT NULL THEN
    ALTER FUNCTION public.auto_submit_pilot_quotes(uuid) RENAME TO auto_submit_pilot_quotes_impl;
    ALTER FUNCTION public.auto_submit_pilot_quotes_impl(uuid) SET SCHEMA private;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.seed_simulated_quotes_for_rfq_impl(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.auto_submit_pilot_quotes_impl(uuid) FROM PUBLIC, anon, authenticated;

-- Shared guard: privileged caller AND demo RFQ.
CREATE OR REPLACE FUNCTION private.assert_synthetic_quotes_allowed(p_rfq_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_is_demo boolean;
BEGIN
  IF NOT (
    private.is_platform_admin()
    OR COALESCE(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin')
  ) THEN
    RETURN 'Access denied: simulated quotes require platform admin';
  END IF;

  SELECT is_demo INTO v_is_demo FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RETURN 'RFQ not found';
  END IF;

  IF v_is_demo IS NOT TRUE THEN
    RETURN 'Simulated quotes are disabled for real RFQs';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_synthetic_quotes_allowed(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.seed_simulated_quotes_for_rfq(
  p_rfq_id uuid,
  p_count  integer DEFAULT 4
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_denied text;
BEGIN
  v_denied := private.assert_synthetic_quotes_allowed(p_rfq_id);
  IF v_denied IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_denied);
  END IF;
  RETURN private.seed_simulated_quotes_for_rfq_impl(p_rfq_id, p_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_submit_pilot_quotes(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_denied text;
BEGIN
  v_denied := private.assert_synthetic_quotes_allowed(p_rfq_id);
  IF v_denied IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', v_denied);
  END IF;
  RETURN private.auto_submit_pilot_quotes_impl(p_rfq_id);
END;
$$;

REVOKE ALL ON FUNCTION public.seed_simulated_quotes_for_rfq(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.seed_simulated_quotes_for_rfq(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.seed_simulated_quotes_for_rfq(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auto_submit_pilot_quotes(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_submit_pilot_quotes(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auto_submit_pilot_quotes(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Stubbed fulfillment only ever touches demo work orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.simulate_pilot_supplier_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_now timestamptz := now();
  v_invoice_number text;
  v_rfq_is_demo boolean;
BEGIN
  IF NOT private.supplier_network_stub_enabled() THEN RETURN NEW; END IF;

  -- Skip if the work order or PO is already completed or seeded in final state
  IF NEW.status = 'COMPLETED' THEN RETURN NEW; END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = NEW.purchase_order_id;
  IF NOT FOUND OR v_po.status IN ('COMPLETED', 'CANCELLED') THEN RETURN NEW; END IF;

  -- Real work orders are completed by the supplier, step by step. Never here.
  SELECT is_demo INTO v_rfq_is_demo FROM rfqs WHERE id = v_po.rfq_id;
  IF NOT (COALESCE(NEW.is_demo, false) OR COALESCE(v_po.is_demo, false) OR COALESCE(v_rfq_is_demo, false)) THEN
    RETURN NEW;
  END IF;

  -- Prevent duplicate invoice generation if an invoice already exists for this WO / PO
  IF EXISTS (SELECT 1 FROM public.invoices WHERE work_order_id = NEW.id OR purchase_order_id = v_po.id) THEN
    RETURN NEW;
  END IF;

  -- The supplier accepts the PO immediately: nobody real is waiting to click it.
  UPDATE purchase_orders
  SET status = 'ACCEPTED', acknowledged_at = COALESCE(acknowledged_at, v_now), updated_at = v_now
  WHERE id = v_po.id AND status = 'ISSUED';

  -- The supplier finishes the work immediately.
  UPDATE work_orders
  SET status = 'COMPLETED',
      progress_percent = 100,
      actual_start = COALESCE(actual_start, v_now),
      completed_at = COALESCE(completed_at, v_now),
      updated_at = v_now
  WHERE id = NEW.id;

  -- The supplier raises the invoice for the buyer to actually approve and pay.
  v_invoice_number := 'INV-' || to_char(v_now, 'YYYYMMDD')
    || '-' || upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8));

  INSERT INTO invoices (
    work_order_id, supplier_id, invoice_number, amount, currency, status, submitted_at
  ) VALUES (
    NEW.id, NEW.supplier_id, v_invoice_number, v_po.total_amount, v_po.currency, 'SUBMITTED', v_now
  );

  RETURN NEW;
END;
$$;

COMMIT;
