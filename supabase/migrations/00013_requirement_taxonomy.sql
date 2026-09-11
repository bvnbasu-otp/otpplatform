-- OTP configurable requirement taxonomy.
--
-- The category tree, its dynamic attribute schemas, the capability vocabulary
-- and the evaluation criteria catalog are all DATA, never application code.
-- Adding a vertical (Coimbatore engineering, Tiruppur textile, Erode
-- commodities) is an INSERT, not a code change.
--
-- Subcategories carry match_keywords and attribute definitions carry
-- match_patterns so the natural-language parser is configured by the same rows
-- that drive the intake form.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE attribute_data_type AS ENUM (
  'TEXT',
  'NUMBER',
  'BOOLEAN',
  'ENUM',
  'MULTI_ENUM',
  'DATE'
);

-- Buyer-facing requirement modes. requirement_type (PRODUCT|SERVICE|PROJECT)
-- is retained as the coarse rollup that the documented state machine and
-- INV-007 depend on; requirement_mode is the finer intent captured at intake.
CREATE TYPE requirement_mode AS ENUM (
  'PRODUCT_MATERIAL',
  'SERVICE',
  'REPAIR_MAINTENANCE',
  'JOB_WORK',
  'PROJECT_CONTRACT',
  'RENTAL_HIRE',
  'AMC',
  'COMMODITY_TRADING',
  'LOGISTICS',
  'PROFESSIONAL_SERVICE',
  'OTHER'
);

CREATE TYPE sourcing_mode AS ENUM (
  'OPEN_RFQ',
  'IDENTITY_PROTECTED',
  'INVITE_SELECTED',
  'NETWORK_DISCOVERY',
  'PREVIOUS_SUPPLIERS'
);

CREATE TYPE required_by_mode AS ENUM (
  'IMMEDIATE',
  'WITHIN_DAYS',
  'SPECIFIC_DATE',
  'FLEXIBLE'
);

CREATE TYPE fulfilment_mode AS ENUM (
  'SUPPLIER_DELIVERY',
  'BUYER_PICKUP',
  'SUPPLIER_ONSITE',
  'REMOTE',
  'LOGISTICS_REQUIRED'
);

-- Whether a lower or higher raw value scores better during evaluation.
CREATE TYPE criterion_direction AS ENUM ('LOWER_IS_BETTER', 'HIGHER_IS_BETTER');

-- ---------------------------------------------------------------------------
-- Category tree
-- ---------------------------------------------------------------------------

CREATE TABLE requirement_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,
  icon        text,
  description text,
  examples    text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_requirement_categories_active
  ON requirement_categories (is_active, sort_order);

CREATE TABLE requirement_subcategories (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id             uuid NOT NULL REFERENCES requirement_categories (id) ON DELETE CASCADE,
  code                    text NOT NULL UNIQUE,
  name                    text NOT NULL,
  description             text,
  -- Lower-cased phrases the parser scores free text against.
  match_keywords          text[] NOT NULL DEFAULT '{}',
  -- Attribute codes a supplier cannot quote without. They may belong to this
  -- subcategory or to its category, so requiredness is stated here rather than
  -- duplicating a shared definition just to flip one flag: HP is mandatory for
  -- a rewinding job and irrelevant for tank cleaning, though both sit under
  -- Water & Environmental.
  required_attribute_codes text[] NOT NULL DEFAULT '{}',
  default_requirement_mode requirement_mode,
  sort_order              integer NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_requirement_subcategories_category
  ON requirement_subcategories (category_id, sort_order);
CREATE INDEX idx_requirement_subcategories_keywords
  ON requirement_subcategories USING gin (match_keywords);

-- ---------------------------------------------------------------------------
-- Capability vocabulary
--
-- Capability is deliberately independent of the category tree: a requirement
-- filed under "Water & Environmental Solutions" can require the capability
-- "motor_rewinding", which is also offered by suppliers who think of
-- themselves as machinery or electrical businesses. Category explains the
-- requirement; capability decides who can fulfil it.
-- ---------------------------------------------------------------------------

CREATE TABLE capabilities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  description   text,
  -- When set, suppliers declare a numeric ceiling in this unit (e.g. HP, KG).
  capacity_unit text,
  sort_order    integer NOT NULL DEFAULT 0,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_capabilities_active ON capabilities (is_active, sort_order);

CREATE TABLE subcategory_capabilities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id uuid NOT NULL REFERENCES requirement_subcategories (id) ON DELETE CASCADE,
  capability_id  uuid NOT NULL REFERENCES capabilities (id) ON DELETE CASCADE,
  -- Primary capabilities are required for eligibility; secondary ones only
  -- improve the match score.
  is_primary     boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcategory_id, capability_id)
);

