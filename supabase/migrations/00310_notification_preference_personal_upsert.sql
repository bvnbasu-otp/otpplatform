-- 00310: personal notification preferences must upsert as one row.
--
-- PostgreSQL UNIQUE constraints treat NULL values as distinct by default.
-- Individual buyers have organization_id = NULL, so the existing
-- (user_id, organization_id) constraint allowed a new row on every save.
-- PostgreSQL 15's NULLS NOT DISTINCT form preserves organization-scoped
-- uniqueness and makes the existing RPC's ON CONFLICT work for personal users.

BEGIN;

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS uq_notif_pref_user_org;

ALTER TABLE public.notification_preferences
  ADD CONSTRAINT uq_notif_pref_user_org
  UNIQUE NULLS NOT DISTINCT (user_id, organization_id);

COMMIT;
