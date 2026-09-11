-- Security barrier blind views (INV-031–040)
-- Buyers/committee MUST use these views — base tables deny supplier_id leak.

-- ---------------------------------------------------------------------------
-- quotes_blind — no supplier_id; anonymous_label from invitation
-- ---------------------------------------------------------------------------

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
    private.can_access_rfq_as_buyer(q.rfq_id)
    OR private.can_access_rfq_as_committee(q.rfq_id)
  );

-- ---------------------------------------------------------------------------
-- quotes_revealed — full supplier details when RFQ reveal_status = REVEALED
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW quotes_revealed
WITH (security_barrier = true) AS
SELECT
  q.id AS quote_id,
  ri.anonymous_label,
  q.rfq_id,
  q.supplier_id,
  s.business_name,
  s.contact_phone AS phone,
  s.contact_email AS email,
  s.address,
  s.source,
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
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv
  ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE r.reveal_status = 'REVEALED'
  AND private.can_access_rfq_as_buyer(q.rfq_id);

-- ---------------------------------------------------------------------------
-- rfq_invitations_blind — anonymous_label only for committee
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfq_invitations_blind
WITH (security_barrier = true) AS
SELECT
  ri.id AS invitation_id,
  ri.rfq_id,
  ri.anonymous_label,
  ri.status,
  ri.invited_at,
  ri.viewed_at,
  ri.declined_at
FROM rfq_invitations ri
JOIN rfqs r ON r.id = ri.rfq_id
WHERE r.reveal_status = 'BLIND'
  AND private.can_access_rfq_as_committee(ri.rfq_id);

-- ---------------------------------------------------------------------------
-- rfq_invitations_manager — match scores for managers; NO supplier_id until reveal
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW rfq_invitations_manager
WITH (security_barrier = true) AS
SELECT
  ri.id AS invitation_id,
  ri.rfq_id,
  ri.anonymous_label,
  ri.status,
  ri.match_score,
  ri.match_reasons,
  ri.invited_at,
  ri.viewed_at,
  ri.declined_at,
  CASE
    WHEN r.reveal_status = 'REVEALED' THEN ri.supplier_id
    ELSE NULL::uuid
  END AS supplier_id
FROM rfq_invitations ri
JOIN rfqs r ON r.id = ri.rfq_id
WHERE private.is_org_manager_or_above(r.organization_id);

-- ---------------------------------------------------------------------------
-- Grants — authenticated users query views; RLS on underlying tables applies
-- ---------------------------------------------------------------------------

GRANT SELECT ON quotes_blind TO authenticated;
GRANT SELECT ON quotes_revealed TO authenticated;
GRANT SELECT ON rfq_invitations_blind TO authenticated;
GRANT SELECT ON rfq_invitations_manager TO authenticated;

-- ---------------------------------------------------------------------------
-- API privileges for PostgREST (RLS still enforces row access)
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO authenticated, service_role;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, service_role;
