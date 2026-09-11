-- Bring the earlier seed files onto the taxonomy.
--
-- seed.sql and seed_pilots_horizontals.sql were written before requirements
-- had a category, suppliers had capability rows, or RFQs carried evaluation
-- weights. Rather than duplicate the classification logic into each of those
-- files, this pass runs after them and applies the same derivation the
-- production backfill uses, then fills in the few things only a human can
-- decide — capacity ceilings and starting weights.
--
-- Kept as its own file so the original seeds stay readable as the scenarios
-- they describe, and so there is one place to look when the taxonomy changes.

-- ---------------------------------------------------------------------------
-- Classify, derive capabilities, derive service areas
-- ---------------------------------------------------------------------------

SELECT public.backfill_taxonomy();

-- ---------------------------------------------------------------------------
-- Capacity ceilings the legacy profiles never stated
--
-- Discovery lets an undeclared ceiling through but ranks it down (00028), so
-- these suppliers would still be found. Stating a real number puts them on
-- equal footing and makes the capacity gate observable in the pilot scenarios.
-- ---------------------------------------------------------------------------

UPDATE supplier_capabilities sc
SET max_capacity_value = m.ceiling
FROM capabilities c, suppliers s, (VALUES
  -- Yarn traders quote by the lot; these are the tonnages they actually hold.
  ('Tiruppur Yarn Traders',            'cotton_yarn_supply',  40000),
  ('South India Spinning Mills',       'cotton_yarn_supply', 180000),
  ('Kongu Cotton Suppliers',           'cotton_yarn_supply',  25000),
  ('Erode Cotton Exchange',            'cotton_yarn_supply',  35000),
  ('Bhavani Yarn Depot',               'cotton_yarn_supply',  18000),

  -- Machining ceilings are the largest workpiece the bed will take.
  ('Coimbatore CNC Solutions',         'cnc_machining',         600),
  ('Lakshmi Machine Tools AMC',        'cnc_machining',         800),
  ('SK Engineering Services',          'cnc_machining',         400),

  -- Panel builders are limited by the busbar rating they can assemble.
  ('Bengaluru Electrical Contractors', 'panel_manufacturing',   630),
  ('Karnataka Licensed Electricians',  'panel_manufacturing',   250),
  ('PowerGrid Shop Solutions',         'panel_manufacturing',   800),

  -- Borewell flushing reach, in feet.
  ('AquaFlow Borewell Services',       'borewell_flushing',     600),
  ('DeepWell Motor Experts',           'borewell_flushing',     450),
  ('HydroTech Winding Co',             'borewell_flushing',     750),
  ('Bengaluru Pump & Motor',           'borewell_flushing',     400),
  ('SouthCity Borewell Works',         'borewell_flushing',     500)
) AS m(business, capability, ceiling)
WHERE sc.supplier_id = s.id
  AND sc.capability_id = c.id
  AND s.business_name = m.business
  AND c.code = m.capability
  AND sc.max_capacity_value IS NULL;

-- ---------------------------------------------------------------------------
-- Universal fields the legacy requirements left implicit
--
-- The fulfilment-track requirement in seed.sql carries no quantity or delivery
-- location, because nothing needed them before. Discovery and price anchoring
-- both do.
-- ---------------------------------------------------------------------------

UPDATE requirements
SET quantity = COALESCE(quantity, 1),
    unit = COALESCE(unit, 'motor'),
    delivery_city = COALESCE(delivery_city, 'Bengaluru'),
    delivery_pincode = COALESCE(delivery_pincode, '560034'),
    attributes = attributes || '{"motor_hp": 10}'::jsonb
WHERE id = 'a2000001-0000-4000-8000-000000000002';

-- The borewell golden path states 10 HP in its legacy specs; make it explicit
-- so the capacity gate reads it from the typed column like any new requirement.
UPDATE requirements
SET attributes = attributes || '{"motor_hp": 10}'::jsonb,
    unit = 'motor'
WHERE id = 'a2000000-0000-4000-8000-000000000001'
  AND NOT (attributes ? 'motor_hp');

-- The pilot requirements state their scale in the title; put it in the columns.
UPDATE requirements
SET attributes = attributes || '{"capacity_kva": 63}'::jsonb
WHERE id = 'd4000020-0000-4000-8000-000000000001'
  AND NOT (attributes ? 'capacity_kva');

UPDATE requirements
SET quantity = COALESCE(quantity, 500),
    unit = COALESCE(unit, 'kg'),
    attributes = attributes || '{"yarn_count": "40s", "yarn_process": "Combed"}'::jsonb
WHERE id = 'd3000020-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Evaluation weights on the legacy RFQs
--
-- Without weights, compute_quote_evaluations has nothing to score against and
-- the blind comparison screen has no criteria to show. Each RFQ takes the
-- suggestion for its own subcategory, which is the same starting point a new
-- RFQ gets.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_rfq record;
BEGIN
  FOR v_rfq IN
    SELECT r.id, r.requirement_id
    FROM rfqs r
    WHERE r.evaluation_weights = '{}'::jsonb
      AND r.requirement_id IS NOT NULL
  LOOP
    UPDATE rfqs
    SET evaluation_weights = public.suggest_evaluation_weights(v_rfq.requirement_id),
        evaluation_weights_source = 'SUGGESTED'
    WHERE id = v_rfq.id;
  END LOOP;
END;
$$;

-- Score the quotes that already exist, so the pilot RFQs open on a populated
-- comparison rather than an empty one.
--
-- Acting as each RFQ's own creator: scoring is an authorized action, and
-- running it as nobody would either fail or quietly bypass a check the
-- application relies on.
DO $$
DECLARE
  v_rfq record;
BEGIN
  FOR v_rfq IN
    SELECT DISTINCT
      q.rfq_id AS id,
      (
        SELECT p.auth_user_id
        FROM organization_members m
        JOIN profiles p ON p.id = m.profile_id
        WHERE m.organization_id = r.organization_id
          AND m.role IN ('OWNER', 'MANAGER')
        ORDER BY CASE m.role WHEN 'OWNER' THEN 0 ELSE 1 END, p.email
        LIMIT 1
      ) AS auth_user_id
    FROM quotes q
    JOIN rfqs r ON r.id = q.rfq_id
    WHERE q.status IN ('SUBMITTED', 'REVISED', 'FINAL')
      AND r.evaluation_weights <> '{}'::jsonb
  LOOP
    CONTINUE WHEN v_rfq.auth_user_id IS NULL;

    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_rfq.auth_user_id::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.compute_quote_evaluations(v_rfq.id);
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;
