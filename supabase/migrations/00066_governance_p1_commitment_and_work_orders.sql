-- 00066_governance_p1_commitment_and_work_orders.sql
-- Phase 1 Governance: Intent-to-Award Commitment Gate & Value-Add Work Orders

-- 1. Extend Awards Table with Commitment Attestation Fields
ALTER TABLE public.awards
  ADD COLUMN IF NOT EXISTS commitment_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS commitment_attestation jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS unmasked_at timestamptz,
  ADD COLUMN IF NOT EXISTS unmasked_by uuid REFERENCES public.profiles(id);

-- 2. Atomic Intent-to-Award Confirmation & Unmasking RPC
CREATE OR REPLACE FUNCTION public.confirm_intent_to_award_and_unmask(
  p_rfq_id        uuid,
  p_quote_id      uuid,
  p_commitment_note text DEFAULT 'Confirmed by buyer committee for on-platform execution'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq           rfqs%ROWTYPE;
  v_quote         quotes%ROWTYPE;
  v_award_id      uuid;
  v_po_id         uuid;
  v_supplier_id   uuid;
  v_business_name text;
  v_legal_name    text;
  v_gstin         text;
  v_contact_phone text;
  v_contact_email text;
  v_alias         text;
  v_now           timestamptz := now();
  v_tally         jsonb;
BEGIN
  -- 1. Check RFQ
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ not found';
  END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only a manager or owner can confirm intent to award';
  END IF;

  IF v_rfq.reveal_status = 'REVEALED' THEN
    SELECT a.id INTO v_award_id FROM awards a WHERE a.rfq_id = p_rfq_id;
    SELECT po.id INTO v_po_id FROM purchase_orders po WHERE po.rfq_id = p_rfq_id ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object(
      'already_unmasked', true,
      'award_id', v_award_id,
      'po_id', v_po_id
    );
  END IF;

  -- 2. Validate Quote
  SELECT * INTO v_quote FROM quotes WHERE id = p_quote_id AND rfq_id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected quote does not belong to this RFQ';
  END IF;

  -- 3. Lock Votes Snapshot
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
    (v_quote.total_cost), 'INR', v_now
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

GRANT EXECUTE ON FUNCTION public.confirm_intent_to_award_and_unmask(uuid, uuid, text) TO authenticated, service_role;

-- 3. Work Order Milestones & Deliverable Checklists
CREATE TABLE IF NOT EXISTS public.work_order_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  milestone_title text NOT NULL,
  target_percentage integer NOT NULL CHECK (target_percentage BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUBMITTED_BY_SUPPLIER', 'VERIFIED_BY_BUYER', 'DISPUTED')),
  deliverable_photos text[] DEFAULT '{}',
  supplier_notes text,
  buyer_notes text,
  submitted_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wo_milestones_wo ON public.work_order_milestones (work_order_id);

-- 4. Delivery Inspection Sign-offs
CREATE TABLE IF NOT EXISTS public.delivery_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  inspector_id uuid NOT NULL REFERENCES public.profiles(id),
  passed boolean NOT NULL,
  checklist_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  rating_given integer CHECK (rating_given BETWEEN 1 AND 5),
  digital_signoff_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_inspections_wo ON public.delivery_inspections (work_order_id);

-- 5. RLS Policies
ALTER TABLE public.work_order_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY wo_milestones_read ON public.work_order_milestones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = work_order_milestones.work_order_id
        AND (
          private.can_access_rfq_as_buyer(po.rfq_id)
          OR private.is_supplier_user_for(po.supplier_id)
          OR private.is_platform_admin()
        )
    )
  );

CREATE POLICY wo_milestones_write ON public.work_order_milestones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = work_order_milestones.work_order_id
        AND (
          private.can_access_rfq_as_buyer(po.rfq_id)
          OR private.is_supplier_user_for(po.supplier_id)
          OR private.is_platform_admin()
        )
    )
  );

CREATE POLICY delivery_inspections_read ON public.delivery_inspections
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM work_orders wo
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = delivery_inspections.work_order_id
        AND (
          private.can_access_rfq_as_buyer(po.rfq_id)
          OR private.is_supplier_user_for(po.supplier_id)
          OR private.is_platform_admin()
        )
    )
  );

CREATE POLICY delivery_inspections_write ON public.delivery_inspections
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM work_orders wo
      JOIN purchase_orders po ON po.id = wo.purchase_order_id
      WHERE wo.id = delivery_inspections.work_order_id
        AND (
          private.can_access_rfq_as_buyer(po.rfq_id)
          OR private.is_platform_admin()
        )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_milestones TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_inspections TO authenticated, service_role;

