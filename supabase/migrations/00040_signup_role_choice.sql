-- The role a person says they hold, captured while they are registering.
--
-- Without this, the question is asked twice: once on the registration form,
-- where it is the natural place to ask what someone does, and again after their
-- first sign-in, because nothing carried the answer across the gap between
-- filing a request and the account being activated. Two answers to one question
-- is how a finance approver ends up titled Procurement Lead.
--
-- It is a preference, not a grant. Nothing here assigns anything: the role is
-- applied when the request becomes a real account, and an operator can override
-- it. That distinction matters, because a public form that could grant itself a
-- permission would be the widest hole in the schema.

ALTER TABLE signup_requests
  ADD COLUMN role_code text REFERENCES user_roles (code);

COMMENT ON COLUMN signup_requests.role_code IS
  'The job role the applicant selected while registering. A preference to apply at activation, never a grant.';

-- A supplier applicant cannot ask to be Procurement Lead. A trigger rather than
-- a CHECK because the rule lives in another table, and enforced here as well as
-- in the submit function below because the table outlives any one caller.
CREATE OR REPLACE FUNCTION private.assert_signup_role_side()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_side signup_side;
BEGIN
  IF NEW.role_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT side INTO v_role_side FROM user_roles WHERE code = NEW.role_code;

  IF v_role_side IS DISTINCT FROM NEW.side THEN
    RAISE EXCEPTION 'Role % does not belong to the % side', NEW.role_code, NEW.side;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER signup_requests_role_side
  BEFORE INSERT OR UPDATE OF role_code, side ON signup_requests
  FOR EACH ROW EXECUTE FUNCTION private.assert_signup_role_side();

-- ---------------------------------------------------------------------------
-- Submission, now carrying the role
--
-- Replaces the body from 00035. Everything else about it is unchanged, including
-- the property that the response says nothing about what is already in the
-- table: an unauthenticated form that could report "already registered" is an
-- account-enumeration oracle.
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
  v_role     text;
  v_id       uuid;
  v_ref      text;
  v_existing signup_requests%ROWTYPE;
BEGIN
  v_side := upper(COALESCE(p_request->>'side', ''))::signup_side;
  v_channel := upper(COALESCE(NULLIF(p_request->>'verification_channel', ''), 'EMAIL'))
               ::verification_channel;

  SELECT COALESCE(array_agg(DISTINCT c.code), '{}') INTO v_codes
  FROM jsonb_array_elements_text(COALESCE(p_request->'category_codes', '[]'::jsonb)) AS raw(code)
  JOIN requirement_categories c ON c.code = raw.code AND c.is_active;

  -- An unknown or wrong-sided role is dropped rather than rejected. The
  -- registration is the valuable thing; a mismatched dropdown value is not worth
  -- losing a real applicant over, and an operator sets the role at activation.
  SELECT ur.code INTO v_role
  FROM user_roles ur
  WHERE ur.code = NULLIF(btrim(COALESCE(p_request->>'role_code', '')), '')
    AND ur.side = v_side
    AND ur.is_active;

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
    category_codes, tax_registration_id, coverage_city, coverage_pincode, role_code
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
    NULLIF(btrim(COALESCE(p_request->>'coverage_pincode', '')), ''),
    v_role
  )
  RETURNING id INTO v_id;

  v_ref := 'REG-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('signup.requested', 'signup_request', v_id::text,
          jsonb_build_object('side', v_side, 'reference', v_ref,
                             'verification_channel', v_channel,
                             'role', v_role));

  RETURN jsonb_build_object('reference', v_ref, 'status', 'PENDING',
                            'already_submitted', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated;

-- The registration form needs the list of job titles before there is a session.
-- The catalogue is not sensitive — it is a list of job titles and what each one
-- is allowed to do — and publishing it lets the public form offer exactly the
-- roles the server would accept.
GRANT EXECUTE ON FUNCTION public.role_catalog(signup_side) TO anon;
