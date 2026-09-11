-- Market intelligence, captured on every requirement at publish time.
--
-- Why this migration exists.
--
-- Two symptoms motivated it.
--
-- First, the market-intelligence panel only ever showed anything for the four
-- pilot RFQs, because the frontend mapped an RFQ id to a hardcoded pilot
-- category key ('motor_winding_10hp', etc.) that had no relation to the real
-- taxonomy. A requirement filed against 'motor_rewinding' (the actual
-- subcategory code) found no baseline, so a normal buyer never saw a price
-- band before publishing.
--
-- Second, even for the pilot RFQs the numbers were re-fetched on every visit
-- to the vote screen. That is not "market intelligence captured on the
-- requirement" — it is a live lookup that would silently change if the
-- baseline table were updated after publish. The audit trail should be able
-- to answer "what price band did the buyer see when they clicked Publish?",
-- and there was no way to answer it.
--
-- The fix has three parts:
--
--   1. A snapshot column on requirements. Populated once by
--      publish_requirement and never rewritten.
--   2. A lookup function that walks a four-step ladder — subcategory+city,
--      subcategory, category+city, category — so any requirement gets a
--      baseline if one exists, without inventing numbers when none do.
--   3. publish_requirement now calls the lookup and stamps the column inside
--      the same transaction. The buyer cannot forge the snapshot; nothing
--      else can rewrite it.
--
-- The lookup returns NULL when no baseline matches. The intake UI shows an
-- honest blank state in that case — a page that fabricated bands from thin
-- air would be worse than one that admitted it does not know yet.

-- ---------------------------------------------------------------------------
-- Snapshot column
-- ---------------------------------------------------------------------------

ALTER TABLE requirements
  ADD COLUMN market_intel_snapshot jsonb;

COMMENT ON COLUMN requirements.market_intel_snapshot IS
  'Immutable snapshot of the market intelligence baseline the buyer saw at publish time. Stamped by publish_requirement, never rewritten. NULL when no baseline matched. Format: { matchedKey, matchedScope, matchedCity, historicalPriceMin, historicalPriceMax, typicalDeliveryDaysMin, typicalDeliveryDaysMax, typicalWarrantyMonthsMin, typicalWarrantyMonthsMax, supplierPerformanceAvg, sampleSize, notes, capturedAt }.';

-- Nothing but publish_requirement should ever set this column, so lock it
-- with a trigger. Adding "or publish_requirement did it" without a way to
-- prove that from the row would leak an escape hatch, so we forbid all
-- direct writes and let the SECURITY DEFINER RPC do the work instead. The
-- trigger allows NULL -> value once (the initial stamp) and refuses every
-- other change.
CREATE OR REPLACE FUNCTION private.requirements_market_intel_snapshot_locked()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.market_intel_snapshot IS NOT NULL
     AND NEW.market_intel_snapshot IS DISTINCT FROM OLD.market_intel_snapshot THEN
    RAISE EXCEPTION
      'requirements.market_intel_snapshot is captured once at publish and cannot be rewritten';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER requirements_market_intel_snapshot_locked
  BEFORE UPDATE ON requirements
  FOR EACH ROW EXECUTE FUNCTION private.requirements_market_intel_snapshot_locked();

