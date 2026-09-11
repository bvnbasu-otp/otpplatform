-- Demo simulation.
--
-- A demo is only convincing if the numbers look like real bids: a spread of
-- prices around a plausible market rate, delivery promises that differ, some
-- suppliers offering warranty and some not. And it is only trustworthy if the
-- same seed produces the same numbers every time, so a walkthrough can be
-- rehearsed and a bug can be reproduced.
--
-- Nothing here is random in the usual sense. Every value is derived by hashing
-- (demo_seed, rfq, supplier, field), which is deterministic, stateless, and
-- independent per quote — so generating quotes for one RFQ never shifts the
-- numbers on another.

-- ---------------------------------------------------------------------------
-- Seeded pseudo-randomness
-- ---------------------------------------------------------------------------

-- Masking to 31 bits keeps the result positive whatever sign convention the
-- bit-to-integer cast uses, so the value is provably in [0,1). Getting this
-- wrong is not loud: a generator that occasionally returns 1.4 produces
-- delivery promises outside the range asked for and array lookups that fall
-- off the end and quietly yield NULL.
CREATE OR REPLACE FUNCTION private.demo_rand(p_seed text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ((('x' || substr(md5(p_seed), 1, 8))::bit(32)::bigint & 2147483647)::numeric)
         / 2147483648.0;
$$;

COMMENT ON FUNCTION private.demo_rand(text) IS
  'Deterministic value in [0,1) derived from a seed string. Same seed, same number, always.';

CREATE OR REPLACE FUNCTION private.demo_rand_int(p_seed text, p_lo integer, p_hi integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT LEAST(p_hi, GREATEST(p_lo,
    p_lo + floor(private.demo_rand(p_seed) * (p_hi - p_lo + 1))::integer
  ));
$$;

CREATE OR REPLACE FUNCTION private.demo_pick(p_seed text, p_options numeric[])
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_options[private.demo_rand_int(p_seed, 1, array_length(p_options, 1))];
$$;

-- ---------------------------------------------------------------------------
-- Price anchors
--
-- Generated quotes need something to scatter around. Rather than hard-coding
-- prices in the generator, the anchor per subcategory (falling back to the
-- category, then to a global default) is configuration like everything else,
-- so a demo for a new vertical is a row insert rather than a code change.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS demo_price_anchors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       text NOT NULL CHECK (scope IN ('SUBCATEGORY', 'CATEGORY', 'GLOBAL')),
  code        text,
  base_amount numeric(14, 2) NOT NULL CHECK (base_amount > 0),
  -- true when base_amount is a rate to be multiplied by the requirement
  -- quantity (per kg, per foot, per camera); false when it is a job price.
  per_unit    boolean NOT NULL DEFAULT false,
  -- Fraction of the anchor the bids spread across. 0.30 means roughly
  -- +/-15%, which is about what a real tender looks like.
  spread      numeric(4, 3) NOT NULL DEFAULT 0.300 CHECK (spread > 0 AND spread < 2),
  unit_hint   text,
  CONSTRAINT demo_price_anchors_code_scope CHECK (
    (scope = 'GLOBAL' AND code IS NULL) OR (scope <> 'GLOBAL' AND code IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS demo_price_anchors_scope_code_key
  ON demo_price_anchors (scope, COALESCE(code, ''));

-- Catch typos at insert time. A misspelt code would silently fall through to
-- the category anchor and nobody would notice the demo was using wrong prices.
CREATE OR REPLACE FUNCTION private.demo_anchor_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.scope = 'SUBCATEGORY'
     AND NOT EXISTS (SELECT 1 FROM requirement_subcategories WHERE code = NEW.code) THEN
    RAISE EXCEPTION 'No such subcategory: %', NEW.code;
  END IF;

  IF NEW.scope = 'CATEGORY'
     AND NOT EXISTS (SELECT 1 FROM requirement_categories WHERE code = NEW.code) THEN
    RAISE EXCEPTION 'No such category: %', NEW.code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS demo_price_anchors_validate ON demo_price_anchors;
CREATE TRIGGER demo_price_anchors_validate
  BEFORE INSERT OR UPDATE ON demo_price_anchors
  FOR EACH ROW EXECUTE FUNCTION private.demo_anchor_validate();

ALTER TABLE demo_price_anchors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demo_price_anchors_read ON demo_price_anchors;
CREATE POLICY demo_price_anchors_read ON demo_price_anchors
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS demo_price_anchors_write ON demo_price_anchors;
CREATE POLICY demo_price_anchors_write ON demo_price_anchors
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

GRANT SELECT ON demo_price_anchors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON demo_price_anchors TO service_role;

INSERT INTO demo_price_anchors (scope, code, base_amount, per_unit, spread, unit_hint) VALUES
  ('GLOBAL', NULL, 25000, false, 0.300, NULL),

  ('CATEGORY', 'construction_infrastructure',    150000, false, 0.280, NULL),
  ('CATEGORY', 'electrical_power',                85000, false, 0.260, NULL),
  ('CATEGORY', 'machinery_engineering',           60000, false, 0.300, NULL),
  ('CATEGORY', 'industrial_supplies_hardware',    18000, false, 0.240, NULL),
  ('CATEGORY', 'chemicals_process_materials',     40000, false, 0.220, NULL),
  ('CATEGORY', 'textile_apparel',                120000, false, 0.260, NULL),
  ('CATEGORY', 'agriculture_commodities',         90000, false, 0.200, NULL),
  ('CATEGORY', 'packaging_printing',              45000, false, 0.280, NULL),
  ('CATEGORY', 'property_facility_management',    35000, false, 0.320, NULL),
  ('CATEGORY', 'safety_security',                 55000, false, 0.300, NULL),
  ('CATEGORY', 'water_environmental',             40000, false, 0.340, NULL),
  ('CATEGORY', 'it_electronics_digital',          65000, false, 0.280, NULL),
  ('CATEGORY', 'logistics_transportation',        22000, false, 0.320, NULL),
  ('CATEGORY', 'professional_skilled_services',   30000, false, 0.360, NULL),
  ('CATEGORY', 'general_other',                   25000, false, 0.300, NULL),

  -- Water and motors
  ('SUBCATEGORY', 'motor_rewinding',           8500, true,  0.340, 'per motor'),
  ('SUBCATEGORY', 'borewell_motor_pump',      32000, true,  0.260, 'per pump set'),
  ('SUBCATEGORY', 'borewell_drilling',          250, true,  0.220, 'per foot'),
  ('SUBCATEGORY', 'water_tank_cleaning',       4500, true,  0.380, 'per tank'),
  ('SUBCATEGORY', 'water_treatment_plant',   780000, false, 0.300, NULL),
  ('SUBCATEGORY', 'sewage_treatment_plant', 1850000, false, 0.280, NULL),
  ('SUBCATEGORY', 'rainwater_harvesting',    165000, false, 0.320, NULL),
  ('SUBCATEGORY', 'plumbing_water_supply',    28000, false, 0.340, NULL),

  -- Electrical
  ('SUBCATEGORY', 'electrical_contracting',    95000, false, 0.300, NULL),
  ('SUBCATEGORY', 'switchgear_panels',        145000, false, 0.240, NULL),
  ('SUBCATEGORY', 'transformers',             480000, false, 0.200, NULL),
  ('SUBCATEGORY', 'dg_sets',                  620000, false, 0.220, NULL),
  ('SUBCATEGORY', 'solar_pv',                  42000, true,  0.240, 'per kW'),
  ('SUBCATEGORY', 'electrical_items_cables',      95, true,  0.200, 'per metre'),
  ('SUBCATEGORY', 'lighting_fixtures',          2400, true,  0.260, 'per fixture'),
  ('SUBCATEGORY', 'ups_inverters',             38000, true,  0.240, 'per unit'),

  -- Machinery and engineering
  ('SUBCATEGORY', 'cnc_machining',               950, true,  0.320, 'per piece'),
  ('SUBCATEGORY', 'spindle_repair',             6500, true,  0.360, 'per spindle'),
  ('SUBCATEGORY', 'machine_installation',      45000, false, 0.320, NULL),
  ('SUBCATEGORY', 'gearbox_transmission',      52000, true,  0.280, 'per unit'),
  ('SUBCATEGORY', 'welding_fabrication',          78, true,  0.280, 'per kg'),
  ('SUBCATEGORY', 'sheet_metal_work',             92, true,  0.300, 'per kg'),
  ('SUBCATEGORY', 'motors_pumps_machinery',    38000, true,  0.260, 'per unit'),
  ('SUBCATEGORY', 'foundry_casting',             135, true,  0.300, 'per kg'),

  -- Construction
  ('SUBCATEGORY', 'cement_concrete',             385, true,  0.140, 'per bag'),
  ('SUBCATEGORY', 'aggregates_sand',            1450, true,  0.240, 'per tonne'),
  ('SUBCATEGORY', 'tiles_flooring',               55, true,  0.300, 'per sqft'),
  ('SUBCATEGORY', 'painting_finishing',           28, true,  0.320, 'per sqft'),
  ('SUBCATEGORY', 'civil_work',               320000, false, 0.300, NULL),
  ('SUBCATEGORY', 'roofing_waterproofing',        68, true,  0.340, 'per sqft'),
  ('SUBCATEGORY', 'fabrication_structural',       82, true,  0.280, 'per kg'),
  ('SUBCATEGORY', 'renovation_interior',      420000, false, 0.340, NULL),

  -- Industrial supplies
  ('SUBCATEGORY', 'steel_metals',                 62, true,  0.180, 'per kg'),
  ('SUBCATEGORY', 'bearings',                   1850, true,  0.260, 'per piece'),
  ('SUBCATEGORY', 'fasteners',                    12, true,  0.280, 'per piece'),
  ('SUBCATEGORY', 'cutting_tools',              1450, true,  0.300, 'per piece'),
  ('SUBCATEGORY', 'lubricants',                  285, true,  0.220, 'per litre'),
  ('SUBCATEGORY', 'pipes_fittings',              340, true,  0.260, 'per metre'),

  -- Chemicals
  ('SUBCATEGORY', 'industrial_chemicals',        165, true,  0.220, 'per kg'),
  ('SUBCATEGORY', 'cleaning_chemicals',           92, true,  0.280, 'per litre'),
  ('SUBCATEGORY', 'water_treatment_chemicals',   118, true,  0.240, 'per kg'),
  ('SUBCATEGORY', 'paints_coatings',             420, true,  0.240, 'per litre'),

  -- Textile
  ('SUBCATEGORY', 'cotton_yarn',                 265, true,  0.160, 'per kg'),
  ('SUBCATEGORY', 'synthetic_yarn',              198, true,  0.180, 'per kg'),
  ('SUBCATEGORY', 'knitting_job_work',            45, true,  0.240, 'per kg'),
  ('SUBCATEGORY', 'dyeing_processing',            60, true,  0.260, 'per kg'),
  ('SUBCATEGORY', 'fabric_knitted',              215, true,  0.220, 'per kg'),
  ('SUBCATEGORY', 'fabric_woven',                138, true,  0.220, 'per metre'),
  ('SUBCATEGORY', 'garments',                    285, true,  0.280, 'per piece'),
  ('SUBCATEGORY', 'embroidery_printing',          18, true,  0.320, 'per piece'),

  -- Agriculture
  ('SUBCATEGORY', 'turmeric',                   9800, true,  0.180, 'per quintal'),
  ('SUBCATEGORY', 'grains_pulses',              4200, true,  0.160, 'per quintal'),
  ('SUBCATEGORY', 'spices',                     8500, true,  0.220, 'per quintal'),
  ('SUBCATEGORY', 'oil_seeds',                  5600, true,  0.180, 'per quintal'),
  ('SUBCATEGORY', 'fertilizers',                1350, true,  0.140, 'per bag'),
  ('SUBCATEGORY', 'animal_feed',                2250, true,  0.180, 'per quintal'),

  -- Packaging
  ('SUBCATEGORY', 'corrugated_boxes',             34, true,  0.240, 'per box'),
  ('SUBCATEGORY', 'labels_stickers',            2.40, true,  0.300, 'per label'),
  ('SUBCATEGORY', 'woven_sacks',                  18, true,  0.220, 'per sack'),
  ('SUBCATEGORY', 'flexible_packaging',          185, true,  0.260, 'per kg'),
  ('SUBCATEGORY', 'commercial_printing',         6.5, true,  0.320, 'per print'),

  -- Facility management
  ('SUBCATEGORY', 'housekeeping_cleaning',     42000, false, 0.320, 'per month'),
  ('SUBCATEGORY', 'security_manpower',         26500, true,  0.220, 'per guard month'),
  ('SUBCATEGORY', 'pest_control',              12500, false, 0.360, NULL),
  ('SUBCATEGORY', 'lift_amc',                  68000, false, 0.280, 'per year'),
  ('SUBCATEGORY', 'amc_facility',             145000, false, 0.300, 'per year'),
  ('SUBCATEGORY', 'rwa_operations',            85000, false, 0.320, 'per month'),
  ('SUBCATEGORY', 'plumbing_services',         18500, false, 0.360, NULL),
  ('SUBCATEGORY', 'waste_collection',          28000, false, 0.320, 'per month'),
  ('SUBCATEGORY', 'gardening_landscape',       22000, false, 0.360, 'per month'),
  ('SUBCATEGORY', 'painting_maintenance',         32, true,  0.320, 'per sqft'),

  -- Safety
  ('SUBCATEGORY', 'fire_extinguisher_amc',       850, true,  0.280, 'per unit'),
  ('SUBCATEGORY', 'fire_safety_systems',      385000, false, 0.280, NULL),
  ('SUBCATEGORY', 'cctv_surveillance',          6800, true,  0.300, 'per camera'),
  ('SUBCATEGORY', 'ppe_safety_gear',             780, true,  0.260, 'per set'),
  ('SUBCATEGORY', 'security_services',         32000, false, 0.300, 'per month'),
  ('SUBCATEGORY', 'access_control',             48000, false, 0.300, NULL),

  -- IT
  ('SUBCATEGORY', 'computers_laptops',         58000, true,  0.180, 'per unit'),
  ('SUBCATEGORY', 'networking_equipment',      34000, false, 0.240, NULL),
  ('SUBCATEGORY', 'it_amc_support',             3200, true,  0.300, 'per node'),
  ('SUBCATEGORY', 'web_software_development',  285000, false, 0.420, NULL),
  ('SUBCATEGORY', 'cctv_it_integration',       78000, false, 0.300, NULL),
  ('SUBCATEGORY', 'software_licenses',          8500, true,  0.200, 'per seat'),

  -- Logistics
  ('SUBCATEGORY', 'freight_transport',         18500, false, 0.300, 'per trip'),
  ('SUBCATEGORY', 'packers_movers',            22000, false, 0.340, NULL),
  ('SUBCATEGORY', 'warehousing',                  32, true,  0.280, 'per sqft month'),
  ('SUBCATEGORY', 'local_delivery',              850, true,  0.320, 'per trip'),
  ('SUBCATEGORY', 'heavy_equipment_movement',  46000, false, 0.320, NULL),
  ('SUBCATEGORY', 'cold_chain',                28000, false, 0.300, NULL),

  -- Professional services
  ('SUBCATEGORY', 'accounting_audit',          45000, false, 0.380, NULL),
  ('SUBCATEGORY', 'legal_services',            65000, false, 0.420, NULL),
  ('SUBCATEGORY', 'architect_services',       125000, false, 0.400, NULL),
  ('SUBCATEGORY', 'engineering_design',        85000, false, 0.380, NULL),
  ('SUBCATEGORY', 'civil_consultant',          72000, false, 0.380, NULL),
  ('SUBCATEGORY', 'project_management',        95000, false, 0.400, NULL),
  ('SUBCATEGORY', 'training_services',         38000, false, 0.400, NULL),
  ('SUBCATEGORY', 'electrician_technician',     8500, false, 0.360, NULL),
  ('SUBCATEGORY', 'plumber_technician',         7500, false, 0.360, NULL)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Anchor resolution: subcategory, then category, then global
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.demo_anchor_for_requirement(p_requirement_id uuid)
RETURNS TABLE (base_amount numeric, per_unit boolean, spread numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.base_amount, a.per_unit, a.spread
  FROM requirements r
  LEFT JOIN requirement_subcategories s ON s.id = r.subcategory_id
  LEFT JOIN requirement_categories c ON c.id = r.category_id
  JOIN demo_price_anchors a
    ON (a.scope = 'SUBCATEGORY' AND a.code = s.code)
    OR (a.scope = 'CATEGORY' AND a.code = c.code)
    OR (a.scope = 'GLOBAL')
  WHERE r.id = p_requirement_id
  ORDER BY CASE a.scope
             WHEN 'SUBCATEGORY' THEN 1
             WHEN 'CATEGORY' THEN 2
             ELSE 3
           END
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Generate quotes for an RFQ
--
-- Fills in bids from suppliers who were invited but have not quoted. Refuses
-- to touch anything that is not demo data, and refuses to run when demo mode
-- is off, so there is no path by which this reaches a real tender.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_generate_quotes(
  p_rfq_id uuid,
  p_count  integer DEFAULT NULL,
  p_status quote_status DEFAULT 'FINAL'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq        rfqs%ROWTYPE;
  v_req        requirements%ROWTYPE;
  v_seed       text;
  v_anchor     record;
  v_unit_base  numeric;
  v_inv        record;
  v_seed_text  text;
  v_base       numeric;
  v_gst        numeric;
  v_transport  numeric;
  v_total      numeric;
  v_days       integer;
  v_warranty   integer;
  v_payment    integer;
  v_response   integer;
  v_fit        integer;
  v_cert       boolean;
  v_quote_id   uuid;
  v_author     uuid;
  v_created    integer := 0;
  v_labels     text[] := '{}';
BEGIN
  IF NOT private.demo_mode_enabled() THEN
    RAISE EXCEPTION 'Demo mode is off: quote simulation is unavailable';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT v_rfq.is_demo THEN
    RAISE EXCEPTION 'RFQ % is not demo data', p_rfq_id;
  END IF;

  IF NOT (private.is_platform_admin() OR private.is_org_manager_or_above(v_rfq.organization_id)) THEN
    RAISE EXCEPTION 'Only a manager on the buying organization may simulate quotes';
  END IF;

  SELECT * INTO v_req FROM requirements WHERE id = v_rfq.requirement_id;
  SELECT demo_seed INTO v_seed FROM demo_settings WHERE id = true;

  SELECT * INTO v_anchor FROM private.demo_anchor_for_requirement(v_req.id);

  v_unit_base := CASE
    WHEN v_anchor.per_unit THEN v_anchor.base_amount * GREATEST(COALESCE(v_req.quantity, 1), 1)
    ELSE v_anchor.base_amount
  END;

  FOR v_inv IN
    SELECT ri.id, ri.supplier_id, ri.anonymous_label
    FROM rfq_invitations ri
    LEFT JOIN quotes q ON q.invitation_id = ri.id
    WHERE ri.rfq_id = p_rfq_id
      AND q.id IS NULL
      AND ri.status <> 'DECLINED'
    ORDER BY ri.anonymous_label
    LIMIT COALESCE(p_count, 1000)
  LOOP
    v_seed_text := v_seed || '|' || p_rfq_id::text || '|' || v_inv.supplier_id::text;

    -- Bids scatter around the anchor by the configured spread.
    v_base := round(
      v_unit_base * ((1 - v_anchor.spread / 2) + private.demo_rand(v_seed_text || '|price') * v_anchor.spread),
      2
    );
    v_gst       := round(v_base * 0.18, 2);
    v_transport := round(v_base * private.demo_rand(v_seed_text || '|transport') * 0.04, 2);
    v_total     := v_base + v_gst + v_transport;

    v_days     := private.demo_rand_int(v_seed_text || '|delivery', 3, 21);
    v_warranty := private.demo_pick(v_seed_text || '|warranty', ARRAY[0, 3, 6, 12, 12, 18, 24])::integer;
    v_payment  := private.demo_pick(v_seed_text || '|payment', ARRAY[0, 0, 15, 30, 30, 45])::integer;
    v_response := private.demo_rand_int(v_seed_text || '|response', 2, 48);
    v_fit      := private.demo_rand_int(v_seed_text || '|fit', 62, 100);
    v_cert     := private.demo_rand(v_seed_text || '|cert') < 0.6;

    -- Attribute the bid to the supplier's own user where one exists, so the
    -- authorship in the record is truthful rather than pinned on the buyer.
    SELECT su.profile_id INTO v_author
    FROM supplier_users su
    WHERE su.supplier_id = v_inv.supplier_id
    ORDER BY su.profile_id
    LIMIT 1;

    v_author := COALESCE(v_author, v_rfq.created_by);

    INSERT INTO quotes (rfq_id, supplier_id, invitation_id, status, current_version, submitted_at)
    VALUES (p_rfq_id, v_inv.supplier_id, v_inv.id, p_status, 1, now())
    RETURNING id INTO v_quote_id;

    INSERT INTO quote_versions (quote_id, version, snapshot, notes, created_by)
    VALUES (
      v_quote_id,
      1,
      jsonb_build_object(
        'basePrice',         v_base,
        'gstAmount',         v_gst,
        'transportCost',     v_transport,
        'totalCost',         v_total,
        'currency',          'INR',
        'deliveryDays',      v_days,
        'warrantyMonths',    v_warranty,
        'paymentTermsDays',  v_payment,
        'responseTimeHours', v_response,
        'technicalFit',      v_fit,
        'certification',     v_cert,
        'simulated',         true
      ),
      'Simulated demo quote',
      v_author
    );

    UPDATE rfq_invitations SET status = 'QUOTED', viewed_at = COALESCE(viewed_at, now())
    WHERE id = v_inv.id;

    v_created := v_created + 1;
    v_labels := v_labels || v_inv.anonymous_label;
  END LOOP;

  IF v_created > 0 THEN
    INSERT INTO audit_events (
      event_type, actor_id, organization_id, entity_type, entity_id, payload
    ) VALUES (
      'demo.quotes_generated',
      private.get_profile_id(),
      v_rfq.organization_id,
      'rfq',
      p_rfq_id::text,
      jsonb_build_object(
        'quotes_created', v_created,
        'aliases', to_jsonb(v_labels),
        'seed', v_seed,
        'status', p_status
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'rfq_id', p_rfq_id,
    'quotes_created', v_created,
    'aliases', to_jsonb(v_labels),
    'anchor_base', v_anchor.base_amount,
    'anchor_per_unit', v_anchor.per_unit,
    'seed', v_seed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_generate_quotes(uuid, integer, quote_status) TO authenticated;

-- ---------------------------------------------------------------------------
-- Simulated committee votes
--
-- Members lean towards the best-scoring quote but not unanimously, because a
-- demo where everyone agrees teaches nothing about weighted voting.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.demo_generate_votes(p_rfq_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq     rfqs%ROWTYPE;
  v_seed    text;
  v_member  record;
  v_quotes  uuid[];
  v_pick    uuid;
  v_choice  vote_choice;
  v_cast    integer := 0;
BEGIN
  IF NOT private.demo_mode_enabled() THEN
    RAISE EXCEPTION 'Demo mode is off: vote simulation is unavailable';
  END IF;

  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND OR NOT v_rfq.is_demo THEN
    RAISE EXCEPTION 'RFQ % is not demo data', p_rfq_id;
  END IF;

  IF NOT (private.is_platform_admin() OR private.is_org_manager_or_above(v_rfq.organization_id)) THEN
    RAISE EXCEPTION 'Only a manager on the buying organization may simulate votes';
  END IF;

  SELECT demo_seed INTO v_seed FROM demo_settings WHERE id = true;

  -- Best-scoring first, so index 1 is the front-runner.
  SELECT array_agg(q.id ORDER BY q.evaluation_score DESC NULLS LAST, q.id)
  INTO v_quotes
  FROM quotes q
  WHERE q.rfq_id = p_rfq_id AND q.status IN ('SUBMITTED', 'REVISED', 'FINAL');

  IF v_quotes IS NULL OR array_length(v_quotes, 1) = 0 THEN
    RETURN jsonb_build_object('votes_cast', 0, 'reason', 'no live quotes to vote on');
  END IF;

  FOR v_member IN
    SELECT ca.profile_id
    FROM committee_assignments ca
    WHERE ca.rfq_id = p_rfq_id
      AND NOT EXISTS (
        SELECT 1 FROM private.current_votes(p_rfq_id) cv WHERE cv.profile_id = ca.profile_id
      )
    ORDER BY ca.profile_id
  LOOP
    -- Roughly three in four back the front-runner; the rest spread out.
    IF private.demo_rand(v_seed || '|vote|' || p_rfq_id::text || '|' || v_member.profile_id::text) < 0.72 THEN
      v_pick := v_quotes[1];
    ELSE
      v_pick := v_quotes[private.demo_rand_int(
        v_seed || '|pick|' || p_rfq_id::text || '|' || v_member.profile_id::text,
        1, array_length(v_quotes, 1)
      )];
    END IF;

    IF v_pick IS NULL THEN
      RAISE EXCEPTION 'Simulated vote picked no quote on RFQ % (% quotes available)',
        p_rfq_id, array_length(v_quotes, 1);
    END IF;

    v_choice := 'RECOMMEND';

    INSERT INTO committee_votes (rfq_id, profile_id, recommended_quote_id, choice, comment)
    VALUES (p_rfq_id, v_member.profile_id, v_pick, v_choice, 'Simulated demo vote');

    v_cast := v_cast + 1;
  END LOOP;

  RETURN jsonb_build_object('rfq_id', p_rfq_id, 'votes_cast', v_cast);
END;
$$;

GRANT EXECUTE ON FUNCTION public.demo_generate_votes(uuid) TO authenticated;
