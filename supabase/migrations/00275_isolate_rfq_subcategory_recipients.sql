-- Require the persisted RFQ subcategory (or an exact required capability) for registered suppliers.

BEGIN;

-- Re-applying this file on a database that already ran it must not rename the
-- current wrapper onto the preserved predecessor. The predecessor is created
-- only on the first apply.
DO $rename_rank_discovery_candidates$
BEGIN
  IF to_regprocedure('private.rank_discovery_candidates_pre_subcategory_isolation(uuid, uuid[])') IS NULL THEN
    ALTER FUNCTION private.rank_discovery_candidates(uuid, uuid[])
      RENAME TO rank_discovery_candidates_pre_subcategory_isolation;
  END IF;
END
$rename_rank_discovery_candidates$;

CREATE OR REPLACE FUNCTION private.rank_discovery_candidates(
  p_rfq_id uuid,
  p_exclude uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE (
  supplier_id uuid,
  match_score numeric,
  match_reasons text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT ranked.supplier_id, ranked.match_score, ranked.match_reasons
  FROM private.rank_discovery_candidates_pre_subcategory_isolation(p_rfq_id, p_exclude) ranked
  JOIN public.suppliers supplier ON supplier.id = ranked.supplier_id
  JOIN public.rfqs rfq ON rfq.id = p_rfq_id
  JOIN public.requirements req ON req.id = rfq.requirement_id
  LEFT JOIN public.requirement_subcategories sub ON sub.id = req.subcategory_id
  WHERE req.subcategory_id IS NULL
     OR EXISTS (
       SELECT 1
       FROM unnest(COALESCE(supplier.categories, ARRAY[]::text[])) supplier_category
       WHERE lower(btrim(supplier_category)) IN (lower(sub.name), lower(sub.code))
     )
     OR EXISTS (
       SELECT 1
       FROM private.rfq_required_capabilities(p_rfq_id) required_capability
       JOIN public.supplier_capabilities supplier_capability
         ON supplier_capability.supplier_id = supplier.id
        AND supplier_capability.capability_id = required_capability.capability_id
       WHERE required_capability.is_primary
     );
$$;

REVOKE ALL ON FUNCTION private.rank_discovery_candidates(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.rank_discovery_candidates_pre_subcategory_isolation(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.rank_discovery_candidates(uuid, uuid[]) TO service_role;

COMMIT;