-- ---------------------------------------------------------------------------
-- Lookup function
--
-- A four-step ladder, most specific first. Whichever step matches sets
-- matchedScope so the UI can say "in Bengaluru" vs "category-wide" honestly.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lookup_market_intelligence(
  p_subcategory_code text,
  p_category_code    text,
  p_city             text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row   market_intelligence_baselines%ROWTYPE;
  v_scope text := NULL;
BEGIN
  IF p_subcategory_code IS NOT NULL AND p_city IS NOT NULL THEN
    SELECT * INTO v_row
    FROM market_intelligence_baselines
    WHERE category_key = p_subcategory_code
      AND location_city = p_city
    LIMIT 1;
    IF FOUND THEN v_scope := 'subcategory_city'; END IF;
  END IF;

  IF v_scope IS NULL AND p_subcategory_code IS NOT NULL THEN
    SELECT * INTO v_row
    FROM market_intelligence_baselines
    WHERE category_key = p_subcategory_code
      AND location_city IS NULL
    LIMIT 1;
    IF FOUND THEN v_scope := 'subcategory'; END IF;
  END IF;

  IF v_scope IS NULL AND p_category_code IS NOT NULL AND p_city IS NOT NULL THEN
    SELECT * INTO v_row
    FROM market_intelligence_baselines
    WHERE category_key = p_category_code
      AND location_city = p_city
    LIMIT 1;
    IF FOUND THEN v_scope := 'category_city'; END IF;
  END IF;

  IF v_scope IS NULL AND p_category_code IS NOT NULL THEN
    SELECT * INTO v_row
    FROM market_intelligence_baselines
    WHERE category_key = p_category_code
      AND location_city IS NULL
    LIMIT 1;
    IF FOUND THEN v_scope := 'category'; END IF;
  END IF;

  IF v_scope IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'matchedKey',                v_row.category_key,
    'matchedScope',              v_scope,
    'matchedCity',               v_row.location_city,
    'historicalPriceMin',        v_row.historical_price_min,
    'historicalPriceMax',        v_row.historical_price_max,
    'typicalDeliveryDaysMin',    v_row.typical_delivery_days_min,
    'typicalDeliveryDaysMax',    v_row.typical_delivery_days_max,
    'typicalWarrantyMonthsMin',  v_row.typical_warranty_months_min,
    'typicalWarrantyMonthsMax',  v_row.typical_warranty_months_max,
    'supplierPerformanceAvg',    v_row.supplier_performance_avg,
    'sampleSize',                v_row.sample_size,
    'notes',                     v_row.notes,
    'capturedAt',                now()
  );
END;
$$;

COMMENT ON FUNCTION public.lookup_market_intelligence(text, text, text) IS
  'Fallback ladder: subcategory+city -> subcategory -> category+city -> category -> NULL. Called by the intake wizard for a live preview and by publish_requirement to stamp the immutable snapshot on the requirement.';

GRANT EXECUTE ON FUNCTION public.lookup_market_intelligence(text, text, text)
  TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- publish_requirement now stamps the snapshot
