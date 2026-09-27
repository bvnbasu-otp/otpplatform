-- Migration 00207: Stop submit_signup_request from revealing an existing
-- registration's real status
--
-- D-26. submit_signup_request's own design comment (00035:112-116) says the
-- response "says nothing about what is already in the table" because
-- telling an anonymous caller "that email is already registered" turns the
-- form into an account-enumeration oracle. The implementation (00035, carried
-- forward unchanged by 00180) contradicts that comment: when a non-REJECTED
-- signup_requests row already exists for the email+side, it returns
-- 'already_submitted', true and the row's real 'status' (e.g. PENDING vs
-- APPROVED/ONBOARDED), which an anonymous prober can read directly.
--
-- This makes the existing-registration branch return the same generic shape
-- an anonymous caller sees for a brand-new submission (status 'PENDING',
-- already_submitted false), while still returning the same reference for a
-- repeat submission from the real applicant (idempotent from the applicant's
-- side, per the original design comment) and still not inserting a
-- duplicate row.
--
-- Idempotent and non-destructive: CREATE OR REPLACE FUNCTION only; no table,
-- column or row is dropped, deleted or updated.

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_signup_request(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_side         signup_side;
  v_buyer_type   org_type;
  v_channel      verification_channel;
  v_codes        text[];
  v_role         text;
  v_id           uuid;
  v_ref          text;
  v_business     text;
  v_existing     signup_requests%ROWTYPE;
BEGIN
  v_side := upper(COALESCE(p_request->>'side', ''))::signup_side;
  v_channel := upper(COALESCE(NULLIF(p_request->>'verification_channel', ''), 'EMAIL'))
               ::verification_channel;

  IF v_side = 'BUYER' THEN
    v_buyer_type := NULLIF(p_request->>'buyer_type', '')::org_type;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT c.code), '{}') INTO v_codes
  FROM jsonb_array_elements_text(COALESCE(p_request->'category_codes', '[]'::jsonb)) AS raw(code)
  JOIN requirement_categories c ON c.code = raw.code AND c.is_active;

  -- Role resolution: must exist, be active, and belong to the requested side
  SELECT ur.code INTO v_role
  FROM user_roles ur
  WHERE ur.code = NULLIF(btrim(COALESCE(p_request->>'role_code', '')), '')
    AND ur.side = v_side
    AND ur.is_active;

  -- Default INDIVIDUAL buyer role to PROPERTY_OWNER if not specified
  IF v_side = 'BUYER' AND v_buyer_type = 'INDIVIDUAL' AND v_role IS NULL THEN
    v_role := 'PROPERTY_OWNER';
  END IF;

  -- Resolve business / organisation name
  v_business := btrim(COALESCE(p_request->>'business_name', ''));
  IF v_side = 'BUYER' AND v_buyer_type = 'INDIVIDUAL' THEN
    IF v_business = '' OR lower(v_business) = 'self' THEN
      v_business := 'Self';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM signup_requests
  WHERE lower(email) = lower(p_request->>'email')
    AND side = v_side
    AND status <> 'REJECTED';

  -- D-26: the response for an already-registered email must be
  -- indistinguishable from a fresh submission's response. Only the
  -- reference (needed for the applicant's own idempotent retry) differs by
  -- being stable across repeats; the status/already_submitted signals that
  -- previously leaked the row's real state are removed.
  IF FOUND THEN
    RETURN jsonb_build_object(
      'reference', 'REG-' || upper(substr(replace(v_existing.id::text, '-', ''), 1, 8)),
      'status', 'PENDING',
      'already_submitted', false
    );
  END IF;

  INSERT INTO signup_requests (
    side, business_name, contact_first_name, contact_last_name, designation,
    email, phone, verification_channel, buyer_type, referral_code,
    category_codes, tax_registration_id, coverage_city, coverage_pincode, role_code,
    status
  ) VALUES (
    v_side,
    v_business,
    btrim(p_request->>'contact_first_name'),
    btrim(p_request->>'contact_last_name'),
    NULLIF(btrim(COALESCE(p_request->>'designation', '')), ''),
    lower(btrim(p_request->>'email')),
    btrim(p_request->>'phone'),
    v_channel,
    v_buyer_type,
    NULLIF(btrim(COALESCE(p_request->>'referral_code', '')), ''),
    v_codes,
    NULLIF(btrim(COALESCE(p_request->>'tax_registration_id', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_city', '')), ''),
    NULLIF(btrim(COALESCE(p_request->>'coverage_pincode', '')), ''),
    v_role,
    'PENDING'
  )
  RETURNING id INTO v_id;

  v_ref := 'REG-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

  INSERT INTO audit_events (event_type, entity_type, entity_id, payload)
  VALUES ('signup.requested', 'signup_request', v_id::text,
          jsonb_build_object('side', v_side, 'reference', v_ref,
                             'verification_channel', v_channel,
                             'role', v_role,
                             'business_name', v_business,
                             'buyer_type', v_buyer_type));

  RETURN jsonb_build_object('reference', v_ref, 'status', 'PENDING',
                            'already_submitted', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_signup_request(jsonb) TO anon, authenticated, service_role;

COMMIT;
