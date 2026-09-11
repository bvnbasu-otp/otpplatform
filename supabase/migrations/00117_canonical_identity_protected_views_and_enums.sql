-- =============================================================================
-- Migration 00117: Canonical Identity-Protected Views & Enum Normalization
-- Description:
--   Enforces strict canonical procurement vocabulary across the database layer:
--   1. Expands rfq_reveal_status enum with 'PROTECTED' (replacing 'BLIND').
--   2. Creates canonical views:
--      - public.quotes_identity_protected (canonical replacement for quotes_blind)
--      - public.rfqs_supplier_masked (canonical replacement for rfqs_supplier_blind)
--      - public.rfq_clarifications_masked (canonical replacement for rfq_clarification_blind)
--      - public.quote_attachments_masked (canonical replacement for quote_attachments_blind)
--      - public.quote_evaluations_masked (canonical replacement for quote_evaluations_blind)
--      - public.rfq_invitations_masked (canonical replacement for rfq_invitations_blind)
--      - public.my_quote_outcome (canonical replacement for my_bid_outcome)
--   3. Maintains non-destructive backward-compatible aliases for transition stability.
--   4. Updates default reveal_status to 'PROTECTED'.
-- =============================================================================

-- 1. Add 'PROTECTED' value to rfq_reveal_status enum if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'rfq_reveal_status' AND e.enumlabel = 'PROTECTED'
  ) THEN
    ALTER TYPE public.rfq_reveal_status ADD VALUE 'PROTECTED' BEFORE 'REVEALED';
  END IF;
END $$;

-- 2. Update default and existing rows on rfqs
ALTER TABLE public.rfqs ALTER COLUMN reveal_status SET DEFAULT 'PROTECTED'::public.rfq_reveal_status;
UPDATE public.rfqs SET reveal_status = 'PROTECTED'::public.rfq_reveal_status WHERE reveal_status = 'BLIND'::public.rfq_reveal_status;

-- 3. Cleanly drop legacy and canonical views first to prevent column rename errors
DROP VIEW IF EXISTS public.quotes_blind CASCADE;
DROP VIEW IF EXISTS public.rfqs_supplier_blind CASCADE;
DROP VIEW IF EXISTS public.rfq_clarification_blind CASCADE;
DROP VIEW IF EXISTS public.quote_attachments_blind CASCADE;
DROP VIEW IF EXISTS public.quote_evaluations_blind CASCADE;
DROP VIEW IF EXISTS public.rfq_invitations_blind CASCADE;
DROP VIEW IF EXISTS public.my_bid_outcome CASCADE;
DROP VIEW IF EXISTS public.my_quote_outcome CASCADE;

DROP VIEW IF EXISTS public.quotes_identity_protected CASCADE;
DROP VIEW IF EXISTS public.rfqs_supplier_masked CASCADE;
DROP VIEW IF EXISTS public.rfq_clarifications_masked CASCADE;
DROP VIEW IF EXISTS public.quote_attachments_masked CASCADE;
DROP VIEW IF EXISTS public.quote_evaluations_masked CASCADE;
DROP VIEW IF EXISTS public.rfq_invitations_masked CASCADE;

-- 4. Create Canonical Security Barrier View: public.quotes_identity_protected
CREATE OR REPLACE VIEW public.quotes_identity_protected
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
    ((qv.snapshot ->> 'basePrice'::text))::numeric(14,2) AS base_price,
    ((qv.snapshot ->> 'gstAmount'::text))::numeric(14,2) AS gst_amount,
    ((qv.snapshot ->> 'transportCost'::text))::numeric(14,2) AS transport_cost,
    ((qv.snapshot ->> 'totalCost'::text))::numeric(14,2) AS total_cost,
    ((qv.snapshot ->> 'deliveryDays'::text))::integer AS delivery_days,
    ((qv.snapshot ->> 'warrantyMonths'::text))::integer AS warranty_months,
    ((qv.snapshot ->> 'paymentTermsDays'::text))::integer AS payment_terms_days,
    ((round((s.rating_avg * (2)::numeric)) / (2)::numeric))::numeric(3,1) AS rating_band,
    ((round((s.on_time_percent / (5)::numeric)) * (5)::numeric))::integer AS on_time_band,
    CASE
        WHEN (s.completed_jobs >= 50) THEN '50+'::text
        WHEN (s.completed_jobs >= 20) THEN '20-49'::text
        WHEN (s.completed_jobs >= 5) THEN '5-19'::text
        WHEN (s.completed_jobs >= 1) THEN '1-4'::text
        ELSE 'New'::text
    END AS experience_band,
    s.verification_status,
    COALESCE(s.gst_verified, false) AS is_gst_verified
