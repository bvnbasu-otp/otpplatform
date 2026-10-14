-- =============================================================================
-- 00269: Harden Sourcing Mode Identity Reveal Boundaries
--
-- Product Principle: OTP does the procurement work. The customer makes the decision.
--
-- 1. Adds 'OPEN_RFQ_TENDER' to sourcing_mode enum if not present (alias for OPEN_RFQ).
-- 2. Redefines public.quotes_revealed (with security_barrier = true):
--    - In IDENTITY_PROTECTED mode:
--      * Only the winning quote (q.status = 'SELECTED') reveals business_name,
--        legal_name, trade_name, gstin, phone, email, address.
--      * Non-selected quotes keep business_name = NULL (stay completely sealed).
--    - In OPEN_RFQ / OPEN_RFQ_TENDER mode:
--      * Post-award unsealing reveals business_name, legal_name, trade_name for
--        all quotes to the buyer so the tender participants can be verified.
--      * Direct contact info (contact_phone, contact_email, gstin, address)
--        remains strictly shielded (NULL) unless q.status = 'SELECTED'.
--    - Invariant: Competing suppliers NEVER access quotes_revealed (strictly guarded
--      by private.can_access_rfq_as_buyer(q.rfq_id)).
-- =============================================================================

BEGIN;

-- 1. Ensure OPEN_RFQ_TENDER is accepted by sourcing_mode enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.sourcing_mode'::regtype
      AND enumlabel = 'OPEN_RFQ_TENDER'
  ) THEN
    ALTER TYPE public.sourcing_mode ADD VALUE 'OPEN_RFQ_TENDER';
  END IF;
END $$;

-- 2. Drop and Recreate public.quotes_revealed with rigorous privacy gates
DROP VIEW IF EXISTS public.quotes_revealed CASCADE;

CREATE OR REPLACE VIEW public.quotes_revealed
WITH (security_barrier = true) AS
SELECT
  q.id AS quote_id,
  ri.anonymous_label,
  q.rfq_id,
  CASE
    WHEN q.status = 'SELECTED' THEN q.supplier_id
    ELSE NULL
  END AS supplier_id,
  CASE
    WHEN q.status = 'SELECTED' THEN s.business_name
    WHEN r.sourcing_mode::text IN ('OPEN_RFQ', 'OPEN_RFQ_TENDER') THEN s.business_name
    ELSE NULL
  END AS business_name,
  CASE
    WHEN q.status = 'SELECTED' THEN s.legal_name
    WHEN r.sourcing_mode::text IN ('OPEN_RFQ', 'OPEN_RFQ_TENDER') THEN s.legal_name
    ELSE NULL
  END AS legal_name,
  CASE
    WHEN q.status = 'SELECTED' THEN s.trade_name
    WHEN r.sourcing_mode::text IN ('OPEN_RFQ', 'OPEN_RFQ_TENDER') THEN s.trade_name
    ELSE NULL
  END AS trade_name,
  CASE
    WHEN q.status = 'SELECTED' THEN s.gstin
    ELSE NULL
  END AS gstin,
  CASE
    WHEN q.status = 'SELECTED' THEN s.gst_status
    ELSE NULL
  END AS gst_status,
  CASE
    WHEN q.status = 'SELECTED' THEN COALESCE(s.gst_verified, false)
    ELSE NULL
  END AS is_gst_verified,
  CASE
    WHEN q.status = 'SELECTED' THEN s.contact_phone
    ELSE NULL
  END AS phone,
  CASE
    WHEN q.status = 'SELECTED' THEN s.contact_email
    ELSE NULL
  END AS email,
  CASE
    WHEN q.status = 'SELECTED' THEN s.address
    ELSE NULL
  END AS address,
  CASE
    WHEN q.status = 'SELECTED' THEN s.source
    ELSE NULL
  END AS source,
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
  CASE
    WHEN q.status = 'SELECTED' THEN s.rating_avg
    ELSE NULL
  END AS supplier_rating
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv
  ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE r.reveal_status = 'REVEALED'
  AND private.can_access_rfq_as_buyer(q.rfq_id);

COMMENT ON VIEW public.quotes_revealed IS
  'Revealed quotations for an RFQ after award lock. In IDENTITY_PROTECTED mode, only the winning supplier entity is unmasked while non-winners stay sealed. In OPEN_RFQ_TENDER, candidate names are revealed to the buyer but direct contact details remain strictly protected unless awarded.';

GRANT SELECT ON public.quotes_revealed TO authenticated, anon;

COMMIT;
