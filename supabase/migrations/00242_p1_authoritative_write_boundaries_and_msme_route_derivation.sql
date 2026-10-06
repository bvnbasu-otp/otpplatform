-- =============================================================================
-- 00242: P1 cluster RC-A / RC-B — authoritative write boundaries (F-01..F-05) and
--        MSME approval-route derivation at the award boundary (F-06).
--
-- Root cause RC-A: `authenticated` holds table-level INSERT/UPDATE on every public table
--   (00005 / 00194) and the original 00004 RLS policies on awards, purchase_orders, quotes,
--   conflict_of_interest_declarations and organization_members still let ordinary signed-in
--   users write them directly, skipping every RPC invariant (quorum, snapshot, supplier
--   verification, amount freeze, conflict recusal, role ceilings). Tables are NO FORCE RLS and
--   every legitimate writer is a SECURITY DEFINER RPC owned by postgres, so tightening the
--   client surface cannot break them.
--
-- Root cause RC-B: private.guard_award_covers_approval_route (00237) returned NEW when the RFQ
--   had zero approval stages, so an MSME / enterprise buyer awarding a >= ₹5L quote without
--   ever evaluating the approval route skipped every tier.
--
-- Client-write detection pattern (same as 00212 guard_supplier_trust_fields): the trigger
--   functions are SECURITY INVOKER, so `current_user` is `anon` / `authenticated` only for a
--   direct client statement, and is the function owner (postgres) inside the SECURITY DEFINER
--   RPCs that legitimately own these writes, and `service_role` for the service key. No
--   client-settable flag, GUC or parameter can bypass them.
--
--   F-01 awards                      no client INSERT/UPDATE (policies, grants, trigger)
--   F-02 purchase_orders             no client INSERT; client UPDATE limited to lifecycle columns
--   F-03 quotes                      column guard; evaluation_score / SELECTED / identity frozen
--   F-04 conflict_of_interest_decl.  no client UPDATE/DELETE (no self-clear of DECLARED_CONFLICT)
--   F-05 organization_members        no client INSERT
--   F-06 awards approval route       zero stages is valid only when the route does not apply
--   +    award_runner_up_quote       narrow internal flag for the PO cancel (00239 guard)
--
-- 00237 (stage sequencing / self-approval / tier 3 / amount mismatch / stale route / replay),
-- 00238 (vote authority + DECLARED_CONFLICT), 00239 (cancel_purchase_order_atomic + guard),
-- 00240 (payment plan persistence) and 00241 (decision receipt) are extended, never weakened.
--
-- Rollback (manual): re-create the dropped policies from 00004 (awards_insert, awards_update,
-- purchase_orders_insert, coi_update_waive, org_members_insert) and 00007 (quotes_update_manager),
-- GRANT the revoked privileges back to authenticated, DROP the five triggers added here, and
-- restore guard_award_covers_approval_route / award_runner_up_quote from 00237 / 00091.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- F-01  awards: no ordinary client INSERT / UPDATE.
--   Writers: lock_and_reveal_award_atomic, lock_award, reveal_award, award_runner_up_quote,
--   confirm_intent_to_award_and_unmask, sign_commercial_commitment_and_unmask,
--   unlock_award_decision, demo RPCs - all SECURITY DEFINER.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS awards_insert ON public.awards;
DROP POLICY IF EXISTS awards_update ON public.awards;
REVOKE INSERT, UPDATE ON public.awards FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_award_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Awards can only be created or changed through the award RPCs (AWARD-DIRECT-WRITE)'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_award_client_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_award_client_write() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_award_client_write ON public.awards;
CREATE TRIGGER trg_aa_guard_award_client_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.awards
  FOR EACH ROW EXECUTE FUNCTION private.guard_award_client_write();

