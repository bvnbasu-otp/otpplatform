-- =============================================================================
-- 00249: Freeze organizations.subscription_plan, subscription_status, and
--        subscription_expires_at against ordinary client writes.
--
-- Root cause: organizations_update (00004) lets an organisation OWNER, or a
--   platform admin, update the row, and authenticated (and anon) hold table
--   UPDATE (00005 / 00194). private.guard_org_classification_fields (00243) is
--   BEFORE UPDATE OF org_type, is_demo only. Its comment leaves subscription
--   columns unfrozen. The same PostgREST update that changes a name can set
--   subscription_plan = 'YEARLY', subscription_status = 'ACTIVE', and a future
--   subscription_expires_at. 00248 reads those three columns for the yearly
--   quarterly RFQ bonus. This file does not edit 00248.
--
-- Fix: same detection pattern as 00243. The trigger function is SECURITY
--   INVOKER, so current_user is anon / authenticated only for a direct client
--   statement, and is the function owner (postgres) inside SECURITY DEFINER
--   RPCs and service_role for the service key. No client-settable GUC, header,
--   parameter, or JWT claim can bypass it. A no-op assignment of the current
--   value is allowed. Any other change to the three columns is rejected.
--   INSERT is rejected only when the stored plan would be read as YEARLY
--   (upper + btrim, the same normalization 00248 uses). Default MONTHLY /
--   ACTIVE / 30-day rows stay insertable. Membership insert stays revoked
--   by 00242.
--
-- Writer matrix (repo; latest body wins):
--   Direct UPDATE by OWNER or platform admin (authenticated)     user-controlled client
--       profile.ts updates name only. AdminUsersActivityPanel also sets
--       subscription_status. Both use the authenticated client. Rejected when
--       any of the three values change.
--   Direct UPDATE by a non-owner member or another organisation  RLS already denies
--   Direct INSERT of a YEARLY plan by anon / authenticated       user-controlled. Rejected.
--   service_role / postgres / supabase_admin                     operator. Preserved.
--   public.process_subscription_payment (latest body 00233)      NOT stopped here.
--       SECURITY DEFINER, EXECUTE granted to authenticated. Writes
--       subscription_plan from client p_cycle after a catalog-amount check and
--       a non-empty p_payment_ref. No gateway verification. current_user inside
--       the function is postgres, so this trigger allows the write. This
--       migration does not replace that function and does not invent a payment
--       check.
--   public.apply_wallet_credits_to_subscription_atomic (00216)   preserved.
--       SECURITY DEFINER. Stores the cycle only after debiting a wallet balance
--       equal to the catalog price. Ordinary wallet mutation is denied by 00233.
--   public.record_verified_payment (00150)                       preserved.
--       SECURITY DEFINER. 00247 revokes client EXECUTE; the webhook calls it
--       with the service-role key after signature verification. This file does
--       not edit 00247 or the webhook.
--   private.provision_signup_request (00212)                     preserved.
--       SECURITY DEFINER, EXECUTE service_role. Inserts MONTHLY. The update
--       only fills NULL subscription columns.
--   public.ensure_buyer_organization / public.switch_portal_side preserved.
--       SECURITY DEFINER inserts. Omitted subscription columns use MONTHLY /
--       ACTIVE / 30-day defaults.
--   public.get_organization_subscription                         read only.
--
-- 00004, 00243, 00248, and every earlier migration are not modified.
-- Hosted apply of this file: NOT APPLIED. Idempotent.
--
-- Rollback (manual):
--   DROP TRIGGER IF EXISTS trg_aa_guard_org_subscription_entitlement_fields ON public.organizations;
--   DROP FUNCTION IF EXISTS private.guard_org_subscription_entitlement_fields();
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION private.guard_org_subscription_entitlement_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, private, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF upper(btrim(COALESCE(NEW.subscription_plan, ''))) = 'YEARLY' THEN
      RAISE EXCEPTION 'Subscription entitlement can only be created by an authorized subscription transition (SUBSCRIPTION-ENTITLEMENT-IMMUTABLE)'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.subscription_plan IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at THEN
    RAISE EXCEPTION 'Subscription entitlement can only be changed by an authorized subscription transition (SUBSCRIPTION-ENTITLEMENT-IMMUTABLE)'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_org_subscription_entitlement_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.guard_org_subscription_entitlement_fields() TO anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_aa_guard_org_subscription_entitlement_fields ON public.organizations;
CREATE TRIGGER trg_aa_guard_org_subscription_entitlement_fields
  BEFORE INSERT OR UPDATE OF subscription_plan, subscription_status, subscription_expires_at
  ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION private.guard_org_subscription_entitlement_fields();

COMMIT;