FROM quotes q
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = q.rfq_id
JOIN suppliers s ON s.id = q.supplier_id
LEFT JOIN quote_versions qv ON qv.quote_id = q.id AND qv.version = q.current_version
WHERE
    r.reveal_status IN ('PROTECTED'::public.rfq_reveal_status, 'BLIND'::public.rfq_reveal_status)
    AND q.status NOT IN ('DRAFT'::public.quote_status, 'DRAFT_FROM_MESSAGING'::public.quote_status, 'WITHDRAWN'::public.quote_status)
    AND (
        private.can_access_rfq_as_buyer(q.rfq_id)
        OR private.can_access_rfq_as_committee(q.rfq_id)
    );

-- 5. Create Canonical View: public.rfqs_supplier_masked
CREATE OR REPLACE VIEW public.rfqs_supplier_masked
WITH (security_barrier = true) AS
SELECT
    r.id AS rfq_id,
    r.public_ref,
    r.title,
    req.description,
    r.status,
    r.sourcing_mode,
    r.quote_deadline,
    r.min_quotes_required,
    r.created_at,
    ri.id AS invitation_id,
    ri.anonymous_label AS my_alias,
    ri.status AS my_invitation_status,
    ri.invited_at,
    cat.name AS category,
    sub.name AS subcategory,
    req.requirement_mode,
    req.quantity,
    req.unit,
    req.attributes,
    req.quality,
    req.commercial,
    req.required_by_mode,
    req.required_by_days,
    req.required_by_date,
    req.fulfilment_mode,
    req.delivery_city,
    r.evaluation_weights,
    CASE
        WHEN r.buyer_anonymous_to_suppliers THEN 'Identity protected'::text
        ELSE o.name
    END AS buyer_display_name,
    CASE
        WHEN r.buyer_anonymous_to_suppliers THEN NULL::public.org_type
        ELSE o.org_type
    END AS buyer_type
FROM rfqs r
JOIN requirements req ON req.id = r.requirement_id
JOIN organizations o ON o.id = r.organization_id
JOIN rfq_invitations ri ON ri.rfq_id = r.id
LEFT JOIN requirement_categories cat ON cat.id = req.category_id
LEFT JOIN requirement_subcategories sub ON sub.id = req.subcategory_id
WHERE private.is_supplier_user_for(ri.supplier_id);

-- 6. Create Canonical View: public.rfq_clarifications_masked
CREATE OR REPLACE VIEW public.rfq_clarifications_masked
WITH (security_barrier = true) AS
SELECT
    m.id AS message_id,
    m.rfq_id,
    m.invitation_id,
    ri.anonymous_label,
    m.author_side,
    CASE
        WHEN m.author_side = 'BUYER'::public.clarification_author_side THEN 'Buyer organization'::text
        ELSE ri.anonymous_label
    END AS author_display,
    m.body,
    m.created_at,
    m.redactions
FROM rfq_clarification_messages m
JOIN rfq_invitations ri ON ri.id = m.invitation_id
JOIN rfqs r ON r.id = m.rfq_id
WHERE
    r.reveal_status IN ('PROTECTED'::public.rfq_reveal_status, 'BLIND'::public.rfq_reveal_status)
    AND (
        private.can_access_rfq_as_buyer(m.rfq_id)
        OR private.can_access_rfq_as_committee(m.rfq_id)
    );

-- 7. Create Canonical View: public.quote_attachments_masked
CREATE OR REPLACE VIEW public.quote_attachments_masked
WITH (security_barrier = true) AS
SELECT
    a.id AS attachment_id,
    a.quote_id,
    a.rfq_id,
    ri.anonymous_label,
    a.kind,
    a.display_name,
    a.content_type,
    a.size_bytes,
    a.duration_seconds,
    a.storage_path,
    a.created_at
FROM attachments a
JOIN quotes q ON q.id = a.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = a.rfq_id
WHERE a.scope = 'QUOTE'::attachment_scope
  AND r.reveal_status IN ('PROTECTED'::public.rfq_reveal_status, 'BLIND'::public.rfq_reveal_status)
  AND (
    private.can_access_rfq_as_buyer(a.rfq_id)
    OR private.can_access_rfq_as_committee(a.rfq_id)
  );

