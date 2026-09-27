-- Migration 00201: Scope procurement_stage_events, audit_events delete and
-- support_tickets policies
--
-- 1. procurement_stage_events (00148): SELECT and INSERT were USING/WITH CHECK
--    (true) for every signed-in user, and advance_procurement_step (the only
--    writer) had no caller check and an anon grant, so anyone could read or
--    append stage events for any requirement. Reads and writes are limited to
--    members of the requirement's buying organization and platform admins
--    (service_role bypasses RLS). No client, edge function or view reads the
--    table; the only readers are SECURITY DEFINER functions, so no supplier
--    path is added. The table stays append-only: no UPDATE or DELETE policy.
-- 2. audit_events_delete (00134) let anon and any signed-in user delete audit
--    rows. The only client deletes are platform-admin tools, so the policy is
--    limited to platform admins.
-- 3. support_tickets (00076): SELECT and UPDATE were USING (true) for PUBLIC,
--    exposing every ticket's email, role and description to anon. Reads go to
--    platform admins and the ticket's own email; updates to platform admins.
--    No client reads or updates the table directly.
--
-- Idempotent and non-destructive: policies are replaced with DROP POLICY IF
-- EXISTS + CREATE POLICY; no table, column or row is dropped or deleted.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. procurement_stage_events
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "procurement_stage_events_read" ON public.procurement_stage_events;
CREATE POLICY "procurement_stage_events_read"
  ON public.procurement_stage_events
  FOR SELECT
  TO authenticated
  USING (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.requirements r
      WHERE r.id = procurement_stage_events.requirement_id
        AND private.is_org_member(r.organization_id)
    )
  );

DROP POLICY IF EXISTS "procurement_stage_events_insert" ON public.procurement_stage_events;
CREATE POLICY "procurement_stage_events_insert"
  ON public.procurement_stage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.requirements r
      WHERE r.id = procurement_stage_events.requirement_id
        AND private.is_org_member(r.organization_id)
    )
  );

REVOKE UPDATE, DELETE, TRUNCATE ON public.procurement_stage_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.procurement_stage_events FROM anon;

CREATE OR REPLACE FUNCTION public.advance_procurement_step(
  p_requirement_id uuid,
  p_expected_current_step int,
  p_next_step int,
  p_step_code text,
  p_step_title text,
  p_rfq_id uuid DEFAULT NULL,
  p_order_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_actor_profile_id uuid;
  v_current_step int;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM public.requirements WHERE id = p_requirement_id;
  IF NOT COALESCE(
    COALESCE(auth.role(), '') = 'service_role'
    OR private.is_platform_admin()
    OR (v_org_id IS NOT NULL AND private.is_org_member(v_org_id)),
    false
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Access denied');
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT id INTO v_actor_profile_id FROM public.profiles WHERE auth_user_id = v_uid;
  END IF;

  -- Validate range
  IF p_next_step < 1 OR p_next_step > 15 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Next step number must be between 1 and 15.');
  END IF;

  -- Validate strictly monotonic advancement (+1 or first step)
  IF p_next_step > 1 AND p_next_step != (p_expected_current_step + 1) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Workflow violation: Cannot bypass stages. Next step must follow sequentially (+1).'
    );
  END IF;

  -- Insert stage event
  INSERT INTO public.procurement_stage_events (
    requirement_id,
    rfq_id,
    order_id,
    step_number,
    step_code,
    step_title,
    actor_profile_id,
    event_payload
  ) VALUES (
    p_requirement_id,
    p_rfq_id,
    p_order_id,
    p_next_step,
    p_step_code,
    p_step_title,
    v_actor_profile_id,
    p_payload
  );

  RETURN jsonb_build_object(
    'ok', true,
    'current_step', p_next_step,
    'step_code', p_step_code,
    'message', 'Procurement stage advanced successfully'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.advance_procurement_step(uuid, int, int, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_procurement_step(uuid, int, int, text, text, uuid, uuid, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. audit_events: only platform admins may delete
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS audit_events_delete ON public.audit_events;
CREATE POLICY audit_events_delete ON public.audit_events
  FOR DELETE TO authenticated
  USING (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 3. support_tickets: admins, and the ticket's own email for reads
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins and creators can read tickets" ON public.support_tickets;
CREATE POLICY "Admins and creators can read tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (
    private.is_platform_admin()
    OR (
      user_email IS NOT NULL
      AND lower(user_email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    )
  );

DROP POLICY IF EXISTS "Admins can update tickets" ON public.support_tickets;
CREATE POLICY "Admins can update tickets"
  ON public.support_tickets FOR UPDATE
  TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

COMMIT;