-- ---------------------------------------------------------------------------
-- F-06  awards: approval route derived from the awarded quote amount.
--   Applicability mirrors evaluate_and_stamp_approval_route_atomic (00237): the organisation is
--   not INDIVIDUAL / COMMUNITY AND (an active policy exists OR amount >= tier-2 minimum).
--   When it applies and no stage exists the award fails closed (evaluate the route first).
--   No stage rows are written here (a rolled-back award must not leave stages behind).
--   Fires on INSERT and on a quote_id reassignment (runner-up) so a reassigned award must
--   still satisfy the route of the new quote.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_award_covers_approval_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_org_id     uuid;
  v_org_type   public.org_type;
  v_is_demo    boolean;
  v_stages     integer;
  v_pending    integer;
  v_total      numeric;
  v_required   integer;
  v_route      record;
  v_applicable boolean;
BEGIN
  SELECT r.organization_id, o.org_type, (COALESCE(r.is_demo, false) OR COALESCE(o.is_demo, false))
  INTO v_org_id, v_org_type, v_is_demo
  FROM public.rfqs r JOIN public.organizations o ON o.id = r.organization_id
  WHERE r.id = NEW.rfq_id;

  -- Demo staging / reset builds scripted awards on demo tenants with no human approvers
  -- (demo_stage_scenario -> lock_award). The window flag is only ever set inside those
  -- SECURITY DEFINER functions and is additionally restricted here to demo RFQs / orgs, so a real
  -- tenant never reaches this branch.
  IF v_is_demo AND private.in_demo_write_window() THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, 0)
  INTO v_total
  FROM public.quotes q
  JOIN public.quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
  WHERE q.id = NEW.quote_id;
  v_total := COALESCE(v_total, 0);

  SELECT * INTO v_route FROM private.approval_route_for_amount(v_org_id, v_total);

  v_applicable := v_org_type IS NOT NULL
    AND v_org_type NOT IN ('INDIVIDUAL', 'COMMUNITY')
    AND (v_route.policy_id IS NOT NULL OR v_total >= v_route.t2_min);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status <> 'APPROVED')
  INTO v_stages, v_pending
  FROM public.rfq_approval_stages WHERE rfq_id = NEW.rfq_id;

  IF v_stages = 0 THEN
    IF v_applicable THEN
      RAISE EXCEPTION 'Cannot lock award: the approval route has not been evaluated for this quote amount, or it cannot be satisfied; evaluate the approval route first. (APPROVAL-ROUTE-REQUIRED)';
    END IF;
    RETURN NEW;
  END IF;

  IF v_pending > 0 THEN
    RAISE EXCEPTION 'Cannot lock award: Required approval tier(s) are pending satisfaction. (APPROVAL-GATE)';
  END IF;

  v_required := array_length(v_route.required_tiers, 1);
  IF COALESCE(v_required, 1) > v_stages THEN
    RAISE EXCEPTION 'Awarded quote requires % approval tier(s) but only % were evaluated; re-evaluate the approval route. (APPROVAL-ROUTE-STALE)',
      v_required, v_stages;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_award_covers_approval_route() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_award_covers_approval_route ON public.awards;
CREATE TRIGGER trg_guard_award_covers_approval_route
  BEFORE INSERT ON public.awards
  FOR EACH ROW EXECUTE FUNCTION private.guard_award_covers_approval_route();

DROP TRIGGER IF EXISTS trg_guard_award_reassign_covers_approval_route ON public.awards;
CREATE TRIGGER trg_guard_award_reassign_covers_approval_route
  BEFORE UPDATE OF quote_id ON public.awards
  FOR EACH ROW WHEN (OLD.quote_id IS DISTINCT FROM NEW.quote_id)
  EXECUTE FUNCTION private.guard_award_covers_approval_route();

