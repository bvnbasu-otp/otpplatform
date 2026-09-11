-- Self-serve registration for both sides of the market.
--
-- A registration is a REQUEST, not an account. Buyer organizations and supplier
-- businesses are both verified before they transact: a buyer because suppliers
-- are being asked to spend a morning quoting, and a supplier because a buyer is
-- being asked to let a stranger onto their site. So the form writes a row here
-- and an operator turns it into an organization or a supplier.
--
-- The consequence worth stating: anon can INSERT and can never SELECT. A
-- registration form on the public internet that could read its own table would
-- hand a competitor the list of every business signing up, which is a customer
-- list and a lead list in one.

CREATE TYPE signup_side AS ENUM ('BUYER', 'SUPPLIER');

CREATE TYPE signup_status AS ENUM (
  'PENDING',
  'CONTACTED',
  'VERIFIED',
  'ONBOARDED',
  'REJECTED'
);

-- How the applicant asked to be reached for their one-time code. WhatsApp is
-- listed because it is what this market actually uses; whether it is available
-- depends on the messaging provider configured for the environment.
CREATE TYPE verification_channel AS ENUM ('EMAIL', 'WHATSAPP');

CREATE TABLE signup_requests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  side                 signup_side NOT NULL,
  status               signup_status NOT NULL DEFAULT 'PENDING',

  -- Who they are.
  business_name        text NOT NULL,
  contact_first_name   text NOT NULL,
  contact_last_name    text NOT NULL,
  designation          text,
  email                text NOT NULL,
  phone                text NOT NULL,

  -- How they asked to be verified.
  verification_channel verification_channel NOT NULL DEFAULT 'EMAIL',
  verified_at          timestamptz,

  -- Buyer-side detail.
  buyer_type           org_type,
  referral_code        text,

  -- Supplier-side detail. Categories are stored as taxonomy codes rather than
  -- ids so a row stays readable if the taxonomy is re-seeded.
  category_codes       text[] NOT NULL DEFAULT '{}',
  tax_registration_id  text,
  coverage_city        text,
  coverage_pincode     text,

  -- What the operator did with it.
  reviewed_by          uuid REFERENCES profiles (id) ON DELETE SET NULL,
  reviewed_at          timestamptz,
  review_notes         text,
  /** Set once the request becomes a real tenant, so it cannot be onboarded twice. */
  organization_id      uuid REFERENCES organizations (id) ON DELETE SET NULL,
  supplier_id          uuid REFERENCES suppliers (id) ON DELETE SET NULL,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT signup_requests_email_shape
    CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Ten digits, optionally with a country code. Deliberately loose: rejecting a
  -- real number is worse than accepting an odd one an operator will call anyway.
  CONSTRAINT signup_requests_phone_shape
    CHECK (regexp_replace(phone, '[^0-9]', '', 'g') ~ '^[0-9]{10,15}$'),
  CONSTRAINT signup_requests_pincode_shape
    CHECK (coverage_pincode IS NULL OR coverage_pincode ~ '^[0-9]{6}$'),
  -- A supplier that names no category cannot be matched to anything, so the
  -- registration would be a dead end.
  -- cardinality rather than array_length: an empty array gives array_length
  -- NULL, and a NULL check expression passes, so the constraint would let
  -- through exactly the row it exists to reject.
  CONSTRAINT signup_requests_supplier_needs_category
    CHECK (side <> 'SUPPLIER' OR cardinality(category_codes) >= 1),
  CONSTRAINT signup_requests_supplier_needs_coverage
    CHECK (
      side <> 'SUPPLIER'
      OR coverage_city IS NOT NULL
      OR coverage_pincode IS NOT NULL
    ),
  CONSTRAINT signup_requests_side_matches_link
    CHECK (
      (side = 'BUYER' AND supplier_id IS NULL)
      OR (side = 'SUPPLIER' AND organization_id IS NULL)
    )
);

-- One live application per email per side. A resubmission after rejection is
-- allowed, which is why the index excludes REJECTED.
CREATE UNIQUE INDEX idx_signup_requests_open_email
  ON signup_requests (lower(email), side)
  WHERE status <> 'REJECTED';

CREATE INDEX idx_signup_requests_queue
  ON signup_requests (status, created_at);

CREATE TRIGGER signup_requests_updated_at
  BEFORE UPDATE ON signup_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Submission
