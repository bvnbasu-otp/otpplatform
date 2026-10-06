-- =============================================================================
-- 00243: P1 F-06 residual — freeze organizations.org_type and organizations.is_demo against
--        ordinary client UPDATE.
--
-- Root cause: organizations_update (00004) lets an organisation OWNER update any column of the
--   row, and `authenticated` holds table-level UPDATE (00005 / 00194). 00242
--   private.guard_award_covers_approval_route treats org_type INDIVIDUAL / COMMUNITY and the demo
--   predicate (rfqs.is_demo OR organizations.is_demo) as "approval route not applicable", so an
--   MSME owner could `UPDATE organizations SET org_type = 'INDIVIDUAL'` (or is_demo = true) and then
--   award a >= tier-2 quote with zero approval stages.
--
-- Fix: a BEFORE UPDATE trigger that rejects any change to org_type / is_demo made directly by a
--   client. Same detection pattern as 00212 guard_supplier_trust_fields and 00242: the trigger
--   function is SECURITY INVOKER, so current_user is `anon` / `authenticated` only for a direct
--   client statement, and is the function owner (postgres) inside SECURITY DEFINER RPCs and
--   `service_role` for the service key. No client-settable GUC, header, parameter or JWT claim
--   can bypass it.
--
-- Writer matrix (verified against the local catalog and the repo):
--   org_type  INSERT  ensure_buyer_organization / switch_portal_side / my_role_context /
--                     private.provision_signup_request (all SECURITY DEFINER, owner postgres) and
--                     service_role seeds / fixtures; INSERT is NOT guarded here, so org creation
--                     with the correct org_type is unchanged.
--   org_type  UPDATE  no application writer after creation (no RPC, no web client, no admin screen
--                     updates it) -> every authenticated / anon change is rejected.
--   is_demo   INSERT  definer seeds / demo setup / service_role (unguarded INSERT, unchanged).
--   is_demo   UPDATE  no application writer (demo reset / admin purge only READ it); demo
--                     carve-out in guard_award_covers_approval_route stays reachable only through
--                     private.in_demo_write_window(), which is set inside demo SECURITY DEFINER
--                     functions -> every authenticated / anon change is rejected.
--   Not frozen: every other column (name, address, contact, settings, subscription, ...) - the
--   trigger is column-scoped (UPDATE OF org_type, is_demo) and compares values, so a no-op
--   `SET org_type = org_type` and all other owner updates behave exactly as before.
--
-- 00237-00242 are not modified. Idempotent.
--
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS trg_aa_guard_org_classification_fields ON public.organizations;
--   DROP FUNCTION IF EXISTS private.guard_org_classification_fields();
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION private.guard_org_classification_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF NEW.org_type IS DISTINCT FROM OLD.org_type THEN
    RAISE EXCEPTION 'Organisation type is fixed at creation and cannot be changed (ORG-TYPE-IMMUTABLE)'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.is_demo IS DISTINCT FROM OLD.is_demo THEN
    RAISE EXCEPTION 'The demo flag of an organisation can only be changed by the platform (ORG-DEMO-IMMUTABLE)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_org_classification_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_org_classification_fields() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_org_classification_fields ON public.organizations;
CREATE TRIGGER trg_aa_guard_org_classification_fields
  BEFORE UPDATE OF org_type, is_demo ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.guard_org_classification_fields();

COMMIT;
