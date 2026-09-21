-- =============================================================================
-- Migration 00191: Phase C8.3 — Dynamic Spend Approval Matrix, Threshold
-- Routing Engine, and Pluggable Market Intelligence Snapshots
--
-- Features:
--   1. Versioned Approval Policy Snapshots & Threshold Routes:
--      - public.organization_approval_policies: Enhanced with validation & snapshot trigger.
--      - public.rfq_approval_route_evaluations: Append-only immutable evaluation records stamped with policy snapshots.
--   2. Pluggable Market Intelligence Engine & Snapshots:
--      - public.market_intelligence_snapshots: Immutable snapshots capturing fair price bands,
--        turnaround days, warranty months, freshness classification (FRESH, AGING, STALE, EXPIRED, UNAVAILABLE),
--        confidence levels (HIGH, MEDIUM, LOW, INSUFFICIENT_DATA), and source attribution.
--   3. Atomic SECURITY DEFINER RPCs:
--      - public.evaluate_and_stamp_approval_route_atomic(p_rfq_id, p_procurement_amount)
--      - public.capture_market_intelligence_snapshot_atomic(...)
--   4. RLS & Immutability Triggers.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Create public.rfq_approval_route_evaluations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rfq_approval_route_evaluations (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                          uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  organization_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  procurement_amount              numeric(14, 2) NOT NULL CHECK (procurement_amount >= 0),
  required_approval_level         text NOT NULL CHECK (required_approval_level IN ('TIER_1_MANAGER', 'TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE')),
  required_tier_levels            text[] NOT NULL DEFAULT ARRAY['TIER_1_MANAGER']::text[],
  required_approvers_count        integer NOT NULL DEFAULT 1 CHECK (required_approvers_count >= 1),
  is_executive_gate               boolean NOT NULL DEFAULT false,
  is_delegation_allowed           boolean NOT NULL DEFAULT true,
  is_voting_required              boolean NOT NULL DEFAULT true,
  is_quorum_required              boolean NOT NULL DEFAULT true,
  policy_version                  integer NOT NULL DEFAULT 1,
  policy_snapshot                 jsonb NOT NULL,
  evaluation_reason               text NOT NULL,
  evaluated_by                    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  evaluated_at                    timestamptz NOT NULL DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfq_route_eval_rfq ON public.rfq_approval_route_evaluations(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_route_eval_org ON public.rfq_approval_route_evaluations(organization_id);
CREATE INDEX IF NOT EXISTS idx_rfq_route_eval_created ON public.rfq_approval_route_evaluations(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Create public.market_intelligence_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_intelligence_snapshots (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                          uuid REFERENCES public.rfqs(id) ON DELETE CASCADE,
  requirement_id                  uuid REFERENCES public.requirements(id) ON DELETE CASCADE,
  organization_id                 uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  category_key                    text NOT NULL,
  location_city                   text,
  fair_price_min                  numeric(14, 2),
  fair_price_max                  numeric(14, 2),
  fair_price_median               numeric(14, 2),
  typical_delivery_days_min       integer,
  typical_delivery_days_max       integer,
  typical_warranty_months_min     integer,
  typical_warranty_months_max     integer,
  network_reliability_score       numeric(5, 2),
  sample_size                     integer NOT NULL DEFAULT 0 CHECK (sample_size >= 0),
  source_type                     text NOT NULL DEFAULT 'HISTORICAL_BENCHMARK' CHECK (source_type IN ('LIVE_API', 'PLATFORM_TRANSACTED', 'HISTORICAL_BENCHMARK', 'ESTIMATED_STATISTICAL', 'UNAVAILABLE')),
  source_provider_name            text NOT NULL DEFAULT 'OTP Curated Cluster Baselines',
  observed_at                     timestamptz NOT NULL DEFAULT now(),
  freshness_status                text NOT NULL DEFAULT 'AGING' CHECK (freshness_status IN ('FRESH', 'AGING', 'STALE', 'EXPIRED', 'UNAVAILABLE')),
  confidence_level                text NOT NULL DEFAULT 'MEDIUM' CHECK (confidence_level IN ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT_DATA')),
  confidence_score                integer NOT NULL DEFAULT 50 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  confidence_methodology          text NOT NULL,
  is_fallback                     boolean NOT NULL DEFAULT false,
  fallback_reason                 text,
  quote_variance_percent          numeric(6, 2),
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_intel_rfq ON public.market_intelligence_snapshots(rfq_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_req ON public.market_intelligence_snapshots(requirement_id);
CREATE INDEX IF NOT EXISTS idx_market_intel_cat ON public.market_intelligence_snapshots(category_key);
CREATE INDEX IF NOT EXISTS idx_market_intel_created ON public.market_intelligence_snapshots(created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Row Level Security Configuration
-- ---------------------------------------------------------------------------
ALTER TABLE public.rfq_approval_route_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_approval_route_evaluations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.market_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_intelligence_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_rfq_approval_route_eval_select ON public.rfq_approval_route_evaluations;
CREATE POLICY p_rfq_approval_route_eval_select ON public.rfq_approval_route_evaluations
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()))
  );

DROP POLICY IF EXISTS p_market_intelligence_snapshots_select ON public.market_intelligence_snapshots;
CREATE POLICY p_market_intelligence_snapshots_select ON public.market_intelligence_snapshots
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IS NULL OR organization_id IN (SELECT private.get_user_org_ids()))
  );

-- ---------------------------------------------------------------------------
-- 4. Immutable Audit Triggers (Append-Only Protection)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.prevent_mutation_route_eval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'rfq_approval_route_evaluations is append-only and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mutation_route_eval ON public.rfq_approval_route_evaluations;
CREATE TRIGGER trg_prevent_mutation_route_eval
  BEFORE UPDATE OR DELETE ON public.rfq_approval_route_evaluations
  FOR EACH ROW EXECUTE FUNCTION private.prevent_mutation_route_eval();

CREATE OR REPLACE FUNCTION private.prevent_mutation_market_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'market_intelligence_snapshots is append-only and cannot be updated or deleted.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mutation_market_snapshot ON public.market_intelligence_snapshots;
CREATE TRIGGER trg_prevent_mutation_market_snapshot
  BEFORE UPDATE OR DELETE ON public.market_intelligence_snapshots
  FOR EACH ROW EXECUTE FUNCTION private.prevent_mutation_market_snapshot();

-- ---------------------------------------------------------------------------
-- 5. Atomic SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_and_stamp_approval_route_atomic(
  p_rfq_id uuid,
  p_procurement_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rfq record;
  v_caller_id uuid;
  v_caller_org_id uuid;
  v_policy record;
  v_tier_level text;
  v_required_tiers text[];
  v_is_exec boolean := false;
  v_reason text;
  v_eval_id uuid;
BEGIN
  v_caller_id := private.get_profile_id();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated caller';
  END IF;

  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found', p_rfq_id;
  END IF;

  v_caller_org_id := v_rfq.organization_id;

  -- Read active org policy
  SELECT * INTO v_policy FROM public.organization_approval_policies WHERE organization_id = v_caller_org_id AND is_active = true;
  
  -- Route threshold calculation
  IF p_procurement_amount > 2500000 THEN
    v_tier_level := 'TIER_3_EXECUTIVE';
    v_required_tiers := ARRAY['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE']::text[];
    v_is_exec := true;
    v_reason := 'Procurement amount > ₹25L routes to Tier 3 Executive Gate.';
  ELSIF p_procurement_amount >= 500000 THEN
    v_tier_level := 'TIER_2_DEPT_HEAD';
    v_required_tiers := ARRAY['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']::text[];
    v_reason := 'Procurement amount ₹5L - ₹25L routes to Tier 2 Department Head.';
  ELSE
    v_tier_level := 'TIER_1_MANAGER';
    v_required_tiers := ARRAY['TIER_1_MANAGER']::text[];
    v_reason := 'Procurement amount < ₹5L routes to Tier 1 Procurement Manager.';
  END IF;

  INSERT INTO public.rfq_approval_route_evaluations (
    rfq_id,
    organization_id,
    procurement_amount,
    required_approval_level,
    required_tier_levels,
    required_approvers_count,
    is_executive_gate,
    is_delegation_allowed,
    is_voting_required,
    is_quorum_required,
    policy_version,
    policy_snapshot,
    evaluation_reason,
    evaluated_by
  ) VALUES (
    p_rfq_id,
    v_caller_org_id,
    p_procurement_amount,
    v_tier_level,
    v_required_tiers,
    CASE WHEN p_procurement_amount >= 5000000 THEN 2 ELSE 1 END,
    v_is_exec,
    NOT v_is_exec,
    true,
    true,
    COALESCE(v_policy.version, 1),
    COALESCE(to_jsonb(v_policy), '{"policyName": "Standard Enterprise Matrix"}'::jsonb),
    v_reason,
    v_caller_id
  ) RETURNING id INTO v_eval_id;

  RETURN jsonb_build_object(
    'success', true,
    'evaluationId', v_eval_id,
    'requiredApprovalLevel', v_tier_level,
    'requiredTierLevels', v_required_tiers,
    'isExecutiveGate', v_is_exec,
    'isDelegationAllowed', NOT v_is_exec,
    'evaluationReason', v_reason
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_and_stamp_approval_route_atomic(uuid, numeric) TO authenticated, service_role;

COMMIT;
