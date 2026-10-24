-- 00317: RFQ discovery requires category match and declared service coverage.
--
-- Tightens the registered-supplier fallback used by
-- public.discover_and_invite_for_rfq. Geographic proximity alone is not RFQ
-- eligibility: a candidate must match the RFQ taxonomy (or a primary required
-- capability) and must have declared service coverage for the delivery area.
--
-- Wraps the 00275 private.rank_discovery_candidates(uuid, uuid[]) by renaming
-- it to rank_discovery_candidates_pre_category_coverage_guard. This file is not
-- rerunnable: the precondition refuses to run when the renamed function
-- already exists or the 00275 wrapper chain is missing, instead of skipping
-- the rename and silently replacing a different function.
--
-- No explicit BEGIN/COMMIT: the migration runner and the Supabase CLI apply
-- this file and its ledger row in one transaction, so the rename and the new
-- function either both commit or both roll back.

DO $preconditions$
BEGIN
  IF to_regprocedure('private.rank_discovery_candidates(uuid,uuid[])') IS NULL
     OR to_regprocedure('private.rank_discovery_candidates_pre_subcategory_isolation(uuid,uuid[])') IS NULL
     OR to_regprocedure('private.rfq_required_capabilities(uuid)') IS NULL THEN
    RAISE EXCEPTION 'RFQ_COVERAGE_GUARD_PRECONDITION_FAILED: migration 00275 discovery functions are required';
  END IF;
  IF to_regprocedure('private.rank_discovery_candidates_pre_category_coverage_guard(uuid,uuid[])') IS NOT NULL THEN
    RAISE EXCEPTION 'RFQ_COVERAGE_GUARD_PRECONDITION_FAILED: rank_discovery_candidates_pre_category_coverage_guard already exists; 00317 was already applied or partially applied';
  END IF;
END
$preconditions$;

ALTER FUNCTION private.rank_discovery_candidates(uuid, uuid[])
  RENAME TO rank_discovery_candidates_pre_category_coverage_guard;

CREATE FUNCTION private.rank_discovery_candidates(
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
  FROM private.rank_discovery_candidates_pre_category_coverage_guard(p_rfq_id, p_exclude) ranked
  JOIN public.suppliers supplier ON supplier.id = ranked.supplier_id
  JOIN public.rfqs rfq ON rfq.id = p_rfq_id
  JOIN public.requirements req ON req.id = rfq.requirement_id
  LEFT JOIN public.requirement_categories category ON category.id = req.category_id
  LEFT JOIN public.requirement_subcategories subcategory ON subcategory.id = req.subcategory_id
  WHERE
    (
      EXISTS (
        SELECT 1
        FROM unnest(COALESCE(supplier.categories, ARRAY[]::text[])) supplier_category
        WHERE lower(btrim(supplier_category)) IN (
          lower(btrim(category.code)),
          lower(btrim(category.name)),
          lower(btrim(subcategory.code)),
          lower(btrim(subcategory.name))
        )
          AND (
            req.subcategory_id IS NULL
            OR lower(btrim(supplier_category)) IN (
              lower(btrim(subcategory.code)),
              lower(btrim(subcategory.name))
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM private.rfq_required_capabilities(p_rfq_id) required_capability
        JOIN public.supplier_capabilities supplier_capability
          ON supplier_capability.supplier_id = supplier.id
         AND supplier_capability.capability_id = required_capability.capability_id
        WHERE required_capability.is_primary
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.supplier_service_areas service_area
      WHERE service_area.supplier_id = supplier.id
        AND (
          (
            COALESCE(
              NULLIF(btrim(req.delivery_pincode), ''),
              NULLIF(btrim(req.structured_specs -> 'deliveryLocation' ->> 'pincode'), '')
            ) IS NOT NULL
            AND service_area.pincode = COALESCE(
              NULLIF(btrim(req.delivery_pincode), ''),
              NULLIF(btrim(req.structured_specs -> 'deliveryLocation' ->> 'pincode'), '')
            )
          )
          OR (
            COALESCE(
              NULLIF(btrim(req.delivery_city), ''),
              NULLIF(btrim(req.structured_specs -> 'deliveryLocation' ->> 'city'), '')
            ) IS NOT NULL
            AND lower(btrim(service_area.city)) = lower(COALESCE(
              NULLIF(btrim(req.delivery_city), ''),
              NULLIF(btrim(req.structured_specs -> 'deliveryLocation' ->> 'city'), '')
            ))
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION private.rank_discovery_candidates(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.rank_discovery_candidates_pre_category_coverage_guard(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.rank_discovery_candidates(uuid, uuid[]) TO service_role;

-- Discovery is a buyer action. Earlier function definitions left this
-- SECURITY DEFINER entry point executable by anon even though its body rejects
-- callers that are not members of the owning organization. Remove that
-- unnecessary API exposure while preserving signed-in and service execution.
REVOKE ALL ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.discover_and_invite_for_rfq(uuid, integer, uuid[], text) TO authenticated, service_role;
