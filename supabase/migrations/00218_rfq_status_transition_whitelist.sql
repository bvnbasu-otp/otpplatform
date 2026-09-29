-- =============================================================================
-- 00218: Close RFQ direct PostgREST status regression (SM-RFQ-DIRECT-UPDATE).
-- Extends 00216 guard with canonical transition whitelist + immutable RFQ keys.
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.rfq_status_transition_allowed(
  p_old public.rfq_status,
  p_new public.rfq_status
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_old = p_new THEN true
    WHEN p_old = 'DRAFT' AND p_new IN ('OPEN', 'CANCELLED') THEN true
    WHEN p_old = 'OPEN' AND p_new IN ('CLARIFICATION', 'EVALUATING', 'CLOSED', 'CANCELLED') THEN true
    WHEN p_old = 'CLARIFICATION' AND p_new IN ('EVALUATING', 'CLOSED', 'CANCELLED') THEN true
    WHEN p_old = 'EVALUATING' AND p_new IN ('AWARDED', 'CANCELLED') THEN true
    WHEN p_old = 'AWARDED' AND p_new IN ('CANCELLED', 'CLOSED') THEN true
    WHEN p_old = 'CLOSED' AND p_new IN ('CANCELLED') THEN true
    ELSE false
  END;
$$;

COMMENT ON FUNCTION private.rfq_status_transition_allowed(public.rfq_status, public.rfq_status) IS
  'Canonical forward-only RFQ status edges for direct SQL/PostgREST updates (matches advance_rfq_phases, award lock, cancellation).';

CREATE OR REPLACE FUNCTION private.guard_rfq_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_bypass boolean := false;
BEGIN
  v_bypass := COALESCE(auth.role(), '') IN ('service_role', '')
    OR pg_trigger_depth() > 1
    OR private.is_platform_admin();

  IF v_bypass THEN
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.requirement_id IS DISTINCT FROM OLD.requirement_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'RFQ identity fields cannot be changed via direct update (RFQ-IMMUTABLE)';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT private.rfq_status_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'Invalid RFQ status transition from % to % (RFQ-STATUS-TRANSITION)', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.rfq_status_transition_allowed(public.rfq_status, public.rfq_status) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_rfq_status_transition() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_rfq_status ON public.rfqs;
CREATE TRIGGER trg_guard_rfq_status
  BEFORE UPDATE ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.guard_rfq_status_transition();

COMMIT;
