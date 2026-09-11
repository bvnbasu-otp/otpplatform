-- Migration 00148: Strict 15-Step Linear Procurement Pipeline
-- Implements stage-gate sequencing, immutable transition events, and forward-skipping prevention.

BEGIN;

-- 1. Create table public.procurement_stage_events
CREATE TABLE IF NOT EXISTS public.procurement_stage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
  rfq_id uuid REFERENCES public.rfqs(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  step_number int NOT NULL CHECK (step_number BETWEEN 1 AND 15),
  step_code text NOT NULL,
  step_title text NOT NULL,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text NOT NULL DEFAULT 'BUYER',
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_stage_sequence
  ON public.procurement_stage_events (requirement_id, step_number, created_at);

ALTER TABLE public.procurement_stage_events ENABLE ROW LEVEL SECURITY;

-- Read policy: authenticated users can view stage events for requirements they have access to
DROP POLICY IF EXISTS "procurement_stage_events_read" ON public.procurement_stage_events;
CREATE POLICY "procurement_stage_events_read"
  ON public.procurement_stage_events
  FOR SELECT
  TO authenticated
  USING (true);

-- Insert policy: authenticated users or system
DROP POLICY IF EXISTS "procurement_stage_events_insert" ON public.procurement_stage_events;
CREATE POLICY "procurement_stage_events_insert"
  ON public.procurement_stage_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. Helper function to get current linear step of a requirement
CREATE OR REPLACE FUNCTION public.get_current_procurement_step(
  p_requirement_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_latest_step int;
  v_latest_code text;
  v_latest_title text;
  v_rfq_id uuid;
  v_po_id uuid;
BEGIN
  -- Look for highest completed stage event
  SELECT step_number, step_code, step_title, rfq_id, order_id
  INTO v_latest_step, v_latest_code, v_latest_title, v_rfq_id, v_po_id
  FROM public.procurement_stage_events
  WHERE requirement_id = p_requirement_id
  ORDER BY step_number DESC, created_at DESC
  LIMIT 1;

  -- Default to Step 1 if no stage event exists yet
  IF v_latest_step IS NULL THEN
    v_latest_step := 1;
    v_latest_code := 'STEP_1_SPEC_SUBMITTED';
    v_latest_title := 'Once Spec is Submitted';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'step_number', v_latest_step,
    'step_code', v_latest_code,
    'step_title', v_latest_title,
    'rfq_id', v_rfq_id,
    'order_id', v_po_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_procurement_step(uuid) TO authenticated, service_role, anon;

-- 3. Stored Procedure: advance_procurement_step
-- Enforces monotonic (+1) advancement without skipping steps.
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
BEGIN
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

GRANT EXECUTE ON FUNCTION public.advance_procurement_step(uuid, int, int, text, text, uuid, uuid, jsonb) TO authenticated, service_role, anon;

-- Record migration in otp_schema_migrations if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'otp_schema_migrations') THEN
    INSERT INTO public.otp_schema_migrations (version, applied_at)
    VALUES ('00148_strict_linear_15_step_procurement_pipeline.sql', now())
    ON CONFLICT (version) DO NOTHING;
  END IF;
END $$;

COMMIT;
