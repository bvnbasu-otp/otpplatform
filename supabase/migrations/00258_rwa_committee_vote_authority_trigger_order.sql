-- =============================================================================
-- 00258: P1-B follow-up — committee_votes vote-authority trigger must fire BEFORE
--   committee_votes_role_permission (00039).
--
-- PostgreSQL runs multiple BEFORE INSERT triggers in name order. With the 00238
-- name committee_votes_vote_authority, enforce_role_permission('VOTE') ran first
-- and surfaced the generic "Your role does not allow this action (VOTE required)"
-- for callers who lack the VOTE permission bit but are still blocked by RWA
-- appointment/seat rules (00238). Security tests and audit messages require the
-- specific VOTE-UNAUTHORIZED boundary from enforce_committee_vote_authority().
--
-- This migration only reorders triggers; it does not replace functions or weaken
-- permissions.
-- =============================================================================

BEGIN;

DROP TRIGGER IF EXISTS committee_votes_vote_authority ON public.committee_votes;

CREATE TRIGGER committee_votes_00_vote_authority
  BEFORE INSERT ON public.committee_votes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_committee_vote_authority();

COMMENT ON TRIGGER committee_votes_00_vote_authority ON public.committee_votes IS
  'Runs before committee_votes_role_permission (name order) so RWA vote-authority '
  'rejections emit VOTE-UNAUTHORIZED instead of the generic VOTE permission error.';

COMMIT;
