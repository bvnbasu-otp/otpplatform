-- Migration 00334: Restrict the RFQ retention purge to the service role
--
-- public.purge_expired_unsuccessful_rfqs (00270) is SECURITY DEFINER, performs no
-- caller, organisation or admin check, and was granted to authenticated. Default
-- privileges from 00194 also extend EXECUTE to anon. Any signed-in user could
-- therefore call it with p_retention_days = 1 and delete unawarded quotes and
-- invitations on every organisation's terminal RFQs.
--
-- The purge is a scheduled retention job, not a user action. Only service_role
-- may execute it. The function body is unchanged.

REVOKE ALL ON FUNCTION public.purge_expired_unsuccessful_rfqs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_unsuccessful_rfqs(integer) FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_unsuccessful_rfqs(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_unsuccessful_rfqs(integer) TO service_role;
