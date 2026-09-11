-- =============================================================================
-- Migration 00156: Mutual Buyer & Supplier Identity Reveal on PO Issuance & Tax Compliance
-- Description:
--   1. Updates Row-Level Security on `organizations` table so that awarded
--      suppliers with an issued Purchase Order or revealed Award can view the
--      Buyer Organization's Legal Name, GSTIN (tax_registration), Address, and
--      Contact information for statutory GST Input Tax Credit (ITC) compliance.
--   2. Updates `lock_and_reveal_award_atomic` to return complete mutual reveal
--      details (both Buyer and Supplier tax and legal credentials) upon PO issuance.
-- =============================================================================

BEGIN;

-- 1. Update RLS Policy on organizations to permit bilateral visibility for awarded suppliers
DROP POLICY IF EXISTS organizations_select ON public.organizations;

CREATE POLICY organizations_select ON public.organizations
  FOR SELECT TO authenticated
  USING (
    private.is_org_member(id)
    OR private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.organization_id = organizations.id
        AND private.is_supplier_user_for(po.supplier_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.rfqs r
      JOIN public.awards a ON a.rfq_id = r.id
      WHERE r.organization_id = organizations.id
        AND r.reveal_status = 'REVEALED'
        AND private.is_awarded_supplier_for(r.id)
    )
  );

