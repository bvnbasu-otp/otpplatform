-- A guard that let strangers through, because it answered "unknown" instead of "no".
--
-- private.is_org_manager_or_above() was written as:
--
--   SELECT private.get_org_role(p_org_id) IN ('OWNER', 'MANAGER') OR ...
--
-- For someone who is not a member of that organisation at all, get_org_role()
-- returns NULL, so `NULL IN (...)` is NULL, and `NULL OR false` is NULL. The
-- function returned NULL rather than false — which reads the same in a policy,
-- where NULL is treated as no, and the opposite of the same in a procedure:
--
--   IF NOT private.is_org_manager_or_above(v_rfq.organization_id) THEN
--     RAISE EXCEPTION 'Only a manager ...';
--   END IF;
--
-- NOT NULL is NULL, IF NULL does not branch, and the exception was skipped. Every
-- caller that phrased its check as a refusal was open to any authenticated user
-- who was not a member of the buying organisation — precisely the person the check
-- existed to stop, because a member with the wrong role got a real role back and
-- was correctly refused. A stranger got NULL and walked through.
--
-- Found by a test asserting that a committee member at one organisation cannot
-- vote on another organisation's enquiry. They could. So could a stranger lock an
-- award, reveal a winning supplier's identity, close a phase early, reschedule a
-- deadline, or file a performance review.
--
-- Fixed here rather than at the seven call sites, because the call sites are all
-- phrased correctly: they ask a yes/no question and expect a yes/no answer. A
-- helper used inside NOT must be total. The COALESCE is the fix; the wider lesson
-- is that a boolean helper in this schema is part of the authorization surface and
-- has no business returning NULL.

CREATE OR REPLACE FUNCTION private.is_org_manager_or_above(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(private.get_org_role(p_org_id) IN ('OWNER', 'MANAGER'), false)
    OR private.is_platform_admin()
    OR private.demo_staging_for(p_org_id);
$$;

COMMENT ON FUNCTION private.is_org_manager_or_above(uuid) IS
  'True when the caller manages this organisation. Never NULL: callers phrase the check as IF NOT ..., where a NULL would skip the refusal entirely rather than deny it.';

-- The same shape, checked. is_org_member() and can_access_rfq_as_* are built on
-- EXISTS, which cannot be NULL, and is_platform_admin() already coalesces — so
-- this was the only one. Asserting it here means a future rewrite of any of them
-- that reintroduces a NULL fails the migration rather than the audit.
DO $$
DECLARE
  v_missing uuid := '00000000-0000-4000-8000-000000000000';
  v_result  boolean;
BEGIN
  FOR v_result IN
    SELECT private.is_org_manager_or_above(v_missing)
    UNION ALL SELECT private.is_org_member(v_missing)
    UNION ALL SELECT private.is_platform_admin()
    UNION ALL SELECT private.can_access_rfq_as_buyer(v_missing)
    UNION ALL SELECT private.can_access_rfq_as_committee(v_missing)
    UNION ALL SELECT private.has_rfq_invitation(v_missing)
  LOOP
    IF v_result IS NULL THEN
      RAISE EXCEPTION
        'An authorization helper returned NULL. Used inside IF NOT ..., that skips the refusal instead of making it.';
    END IF;
  END LOOP;
END;
$$;
