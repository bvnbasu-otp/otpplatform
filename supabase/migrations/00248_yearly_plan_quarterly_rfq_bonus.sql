-- =============================================================================
-- 00248: ENT-01 yearly-plan quarterly RFQ bonus on the RFQ insert path.
--
-- Replaces private.enforce_pilot_rfq_allowance (created in 00199). Does not
-- edit 00199 or any earlier migration.
--
-- 00199 allowed 3 RFQs per organization per UTC calendar month and did not
-- read organizations.subscription_plan. A stored YEARLY plan therefore could
-- not publish the extra RFQ the public yearly promise describes.
--
-- Rule, using the same UTC clock as 00199 (now() AT TIME ZONE 'UTC'):
--   * 3 published RFQs in the current UTC calendar month for every organization.
--   * One additional RFQ in the current UTC calendar quarter when ALL of these
--     are true on the locked organizations row:
--       - upper(btrim(subscription_plan)) = 'YEARLY'
--       - status is ACTIVE (null or blank counts as ACTIVE)
--       - subscription_expires_at is null or not earlier than now()
--       - org_type is INDIVIDUAL, COMMUNITY, or MSME
--     COMMUNITY is the stored RWA / society type. ENTERPRISE and INSTITUTION
--     do not receive the bonus.
--   * The extra RFQ is allowed only when this month already has exactly 3 and
--     no UTC month in this calendar quarter already has more than 3.
--   * A second extra in the same quarter is rejected. The bonus does not carry
--     into the next month. The next quarter has its own bonus.
--   * MONTHLY, unknown, malformed, expired, and non-customer org types stay at 3.
--   * Sourcing mode, session, device, and payment rows are not read, so they
--     cannot multiply the bonus.
--   * created_at must fall in the current UTC calendar month. A direct insert
--     cannot hide the row in another month. Platform admins stay exempt, which
--     is the 00199 bypass and is how local seeds run.
--
-- Consumption is the committed rfqs insert. This BEFORE INSERT trigger runs
-- inside that transaction. It locks the organization row (FOR UPDATE) before
-- counting, which is the same serialization 00199 used. Under READ COMMITTED,
-- the waiter sees the winner's committed row, so exactly one of two racing
-- final-bonus inserts succeeds. A rollback removes the row; the next count
-- does not see it. publish_requirement is unchanged: it still inserts one
-- rfqs row and still refuses a second RFQ for the same requirement.
--
-- SECURITY DEFINER and the 00199 revoke are preserved. No GRANT to PUBLIC,
-- anon, or authenticated.
--
-- Hosted apply is a separate manual step. This file does not apply itself.
--
-- Rollback (manual, restores the 00199 flat monthly cap of 3):
--   Re-apply the 00199 body of private.enforce_pilot_rfq_allowance
--   (no subscription_plan read, no quarter window). Keep the trigger.
--   Do not DROP the trigger: that would remove the monthly cap as well.
--
-- Verification after a person applies this file (not run by this migration):
--   SELECT p.proname, p.prosecdef, p.proacl
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'private' AND p.proname = 'enforce_pilot_rfq_allowance';
--   -- prosecdef must be true. proacl must not grant anon or authenticated.
--   SELECT pg_get_triggerdef(oid)
--   FROM pg_trigger
--   WHERE tgname = 'trg_enforce_pilot_rfq_allowance';
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION private.enforce_pilot_rfq_allowance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
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
BEGIN
  IF private.is_platform_admin() THEN
    RETURN NEW;
  END IF;

  -- Defaults fill created_at before this trigger. A caller-supplied timestamp
  -- outside this month would not be counted and could be repeated without limit.
  IF NEW.created_at < v_month_start OR NEW.created_at >= v_month_start + interval '1 month' THEN
    RAISE EXCEPTION 'Pilot Allowance: an RFQ counts in the current UTC calendar month and cannot be recorded outside that month.'
      USING ERRCODE = 'P0001', HINT = 'PILOT_ALLOWANCE_EXHAUSTED';
  END IF;

  SELECT upper(btrim(COALESCE(subscription_plan, ''))),
         COALESCE(NULLIF(upper(btrim(COALESCE(subscription_status, ''))), ''), 'ACTIVE'),
         subscription_expires_at,
         upper(btrim(COALESCE(org_type::text, '')))
    INTO v_plan, v_status, v_expires, v_org_type
  FROM public.organizations
  WHERE id = NEW.organization_id
  FOR UPDATE;

  IF FOUND THEN
    v_yearly := v_plan = 'YEARLY'
      AND v_status = 'ACTIVE'
      AND (v_expires IS NULL OR v_expires >= now())
      AND v_org_type IN ('INDIVIDUAL', 'COMMUNITY', 'MSME');
  END IF;

  SELECT count(*)::integer INTO v_used
  FROM public.rfqs
  WHERE organization_id = NEW.organization_id
    AND created_at >= v_month_start
    AND created_at < v_month_start + interval '1 month';

  IF v_used < v_allowance THEN
    RETURN NEW;
  END IF;

  -- Exactly one extra row once this month is full, and only if no earlier
  -- month in this UTC calendar quarter already used the bonus.
  IF v_yearly AND v_used = v_allowance THEN
    SELECT COALESCE(SUM(GREATEST(month_count - v_allowance, 0)), 0)::integer
      INTO v_bonus_used
    FROM (
      SELECT count(*)::integer AS month_count
      FROM public.rfqs
      WHERE organization_id = NEW.organization_id
        AND created_at >= v_quarter_start
        AND created_at < v_quarter_start + interval '3 months'
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

REVOKE ALL ON FUNCTION private.enforce_pilot_rfq_allowance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_pilot_rfq_allowance ON public.rfqs;
CREATE TRIGGER trg_enforce_pilot_rfq_allowance
  BEFORE INSERT ON public.rfqs
  FOR EACH ROW EXECUTE FUNCTION private.enforce_pilot_rfq_allowance();

COMMIT;