-- 2. Enhanced lock_and_reveal_award_atomic with full mutual reveal payload
CREATE OR REPLACE FUNCTION public.lock_and_reveal_award_atomic(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_justification text,
  p_auto_reveal   boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth
AS $$
DECLARE
  v_rfq         rfqs%ROWTYPE;
  v_quote       quotes%ROWTYPE;
  v_org         organizations%ROWTYPE;
  v_award_id    uuid;
  v_now         timestamptz := now();
  v_final       integer;
  v_tally       jsonb;
  v_po_res      jsonb;
  v_po_id       uuid;
  v_po_number   text;
  v_supplier_id uuid;
  v_business    text;
  v_phone       text;
  v_email       text;
  v_alias       text;
  v_supplier_gst text;
  v_existing_award awards%ROWTYPE;
BEGIN
  -- Strict row-level lock on RFQ to serialize concurrent award operations
  SELECT * INTO v_rfq
  FROM public.rfqs
  WHERE id = p_rfq_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  IF v_rfq.status NOT IN ('RFQ_OPEN', 'RFQ_CLOSED', 'VOTING', 'EVALUATION', 'AWARDED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ is not in an awardable state. Current status: ' || v_rfq.status);
  END IF;

  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = v_rfq.organization_id;

  -- Verify Quote belongs to this RFQ
  SELECT * INTO v_quote
  FROM public.quotes
  WHERE id = p_quote_id AND rfq_id = p_rfq_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Winning quote does not belong to specified RFQ');
  END IF;

  -- Check if award already exists for this RFQ
  SELECT * INTO v_existing_award
  FROM public.awards
  WHERE rfq_id = p_rfq_id;

  IF FOUND THEN
    v_award_id := v_existing_award.id;
  ELSE
    -- Compute final frozen vote tally snapshot
    SELECT 
      COALESCE(SUM(weight), 0),
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'profile_id', profile_id,
            'quote_id', quote_id,
            'weight', weight,
            'justification', justification,
            'cast_at', cast_at
          ) ORDER BY cast_at ASC
        ),
        '[]'::jsonb
      )
    INTO v_final, v_tally
    FROM (
      SELECT DISTINCT ON (profile_id)
        profile_id, quote_id, weight, justification, cast_at
      FROM public.committee_votes
      WHERE rfq_id = p_rfq_id
      ORDER BY profile_id, cast_at DESC
    ) latest_votes;

    -- 1. Insert Frozen Award Record
    INSERT INTO public.awards (
      rfq_id,
      quote_id,
      supplier_id,
      awarded_by,
      justification,
      status,
      awarded_at,
      revealed_at,
      metadata
    ) VALUES (
      p_rfq_id,
      p_quote_id,
      v_quote.supplier_id,
      COALESCE(private.get_profile_id(), v_rfq.created_by),
      p_justification,
      CASE WHEN p_auto_reveal THEN 'REVEALED'::public.award_status ELSE 'LOCKED'::public.award_status END,
      v_now,
      CASE WHEN p_auto_reveal THEN v_now ELSE NULL END,
      jsonb_build_object(
        'final_vote_count', v_final,
        'vote_tally_snapshot', v_tally,
        'frozen_at', v_now
      )
    )
    RETURNING id INTO v_award_id;
  END IF;

  -- 2. Update Quote Statuses (Winner -> SELECTED, Others -> NOT_SELECTED)
  UPDATE quotes SET status = 'SELECTED', updated_at = v_now WHERE id = p_quote_id;
  UPDATE quotes SET status = 'NOT_SELECTED', updated_at = v_now WHERE rfq_id = p_rfq_id AND id <> p_quote_id;

  -- 3. Update RFQ and Requirement Status
  UPDATE rfqs
  SET 
    status = 'AWARDED',
    reveal_status = CASE WHEN p_auto_reveal THEN 'REVEALED'::public.rfq_reveal_status ELSE reveal_status END,
    updated_at = v_now
  WHERE id = p_rfq_id;

  UPDATE requirements SET status = 'AWARDED', updated_at = v_now WHERE id = v_rfq.requirement_id;

  -- 4. Audit Log
  INSERT INTO audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'award.locked',
    COALESCE(private.get_profile_id(), v_rfq.created_by),
    v_rfq.organization_id,
    'award',
    v_award_id::text,
    jsonb_build_object(
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'auto_reveal', p_auto_reveal,
      'locked_at', v_now
    )
  );

  -- 5. If auto_reveal is requested, atomically generate PO and return mutual reveal payload
  IF p_auto_reveal THEN
    v_po_res := public.create_purchase_order_from_award(v_award_id);
    v_po_id := (v_po_res->>'po_id')::uuid;
    v_po_number := v_po_res->>'po_number';

    SELECT s.id, s.business_name, s.contact_phone, s.contact_email, s.gstin, ri.anonymous_label
    INTO v_supplier_id, v_business, v_phone, v_email, v_supplier_gst, v_alias
    FROM quotes q
    JOIN suppliers s ON s.id = q.supplier_id
    JOIN rfq_invitations ri ON ri.id = q.invitation_id
    WHERE q.id = p_quote_id;

    RETURN jsonb_build_object(
      'ok', true,
      'award_id', v_award_id,
      'rfq_id', p_rfq_id,
      'quote_id', p_quote_id,
      'status', 'REVEALED',
      'revealed', true,
      'po_id', v_po_id,
      'po_number', v_po_number,
      -- Supplier unmasked details
      'supplier_id', v_supplier_id,
      'business_name', v_business,
      'supplier_gstin', v_supplier_gst,
      'contact_phone', v_phone,
      'contact_email', v_email,
      'alias_before_reveal', v_alias,
      -- Buyer unmasked details for GST Tax Invoice & ITC claims
      'buyer_organization_id', v_org.id,
      'buyer_organization_name', v_org.name,
      'buyer_org_type', v_org.org_type,
      'buyer_gstin', v_org.tax_registration,
      'buyer_contact_person', v_org.contact_person,
      'buyer_contact_phone', v_org.contact_phone,
      'buyer_contact_email', v_org.contact_email,
      'buyer_address', v_org.address,
      'buyer_city', v_org.city
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'award_id', v_award_id,
    'rfq_id', p_rfq_id,
    'quote_id', p_quote_id,
    'status', 'PENDING_REVEAL',
    'revealed', false,
    'votes_locked_at', v_now
  );
END;
$$;

COMMIT;
