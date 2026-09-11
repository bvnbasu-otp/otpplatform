-- The list of cities the platform can actually serve.
--
-- Intake needs to suggest cities, and the parser needs to recognise them, but
-- supplier_service_areas is deliberately readable only by the supplier who owns
-- the row: which firms cover which pin codes is a directory, and handing that
-- to buyers would undo capability-based discovery by letting them shop for
-- named suppliers.
--
-- A distinct list of city names carries no supplier in it. No counts are
-- returned either, so a thin city cannot be inferred from the shape of the
-- answer.

CREATE OR REPLACE FUNCTION public.served_cities()
RETURNS TABLE (city text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT s.city
  FROM supplier_service_areas s
  JOIN suppliers sup ON sup.id = s.supplier_id
  WHERE s.city IS NOT NULL
    AND sup.status = 'ACTIVE'
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.served_cities() IS
  'Distinct cities covered by active suppliers. Aggregate only: no supplier is identifiable from the result, which is why buyers may call it while supplier_service_areas stays supplier-private.';

GRANT EXECUTE ON FUNCTION public.served_cities() TO authenticated, service_role;
