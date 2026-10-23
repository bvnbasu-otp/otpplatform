-- STATUS: UNAPPLIED
-- Prepared locally on 2026-10-22. This file is NOT in supabase/migrations.
-- A migration runner will not apply it. It has not been applied to any local
-- or hosted database. Do not move it under supabase/migrations until review.
--
-- Privilege narrowing only. public.update_my_organization_name(text, uuid)
-- is defined in supabase/migrations/00146_update_nokia_to_basu_and_org_name_edit.sql
-- and granted there to authenticated, service_role, and anon. PostgreSQL also
-- grants EXECUTE to PUBLIC on a newly created function unless that grant is
-- revoked. The function body already returns before any write when auth.uid()
-- is null, resolves the caller from that uid, and requires organization
-- membership in OWNER, MANAGER, BUYER, or ADMIN unless the profile is a
-- platform admin. This file does not replace that function, does not grant
-- any role, and does not accept a caller-supplied user id.

BEGIN;

REVOKE ALL ON FUNCTION public.update_my_organization_name(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_organization_name(text, uuid) FROM anon;

COMMIT;
