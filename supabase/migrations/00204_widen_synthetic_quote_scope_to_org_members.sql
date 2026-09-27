-- Migration 00204: Widen synthetic/demo-quote trigger scope to also permit
-- members of the demo RFQ's own organization (A-08 sub-issue / Conflict B)
--
-- Product decision (32FIX Batch 1, Decision B): the synthetic/demo-quote
-- trigger mechanism must permit BOTH (a) platform admins, AND (b) members of
-- the demo RFQ's own organization, to trigger it. This is wider than 00198's
-- original guard, which restricted private.assert_synthetic_quotes_allowed()
-- to platform admin / service_role / local superuser only, rejecting a
-- non-admin buyer who is a member of their own demo RFQ's organization.
--
-- This surgically widens ONLY the authorization check inside
-- private.assert_synthetic_quotes_allowed(uuid). Everything else about the
-- function (the is_demo requirement, the two public wrapper entry points
-- seed_simulated_quotes_for_rfq / auto_submit_pilot_quotes, their grants) is
-- unchanged from 00198.
--
-- Org-membership check pattern follows the existing convention used
-- elsewhere for RFQ-scoped authorization (e.g. discover_and_invite_for_rfq
-- in 00188/00120/00137: "... OR private.is_org_member(v_rfq.organization_id)
-- OR private.is_platform_admin()"), i.e. private.is_org_member(p_org_id),
-- gated on auth.uid() IS NOT NULL so an unauthenticated/service caller still
-- goes through the explicit service_role/superuser branches instead.
--
-- Blast radius is unchanged in scope of *what* can be mutated: the function
-- still hard-requires the target RFQ to have is_demo = true, so a
-- non-admin org member can only trigger synthetic quotes for their own
-- organization's own demo RFQs, never a real RFQ and never another org's
-- RFQ.

CREATE OR REPLACE FUNCTION private.assert_synthetic_quotes_allowed(p_rfq_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_is_demo boolean;
  v_org_id  uuid;
BEGIN
  SELECT is_demo, organization_id INTO v_is_demo, v_org_id
  FROM rfqs
  WHERE id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN 'RFQ not found';
  END IF;

  IF NOT (
    private.is_platform_admin()
    OR COALESCE(auth.role(), '') = 'service_role'
    OR session_user IN ('postgres', 'supabase_admin')
    OR (auth.uid() IS NOT NULL AND private.is_org_member(v_org_id))
  ) THEN
    RETURN 'Access denied: simulated quotes require platform admin or membership in the RFQ''s organization';
  END IF;

  IF v_is_demo IS NOT TRUE THEN
    RETURN 'Simulated quotes are disabled for real RFQs';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_synthetic_quotes_allowed(uuid) FROM PUBLIC, anon, authenticated;