-- ---------------------------------------------------------------------------
-- F-02  purchase_orders: creation belongs to create_purchase_order_from_award; a client UPDATE
--   may only touch lifecycle fields. Commercial columns (amounts, parties, award/rfq link,
--   numbers, tax, address snapshots, payment plan, currency, is_demo, ...) are frozen.
--   Lifecycle fields written by the app: status, issued_at, acknowledged_at, updated_at; the
--   cancellation columns stay owned by the 00239 guard (PO-CANCEL-DIRECT-WRITE).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS purchase_orders_insert ON public.purchase_orders;
REVOKE INSERT ON public.purchase_orders FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_po_commercial_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
  c_lifecycle constant text[] := ARRAY[
    'status', 'issued_at', 'acknowledged_at', 'updated_at',
    'cancellation_reason', 'cancelled_at', 'cancelled_by'
  ];
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Purchase orders are created only by create_purchase_order_from_award (PO-DIRECT-INSERT)'
      USING ERRCODE = '42501';
  END IF;

  IF (to_jsonb(NEW) - c_lifecycle) IS DISTINCT FROM (to_jsonb(OLD) - c_lifecycle) THEN
    RAISE EXCEPTION 'Purchase order commercial terms are immutable after creation (PO-COMMERCIAL-IMMUTABLE)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_po_commercial_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_po_commercial_write() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_po_commercial_write ON public.purchase_orders;
CREATE TRIGGER trg_aa_guard_po_commercial_write
  BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION private.guard_po_commercial_write();

-- ---------------------------------------------------------------------------
-- F-03  quotes: column guard. Suppliers keep submit / revise / finalize.
--   * no manager UPDATE (quotes_update_manager had no app caller);
--   * evaluation_score is written only by compute_quote_evaluations (definer) / service role;
--     a client may only clear it to NULL together with a new version (revision);
--   * SELECTED / NOT_SELECTED / WITHDRAWN are RPC-only (set and cleared);
--   * rfq_id, supplier_id, invitation_id are frozen;
--   * current_version may only move to the latest existing quote_versions row, while the
--     quoting window is open;
--   * INSERT: DRAFT or SUBMITTED, no score, version 0..1, invitation of this RFQ and supplier.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS quotes_update_manager ON public.quotes;

