-- Buyers cannot SELECT the base `quotes` table (identity protection — see
-- quotes_select_supplier in 00004_rls_policies.sql), so a buyer-side query
-- that embeds `rfqs(quotes(id))` via PostgREST always resolves to an empty
-- array under RLS. That silently pinned the buyer dashboard's "Quotes
-- Received" counter to 0 for every requirement, no matter how many quotes
-- had actually arrived. `quotes_blind` cannot fill in either, since it only
-- shows rows while reveal_status = 'BLIND' and disappears after award.
--
-- This gives buyers a safe, count-only view of their own RFQs that works at
-- every phase, without exposing anything about who quoted.

CREATE OR REPLACE FUNCTION public.organization_rfq_quote_counts(p_organization_id uuid)
RETURNS TABLE (rfq_id uuid, quotes_count int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT rfq.id, count(q.id)::int
  FROM rfqs rfq
  JOIN requirements r ON r.id = rfq.requirement_id
  LEFT JOIN quotes q
    ON q.rfq_id = rfq.id
    AND q.status NOT IN ('DRAFT', 'DRAFT_FROM_MESSAGING', 'WITHDRAWN')
  WHERE r.organization_id = p_organization_id
    AND (private.is_org_member(p_organization_id) OR private.is_platform_admin())
  GROUP BY rfq.id;
$$;

GRANT EXECUTE ON FUNCTION public.organization_rfq_quote_counts(uuid) TO authenticated;
