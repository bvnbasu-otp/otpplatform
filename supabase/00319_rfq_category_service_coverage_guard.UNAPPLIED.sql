-- STATUS: UNAPPLIED
-- Review proposal only. This file is intentionally outside supabase/migrations;
-- 00314 remains the last approved runnable migration. It has not been applied.
--
-- Tightens the registered-supplier fallback used by
-- public.discover_and_invite_for_rfq. Geographic proximity alone is not RFQ
-- eligibility: a candidate must match the RFQ taxonomy (or a primary required
-- capability) and must have declared service coverage for the delivery area.

BEGIN;

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

COMMIT;