CREATE OR REPLACE FUNCTION private.guard_quote_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_latest integer;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('DRAFT', 'SUBMITTED') THEN
      RAISE EXCEPTION 'A new quote can only be created as DRAFT or SUBMITTED (QUOTE-CLIENT-STATUS)' USING ERRCODE = '42501';
    END IF;
    IF NEW.evaluation_score IS NOT NULL THEN
      RAISE EXCEPTION 'evaluation_score is computed by the platform and cannot be supplied (QUOTE-SCORE-DIRECT-WRITE)' USING ERRCODE = '42501';
    END IF;
    IF NEW.current_version NOT BETWEEN 0 AND 1 THEN
      RAISE EXCEPTION 'A new quote must start at version 0 or 1 (QUOTE-VERSION-BOUND)' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.rfq_invitations ri
      WHERE ri.id = NEW.invitation_id AND ri.rfq_id = NEW.rfq_id AND ri.supplier_id = NEW.supplier_id
    ) THEN
      RAISE EXCEPTION 'The invitation does not belong to this RFQ and supplier (QUOTE-INVITATION-MISMATCH)' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.rfq_id IS DISTINCT FROM OLD.rfq_id
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
     OR NEW.invitation_id IS DISTINCT FROM OLD.invitation_id THEN
    RAISE EXCEPTION 'Quote identity (rfq, supplier, invitation) is immutable (QUOTE-IDENTITY-IMMUTABLE)' USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('SELECTED', 'NOT_SELECTED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'A decided quote cannot be changed by the supplier (QUOTE-DECIDED)' USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('SUBMITTED', 'REVISED', 'FINAL') THEN
    RAISE EXCEPTION 'Quote status % can only be set by the platform (QUOTE-CLIENT-STATUS)', NEW.status USING ERRCODE = '42501';
  END IF;

  IF NEW.evaluation_score IS DISTINCT FROM OLD.evaluation_score
     AND NOT (NEW.evaluation_score IS NULL AND NEW.current_version > OLD.current_version) THEN
    RAISE EXCEPTION 'evaluation_score is computed by the platform and cannot be written directly (QUOTE-SCORE-DIRECT-WRITE)' USING ERRCODE = '42501';
  END IF;

  IF NEW.current_version IS DISTINCT FROM OLD.current_version THEN
    SELECT MAX(qv.version) INTO v_latest FROM public.quote_versions qv WHERE qv.quote_id = NEW.id;
    IF v_latest IS NULL OR NEW.current_version <> v_latest THEN
      RAISE EXCEPTION 'current_version must point at the latest existing quote version (QUOTE-VERSION-BOUND)' USING ERRCODE = '42501';
    END IF;
    IF private.quoting_refusal(NEW.rfq_id) IS NOT NULL THEN
      RAISE EXCEPTION 'The quoting window is closed; the quote version cannot change (QUOTE-WINDOW-CLOSED)' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_quote_client_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_quote_client_write() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_quote_client_write ON public.quotes;
CREATE TRIGGER trg_aa_guard_quote_client_write
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION private.guard_quote_client_write();

-- ---------------------------------------------------------------------------
-- F-04  conflict_of_interest_declarations: append-only for clients.
--   The declarant INSERT (coi_insert) stays. No client UPDATE / DELETE, so a subject can neither
--   clear nor rewrite a DECLARED_CONFLICT, and no waiver can be self-written on INSERT.
--   No waiver workflow exists in the product; none is introduced.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS coi_update_waive ON public.conflict_of_interest_declarations;
REVOKE UPDATE, DELETE ON public.conflict_of_interest_declarations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_coi_client_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
      RAISE EXCEPTION 'Conflict-of-interest declarations cannot be changed or removed once declared (COI-IMMUTABLE)'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'WAIVED' OR NEW.waived_by IS NOT NULL OR NEW.waived_at IS NOT NULL THEN
      RAISE EXCEPTION 'A conflict-of-interest waiver cannot be self-declared (COI-IMMUTABLE)'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_coi_client_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_coi_client_write() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_coi_client_write ON public.conflict_of_interest_declarations;
CREATE TRIGGER trg_aa_guard_coi_client_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.conflict_of_interest_declarations
  FOR EACH ROW EXECUTE FUNCTION private.guard_coi_client_write();

-- ---------------------------------------------------------------------------
-- F-05  organization_members: no ordinary client INSERT (a MANAGER could insert role OWNER).
--   Membership is created only by SECURITY DEFINER RPCs (first-org creation / signup
--   provisioning, accept_organization_invitation_atomic, invite_org_member, appointments,
--   close_clarification_for_evaluation). UPDATE / DELETE policies (owner / platform admin)
--   are out of this cluster and unchanged.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS org_members_insert ON public.organization_members;
REVOKE INSERT ON public.organization_members FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_org_member_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Organisation membership can only be created through the membership RPCs (ORG-MEMBER-DIRECT-INSERT)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_org_member_client_insert() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_org_member_client_insert() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_org_member_client_insert ON public.organization_members;
CREATE TRIGGER trg_aa_guard_org_member_client_insert
  BEFORE INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION private.guard_org_member_client_insert();

-- ---------------------------------------------------------------------------
-- Runner-up (00091): cancel the superseded PO through the narrow 00239 internal flag, set only
-- around that single UPDATE and cleared immediately after. Body is otherwise unchanged; the
-- awards.quote_id reassignment and quote status moves run as the definer owner, which the new
-- triggers above allow, and the reassigned award is re-checked by F-06.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.award_runner_up_quote(
  p_rfq_id uuid,
  p_reason text DEFAULT 'Previous winning supplier was unresponsive or failed inspection'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_prev_award awards%ROWTYPE;
  v_runner_up_id uuid;
  v_runner_up_price numeric;
  v_now timestamptz := now();
  v_new_award_id uuid;
  v_alias text;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can award runner-up quote';
  END IF;

  SELECT * INTO v_prev_award FROM awards WHERE rfq_id = p_rfq_id;

  -- 1. Disqualify previous winning quote and void any PO cut against it
  IF v_prev_award.quote_id IS NOT NULL THEN
    UPDATE quotes
    SET status = 'WITHDRAWN', updated_at = v_now
    WHERE id = v_prev_award.quote_id;

    -- A draft PO was never issued and can simply be removed; anything past
    -- draft is voided instead, since its award_id must never dangle.
    DELETE FROM purchase_orders WHERE rfq_id = p_rfq_id AND status = 'DRAFT';

    -- Narrow internal authority for the 00239 cancellation guard: transaction-local, set only
    -- around this UPDATE, cleared right after. Not reachable from any client-supplied input.
    PERFORM set_config('otp.po_cancel_internal', '1', true);
    UPDATE purchase_orders
    SET status = 'CANCELLED',
        cancellation_reason = 'Award reassigned to runner-up: ' || COALESCE(NULLIF(btrim(p_reason), ''), 'no reason given'),
        cancelled_at = v_now,
        cancelled_by = private.get_profile_id(),
        updated_at = v_now
    WHERE award_id = v_prev_award.id AND status <> 'DRAFT' AND status <> 'CANCELLED';
    PERFORM set_config('otp.po_cancel_internal', '', true);
  END IF;

  -- 2. Find Runner-Up Quote (lowest total cost from quote_versions)
  SELECT q.id, COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, 0), ri.anonymous_label
  INTO v_runner_up_id, v_runner_up_price, v_alias
  FROM quotes q
  JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
  JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.rfq_id = p_rfq_id
    AND q.id <> COALESCE(v_prev_award.quote_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND q.status IN ('FINAL', 'NOT_SELECTED', 'SUBMITTED', 'REVISED')
  ORDER BY COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, 0) ASC
  LIMIT 1;

  IF v_runner_up_id IS NULL THEN
    RAISE EXCEPTION 'No eligible runner-up quote found for this RFQ';
  END IF;

  -- 3. Transition Runner-Up to SELECTED
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = v_runner_up_id;

  -- 4. Reassign the award in place so any purchase order still pointing at
  -- this award id (now cancelled above) keeps a valid foreign key, rather
  -- than deleting the row and re-inserting a new one.
  IF v_prev_award.id IS NOT NULL THEN
    UPDATE awards
    SET quote_id = v_runner_up_id,
        awarded_by = private.get_profile_id(),
        justification = jsonb_build_object('text', 'Runner-up auto-awarded: ' || p_reason),
        status = 'LOCKED',
        awarded_at = v_now,
        votes_locked_at = v_now,
        revealed_at = NULL
    WHERE id = v_prev_award.id
    RETURNING id INTO v_new_award_id;
  ELSE
    INSERT INTO awards (
      rfq_id, quote_id, awarded_by, justification, status,
      awarded_at, votes_locked_at
    ) VALUES (
      p_rfq_id, v_runner_up_id, private.get_profile_id(),
      jsonb_build_object('text', 'Runner-up auto-awarded: ' || p_reason),
      'LOCKED', v_now, v_now
    ) RETURNING id INTO v_new_award_id;
  END IF;

  -- 5. Reset RFQ reveal status to BLIND so buyer confirms intent before unmasking runner-up
  UPDATE rfqs SET status = 'AWARDED', reveal_status = 'BLIND', updated_at = v_now WHERE id = p_rfq_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.runner_up_selected',
    private.get_profile_id(),
    v_rfq.organization_id,
    'award',
    v_new_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'runner_up_quote_id', v_runner_up_id,
      'runner_up_alias', v_alias,
      'runner_up_price', v_runner_up_price,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'award_id', v_new_award_id,
    'runner_up_quote_id', v_runner_up_id,
    'runner_up_alias', v_alias,
    'total_cost', v_runner_up_price
  );
END;
$$;

COMMIT;
