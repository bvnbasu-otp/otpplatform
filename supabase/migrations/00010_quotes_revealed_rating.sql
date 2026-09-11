-- ---------------------------------------------------------------------------
-- 00010_quotes_revealed_rating
--
-- Adds the supplier rating to quotes_revealed so the decision receipt can show
-- what reputation would have suggested against what the blind criteria chose.
--
-- Blind safety: this view is already gated on reveal_status = 'REVEALED' and
-- already exposes business name, contact details and address. Rating adds no
-- identity the buyer cannot see at that point, and remains unreachable while
-- the RFQ is blind.
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
  (qv.snapshot ->> 'warrantyMonths')::integer AS warranty_months,
  s.rating_avg AS supplier_rating
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv
  ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE r.reveal_status = 'REVEALED'
  AND private.can_access_rfq_as_buyer(q.rfq_id);

GRANT SELECT ON quotes_revealed TO authenticated;
