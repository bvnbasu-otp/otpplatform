-- Migration 00270: Unsuccessful RFQ Retention & 30-Day Purge Lifecycle
--
-- Governs data minimization and regulatory hygiene:
-- 1. Adds legal_hold, is_purged, purged_at, and purge_audit_tombstone to public.rfqs
-- 2. Introduces public.purge_expired_unsuccessful_rfqs(p_retention_days integer DEFAULT 30)
-- 3. Strictly preserves active RFQs, awarded transactions, drafts, and records under legal hold.
-- 4. Cleans ephemeral unawarded quotes, line items, invitations while preserving audit tombstones.

-- 1. Safely add retention & compliance columns to rfqs
ALTER TABLE public.rfqs
  ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_purged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purged_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS purge_audit_tombstone jsonb DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_rfqs_purge_lifecycle
  ON public.rfqs (status, is_purged, legal_hold, updated_at);

-- 2. Ensure terminal enum values exist
DO $$
BEGIN
  ALTER TYPE public.rfq_status ADD VALUE IF NOT EXISTS 'UNSUCCESSFUL';
  ALTER TYPE public.rfq_status ADD VALUE IF NOT EXISTS 'EXPIRED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Core Purge Function
CREATE OR REPLACE FUNCTION public.purge_expired_unsuccessful_rfqs(
  p_retention_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_rfq record;
  v_purged_count integer := 0;
  v_quote_count integer := 0;
  v_invitation_count integer := 0;
  v_cutoff timestamptz;
  v_tombstone jsonb;
BEGIN
  -- Safe floor of at least 1 day retention
  IF p_retention_days IS NULL OR p_retention_days < 1 THEN
    p_retention_days := 30;
  END IF;

  v_cutoff := now() - (p_retention_days || ' days')::interval;

  FOR v_rfq IN
    SELECT r.id, r.status, r.title, r.organization_id, r.created_at, r.updated_at
    FROM public.rfqs r
    WHERE r.is_purged = false
      AND r.legal_hold = false
      AND r.updated_at < v_cutoff
      -- Terminal unawarded statuses only
      AND r.status::text IN ('UNSUCCESSFUL', 'CANCELLED', 'EXPIRED', 'CLOSED')
      -- Strictly protect active and in-progress procurement
      AND r.status::text NOT IN ('DRAFT', 'OPEN', 'CLARIFICATION', 'EVALUATING', 'AWARDED')
      -- Never purge if a Purchase Order was issued or executed
      AND NOT EXISTS (
        SELECT 1 FROM public.purchase_orders po WHERE po.rfq_id = r.id
      )
      -- Never purge if an award selection quote exists
      AND NOT EXISTS (
        SELECT 1 FROM public.quotes q WHERE q.rfq_id = r.id AND q.status = 'SELECTED'
      )
    FOR UPDATE OF r SKIP LOCKED
  LOOP
    -- Count objects to be purged
    SELECT count(*) INTO v_quote_count FROM public.quotes WHERE rfq_id = v_rfq.id;
    SELECT count(*) INTO v_invitation_count FROM public.rfq_invitations WHERE rfq_id = v_rfq.id;

    -- Build cryptographic & audit tombstone
    v_tombstone := jsonb_build_object(
      'purged_at', now(),
      'retention_days', p_retention_days,
      'original_status', v_rfq.status,
      'original_title', v_rfq.title,
      'organization_id', v_rfq.organization_id,
      'quotes_purged', v_quote_count,
      'invitations_purged', v_invitation_count,
      'created_at', v_rfq.created_at,
      'updated_at', v_rfq.updated_at
    );

    -- Nullify foreign key references from committee votes
    UPDATE public.committee_votes
    SET recommended_quote_id = NULL
    WHERE rfq_id = v_rfq.id;

    -- Delete unawarded quotes (cascades line items & revisions)
    DELETE FROM public.quotes WHERE rfq_id = v_rfq.id;

    -- Delete unawarded supplier invitations
    DELETE FROM public.rfq_invitations WHERE rfq_id = v_rfq.id;

    -- Mark RFQ as purged with audit tombstone
    UPDATE public.rfqs
    SET is_purged = true,
        purged_at = now(),
        purge_audit_tombstone = v_tombstone
    WHERE id = v_rfq.id;

    -- Record immutable audit log
    INSERT INTO public.audit_events (
      event_type,
      entity_type,
      entity_id,
      organization_id,
      payload
    ) VALUES (
      'rfq.retention_purged',
      'rfq',
      v_rfq.id::text,
      v_rfq.organization_id,
      v_tombstone
    );

    v_purged_count := v_purged_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'purged_count', v_purged_count,
    'retention_days', p_retention_days,
    'cutoff_timestamp', v_cutoff
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_unsuccessful_rfqs(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_unsuccessful_rfqs(integer) TO service_role, authenticated;

-- Comment for schema documentation
COMMENT ON FUNCTION public.purge_expired_unsuccessful_rfqs(integer) IS
  'Purges unawarded quotes and invitations for terminal RFQs older than the retention threshold, preserving drafts, active workflows, awarded contracts, and legal-hold records with permanent tombstones.';
