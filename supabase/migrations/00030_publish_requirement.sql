-- Publishing a requirement, as one act.
--
-- Two problems are fixed here, both found by walking the intake wizard.
--
-- First, rfqs_select_buyer resolved the organization by reading the rfqs table
-- back through private.rfq_org_id(id). That works for a row that already
-- exists, but an INSERT ... RETURNING has to satisfy the SELECT policy for a
-- row the sub-query cannot see yet, so every buyer-side RFQ creation failed
-- with "new row violates row-level security policy". The requirements table
-- never had the problem because its policy reads organization_id off the row.
-- The rule is identical either way; the column form is simply the one that can
-- be evaluated during an insert.
--
-- Second, publishing was three client round trips: submit the requirement,
-- create the RFQ, set the weights. A failure in the middle left a requirement
-- marked SUBMITTED with no RFQ attached and no way back through the wizard.
-- Publishing is one transaction now, so it either happens or it does not.

DROP POLICY IF EXISTS rfqs_select_buyer ON rfqs;

CREATE POLICY rfqs_select_buyer ON rfqs
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- publish_requirement
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
  v_req            requirements%ROWTYPE;
  v_rfq_id         uuid;
  v_public_ref     text;
  v_quote_deadline timestamptz;
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

  -- DRAFT -> SUBMITTED -> RFQ_CREATED, in the order the state machine
  -- documents, inside one transaction so no intermediate state is observable.
  UPDATE requirements
  SET status = 'SUBMITTED',
      published_at = COALESCE(published_at, now()),
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
      'quoteDeadline', v_quote_deadline
    )
  );

  RETURN jsonb_build_object(
    'requirementId', p_requirement_id,
    'rfqId', v_rfq_id,
    'publicRef', v_public_ref
  );
END;
$$;

COMMENT ON FUNCTION public.publish_requirement(uuid, sourcing_mode, integer, integer, jsonb, text) IS
  'Publishes a DRAFT requirement and creates its RFQ in one transaction. The intake wizard calls only this; it never writes rfqs directly.';

GRANT EXECUTE ON FUNCTION public.publish_requirement(
  uuid, sourcing_mode, integer, integer, jsonb, text
) TO authenticated;