CREATE INDEX idx_subcategory_capabilities_sub
  ON subcategory_capabilities (subcategory_id);
CREATE INDEX idx_subcategory_capabilities_cap
  ON subcategory_capabilities (capability_id);

-- ---------------------------------------------------------------------------
-- Dynamic attribute schemas
--
-- An attribute attaches either to a whole category (shared across its
-- subcategories) or to one subcategory (specific). match_patterns hold
-- POSIX regexes the parser uses to lift the value out of free text; the first
-- capture group is the value.
-- ---------------------------------------------------------------------------

CREATE TABLE category_attribute_definitions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid REFERENCES requirement_categories (id) ON DELETE CASCADE,
  subcategory_id  uuid REFERENCES requirement_subcategories (id) ON DELETE CASCADE,
  code            text NOT NULL,
  label           text NOT NULL,
  data_type       attribute_data_type NOT NULL,
  unit            text,
  is_required     boolean NOT NULL DEFAULT false,
  -- ENUM/MULTI_ENUM choices: ["Combed", "Carded"]
  options         jsonb NOT NULL DEFAULT '[]',
  -- {"min":0,"max":1000,"step":0.01}
  validation      jsonb NOT NULL DEFAULT '{}',
  match_patterns  text[] NOT NULL DEFAULT '{}',
  help_text       text,
  placeholder     text,
  -- Empty array means the attribute applies to every mode.
  applies_to_modes requirement_mode[] NOT NULL DEFAULT '{}',
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attribute_scope_exactly_one CHECK (
    (category_id IS NOT NULL AND subcategory_id IS NULL)
    OR (category_id IS NULL AND subcategory_id IS NOT NULL)
  ),
  CONSTRAINT attribute_options_is_array CHECK (jsonb_typeof(options) = 'array'),
  CONSTRAINT attribute_validation_is_object CHECK (jsonb_typeof(validation) = 'object'),
  CONSTRAINT attribute_enum_has_options CHECK (
    data_type NOT IN ('ENUM', 'MULTI_ENUM') OR jsonb_array_length(options) > 0
  )
);

CREATE UNIQUE INDEX idx_attribute_defs_category_code
  ON category_attribute_definitions (category_id, code)
  WHERE category_id IS NOT NULL;
CREATE UNIQUE INDEX idx_attribute_defs_subcategory_code
  ON category_attribute_definitions (subcategory_id, code)
  WHERE subcategory_id IS NOT NULL;
CREATE INDEX idx_attribute_defs_lookup
  ON category_attribute_definitions (category_id, subcategory_id, sort_order);

-- ---------------------------------------------------------------------------
-- Evaluation criteria catalog
--
-- value_source names where compute_quote_evaluations reads the raw number
-- from. Criteria the scoring function does not recognise score neutrally
-- rather than silently dropping their weight.
-- ---------------------------------------------------------------------------

CREATE TABLE evaluation_criteria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  description  text,
  direction    criterion_direction NOT NULL,
  value_source text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluation_criteria_active
  ON evaluation_criteria (is_active, sort_order);

-- Per-subcategory STARTING SUGGESTION only. The buyer owns the criteria set
-- and the weights for each requirement and may add, remove or rewrite any of
-- them; Reset restores these rows.
CREATE TABLE subcategory_evaluation_suggestions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcategory_id uuid NOT NULL REFERENCES requirement_subcategories (id) ON DELETE CASCADE,
  criterion_id   uuid NOT NULL REFERENCES evaluation_criteria (id) ON DELETE CASCADE,
  weight         numeric(6, 2) NOT NULL CHECK (weight > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcategory_id, criterion_id)
);

