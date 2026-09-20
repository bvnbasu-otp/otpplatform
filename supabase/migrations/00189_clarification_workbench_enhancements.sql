-- =============================================================================
-- Migration: 00189_clarification_workbench_enhancements.sql
-- Phase C.7: Collaborative Clarification & Sealed Q&A Workbench
-- Structured Categories, Line-Item Referencing, Broadcast Addenda & Isolation
-- =============================================================================

-- 1. Extend rfq_clarification_messages schema
ALTER TABLE public.rfq_clarification_messages
  ALTER COLUMN invitation_id DROP NOT NULL;

ALTER TABLE public.rfq_clarification_messages
  ADD COLUMN IF NOT EXISTS inquiry_category text NOT NULL DEFAULT 'TECHNICAL_SPEC'
    CHECK (inquiry_category IN ('TECHNICAL_SPEC', 'COMMERCIAL_TERMS', 'DELIVERY_LOGISTICS', 'COMPLIANCE')),
  ADD COLUMN IF NOT EXISTS line_item_ref text,
  ADD COLUMN IF NOT EXISTS is_broadcast boolean NOT NULL DEFAULT false;

-- Add consistency constraint: non-broadcast messages MUST have an invitation_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_clarification_broadcast_or_invitation'
  ) THEN
    ALTER TABLE public.rfq_clarification_messages
      ADD CONSTRAINT chk_clarification_broadcast_or_invitation
      CHECK (is_broadcast = true OR invitation_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_clarification_broadcast
  ON public.rfq_clarification_messages (rfq_id, is_broadcast);

CREATE INDEX IF NOT EXISTS idx_clarification_category
  ON public.rfq_clarification_messages (rfq_id, inquiry_category);

-- 2. Drop and Recreate Canonical Views with full C.7 structured attributes
DROP VIEW IF EXISTS public.rfq_clarification_blind CASCADE;
DROP VIEW IF EXISTS public.rfq_clarifications_masked CASCADE;
DROP VIEW IF EXISTS public.rfq_clarification_supplier CASCADE;

-- Canonical Buyer & Committee View
CREATE OR REPLACE VIEW public.rfq_clarifications_masked
WITH (security_barrier = true) AS
SELECT
    m.id AS message_id,
    m.rfq_id,
    m.invitation_id,
    COALESCE(
      ri.anonymous_label,
      CASE WHEN m.is_broadcast THEN 'Broadcast Addendum' ELSE 'Supplier' END
    ) AS anonymous_label,
    m.author_side,
    CASE
        WHEN m.is_broadcast THEN 'Buyer organization (Broadcast Addendum)'::text
        WHEN m.author_side = 'BUYER'::public.clarification_author_side THEN 'Buyer organization'::text
        ELSE COALESCE(ri.anonymous_label, 'Supplier')
    END AS author_display,
    m.body,
    m.created_at,
    m.redactions,
    m.inquiry_category,
    m.line_item_ref,
    m.is_broadcast
FROM public.rfq_clarification_messages m
LEFT JOIN public.rfq_invitations ri ON ri.id = m.invitation_id
JOIN public.rfqs r ON r.id = m.rfq_id
WHERE
    r.reveal_status IN ('PROTECTED'::public.rfq_reveal_status, 'BLIND'::public.rfq_reveal_status)
    AND (
        private.can_access_rfq_as_buyer(m.rfq_id)
        OR private.can_access_rfq_as_committee(m.rfq_id)
    );

-- Canonical Supplier Persona View
CREATE OR REPLACE VIEW public.rfq_clarification_supplier
WITH (security_barrier = true) AS
SELECT
    m.id AS message_id,
    m.rfq_id,
    m.invitation_id,
    m.author_side,
    CASE
        WHEN m.is_broadcast THEN 'Buyer organization (Broadcast Addendum)'::text
        WHEN m.author_side = 'BUYER'::public.clarification_author_side THEN 'Buyer organization'::text
        ELSE 'You'
    END AS author_display,
    m.body,
    m.created_at,
    m.redactions,
    m.inquiry_category,
    m.line_item_ref,
    m.is_broadcast
FROM public.rfq_clarification_messages m
LEFT JOIN public.rfq_invitations ri ON ri.id = m.invitation_id
WHERE
    (
        m.is_broadcast = true
        AND EXISTS (
            SELECT 1 FROM public.rfq_invitations ri2
            WHERE ri2.rfq_id = m.rfq_id
              AND private.is_supplier_user_for(ri2.supplier_id)
        )
    )
    OR (
        m.invitation_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.rfq_invitations ri3
            WHERE ri3.id = m.invitation_id
              AND private.is_supplier_user_for(ri3.supplier_id)
        )
    );

