-- Procurement OS: market intelligence baselines (LEARN layer MVP)

CREATE TABLE market_intelligence_baselines (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key                text NOT NULL,
  location_city               text,
  historical_price_min        numeric(14, 2),
  historical_price_max        numeric(14, 2),
  typical_delivery_days_min   integer,
  typical_delivery_days_max   integer,
  typical_warranty_months_min integer,
  typical_warranty_months_max integer,
  supplier_performance_avg    numeric(4, 2),
  sample_size                 integer NOT NULL DEFAULT 0,
  notes                       text,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_key, location_city)
);

CREATE INDEX idx_market_intel_category ON market_intelligence_baselines (category_key);

ALTER TABLE market_intelligence_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY market_intel_select ON market_intelligence_baselines
  FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER market_intelligence_baselines_updated_at
  BEFORE UPDATE ON market_intelligence_baselines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

GRANT SELECT ON market_intelligence_baselines TO authenticated, anon;
GRANT ALL ON market_intelligence_baselines TO service_role;

GRANT SELECT ON market_intelligence_baselines TO authenticated, anon;
GRANT ALL ON market_intelligence_baselines TO service_role;
