-- Migration 00119: Add 2-argument overload for discover_and_invite_for_rfq
-- Ensures compatibility with demo_stage_scenario while preserving single-arg signature

CREATE OR REPLACE FUNCTION public.discover_and_invite_for_rfq(p_rfq_id uuid, p_limit integer)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.discover_and_invite_for_rfq(p_rfq_id);
$$;

GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer) TO authenticated, service_role;
