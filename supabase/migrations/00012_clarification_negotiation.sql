-- Negotiation & Q&A phase between initial quotes and blind evaluation.
-- Flow: OPEN (initial quotes) → CLARIFICATION (Q&A + final quotes) → EVALUATING

ALTER TYPE rfq_status ADD VALUE IF NOT EXISTS 'CLARIFICATION' AFTER 'OPEN';
ALTER TYPE requirement_status ADD VALUE IF NOT EXISTS 'NEGOTIATION' AFTER 'QUOTING';

CREATE TYPE clarification_author_side AS ENUM ('BUYER', 'SUPPLIER');

CREATE TABLE rfq_clarification_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id            uuid NOT NULL REFERENCES rfqs (id) ON DELETE CASCADE,
  invitation_id     uuid NOT NULL REFERENCES rfq_invitations (id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES profiles (id),
  author_side       clarification_author_side NOT NULL,
  body              text NOT NULL CHECK (char_length(trim(body)) > 0),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_clarification_rfq ON rfq_clarification_messages (rfq_id);
CREATE INDEX idx_clarification_invitation ON rfq_clarification_messages (invitation_id);

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS buyer_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS inspection_notes text;

-- ---------------------------------------------------------------------------
-- Blind clarification view — anonymous labels only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfq_clarification_blind
WITH (security_barrier = true) AS
SELECT
  m.id AS message_id,
  m.rfq_id,
  m.invitation_id,
  ri.anonymous_label,
  m.author_side,
  CASE
    WHEN m.author_side = 'BUYER' THEN 'Buyer organization'
    ELSE ri.anonymous_label
  END AS author_display,
  m.body,
  m.created_at
FROM rfq_clarification_messages m
JOIN rfq_invitations ri ON ri.id = m.invitation_id
JOIN rfqs r ON r.id = m.rfq_id
WHERE r.reveal_status = 'BLIND'
  AND (
    private.can_access_rfq_as_buyer(m.rfq_id)
    OR private.can_access_rfq_as_committee(m.rfq_id)
  );

CREATE OR REPLACE VIEW rfq_clarification_supplier
WITH (security_barrier = true) AS
SELECT
  m.id AS message_id,
  m.rfq_id,
  m.invitation_id,
  m.author_side,
  CASE
    WHEN m.author_side = 'BUYER' THEN 'Buyer organization'
    ELSE 'You'
  END AS author_display,
  m.body,
  m.created_at
FROM rfq_clarification_messages m
JOIN rfq_invitations ri ON ri.id = m.invitation_id
WHERE private.is_supplier_user_for(ri.supplier_id);

GRANT SELECT ON rfq_clarification_blind TO authenticated;
GRANT SELECT ON rfq_clarification_supplier TO authenticated;

ALTER TABLE rfq_clarification_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY clarification_select_buyer ON rfq_clarification_messages
  FOR SELECT TO authenticated
  USING (private.can_access_rfq_as_buyer(rfq_id));

CREATE POLICY clarification_select_supplier ON rfq_clarification_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rfq_invitations ri
      WHERE ri.id = invitation_id
        AND private.is_supplier_user_for(ri.supplier_id)
    )
  );

