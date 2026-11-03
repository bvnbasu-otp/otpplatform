-- =============================================================================
-- Migration 00334: Exempt demo reset and staging sessions from RFQ status transition whitelist
-- Allows automated test suite and demo scenarios to rewind RFQ status during demo_reset.
-- =============================================================================

BEGIN;

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
    OR private.is_platform_admin()
    OR private.in_demo_reset()
    OR COALESCE(current_setting('otp.demo_reset', true), 'off') = 'on'
    OR COALESCE(current_setting('otp.demo_staging', true), 'off') = 'on';

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

REVOKE ALL ON FUNCTION private.guard_rfq_status_transition() FROM PUBLIC, anon, authenticated;

COMMIT;
