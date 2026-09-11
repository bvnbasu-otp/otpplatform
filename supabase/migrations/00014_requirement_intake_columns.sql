-- Requirement intake columns and RFQ sourcing/evaluation configuration.
--
-- The universal fields become real columns; only genuinely category-specific
-- values stay in the `attributes` jsonb, shaped by
-- category_attribute_definitions.
--
-- structured_specs is retained and kept in sync by trigger so every existing
-- view, seed and RPC that reads it keeps working.

-- ---------------------------------------------------------------------------
-- requirement_mode -> requirement_type rollup
--
-- requirement_type stays the coarse three-value enum the documented state
-- machine and INV-007 depend on. requirement_mode is the buyer-facing intent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.requirement_mode_base_type(p_mode requirement_mode)
RETURNS requirement_type
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_mode
    WHEN 'PRODUCT_MATERIAL'     THEN 'PRODUCT'::requirement_type
    WHEN 'COMMODITY_TRADING'    THEN 'PRODUCT'::requirement_type
    WHEN 'PROJECT_CONTRACT'     THEN 'PROJECT'::requirement_type
    WHEN 'SERVICE'              THEN 'SERVICE'::requirement_type
    WHEN 'REPAIR_MAINTENANCE'   THEN 'SERVICE'::requirement_type
    WHEN 'JOB_WORK'             THEN 'SERVICE'::requirement_type
    WHEN 'RENTAL_HIRE'          THEN 'SERVICE'::requirement_type
    WHEN 'AMC'                  THEN 'SERVICE'::requirement_type
    WHEN 'LOGISTICS'            THEN 'SERVICE'::requirement_type
    WHEN 'PROFESSIONAL_SERVICE' THEN 'SERVICE'::requirement_type
    ELSE NULL
  END;
$$;

-- ---------------------------------------------------------------------------
-- requirements — taxonomy, universal fields, dynamic attributes
-- ---------------------------------------------------------------------------

ALTER TABLE requirements
  ADD COLUMN category_id       uuid REFERENCES requirement_categories (id),
  ADD COLUMN subcategory_id    uuid REFERENCES requirement_subcategories (id),
  ADD COLUMN requirement_mode  requirement_mode,
  ADD COLUMN quantity          numeric(14, 3),
  ADD COLUMN unit              text,
  ADD COLUMN attributes        jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN quality           jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN commercial        jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN required_by_mode  required_by_mode,
  ADD COLUMN required_by_days  integer,
  ADD COLUMN required_by_date  date,
  ADD COLUMN fulfilment_mode   fulfilment_mode,
  ADD COLUMN delivery_city     text,
  ADD COLUMN delivery_pincode  text,
  ADD COLUMN delivery_line1    text,
  -- Exact site detail stays buyer-private: suppliers see city granularity
  -- only until award reveal.
  ADD COLUMN site_notes        text;

ALTER TABLE requirements
  ADD CONSTRAINT requirements_attributes_is_object
    CHECK (jsonb_typeof(attributes) = 'object'),
  ADD CONSTRAINT requirements_quality_is_object
    CHECK (jsonb_typeof(quality) = 'object'),
  ADD CONSTRAINT requirements_commercial_is_object
    CHECK (jsonb_typeof(commercial) = 'object'),
  ADD CONSTRAINT requirements_quantity_non_negative
    CHECK (quantity IS NULL OR quantity >= 0),
  ADD CONSTRAINT requirements_required_by_days_positive
    CHECK (required_by_days IS NULL OR required_by_days > 0),
  ADD CONSTRAINT requirements_pincode_format
    CHECK (delivery_pincode IS NULL OR delivery_pincode ~ '^[0-9]{6}$');

CREATE INDEX idx_requirements_category ON requirements (category_id);
CREATE INDEX idx_requirements_subcategory ON requirements (subcategory_id);
CREATE INDEX idx_requirements_mode ON requirements (requirement_mode);
CREATE INDEX idx_requirements_attributes ON requirements USING gin (attributes);

COMMENT ON COLUMN requirements.structured_specs IS
  'Legacy mirror of the typed intake columns, refreshed by trigger for backward compatibility. New code should read the typed columns and attributes.';
COMMENT ON COLUMN requirements.site_notes IS
  'Buyer-private site detail. Never exposed through supplier-facing views before award reveal.';

-- ---------------------------------------------------------------------------
-- Keep category/subcategory consistent and derive requirement_type
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.requirements_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_category uuid;
  v_base_type       requirement_type;
  v_specs           jsonb;
