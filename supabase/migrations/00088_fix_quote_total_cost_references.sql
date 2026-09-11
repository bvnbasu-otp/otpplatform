-- 00088_fix_quote_total_cost_references.sql
-- Fixes references to non-existent column `q.total_cost` by correctly joining `quote_versions`

BEGIN;

-- 1. Fix auto_schedule_cancellation_audit_ping (Trigger on rfq_cancellations)
CREATE OR REPLACE FUNCTION private.auto_schedule_cancellation_audit_ping()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_supplier_id uuid;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = NEW.rfq_id;

  -- Find selected or lowest quote supplier if available
  SELECT q.supplier_id INTO v_supplier_id
  FROM quotes q
  LEFT JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
  WHERE q.rfq_id = NEW.rfq_id
  ORDER BY (q.status = 'SELECTED') DESC, COALESCE((qv.snapshot->>'totalCost')::numeric, 999999999) ASC
  LIMIT 1;

  INSERT INTO public.audit_pings (
    rfq_id,
    supplier_id,
    organization_id,
    scheduled_for,
    ping_channel,
    status
  ) VALUES (
    NEW.rfq_id,
    v_supplier_id,
    v_rfq.organization_id,
    now() + interval '14 days',
    'WHATSAPP',
    'PENDING'
  );

  RETURN NEW;
END;
$$;

-- 2. Fix award_runner_up_quote
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

  -- 1. Disqualify previous winning quote
  IF v_prev_award.quote_id IS NOT NULL THEN
    UPDATE quotes
    SET status = 'WITHDRAWN', updated_at = v_now
    WHERE id = v_prev_award.quote_id;

    -- Clean up any draft PO
    DELETE FROM purchase_orders WHERE rfq_id = p_rfq_id AND status = 'DRAFT';
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

  -- 4. Create New Award for Runner-Up
  DELETE FROM awards WHERE rfq_id = p_rfq_id;

  INSERT INTO awards (
    rfq_id, quote_id, awarded_by, justification, status,
    awarded_at, votes_locked_at
  ) VALUES (
    p_rfq_id, v_runner_up_id, private.get_profile_id(),
    jsonb_build_object('text', 'Runner-up auto-awarded: ' || p_reason),
    'LOCKED', v_now, v_now
  ) RETURNING id INTO v_new_award_id;

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

-- 3. Fix sign_commercial_commitment_and_unmask
CREATE OR REPLACE FUNCTION public.sign_commercial_commitment_and_unmask(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_commitment_note text DEFAULT 'Organization committed to execute on-platform purchase'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_quote quotes%ROWTYPE;
  v_supplier_id uuid;
  v_business_name text;
  v_legal_name text;
  v_gstin text;
  v_contact_phone text;
  v_contact_email text;
  v_alias text;
  v_award_id uuid;
  v_po_id uuid;
  v_now timestamptz := now();
  v_tally jsonb;
  v_total numeric;
BEGIN
  -- 1. Permissions & RFQ validation
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can sign commitment and unmask identity';
  END IF;

  -- 2. Quote validation
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quote not found for this RFQ'; END IF;

  -- Extract total amount from latest version
  SELECT COALESCE((qv.snapshot->>'totalCost')::numeric, (qv.snapshot->>'basePrice')::numeric, 0)
  INTO v_total
  FROM quote_versions qv
  WHERE qv.quote_id = p_quote_id
  ORDER BY qv.version DESC
  LIMIT 1;

  -- 3. Freeze Vote Tally Snapshot
  SELECT jsonb_build_object(
    'locked_at', v_now,
    'votes', COALESCE(jsonb_agg(jsonb_build_object(
      'quote_id', v.recommended_quote_id,
      'choice', v.choice,
      'voting_power', v.voting_power,
      'buyer_type', v.buyer_type
    )), '[]'::jsonb)
  )
  INTO v_tally
  FROM (
    SELECT DISTINCT ON (cv.profile_id) cv.*
    FROM committee_votes cv
    WHERE cv.rfq_id = p_rfq_id AND cv.cast_at <= v_now
    ORDER BY cv.profile_id, cv.cast_at DESC, cv.id DESC
  ) v;

  -- 4. Create or Update Award
  INSERT INTO awards (
    rfq_id, quote_id, awarded_by, justification, status,
    awarded_at, votes_locked_at, vote_snapshot,
    commitment_signed_at, commitment_attestation,
    unmasked_at, unmasked_by
  ) VALUES (
    p_rfq_id, p_quote_id, private.get_profile_id(),
    jsonb_build_object('text', p_commitment_note),
    'REVEALED', v_now, v_now, v_tally,
    v_now, jsonb_build_object('buyer_attestation', true, 'note', p_commitment_note),
    v_now, private.get_profile_id()
  )
  ON CONFLICT (rfq_id) DO UPDATE SET
    quote_id = EXCLUDED.quote_id,
    status = 'REVEALED',
    commitment_signed_at = v_now,
    commitment_attestation = jsonb_build_object('buyer_attestation', true, 'note', p_commitment_note),
    unmasked_at = v_now,
    unmasked_by = private.get_profile_id()
  RETURNING id INTO v_award_id;

  -- 5. Transition Quotes
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;

  -- 6. Unmask RFQ & Requirement
  UPDATE rfqs SET status = 'AWARDED', reveal_status = 'REVEALED', updated_at = v_now WHERE id = p_rfq_id;
  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;

  -- 7. Fetch Supplier & Create PO Draft if not exists
  SELECT s.id, s.business_name, s.legal_name, s.gstin, s.contact_phone, s.contact_email, ri.anonymous_label
  INTO v_supplier_id, v_business_name, v_legal_name, v_gstin, v_contact_phone, v_contact_email, v_alias
  FROM quotes q
  JOIN suppliers s ON s.id = q.supplier_id
  JOIN rfq_invitations ri ON ri.id = q.invitation_id
  WHERE q.id = p_quote_id;

  INSERT INTO purchase_orders (
    rfq_id, supplier_id, organization_id, status, total_amount, currency, created_at
  ) VALUES (
    p_rfq_id, v_supplier_id, v_rfq.organization_id, 'DRAFT',
    COALESCE(v_total, 0), 'INR', v_now
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_po_id;

  IF v_po_id IS NULL THEN
    SELECT id INTO v_po_id FROM purchase_orders WHERE rfq_id = p_rfq_id ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- 8. Audit Event
  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'identity.unmasked',
    private.get_profile_id(),
    v_rfq.organization_id,
    'award',
    v_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'po_id', v_po_id,
      'supplier_id', v_supplier_id,
      'business_name', v_business_name,
      'gstin', v_gstin,
      'alias_before_reveal', v_alias
    )
  );

  RETURN jsonb_build_object(
    'award_id', v_award_id,
    'po_id', v_po_id,
    'supplier_id', v_supplier_id,
    'business_name', v_business_name,
    'legal_name', v_legal_name,
    'gstin', v_gstin,
    'contact_phone', v_contact_phone,
    'contact_email', v_contact_email,
    'alias_before_reveal', v_alias,
    'unmasked_at', v_now
  );
END;
$$;

COMMIT;
