-- 00067_governance_p2_exit_reasons_and_buyer_scoring.sql
-- Phase 2 Governance: Structured Exit Reasons & Buyer Reliability Scoring Engine

-- 1. Cancellation Enums & Table
DO $$ BEGIN
  CREATE TYPE cancellation_stage AS ENUM (
    'PRE_QUOTE',
    'POST_QUOTE_PRE_AWARD',
    'POST_AWARD_PRE_REVEAL',
    'POST_REVEAL_PRE_PO',
    'POST_PO_EXECUTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE exit_reason_code AS ENUM (
    'BUDGET_CANCELLED',
    'INTERNAL_REORGANIZATION',
    'SPECIFICATION_CHANGED',
    'SUPPLIER_UNRESPONSIVE_POST_REVEAL',
    'SUPPLIER_FAILED_SITE_INSPECTION',
    'PROCUREMENT_TIMELINE_DEFERRED',
    'PRICING_EXCEEDED_BUDGET_CEILING',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.rfq_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  cancelled_by uuid NOT NULL REFERENCES public.profiles(id),
  stage cancellation_stage NOT NULL,
  reason_code exit_reason_code NOT NULL,
  detailed_notes text NOT NULL,
  supporting_doc_id uuid REFERENCES public.attachments(id),
  is_suspicious boolean NOT NULL DEFAULT false,
  suspicion_reasons text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfq_cancellations_rfq ON public.rfq_cancellations (rfq_id);

-- 2. Buyer Reliability Fields on Organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS reliability_score integer NOT NULL DEFAULT 100 CHECK (reliability_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS reliability_tier text NOT NULL DEFAULT 'VERIFIED_PRIME',
  ADD COLUMN IF NOT EXISTS total_rfqs_launched integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_pos_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_reveal_cancels_count integer NOT NULL DEFAULT 0;

-- 3. Recalculate Buyer Reliability Score
CREATE OR REPLACE FUNCTION private.recalculate_buyer_reliability_score(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_rfqs int;
  v_completed_pos int;
  v_post_reveal_cancels int;
  v_score int := 100;
  v_tier text := 'VERIFIED_PRIME';
BEGIN
  -- Count total RFQs
  SELECT count(*)::int INTO v_total_rfqs
  FROM rfqs WHERE organization_id = p_org_id AND status <> 'DRAFT';

  -- Count Completed POs
  SELECT count(*)::int INTO v_completed_pos
  FROM purchase_orders po
  JOIN rfqs r ON r.id = po.rfq_id
  WHERE r.organization_id = p_org_id AND po.status = 'COMPLETED';

  -- Count Post-Reveal Cancellations
  SELECT count(*)::int INTO v_post_reveal_cancels
  FROM rfq_cancellations rc
  JOIN rfqs r ON r.id = rc.rfq_id
  WHERE r.organization_id = p_org_id AND rc.stage = 'POST_REVEAL_PRE_PO';

  IF v_total_rfqs > 0 THEN
    -- Formula: 50% Conversion + 30% Post-Reveal Integrity + 20% Base (scaled to 100)
    v_score := round(
      (LEAST(v_completed_pos::numeric / GREATEST(v_total_rfqs, 1), 1.0) * 50) +
      (GREATEST(1.0 - (v_post_reveal_cancels::numeric * 0.35), 0.0) * 30) +
      20
    )::int;
  ELSE
    v_score := 100; -- New buyer baseline
  END IF;

  v_score := GREATEST(LEAST(v_score, 100), 0);

  IF v_score >= 90 THEN
    v_tier := 'VERIFIED_PRIME';
  ELSIF v_score >= 75 THEN
    v_tier := 'ACTIVE_RELIABLE';
  ELSIF v_score >= 50 THEN
    v_tier := 'NEEDS_IMPROVEMENT';
  ELSE
    v_tier := 'HIGH_RISK_AUDIT';
  END IF;

  UPDATE public.organizations
  SET
    reliability_score = v_score,
    reliability_tier = v_tier,
    total_rfqs_launched = v_total_rfqs,
    completed_pos_count = v_completed_pos,
    post_reveal_cancels_count = v_post_reveal_cancels,
    updated_at = now()
  WHERE id = p_org_id;
END;
$$;

-- 4. Process Structured RFQ Cancellation RPC
CREATE OR REPLACE FUNCTION public.process_rfq_cancellation(
  p_rfq_id uuid,
  p_reason_code exit_reason_code,
  p_detailed_notes text,
  p_supporting_doc_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq rfqs%ROWTYPE;
  v_stage cancellation_stage;
  v_is_suspicious boolean := false;
  v_flags text[] := '{}';
  v_recent_cancels integer;
BEGIN
  SELECT * INTO v_rfq FROM rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'RFQ not found'; END IF;

  IF NOT private.is_org_manager_or_above(v_rfq.organization_id)
     AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Only an organization manager or admin can cancel an RFQ';
  END IF;

  IF v_rfq.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Cannot cancel an RFQ that is already %', v_rfq.status;
  END IF;

  -- Determine stage
  IF v_rfq.reveal_status = 'REVEALED' THEN
    v_stage := 'POST_REVEAL_PRE_PO';
  ELSIF v_rfq.status = 'AWARDED' THEN
    v_stage := 'POST_AWARD_PRE_REVEAL';
  ELSIF v_rfq.status IN ('OPEN', 'CLARIFICATION', 'CLOSED', 'EVALUATING') THEN
    v_stage := 'POST_QUOTE_PRE_AWARD';
  ELSE
    v_stage := 'PRE_QUOTE';
  END IF;

  -- Rule 1: Post-Reveal Cancellation Flag
  IF v_stage = 'POST_REVEAL_PRE_PO' THEN
    v_is_suspicious := true;
    v_flags := array_append(v_flags, 'CANCELLED_AFTER_IDENTITY_UNMASK');
  END IF;

  -- Rule 2: High Velocity Cancellation
  SELECT count(*)::int INTO v_recent_cancels
  FROM rfq_cancellations rc
  JOIN rfqs r ON r.id = rc.rfq_id
  WHERE r.organization_id = v_rfq.organization_id
    AND rc.created_at >= now() - interval '30 days';

  IF v_recent_cancels >= 2 THEN
    v_is_suspicious := true;
    v_flags := array_append(v_flags, 'REPEATED_CANCELLATION_PATTERN');
  END IF;

  -- Insert Cancellation Audit
  INSERT INTO public.rfq_cancellations (
    rfq_id, cancelled_by, stage, reason_code, detailed_notes,
    supporting_doc_id, is_suspicious, suspicion_reasons
  ) VALUES (
    p_rfq_id, private.get_profile_id(), v_stage, p_reason_code,
    btrim(p_detailed_notes), p_supporting_doc_id, v_is_suspicious, v_flags
  );

  -- Close RFQ & Requirement
  UPDATE public.rfqs SET status = 'CANCELLED', updated_at = now() WHERE id = p_rfq_id;
  UPDATE public.requirements SET status = 'CANCELLED', updated_at = now() WHERE id = v_rfq.requirement_id;

  -- Update associated open quotes
  UPDATE public.quotes SET status = 'WITHDRAWN', updated_at = now()
  WHERE rfq_id = p_rfq_id AND status NOT IN ('SELECTED', 'NOT_SELECTED');

  -- Recalculate Buyer Reliability Score
  PERFORM private.recalculate_buyer_reliability_score(v_rfq.organization_id);

  INSERT INTO public.audit_events (
    event_type, actor_id, organization_id, entity_type, entity_id, payload
  ) VALUES (
    'rfq.cancelled',
    private.get_profile_id(),
    v_rfq.organization_id,
    'rfq',
    p_rfq_id::text,
    jsonb_build_object(
      'stage', v_stage,
      'reason_code', p_reason_code,
      'is_suspicious', v_is_suspicious,
      'flags', v_flags
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'rfq_id', p_rfq_id,
    'stage', v_stage,
    'is_suspicious', v_is_suspicious,
    'reasons', v_flags
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_rfq_cancellation(uuid, exit_reason_code, text, uuid) TO authenticated, service_role;

-- 5. RLS
ALTER TABLE public.rfq_cancellations ENABLE ROW LEVEL SECURITY;

CREATE POLICY rfq_cancellations_read ON public.rfq_cancellations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rfqs r
      WHERE r.id = rfq_cancellations.rfq_id
        AND (
          private.can_access_rfq_as_buyer(r.id)
          OR private.is_platform_admin()
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.rfq_cancellations TO authenticated, service_role;

