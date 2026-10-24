-- 00315: revoke PUBLIC and anon EXECUTE on public.update_my_organization_name.
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
--
-- 00316 replaces the function body with CREATE OR REPLACE, which keeps these
-- grants. Authenticated and service_role EXECUTE from 00146 are unchanged.
--
-- No explicit BEGIN/COMMIT: the migration runner and the Supabase CLI apply
-- this file and its ledger row in one transaction, and an inner COMMIT would
-- end that transaction before the ledger row is written.

REVOKE ALL ON FUNCTION public.update_my_organization_name(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_my_organization_name(text, uuid) FROM anon;
