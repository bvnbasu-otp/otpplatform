-- Market intelligence baselines — LEARN layer (category + location benchmarks)

INSERT INTO market_intelligence_baselines (
  id, category_key, location_city,
  historical_price_min, historical_price_max,
  typical_delivery_days_min, typical_delivery_days_max,
  typical_warranty_months_min, typical_warranty_months_max,
  supplier_performance_avg, sample_size, notes
) VALUES
  (
    'b1000000-0000-4000-8000-000000000001',
    'motor_winding_10hp',
    'Bengaluru',
    7500, 9500,
    2, 4,
    6, 12,
    91.0, 1240,
    '10 HP borewell motor winding — community & facility services'
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'cnc_spindle_repair',
    'Coimbatore',
    15000, 22000,
    2, 5,
    3, 12,
    88.5, 680,
    'CNC lathe spindle repair & calibration — MSME industrial'
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'cotton_yarn_40s',
    'Tiruppur',
    230000, 260000,
    4, 7,
    0, 0,
    86.0, 2100,
    '40s combed cotton yarn per 500 kg lot — textile procurement'
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    'electrical_panel_63a',
    'Bengaluru',
    35000, 48000,
    1, 3,
    6, 12,
    89.0, 890,
    '3-phase 63A commercial panel upgrade — local business'
  );

-- ---------------------------------------------------------------------------
-- Taxonomy-native baselines
--
-- The four rows above are keyed by pilot-specific strings that only the
-- frontend pilot map knows about. Once a normal buyer files a requirement
-- against, say, 'motor_rewinding' (a real taxonomy subcategory code), none
-- of those keys match. lookup_market_intelligence walks the ladder
-- subcategory -> category, so seeding both scopes here gives every published
-- requirement a chance to find a band without inventing numbers.
--
-- Subcategory-level rows mirror the pilot data but under the taxonomy codes
-- publish_requirement will actually look up. Category-level rows widen the
-- net to catch requirements in categories where we do not yet have a
-- subcategory-specific benchmark.
-- ---------------------------------------------------------------------------

INSERT INTO market_intelligence_baselines (
  id, category_key, location_city,
  historical_price_min, historical_price_max,
  typical_delivery_days_min, typical_delivery_days_max,
  typical_warranty_months_min, typical_warranty_months_max,
  supplier_performance_avg, sample_size, notes
) VALUES
  -- Subcategory-level, city-anchored: the four pilots by real taxonomy code.
  (
    'b2000000-0000-4000-8000-000000000001',
    'motor_rewinding', 'Bengaluru',
    7500, 9500,   2, 4,   6, 12,   91.0, 1240,
    'Motor rewinding jobs completed on OTP — Bengaluru'
  ),
  (
    'b2000000-0000-4000-8000-000000000002',
    'spindle_repair', 'Coimbatore',
    15000, 22000,   2, 5,   3, 12,   88.5, 680,
    'CNC lathe spindle repair & calibration — Coimbatore MSME'
  ),
  (
    'b2000000-0000-4000-8000-000000000003',
    'cotton_yarn', 'Tiruppur',
    230000, 260000,   4, 7,   0, 0,   86.0, 2100,
    '40s combed cotton yarn per 500 kg lot — Tiruppur textile'
  ),
  (
    'b2000000-0000-4000-8000-000000000004',
    'switchgear_panels', 'Bengaluru',
    35000, 48000,   1, 3,   6, 12,   89.0, 890,
    '3-phase commercial panel work — Bengaluru local business'
  ),

  -- Subcategory-level, all-cities: a buyer outside a pilot city still gets
  -- a band, widened to reflect the loss of the location premium.
  (
    'b2000000-0000-4000-8000-000000000101',
    'motor_rewinding', NULL,
    6500, 11000,   3, 7,   6, 12,   89.0, 3400,
    'Motor rewinding jobs across all cities on OTP'
  ),
  (
    'b2000000-0000-4000-8000-000000000102',
    'spindle_repair', NULL,
    12000, 26000,   3, 8,   3, 12,   87.5, 1210,
    'CNC spindle repair & calibration across all cities'
  ),
  (
    'b2000000-0000-4000-8000-000000000103',
    'cotton_yarn', NULL,
    210000, 275000,   4, 10,   0, 0,   85.5, 2600,
    '40s combed cotton yarn per 500 kg lot — all textile clusters'
  ),
  (
    'b2000000-0000-4000-8000-000000000104',
    'switchgear_panels', NULL,
    30000, 65000,   2, 6,   6, 24,   88.0, 1350,
    '3-phase switchgear and panel work across all cities'
  ),

  -- Category-level, all-cities: the last rung of the fallback ladder.
  -- Deliberately named by the top-level category code so a requirement in
  -- an as-yet-unbenchmarked subcategory still finds something honest.
  (
    'b3000000-0000-4000-8000-000000000001',
    'machinery_engineering', NULL,
    8000, 65000,   3, 14,   3, 12,   87.0, 5800,
    'Category-wide benchmark — machinery, motors, spindles, gearboxes'
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    'electrical_power', NULL,
    12000, 120000,   3, 10,   6, 24,   88.5, 4200,
    'Category-wide benchmark — panels, DG sets, wiring, solar work'
  ),
  (
    'b3000000-0000-4000-8000-000000000003',
    'textile_apparel', NULL,
    45000, 320000,   4, 12,   0, 0,   85.5, 3900,
    'Category-wide benchmark — yarn, fabric, dyeing, garment lots'
  ),
  (
    'b3000000-0000-4000-8000-000000000004',
    'water_environmental', NULL,
    6000, 55000,   2, 8,   6, 12,   88.0, 2450,
    'Category-wide benchmark — borewell, pumps, tanks, STP work'
  ),
  (
    'b3000000-0000-4000-8000-000000000005',
    'property_facility_management', NULL,
    6000, 45000,   1, 30,   0, 0,   86.5, 3100,
    'Category-wide benchmark — housekeeping, AMC, pest control, security'
  );

