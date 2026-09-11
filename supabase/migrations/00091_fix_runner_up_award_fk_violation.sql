-- award_runner_up_quote() replaced the disqualified award with a fresh row
-- (DELETE FROM awards, then INSERT). Once a purchase order had actually been
-- issued off that award, purchase_orders.award_id (NOT NULL, no ON DELETE
-- action) blocked the DELETE with "violates foreign key constraint
-- purchase_orders_award_id_fkey" — exactly the case the button exists for
-- (buyer awarded, supplier went unresponsive after the PO was cut).
--
-- Fixed by reassigning the existing award row in place (UPDATE, not
-- DELETE+INSERT) and voiding any non-draft PO issued against it, instead of
-- only cleaning up DRAFT ones.
CREATE OR REPLACE FUNCTION public.award_runner_up_quote(
  p_rfq_id uuid,
  p_reason text DEFAULT 'Previous winning supplier was unresponsive or failed inspection'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_prev_award awards%ROWTYPE;
  v_runner_up_id uuid;
  v_runner_up_price numeric;
  v_now timestamptz := now();
  v_new_award_id uuid;
  v_alias text;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can award runner-up quote';
  END IF;

  SELECT * INTO v_prev_award FROM awards WHERE rfq_id = p_rfq_id;

  -- 1. Disqualify previous winning quote and void any PO cut against it
  IF v_prev_award.quote_id IS NOT NULL THEN
    UPDATE quotes
    SET status = 'WITHDRAWN', updated_at = v_now
    WHERE id = v_prev_award.quote_id;

    -- A draft PO was never issued and can simply be removed; anything past
    -- draft is voided instead, since its award_id must never dangle.
    DELETE FROM purchase_orders WHERE rfq_id = p_rfq_id AND status = 'DRAFT';
    UPDATE purchase_orders
    SET status = 'CANCELLED', updated_at = v_now
    WHERE award_id = v_prev_award.id AND status <> 'DRAFT';
  END IF;

  -- 2. Find Runner-Up Quote (lowest total cost from quote_versions)
  SELECT q.id, COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, 0), ri.anonymous_label
  INTO v_runner_up_id, v_runner_up_price, v_alias
  FROM quotes q
  JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
  JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.rfq_id = p_rfq_id
    AND q.id <> COALESCE(v_prev_award.quote_id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND q.status IN ('FINAL', 'NOT_SELECTED', 'SUBMITTED', 'REVISED')
  ORDER BY COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, 0) ASC
  LIMIT 1;

  IF v_runner_up_id IS NULL THEN
    RAISE EXCEPTION 'No eligible runner-up quote found for this RFQ';
  END IF;

  -- 3. Transition Runner-Up to SELECTED
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = v_runner_up_id;

  -- 4. Reassign the award in place so any purchase order still pointing at
  -- this award id (now cancelled above) keeps a valid foreign key, rather
  -- than deleting the row and re-inserting a new one.
  IF v_prev_award.id IS NOT NULL THEN
    UPDATE awards
    SET quote_id = v_runner_up_id,
        awarded_by = private.get_profile_id(),
        justification = jsonb_build_object('text', 'Runner-up auto-awarded: ' || p_reason),
        status = 'LOCKED',
        awarded_at = v_now,
        votes_locked_at = v_now,
        revealed_at = NULL
    WHERE id = v_prev_award.id
    RETURNING id INTO v_new_award_id;
  ELSE
    INSERT INTO awards (
      rfq_id, quote_id, awarded_by, justification, status,
      awarded_at, votes_locked_at
    ) VALUES (
      p_rfq_id, v_runner_up_id, private.get_profile_id(),
      jsonb_build_object('text', 'Runner-up auto-awarded: ' || p_reason),
      'LOCKED', v_now, v_now
    ) RETURNING id INTO v_new_award_id;
  END IF;

  -- 5. Reset RFQ reveal status to BLIND so buyer confirms intent before unmasking runner-up
  UPDATE rfqs SET status = 'AWARDED', reveal_status = 'BLIND', updated_at = v_now WHERE id = p_rfq_id;

  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.runner_up_selected',
    private.get_profile_id(),
    v_rfq.organization_id,
    'award',
    v_new_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'runner_up_quote_id', v_runner_up_id,
      'runner_up_alias', v_alias,
      'runner_up_price', v_runner_up_price,
      'reason', p_reason
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'award_id', v_new_award_id,
    'runner_up_quote_id', v_runner_up_id,
    'runner_up_alias', v_alias,
    'total_cost', v_runner_up_price
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.award_runner_up_quote(uuid, text) TO authenticated, service_role;
