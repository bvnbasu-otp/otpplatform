-- Migration: 00297_revoke_anon_my_role_context.sql
-- Description: Restore least-privilege boundary on public.my_role_context().
-- Explicitly revokes anonymous execute inadvertently re-granted in 00294/00296,
-- restoring the privilege boundary established in 00217.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.my_role_context() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_role_context() TO authenticated, service_role;

COMMIT;