-- Backwards compatibility alias view
CREATE OR REPLACE VIEW public.rfq_clarification_blind
WITH (security_barrier = true) AS
SELECT * FROM public.rfq_clarifications_masked;

-- Grants
GRANT SELECT ON public.rfq_clarifications_masked TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_clarification_supplier TO authenticated, anon, service_role;
GRANT SELECT ON public.rfq_clarification_blind TO authenticated, anon, service_role;

-- 3. Update RLS Policies on rfq_clarification_messages
DROP POLICY IF EXISTS clarification_select_buyer ON public.rfq_clarification_messages;
DROP POLICY IF EXISTS clarification_select_supplier ON public.rfq_clarification_messages;
DROP POLICY IF EXISTS clarification_insert ON public.rfq_clarification_messages;

CREATE POLICY clarification_select_buyer ON public.rfq_clarification_messages
  FOR SELECT TO authenticated
  USING (
    private.can_access_rfq_as_buyer(rfq_id)
    OR private.can_access_rfq_as_committee(rfq_id)
  );

CREATE POLICY clarification_select_supplier ON public.rfq_clarification_messages
  FOR SELECT TO authenticated
  USING (
    (
      is_broadcast = true
      AND EXISTS (
        SELECT 1 FROM public.rfq_invitations ri
        WHERE ri.rfq_id = rfq_clarification_messages.rfq_id
          AND private.is_supplier_user_for(ri.supplier_id)
      )
    )
    OR (
      invitation_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.rfq_invitations ri
        WHERE ri.id = rfq_clarification_messages.invitation_id
          AND private.is_supplier_user_for(ri.supplier_id)
      )
    )
  );

CREATE POLICY clarification_insert ON public.rfq_clarification_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_profile_id = private.get_profile_id()
    AND EXISTS (
      SELECT 1 FROM public.rfqs r
      WHERE r.id = rfq_id
        AND r.status::text IN ('OPEN', 'CLARIFICATION')
    )
    AND (
      (
        author_side = 'BUYER'
        AND private.is_org_member(private.rfq_org_id(rfq_id))
        AND (is_broadcast = true OR invitation_id IS NOT NULL)
      )
      OR (
        author_side = 'SUPPLIER'
        AND is_broadcast = false
        AND invitation_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.rfq_invitations ri
          WHERE ri.id = rfq_clarification_messages.invitation_id
            AND ri.rfq_id = rfq_clarification_messages.rfq_id
            AND private.is_supplier_user_for(ri.supplier_id)
        )
      )
    )
  );

-- 4. Atomic RPC: Publish Neutral Broadcast Clarification Addendum
CREATE OR REPLACE FUNCTION public.post_broadcast_clarification_atomic(
  p_rfq_id uuid,
  p_body text,
  p_inquiry_category text DEFAULT 'TECHNICAL_SPEC',
  p_line_item_ref text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_profile_id uuid;
  v_org_id     uuid;
  v_rfq_status text;
  v_trimmed    text;
  v_msg_id     uuid;
  v_category   text;
BEGIN
  v_profile_id := private.get_profile_id();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  v_trimmed := trim(p_body);
  IF v_trimmed IS NULL OR char_length(v_trimmed) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Addendum body cannot be empty');
  END IF;

  SELECT r.organization_id, r.status::text
    INTO v_org_id, v_rfq_status
  FROM public.rfqs r
  WHERE r.id = p_rfq_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'RFQ not found');
  END IF;

  IF NOT private.is_org_member(v_org_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unauthorized: Only buyer organization members may post broadcast addenda');
  END IF;

  IF v_rfq_status NOT IN ('OPEN', 'CLARIFICATION') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Clarifications can only be published while RFQ is open or in clarification phase');
  END IF;

  v_category := COALESCE(p_inquiry_category, 'TECHNICAL_SPEC');
  IF v_category NOT IN ('TECHNICAL_SPEC', 'COMMERCIAL_TERMS', 'DELIVERY_LOGISTICS', 'COMPLIANCE') THEN
    v_category := 'TECHNICAL_SPEC';
  END IF;

  INSERT INTO public.rfq_clarification_messages (
    rfq_id,
    invitation_id,
    author_profile_id,
    author_side,
    body,
    inquiry_category,
    line_item_ref,
    is_broadcast
  ) VALUES (
    p_rfq_id,
    NULL,
    v_profile_id,
    'BUYER'::public.clarification_author_side,
    v_trimmed,
    v_category,
    nullif(trim(p_line_item_ref), ''),
    true
  ) RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object(
    'ok', true,
    'message_id', v_msg_id,
    'is_broadcast', true,
    'category', v_category
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_broadcast_clarification_atomic(uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.post_broadcast_clarification_atomic IS
  'Atomically publishes a neutral broadcast clarification addendum visible to all invited suppliers on the RFQ.';