CREATE POLICY clarification_insert ON rfq_clarification_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_profile_id = private.get_profile_id()
    AND EXISTS (
      SELECT 1 FROM rfqs r
      WHERE r.id = rfq_id
        -- Compared as text: Postgres forbids referencing an enum value in the
        -- same transaction that added it, and 'CLARIFICATION' is added above.
        AND r.status::text = 'CLARIFICATION'
    )
    AND (
      (
        author_side = 'BUYER'
        AND private.is_org_member(private.rfq_org_id(rfq_id))
      )
      OR (
        author_side = 'SUPPLIER'
        AND EXISTS (
          SELECT 1 FROM rfq_invitations ri
          WHERE ri.id = invitation_id
            AND ri.rfq_id = rfq_clarification_messages.rfq_id
            AND private.is_supplier_user_for(ri.supplier_id)
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Transition helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.close_initial_quoting(p_rfq_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_quote_count int;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Only managers can close initial quoting';
  END IF;

  IF v_rfq.status <> 'OPEN' THEN
    RAISE EXCEPTION 'RFQ must be OPEN to start negotiation';
  END IF;

  SELECT count(*)::int INTO v_quote_count
  FROM quotes
  WHERE rfq_id = p_rfq_id
    AND status IN ('SUBMITTED', 'REVISED', 'FINAL');

  IF v_quote_count < 1 THEN
    RAISE EXCEPTION 'At least one submitted quote required';
  END IF;

  UPDATE rfqs SET status = 'CLARIFICATION', updated_at = now() WHERE id = p_rfq_id;

  UPDATE requirements
  SET status = 'NEGOTIATION', updated_at = now()
  WHERE id = v_rfq.requirement_id
    AND status = 'QUOTING';
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_initial_quoting(uuid) TO authenticated;

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

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id) THEN
    RAISE EXCEPTION 'Only managers can close negotiation';
  END IF;

  IF v_rfq.status <> 'CLARIFICATION' THEN
    RAISE EXCEPTION 'RFQ must be in CLARIFICATION to proceed to evaluation';
  END IF;

  SELECT count(*)::int INTO v_final_count
  FROM quotes
  WHERE rfq_id = p_rfq_id AND status = 'FINAL';

  IF v_final_count < v_rfq.min_quotes_required THEN
    RAISE EXCEPTION 'Minimum % final quotes required', v_rfq.min_quotes_required;
  END IF;

  UPDATE rfqs SET status = 'EVALUATING', updated_at = now() WHERE id = p_rfq_id;

  UPDATE requirements
  SET status = 'EVALUATION', updated_at = now()
  WHERE id = v_rfq.requirement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_clarification_for_evaluation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.accept_delivery_inspection(
  p_work_order_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo work_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM purchase_orders po
    WHERE po.id = v_wo.purchase_order_id
      AND private.is_org_manager_or_above(po.organization_id)
  ) THEN
    RAISE EXCEPTION 'Only buyer managers can accept delivery';
  END IF;

  IF v_wo.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Work order must be completed before inspection';
  END IF;

  IF v_wo.buyer_accepted_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE work_orders
  SET buyer_accepted_at = now(),
      inspection_notes = p_notes,
      updated_at = now()
  WHERE id = p_work_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_delivery_inspection(uuid, text) TO authenticated;

-- Evaluation view shows FINAL quotes only once in EVALUATING+
CREATE OR REPLACE VIEW quotes_blind
WITH (security_barrier = true) AS
SELECT
  q.id AS quote_id,
  ri.anonymous_label,
  q.rfq_id,
  q.status,
  q.current_version AS version,
  q.evaluation_score,
  q.submitted_at,
  q.created_at,
  q.updated_at,
  (qv.snapshot ->> 'basePrice')::numeric(14, 2) AS base_price,
  (qv.snapshot ->> 'gstAmount')::numeric(14, 2) AS gst_amount,
  (qv.snapshot ->> 'transportCost')::numeric(14, 2) AS transport_cost,
  (qv.snapshot ->> 'totalCost')::numeric(14, 2) AS total_cost,
  (qv.snapshot ->> 'deliveryDays')::integer AS delivery_days,
  (qv.snapshot ->> 'warrantyMonths')::integer AS warranty_months
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
LEFT JOIN quote_versions qv
  ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE r.reveal_status = 'BLIND'
  AND (
    (
      -- Compared as text for the same reason as the policy above.
      r.status::text = 'CLARIFICATION'
      AND q.status IN ('SUBMITTED', 'REVISED', 'FINAL')
    )
    OR (
      r.status IN ('EVALUATING', 'AWARDED', 'CLOSED')
      AND q.status = 'FINAL'
    )
  )
  AND (
    private.can_access_rfq_as_buyer(q.rfq_id)
    OR private.can_access_rfq_as_committee(q.rfq_id)
  );