-- 8. Create Canonical View: public.quote_evaluations_masked
CREATE OR REPLACE VIEW public.quote_evaluations_masked
WITH (security_barrier = true) AS
SELECT
    e.id AS evaluation_id,
    e.quote_id,
    e.rfq_id,
    ri.anonymous_label,
    e.version_evaluated,
    e.evaluation_score,
    private.band_evaluation_breakdown(e.breakdown) AS breakdown,
    e.status,
    e.computed_at
FROM quote_evaluations e
JOIN quotes q ON q.id = e.quote_id
JOIN rfq_invitations ri ON ri.id = q.invitation_id
JOIN rfqs r ON r.id = e.rfq_id
WHERE r.reveal_status IN ('PROTECTED'::public.rfq_reveal_status, 'BLIND'::public.rfq_reveal_status)
  AND (
    private.can_access_rfq_as_buyer(e.rfq_id)
    OR private.can_access_rfq_as_committee(e.rfq_id)
  );

-- 9. Create Canonical View: public.rfq_invitations_masked
CREATE OR REPLACE VIEW public.rfq_invitations_masked
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
WHERE r.reveal_status IN ('PROTECTED'::public.rfq_reveal_status, 'BLIND'::public.rfq_reveal_status)
  AND private.can_access_rfq_as_committee(ri.rfq_id);

-- 10. Create Canonical View: public.my_quote_outcome
CREATE OR REPLACE VIEW public.my_quote_outcome
WITH (security_barrier = true) AS
SELECT
    r.id AS rfq_id,
    r.public_ref,
    r.title,
    ri.anonymous_label AS my_alias,
    CASE
        WHEN q.id IS NULL THEN 'NO_QUOTE'::text
        WHEN q.status = 'SELECTED'::quote_status THEN 'WON'::text
        WHEN q.status = 'WITHDRAWN'::quote_status THEN 'WITHDRAWN'::text
        ELSE 'NOT_SELECTED'::text
    END AS outcome,
    q.status = 'SELECTED'::quote_status AND r.reveal_status = 'REVEALED'::rfq_reveal_status AS buyer_released,
    a.awarded_at AS decided_at
FROM rfq_invitations ri
JOIN rfqs r ON r.id = ri.rfq_id
JOIN awards a ON a.rfq_id = r.id
LEFT JOIN quotes q ON q.invitation_id = ri.id
WHERE private.is_supplier_user_for(ri.supplier_id);

-- 11. Re-point legacy views as non-destructive aliases to maintain backward compatibility
CREATE OR REPLACE VIEW public.quotes_blind WITH (security_barrier = true) AS SELECT * FROM public.quotes_identity_protected;
CREATE OR REPLACE VIEW public.rfqs_supplier_blind WITH (security_barrier = true) AS SELECT * FROM public.rfqs_supplier_masked;
CREATE OR REPLACE VIEW public.rfq_clarification_blind WITH (security_barrier = true) AS SELECT * FROM public.rfq_clarifications_masked;
CREATE OR REPLACE VIEW public.quote_attachments_blind WITH (security_barrier = true) AS SELECT * FROM public.quote_attachments_masked;
CREATE OR REPLACE VIEW public.quote_evaluations_blind WITH (security_barrier = true) AS SELECT * FROM public.quote_evaluations_masked;
CREATE OR REPLACE VIEW public.rfq_invitations_blind WITH (security_barrier = true) AS SELECT * FROM public.rfq_invitations_masked;
CREATE OR REPLACE VIEW public.my_bid_outcome WITH (security_barrier = true) AS SELECT * FROM public.my_quote_outcome;

-- 12. Grant Permissions to all active roles
GRANT SELECT ON public.quotes_identity_protected TO authenticated, anon, service_role;
GRANT SELECT ON public.rfqs_supplier_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_clarifications_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_attachments_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_evaluations_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_invitations_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.my_quote_outcome TO authenticated, anon, service_role;

GRANT SELECT ON public.quotes_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.rfqs_supplier_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_clarification_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_attachments_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.quote_evaluations_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_invitations_blind TO authenticated, anon, service_role;
GRANT SELECT ON public.my_bid_outcome TO authenticated, anon, service_role;
