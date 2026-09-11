-- Two-way identity protection.
--
-- Suppliers must not be identifiable to the buyer before award, and the buyer
-- must not be identifiable to the suppliers at all unless they choose to be.
--
-- The alias is the crux. Sequential "Supplier A/B/C" labels leak across RFQs:
-- if a committee sees that Supplier A is always the cheapest, and the same
-- ordering is used every time, the anonymity is cosmetic. Here each RFQ gets
-- its own salt and each alias is a hash of (salt, supplier), so the same
-- workshop is "Bidder K7P4" on one RFQ and "Bidder A3F9" on the next, with no
-- way to link the two.

-- ---------------------------------------------------------------------------
-- Opaque short codes (Crockford base32: no I, L, O or U, so nothing reads as
-- a word and nothing is misread aloud)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.short_code(p_seed text, p_len integer DEFAULT 4)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_num  bigint;
  v_out  text := '';
  v_i    integer;
BEGIN
  v_num := ('x' || substr(md5(COALESCE(p_seed, '')), 1, 15))::bit(60)::bigint;

  FOR v_i IN 1..GREATEST(p_len, 1) LOOP
    v_out := substr(k_alphabet, (v_num % 32)::integer + 1, 1) || v_out;
    v_num := v_num / 32;
  END LOOP;

  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- Per-RFQ alias salt and public references
-- ---------------------------------------------------------------------------

ALTER TABLE rfqs
  ADD COLUMN alias_salt text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  ADD COLUMN public_ref text;

ALTER TABLE requirements ADD COLUMN public_ref text;

COMMENT ON COLUMN rfqs.alias_salt IS
  'Per-RFQ salt for bidder aliases. Makes aliases unlinkable across RFQs. Never exposed to any client.';

-- Buyer anonymity is the default posture, not an opt-in.
ALTER TABLE rfqs ALTER COLUMN buyer_anonymous_to_suppliers SET DEFAULT true;

CREATE OR REPLACE FUNCTION private.assign_public_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_try    integer := 0;
  v_ref    text;
BEGIN
  IF NEW.public_ref IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_prefix := CASE TG_TABLE_NAME WHEN 'rfqs' THEN 'RFQ-' ELSE 'REQ-' END;

  LOOP
    v_ref := v_prefix || private.short_code(TG_TABLE_NAME || NEW.id::text || v_try, 6);

    IF TG_TABLE_NAME = 'rfqs' THEN
      EXIT WHEN NOT EXISTS (SELECT 1 FROM rfqs WHERE public_ref = v_ref);
    ELSE
      EXIT WHEN NOT EXISTS (SELECT 1 FROM requirements WHERE public_ref = v_ref);
    END IF;

    v_try := v_try + 1;
    IF v_try > 25 THEN
      RAISE EXCEPTION 'Could not allocate a unique public reference';
    END IF;
  END LOOP;

  NEW.public_ref := v_ref;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rfqs_public_ref
  BEFORE INSERT ON rfqs
  FOR EACH ROW EXECUTE FUNCTION private.assign_public_ref();

CREATE TRIGGER requirements_public_ref
  BEFORE INSERT ON requirements
  FOR EACH ROW EXECUTE FUNCTION private.assign_public_ref();

-- Existing rows.
UPDATE rfqs SET public_ref = 'RFQ-' || private.short_code('rfqs' || id::text, 6)
WHERE public_ref IS NULL;
UPDATE requirements SET public_ref = 'REQ-' || private.short_code('requirements' || id::text, 6)
WHERE public_ref IS NULL;

CREATE UNIQUE INDEX idx_rfqs_public_ref ON rfqs (public_ref);
CREATE UNIQUE INDEX idx_requirements_public_ref ON requirements (public_ref);

-- ---------------------------------------------------------------------------
-- Randomized aliases
--
-- Replaces the sequential allocator from 00016. Discovery is untouched: it
-- calls this helper and never constructs a label itself.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.assign_anonymous_label(
  p_rfq_id      uuid,
  p_supplier_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salt  text;
  v_try   integer := 0;
  v_label text;
BEGIN
  SELECT alias_salt INTO v_salt FROM rfqs WHERE id = p_rfq_id;

  IF v_salt IS NULL THEN
    RAISE EXCEPTION 'RFQ % has no alias salt', p_rfq_id;
  END IF;

  LOOP
    v_label := 'Bidder ' || private.short_code(
      v_salt || ':' || p_supplier_id::text || ':' || v_try, 4
    );

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM rfq_invitations
      WHERE rfq_id = p_rfq_id AND anonymous_label = v_label
    );

    v_try := v_try + 1;
    IF v_try > 50 THEN
      RAISE EXCEPTION 'Could not allocate a unique bidder alias';
    END IF;
  END LOOP;

  RETURN v_label;
END;
$$;