--
-- A function rather than a direct INSERT, so the shape of the request is
-- validated in one place and the response says nothing about what is already in
-- the table. It returns a reference the applicant can quote and nothing else:
-- telling an anonymous caller "that email is already registered" turns the form
-- into an account-enumeration oracle.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.submit_signup_request(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_side     signup_side;
  v_channel  verification_channel;
  v_codes    text[];
  v_id       uuid;
  v_ref      text;
  v_existing signup_requests%ROWTYPE;
BEGIN
  v_side := upper(COALESCE(p_request->>'side', ''))::signup_side;
  v_channel := upper(COALESCE(NULLIF(p_request->>'verification_channel', ''), 'EMAIL'))
               ::verification_channel;

  SELECT COALESCE(
    array_agg(DISTINCT c.code),
    '{}'
  ) INTO v_codes
  FROM jsonb_array_elements_text(COALESCE(p_request->'category_codes', '[]'::jsonb)) AS raw(code)
  JOIN requirement_categories c ON c.code = raw.code AND c.is_active;

  -- Already applied and not rejected: report success with the existing
  -- reference. Idempotent from the applicant's side, and silent about the
  -- table's contents.
  SELECT * INTO v_existing
  FROM signup_requests
  WHERE lower(email) = lower(p_request->>'email')
    AND side = v_side
    AND status <> 'REJECTED';

  IF FOUND THEN
    RETURN jsonb_build_object(
      'reference', 'REG-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'status', v_existing.status,
      'already_submitted', true
    );
  END IF;

  INSERT INTO signup_requests (
    side, business_name, contact_first_name, contact_last_name, designation,
    email, phone, verification_channel, buyer_type, referral_code,
    category_codes, tax_registration_id, coverage_city, coverage_pincode
  ) VALUES (
    v_side,
    btrim(p_request->>'business_name'),
    btrim(p_request->>'contact_first_name'),
    btrim(p_request->>'contact_last_name'),
    NULLIF(btrim(COALESCE(p_request->>'designation', '')), ''),
    lower(btrim(p_request->>'email')),
    btrim(p_request->>'phone'),
    v_channel,
    CASE WHEN v_side = 'BUYER'
         THEN NULLIF(p_request->>'buyer_type', '')::org_type END,
    NULLIF(btrim(COALESCE(p_request->>'referral_code', '')), ''),
    v_codes,
    NULLIF(btrim(COALESCE(p_request->>'tax_registration_id', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_city', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_pincode', '')), '')
  )
  RETURNING id INTO v_id;

  v_ref := 'REG-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('signup.requested', 'signup_request', v_id::text,
          jsonb_build_object('side', v_side, 'reference', v_ref,
                             'verification_channel', v_channel));

  RETURN jsonb_build_object('reference', v_ref, 'status', 'PENDING',
                            'already_submitted', false);
END;
$$;

COMMENT ON FUNCTION public.submit_signup_request(jsonb) IS
  'Accepts a registration from an unauthenticated visitor. Returns only a reference, never whether the email was already known.';

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reference data the unauthenticated forms need
--
-- The signup forms ask a supplier for its categories and its coverage city.
-- Both tables are readable only by authenticated users, and rightly so, but the
-- category catalog is published reference data and the served-city list is an
-- aggregate with no supplier in it. Exposing those two, and only those two,
-- through functions keeps the tables shut.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.service_categories()
RETURNS TABLE (code text, name text, description text, sort_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.code, c.name, c.description, c.sort_order
  FROM requirement_categories c
  WHERE c.is_active
  ORDER BY c.sort_order, c.name;
$$;

COMMENT ON FUNCTION public.service_categories() IS
  'Published category catalog for the unauthenticated signup forms. Reference data only.';

GRANT EXECUTE ON FUNCTION public.service_categories() TO anon, authenticated;

-- served_cities() is already an aggregate that no supplier can be identified
-- from; the signup form needs it before there is a session.
GRANT EXECUTE ON FUNCTION public.served_cities() TO anon;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Insert goes exclusively through the function above, so there is no INSERT
-- policy at all. Only a platform admin may read or work the queue.
-- ---------------------------------------------------------------------------

ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY signup_requests_admin_read ON signup_requests
  FOR SELECT TO authenticated
  USING (private.is_platform_admin());

CREATE POLICY signup_requests_admin_write ON signup_requests
  FOR UPDATE TO authenticated
  USING (private.is_platform_admin())
  WITH CHECK (private.is_platform_admin());

GRANT SELECT, UPDATE ON signup_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON signup_requests TO service_role;