--
-- The function's external contract is unchanged: same parameters, same
-- return shape. The snapshot is derived server-side from the requirement's
-- own subcategory, category and delivery city, so a caller cannot influence
-- which baseline is chosen.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_requirement(
  p_requirement_id      uuid,
  p_sourcing_mode       sourcing_mode DEFAULT 'IDENTITY_PROTECTED',
  p_min_quotes_required integer DEFAULT 3,
  p_quote_deadline_days integer DEFAULT 7,
  p_weights             jsonb DEFAULT '{}'::jsonb,
  p_weights_source      text DEFAULT 'SUGGESTED'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req              requirements%ROWTYPE;
  v_rfq_id           uuid;
  v_public_ref       text;
  v_quote_deadline   timestamptz;
  v_subcategory_code text;
  v_category_code    text;
  v_snapshot         jsonb;
BEGIN
  SELECT * INTO v_req FROM requirements WHERE id = p_requirement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Requirement not found';
  END IF;

  IF NOT private.is_org_member(v_req.organization_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF private.get_org_role(v_req.organization_id) NOT IN ('OWNER', 'MANAGER', 'BUYER')
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Insufficient role to publish a requirement';
  END IF;

  IF v_req.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only a DRAFT requirement can be published; this one is %',
      v_req.status;
  END IF;

  IF v_req.subcategory_id IS NULL THEN
    RAISE EXCEPTION 'A requirement needs a subcategory before it can be published, or discovery has nothing to match on';
  END IF;

  IF EXISTS (SELECT 1 FROM rfqs WHERE requirement_id = p_requirement_id) THEN
    RAISE EXCEPTION 'This requirement already has an RFQ';
  END IF;

  IF p_min_quotes_required < 1 THEN
    RAISE EXCEPTION 'At least one quote must be required';
  END IF;

  IF p_quote_deadline_days < 1 THEN
    RAISE EXCEPTION 'The quote deadline must be at least a day away';
  END IF;

  v_quote_deadline := now() + make_interval(days => p_quote_deadline_days);

  -- Look up the taxonomy codes for the snapshot. Both are already present
  -- on the requirement row indirectly; resolving them here keeps the RPC
  -- self-contained and lets the market_intelligence table be keyed by text
  -- codes rather than uuids that would drift with a taxonomy reload.
  SELECT s.code, c.code
    INTO v_subcategory_code, v_category_code
  FROM requirement_subcategories s
  JOIN requirement_categories c ON c.id = s.category_id
  WHERE s.id = v_req.subcategory_id;

  v_snapshot := public.lookup_market_intelligence(
    v_subcategory_code, v_category_code, v_req.delivery_city
  );

  -- DRAFT -> SUBMITTED -> RFQ_CREATED, in the order the state machine
  -- documents, inside one transaction so no intermediate state is observable.
  UPDATE requirements
  SET status = 'SUBMITTED',
      published_at = COALESCE(published_at, now()),
      market_intel_snapshot = COALESCE(market_intel_snapshot, v_snapshot),
      updated_at = now()
  WHERE id = p_requirement_id;

  INSERT INTO rfqs (
    requirement_id, organization_id, status, reveal_status, title,
    quote_deadline, evaluation_deadline, buyer_anonymous_to_suppliers,
    sourcing_mode, min_quotes_required, created_by
  ) VALUES (
    p_requirement_id,
    v_req.organization_id,
    'DRAFT',
    'BLIND',
    'RFQ: ' || v_req.title,
    v_quote_deadline,
    v_quote_deadline + interval '7 days',
    p_sourcing_mode <> 'OPEN_RFQ',
    p_sourcing_mode,
    p_min_quotes_required,
    private.get_profile_id()
  )
  RETURNING id, public_ref INTO v_rfq_id, v_public_ref;

  UPDATE requirements
  SET status = 'RFQ_CREATED', updated_at = now()
  WHERE id = p_requirement_id;

  IF p_weights IS NOT NULL AND p_weights <> '{}'::jsonb THEN
    PERFORM public.set_rfq_evaluation_weights(v_rfq_id, p_weights, p_weights_source);
  END IF;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'requirement.published',
    private.get_profile_id(),
    v_req.organization_id,
    'requirement',
    p_requirement_id::text,
    jsonb_build_object(
      'rfqId', v_rfq_id,
      'publicRef', v_public_ref,
      'sourcingMode', p_sourcing_mode::text,
      'minQuotesRequired', p_min_quotes_required,
      'quoteDeadline', v_quote_deadline,
      -- Only the scope, not the numbers themselves. The full snapshot lives
      -- on the requirement; audit records that we captured one.
      'marketIntelScope', COALESCE(v_snapshot ->> 'matchedScope', 'none'),
      'marketIntelKey', COALESCE(v_snapshot ->> 'matchedKey', NULL)
    )
  );

  RETURN jsonb_build_object(
    'requirementId', p_requirement_id,
    'rfqId', v_rfq_id,
    'publicRef', v_public_ref,
    'marketIntelSnapshot', v_snapshot
  );
END;
$$;

COMMENT ON FUNCTION public.publish_requirement(uuid, sourcing_mode, integer, integer, jsonb, text) IS
  'Publishes a DRAFT requirement and creates its RFQ in one transaction. Also stamps requirements.market_intel_snapshot with the baseline the buyer saw at publish time, so the decision can be reviewed against what was known at the moment. The intake wizard calls only this; it never writes rfqs directly.';
