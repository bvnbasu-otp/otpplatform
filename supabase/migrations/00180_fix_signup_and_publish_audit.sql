-- =============================================================================
-- Migration 00180: Fix submit_signup_request & publish_requirement Audit Payload
--
-- Fixes:
--   1. submit_signup_request: ensures pending status, side-filtered role validation,
--      no auto-approval bypass, proper registration reference and audit event.
--   2. publish_requirement: ensures market intelligence snapshot is captured and
--      marketIntelScope and marketIntelKey are properly recorded in the requirement.published
--      audit event payload.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Restore canonical submit_signup_request
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Restore canonical publish_requirement with market intelligence & credit deduction
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
SET search_path = public, private, auth, extensions
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

  SELECT s.code, c.code
    INTO v_subcategory_code, v_category_code
  FROM requirement_subcategories s
  JOIN requirement_categories c ON c.id = s.category_id
  WHERE s.id = v_req.subcategory_id;

  v_snapshot := public.lookup_market_intelligence(
    v_subcategory_code, v_category_code, v_req.delivery_city
  );

  -- Track credit usage on organization if present
  UPDATE public.organizations
  SET free_rfq_credits = GREATEST(0, COALESCE(free_rfq_credits, 1) - 1),
      rfq_credits_used = COALESCE(rfq_credits_used, 0) + 1,
      updated_at = now()
  WHERE id = v_req.organization_id;

  -- Transition requirement
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

GRANT EXECUTE ON FUNCTION public.publish_requirement(uuid, sourcing_mode, integer, integer, jsonb, text) TO authenticated, service_role;

COMMIT;
