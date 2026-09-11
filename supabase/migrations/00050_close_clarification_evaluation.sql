CREATE OR REPLACE FUNCTION public.close_clarification_for_evaluation(p_rfq_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_final_count int;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only managers or owners can close negotiation';
  END IF;

  IF v_rfq.status NOT IN ('CLARIFICATION', 'OPEN', 'CLOSED') THEN
    RAISE EXCEPTION 'RFQ must be in CLARIFICATION or OPEN to proceed to evaluation (current: %)', v_rfq.status;
  END IF;

  -- A price that was submitted is the supplier's word: finalize all submitted quotes.
  UPDATE quotes
  SET status = 'FINAL', updated_at = now()
  WHERE rfq_id = p_rfq_id AND status IN ('SUBMITTED', 'REVISED');

  SELECT count(*)::int INTO v_final_count
  FROM quotes
  WHERE rfq_id = p_rfq_id AND status = 'FINAL';

  IF v_final_count < v_rfq.min_quotes_required AND NOT v_rfq.min_quotes_waived THEN
    RAISE EXCEPTION 'Minimum % final quotes required (found %)', v_rfq.min_quotes_required, v_final_count;
  END IF;

  UPDATE rfqs SET status = 'EVALUATING', updated_at = now() WHERE id = p_rfq_id;

  UPDATE requirements
  SET status = 'EVALUATION', updated_at = now()
  WHERE id = v_rfq.requirement_id;

  -- Auto-populate committee assignments for all eligible committee members in this organization
  INSERT INTO committee_assignments (rfq_id, profile_id)
  SELECT p_rfq_id, om.profile_id
  FROM organization_members om
  WHERE om.organization_id = v_rfq.organization_id
    AND om.role IN ('COMMITTEE_MEMBER', 'MANAGER', 'OWNER', 'BUYER')
  ON CONFLICT (rfq_id, profile_id) DO NOTHING;
END;
$$;
