-- Supplier capabilities, service areas and performance profile.
--
-- Capability rows are what make discovery work across category boundaries: a
-- borewell motor rewinding requirement reaches motor workshops, electrical
-- contractors and pump services because they all declare the capability, not
-- because they share a category string.
--
-- None of these tables are readable by buyers. Discovery reads them through a
-- SECURITY DEFINER function so supplier identity never crosses to the buyer
-- side before award reveal.

CREATE TYPE supplier_verification_status AS ENUM (
  'UNVERIFIED',
  'SELF_DECLARED',
  'DOCUMENT_VERIFIED',
  'PLATFORM_VERIFIED'
);

-- ---------------------------------------------------------------------------
-- Supplier profile columns
-- ---------------------------------------------------------------------------

ALTER TABLE suppliers
  ADD COLUMN verification_status supplier_verification_status NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN city            text,
  ADD COLUMN pincode         text,
  ADD COLUMN completed_jobs  integer NOT NULL DEFAULT 0,
  ADD COLUMN on_time_percent numeric(5, 2),
  ADD COLUMN dispute_rate    numeric(5, 2);

ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_completed_jobs_non_negative
    CHECK (completed_jobs >= 0),
  ADD CONSTRAINT suppliers_on_time_percent_range
    CHECK (on_time_percent IS NULL OR (on_time_percent >= 0 AND on_time_percent <= 100)),
  ADD CONSTRAINT suppliers_dispute_rate_range
    CHECK (dispute_rate IS NULL OR (dispute_rate >= 0 AND dispute_rate <= 100)),
  ADD CONSTRAINT suppliers_pincode_format
    CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$');

CREATE INDEX idx_suppliers_city ON suppliers (city);

-- ---------------------------------------------------------------------------
-- Declared capabilities
-- ---------------------------------------------------------------------------

CREATE TABLE supplier_capabilities (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id        uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  capability_id      uuid NOT NULL REFERENCES capabilities (id) ON DELETE CASCADE,
  -- Ceiling the supplier can handle for capacity-bearing capabilities, in the
  -- capability's capacity_unit (e.g. 20 HP motor rewinding).
  max_capacity_value numeric(14, 3),
  capacity_unit      text,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, capability_id),
  CONSTRAINT supplier_capabilities_capacity_non_negative
    CHECK (max_capacity_value IS NULL OR max_capacity_value >= 0)
);

CREATE INDEX idx_supplier_capabilities_supplier ON supplier_capabilities (supplier_id);
CREATE INDEX idx_supplier_capabilities_capability ON supplier_capabilities (capability_id);

-- ---------------------------------------------------------------------------
-- Service areas (INV-061 — discovery filters on service area overlap)
-- ---------------------------------------------------------------------------

CREATE TABLE supplier_service_areas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers (id) ON DELETE CASCADE,
  city        text,
  pincode     text,
  radius_km   numeric(7, 2),
  center_lat  numeric(9, 6),
  center_lng  numeric(9, 6),
  is_primary  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_service_areas_has_locator
    CHECK (city IS NOT NULL OR pincode IS NOT NULL OR (center_lat IS NOT NULL AND center_lng IS NOT NULL)),
  CONSTRAINT supplier_service_areas_radius_positive
    CHECK (radius_km IS NULL OR radius_km > 0),
  CONSTRAINT supplier_service_areas_pincode_format
    CHECK (pincode IS NULL OR pincode ~ '^[0-9]{6}$')
);

CREATE INDEX idx_supplier_service_areas_supplier ON supplier_service_areas (supplier_id);
CREATE INDEX idx_supplier_service_areas_city ON supplier_service_areas (lower(city));

CREATE TRIGGER supplier_capabilities_updated_at
  BEFORE UPDATE ON supplier_capabilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER supplier_service_areas_updated_at
  BEFORE UPDATE ON supplier_service_areas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Performance aggregates derived from delivered work
--
-- Keeps rating_avg, completed_jobs, on_time_percent and dispute_rate honest:
-- they are recomputed from procurement_performance_records rather than being
-- editable marketing numbers. Suppliers with no delivered work keep whatever
-- baseline was seeded for them.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_supplier_performance(p_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     int;
  v_on_time   int;
  v_rating    numeric;
  v_disputes  int;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (
      WHERE actual_delivery_days IS NOT NULL
        AND actual_delivery_days <= quoted_delivery_days
    ),
    avg(quality_rating)
  INTO v_total, v_on_time, v_rating
  FROM procurement_performance_records
  WHERE supplier_id = p_supplier_id;

  IF v_total = 0 THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_disputes
  FROM work_orders
  WHERE supplier_id = p_supplier_id
    AND dispute_status <> 'NONE';

  UPDATE suppliers
  SET completed_jobs  = v_total,
      on_time_percent = round((v_on_time::numeric / v_total) * 100, 2),
      rating_avg      = COALESCE(round(v_rating, 2), rating_avg),
      dispute_rate    = round((v_disputes::numeric / v_total) * 100, 2)
  WHERE id = p_supplier_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.performance_record_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_supplier_performance(NEW.supplier_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER performance_records_refresh_supplier
  AFTER INSERT OR UPDATE ON procurement_performance_records
  FOR EACH ROW EXECUTE FUNCTION private.performance_record_refresh();

-- ---------------------------------------------------------------------------
-- RLS — suppliers own their capability and coverage rows; buyers never read
-- them directly (discovery is SECURITY DEFINER)
-- ---------------------------------------------------------------------------

ALTER TABLE supplier_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_service_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY supplier_capabilities_select ON supplier_capabilities
  FOR SELECT TO authenticated
  USING (private.is_supplier_user_for(supplier_id));

CREATE POLICY supplier_capabilities_insert ON supplier_capabilities
  FOR INSERT TO authenticated
  WITH CHECK (private.is_supplier_user_for(supplier_id));

CREATE POLICY supplier_capabilities_update ON supplier_capabilities
  FOR UPDATE TO authenticated
  USING (private.is_supplier_user_for(supplier_id))
  WITH CHECK (private.is_supplier_user_for(supplier_id));

CREATE POLICY supplier_capabilities_delete ON supplier_capabilities
  FOR DELETE TO authenticated
  USING (private.is_supplier_user_for(supplier_id));

CREATE POLICY supplier_service_areas_select ON supplier_service_areas
  FOR SELECT TO authenticated
  USING (private.is_supplier_user_for(supplier_id));

CREATE POLICY supplier_service_areas_insert ON supplier_service_areas
  FOR INSERT TO authenticated
  WITH CHECK (private.is_supplier_user_for(supplier_id));

CREATE POLICY supplier_service_areas_update ON supplier_service_areas
  FOR UPDATE TO authenticated
  USING (private.is_supplier_user_for(supplier_id))
  WITH CHECK (private.is_supplier_user_for(supplier_id));

CREATE POLICY supplier_service_areas_delete ON supplier_service_areas
  FOR DELETE TO authenticated
  USING (private.is_supplier_user_for(supplier_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_capabilities, supplier_service_areas
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.refresh_supplier_performance(uuid) TO service_role;