CREATE INDEX idx_subcategory_suggestions_sub
  ON subcategory_evaluation_suggestions (subcategory_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER requirement_categories_updated_at
  BEFORE UPDATE ON requirement_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER requirement_subcategories_updated_at
  BEFORE UPDATE ON requirement_subcategories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER capabilities_updated_at
  BEFORE UPDATE ON capabilities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER category_attribute_definitions_updated_at
  BEFORE UPDATE ON category_attribute_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER evaluation_criteria_updated_at
  BEFORE UPDATE ON evaluation_criteria
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Helper — resolve the attribute schema for a subcategory
--
-- Returns category-level attributes followed by subcategory-level ones, which
-- is the order the intake form renders them in. is_required is widened by the
-- subcategory's required_attribute_codes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.subcategory_attribute_schema(p_subcategory_id uuid)
RETURNS TABLE (
  attribute_id     uuid,
  scope            text,
  code             text,
  label            text,
  data_type        attribute_data_type,
  unit             text,
  is_required      boolean,
  options          jsonb,
  validation       jsonb,
  match_patterns   text[],
  help_text        text,
  placeholder      text,
  applies_to_modes requirement_mode[],
  sort_order       integer
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    d.id,
    CASE WHEN d.category_id IS NOT NULL THEN 'CATEGORY' ELSE 'SUBCATEGORY' END,
    d.code,
    d.label,
    d.data_type,
    d.unit,
    d.is_required OR d.code = ANY (s.required_attribute_codes),
    d.options,
    d.validation,
    d.match_patterns,
    d.help_text,
    d.placeholder,
    d.applies_to_modes,
    d.sort_order
  FROM category_attribute_definitions d
  JOIN requirement_subcategories s ON s.id = p_subcategory_id
  WHERE d.is_active
    AND (d.subcategory_id = s.id OR d.category_id = s.category_id)
  ORDER BY
    CASE WHEN d.category_id IS NOT NULL THEN 0 ELSE 1 END,
    d.sort_order,
    d.label;
$$;

-- ---------------------------------------------------------------------------
-- RLS — taxonomy is public reference data; only platform admins write it
-- ---------------------------------------------------------------------------

ALTER TABLE requirement_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE requirement_subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategory_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_attribute_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategory_evaluation_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY requirement_categories_select ON requirement_categories
  FOR SELECT TO authenticated USING (is_active OR private.is_platform_admin());
CREATE POLICY requirement_categories_write ON requirement_categories
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY requirement_subcategories_select ON requirement_subcategories
  FOR SELECT TO authenticated USING (is_active OR private.is_platform_admin());
CREATE POLICY requirement_subcategories_write ON requirement_subcategories
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY capabilities_select ON capabilities
  FOR SELECT TO authenticated USING (is_active OR private.is_platform_admin());
CREATE POLICY capabilities_write ON capabilities
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY subcategory_capabilities_select ON subcategory_capabilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY subcategory_capabilities_write ON subcategory_capabilities
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY category_attribute_definitions_select ON category_attribute_definitions
  FOR SELECT TO authenticated USING (is_active OR private.is_platform_admin());
CREATE POLICY category_attribute_definitions_write ON category_attribute_definitions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY evaluation_criteria_select ON evaluation_criteria
  FOR SELECT TO authenticated USING (is_active OR private.is_platform_admin());
CREATE POLICY evaluation_criteria_write ON evaluation_criteria
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

CREATE POLICY subcategory_evaluation_suggestions_select ON subcategory_evaluation_suggestions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY subcategory_evaluation_suggestions_write ON subcategory_evaluation_suggestions
  FOR ALL TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Grants — the blanket grants in 00005 only covered tables that existed then
-- ---------------------------------------------------------------------------

GRANT SELECT ON requirement_categories, requirement_subcategories, capabilities,
  subcategory_capabilities, category_attribute_definitions, evaluation_criteria,
  subcategory_evaluation_suggestions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON requirement_categories,
  requirement_subcategories, capabilities, subcategory_capabilities,
  category_attribute_definitions, evaluation_criteria,
  subcategory_evaluation_suggestions TO service_role;

GRANT EXECUTE ON FUNCTION public.subcategory_attribute_schema(uuid) TO authenticated;