-- ---------------------------------------------------------------------------
-- What a supplier sees of an RFQ
--
-- Deliberately excludes organization_id, created_by, the buyer's name unless
-- they waived anonymity, the exact address and the buyer's private site notes.
-- City granularity is enough to price travel.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfqs_supplier_blind
WITH (security_barrier = true) AS
SELECT
  r.id AS rfq_id,
  r.public_ref,
  r.title,
  req.description,
  r.status,
  r.sourcing_mode,
  r.quote_deadline,
  r.min_quotes_required,
  r.created_at,
  ri.id AS invitation_id,
  ri.anonymous_label AS my_alias,
  ri.status AS my_invitation_status,
  ri.invited_at,
  -- Requirement detail the supplier needs in order to quote.
  cat.name AS category,
  sub.name AS subcategory,
  req.requirement_mode,
  req.quantity,
  req.unit,
  req.attributes,
  req.quality,
  req.commercial,
  req.required_by_mode,
  req.required_by_days,
  req.required_by_date,
  req.fulfilment_mode,
  req.delivery_city,
  -- The criteria the buyer will judge on, so competition is on merit rather
  -- than on guessing what matters.
  r.evaluation_weights,
  CASE
    WHEN r.buyer_anonymous_to_suppliers THEN 'Identity protected'
    ELSE o.name
  END AS buyer_display_name,
  CASE
    WHEN r.buyer_anonymous_to_suppliers THEN NULL
    ELSE o.org_type
  END AS buyer_type
FROM rfqs r
JOIN requirements req ON req.id = r.requirement_id
JOIN organizations o ON o.id = r.organization_id
JOIN rfq_invitations ri ON ri.rfq_id = r.id
LEFT JOIN requirement_categories cat ON cat.id = req.category_id
LEFT JOIN requirement_subcategories sub ON sub.id = req.subcategory_id
WHERE private.is_supplier_user_for(ri.supplier_id);

GRANT SELECT ON rfqs_supplier_blind TO authenticated;

-- ---------------------------------------------------------------------------
-- quotes_blind gains reliability signals without identity
--
-- Buyers legitimately want to weigh "who delivers on time" but must not learn
-- WHO. Ratings are rounded into half-star and 5% bands so a distinctive exact
-- value cannot be used to fingerprint a bidder.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW quotes_blind
WITH (security_barrier = true) AS
SELECT
  q.id AS quote_id,
  ri.anonymous_label,
  q.rfq_id,
  q.status,
  q.current_version AS version,
  q.evaluation_score,
  q.submitted_at,
  q.created_at,
  q.updated_at,
  (qv.snapshot ->> 'basePrice')::numeric(14, 2) AS base_price,
  (qv.snapshot ->> 'gstAmount')::numeric(14, 2) AS gst_amount,
  (qv.snapshot ->> 'transportCost')::numeric(14, 2) AS transport_cost,
  (qv.snapshot ->> 'totalCost')::numeric(14, 2) AS total_cost,
  (qv.snapshot ->> 'deliveryDays')::integer AS delivery_days,
  (qv.snapshot ->> 'warrantyMonths')::integer AS warranty_months,
  (qv.snapshot ->> 'paymentTermsDays')::integer AS payment_terms_days,
  ((round(s.rating_avg * 2) / 2))::numeric(3, 1) AS rating_band,
  ((round(s.on_time_percent / 5) * 5))::integer AS on_time_band,
  CASE
    WHEN s.completed_jobs >= 50 THEN '50+'
    WHEN s.completed_jobs >= 20 THEN '20-49'
    WHEN s.completed_jobs >= 5  THEN '5-19'
    WHEN s.completed_jobs >= 1  THEN '1-4'
    ELSE 'New'
  END AS experience_band,
  s.verification_status
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv
  ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE r.reveal_status = 'BLIND'
  AND (
    private.can_access_rfq_as_buyer(q.rfq_id)
    OR private.can_access_rfq_as_committee(q.rfq_id)
  );

GRANT SELECT ON quotes_blind TO authenticated;

-- ---------------------------------------------------------------------------
-- Per-criterion score breakdown, blind
--
-- Lets the comparison screen show WHY a quote scored what it did without
-- exposing who submitted it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW quote_evaluations_blind
WITH (security_barrier = true) AS
SELECT
  e.id AS evaluation_id,
  e.quote_id,
  e.rfq_id,
  ri.anonymous_label,
  e.version_evaluated,
  e.evaluation_score,
  e.breakdown,
  e.status,
  e.computed_at
FROM quote_evaluations e
JOIN quotes q ON q.id = e.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = e.rfq_id
WHERE r.reveal_status = 'BLIND'
  AND (
    private.can_access_rfq_as_buyer(e.rfq_id)
    OR private.can_access_rfq_as_committee(e.rfq_id)
  );

GRANT SELECT ON quote_evaluations_blind TO authenticated;

-- ---------------------------------------------------------------------------
-- Requirement attachments a supplier may read, keyed by public_ref
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rfq_by_public_ref(p_public_ref text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id
  FROM rfqs r
  WHERE r.public_ref = p_public_ref
    AND (
      private.has_rfq_invitation(r.id)
      OR private.can_access_rfq_as_buyer(r.id)
      OR private.can_access_rfq_as_committee(r.id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.rfq_by_public_ref(text) TO authenticated;