BEGIN
  -- Subcategory implies its parent category.
  IF NEW.subcategory_id IS NOT NULL THEN
    SELECT category_id INTO v_parent_category
    FROM requirement_subcategories
    WHERE id = NEW.subcategory_id;

    IF v_parent_category IS NULL THEN
      RAISE EXCEPTION 'Unknown subcategory %', NEW.subcategory_id;
    END IF;

    IF NEW.category_id IS NULL THEN
      NEW.category_id := v_parent_category;
    ELSIF NEW.category_id <> v_parent_category THEN
      RAISE EXCEPTION
        'Subcategory % belongs to category %, not %',
        NEW.subcategory_id, v_parent_category, NEW.category_id;
    END IF;
  END IF;

  -- requirement_mode drives requirement_type. INV-007 keeps requirement_type
  -- immutable once the requirement leaves DRAFT, so only re-derive while the
  -- requirement is still a draft.
  IF NEW.requirement_mode IS NOT NULL THEN
    v_base_type := private.requirement_mode_base_type(NEW.requirement_mode);

    IF v_base_type IS NOT NULL THEN
      IF TG_OP = 'INSERT' OR NEW.status = 'DRAFT' THEN
        NEW.requirement_type := v_base_type;
      ELSIF NEW.requirement_type <> v_base_type THEN
        RAISE EXCEPTION
          'requirement_mode % implies requirement_type % but requirement is % and past DRAFT (INV-007)',
          NEW.requirement_mode, v_base_type, NEW.requirement_type;
      END IF;
    END IF;
  END IF;

  -- Refresh the legacy mirror. The nested objects are merged rather than
  -- replaced: a shallow || would silently discard legacy keys that the typed
  -- columns do not cover yet (postalCode, state, and any attribute we have no
  -- definition for).
  IF NEW.category_id IS NOT NULL OR NEW.subcategory_id IS NOT NULL THEN
    v_specs := COALESCE(NEW.structured_specs, '{}'::jsonb) || jsonb_strip_nulls(
      jsonb_build_object(
        'requirementType', NEW.requirement_type::text,
        'requirementMode', NEW.requirement_mode::text,
        'title', NEW.title,
        'category', (SELECT name FROM requirement_categories WHERE id = NEW.category_id),
        'categoryCode', (SELECT code FROM requirement_categories WHERE id = NEW.category_id),
        'subcategory', (SELECT name FROM requirement_subcategories WHERE id = NEW.subcategory_id),
        'subcategoryCode', (SELECT code FROM requirement_subcategories WHERE id = NEW.subcategory_id),
        'quantity', NEW.quantity,
        'unit', NEW.unit,
        'quality', NULLIF(NEW.quality, '{}'::jsonb),
        'commercial', NULLIF(NEW.commercial, '{}'::jsonb),
        'requiredBy', jsonb_strip_nulls(jsonb_build_object(
          'mode', NEW.required_by_mode::text,
          'days', NEW.required_by_days,
          'date', NEW.required_by_date
        ))
      )
    );

    v_specs := jsonb_set(
      v_specs, '{attributes}',
      COALESCE(v_specs -> 'attributes', '{}'::jsonb) || NEW.attributes,
      true
    );

    v_specs := jsonb_set(
      v_specs, '{deliveryLocation}',
      COALESCE(v_specs -> 'deliveryLocation', '{}'::jsonb) || jsonb_strip_nulls(
        jsonb_build_object(
          'line1', NEW.delivery_line1,
          'city', NEW.delivery_city,
          'pincode', NEW.delivery_pincode,
          'country', 'IN'
        )
      ),
      true
    );

    NEW.structured_specs := v_specs;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER requirements_normalize
  BEFORE INSERT OR UPDATE ON requirements
  FOR EACH ROW EXECUTE FUNCTION private.requirements_normalize();

-- ---------------------------------------------------------------------------
-- rfqs — sourcing mode and buyer-owned evaluation weights
-- ---------------------------------------------------------------------------

ALTER TABLE rfqs
  ADD COLUMN sourcing_mode sourcing_mode NOT NULL DEFAULT 'IDENTITY_PROTECTED',
  -- Normalized percentages keyed by evaluation_criteria.code, summing to 100.
  -- Owned by the buyer per requirement; there is no fixed criteria set.
  ADD COLUMN evaluation_weights jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN evaluation_weights_source text NOT NULL DEFAULT 'SUGGESTED';

ALTER TABLE rfqs
  ADD CONSTRAINT rfqs_evaluation_weights_is_object
    CHECK (jsonb_typeof(evaluation_weights) = 'object'),
  ADD CONSTRAINT rfqs_evaluation_weights_source_valid
    CHECK (evaluation_weights_source IN ('SUGGESTED', 'CUSTOM'));

-- Golden path expects competitive tension: three quotes by default (INV-071).
ALTER TABLE rfqs ALTER COLUMN min_quotes_required SET DEFAULT 3;

COMMENT ON COLUMN rfqs.evaluation_weights IS
  'Buyer-owned normalized criterion weights keyed by evaluation_criteria.code. Written only through set_rfq_evaluation_weights.';
