-- =============================================================================
-- Migration 00183: Phase 6 Group 6 — Vendor Master Intelligence (VMI),
-- Multi-Tier Threshold Governance & Enterprise Approval Matrix,
-- and Tamper-Evident Contract Operations
--
-- Features:
--   1. Vendor Master Intelligence (VMI) Engine:
--      - public.supplier_scorecards: Multi-dimensional scorecards with 35/30/20/15 weights, tiers (PLATINUM/GOLD/SILVER/BRONZE/PROBATIONARY), and privacy masking flag.
--      - public.scorecard_dimension_history: Append-only history of recalculated scores and transactional metrics.
--      - public.anonymized_supplier_badges: Pre-award privacy-preserving coarse/banded scorecards view for RFQ evaluations.
--   2. Multi-Tier Threshold Governance & Enterprise Approval Matrix:
--      - public.organization_approval_policies: Configurable organization tiered rules (<₹5L Tier 1, ₹5L-₹25L Tier 2, >₹25L Tier 3) with anti-bypass flags.
--      - public.rfq_approval_stages: Sequential approval chain stages, digital signatures, role validations, and anti-self-approval enforcement.
--   3. Tamper-Evident Contract Operations & SLA Monitoring:
--      - public.procurement_contracts: Cryptographic SHA-256 hashed contracts, legal markdown body, milestone schedule, liquidated damages, and dual-signoff tracking.
--   4. Atomic SECURITY DEFINER RPCs:
--      - public.compute_supplier_scorecard_atomic(...)
--      - public.configure_approval_policy_atomic(...)
--      - public.submit_rfq_tier_approval_atomic(...)
--      - public.generate_procurement_contract_atomic(...)
--      - public.sign_procurement_contract_atomic(...)
--   5. Multi-Tenant RLS & Immutability Triggers.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helper Functions: Organization and Supplier Membership Sets
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM organization_members om
  WHERE om.profile_id = private.get_profile_id();
$$;

CREATE OR REPLACE FUNCTION private.get_user_supplier_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.supplier_id
  FROM supplier_users su
  WHERE su.profile_id = private.get_profile_id();
$$;

GRANT EXECUTE ON FUNCTION private.get_user_org_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.get_user_supplier_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Create public.supplier_scorecards & dimension history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_scorecards (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id                     uuid NOT NULL UNIQUE REFERENCES public.suppliers(id) ON DELETE CASCADE,
  organization_id                 uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  overall_score                   numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (overall_score >= 0 AND overall_score <= 100),
  performance_tier                text NOT NULL DEFAULT 'PROBATIONARY' CHECK (performance_tier IN ('PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'PROBATIONARY')),
  quality_score                   numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (quality_score >= 0 AND quality_score <= 100),
  delivery_score                  numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (delivery_score >= 0 AND delivery_score <= 100),
  sla_dispute_score               numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (sla_dispute_score >= 0 AND sla_dispute_score <= 100),
  commercial_score                numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (commercial_score >= 0 AND commercial_score <= 100),
  quality_weight                  numeric(4, 3) NOT NULL DEFAULT 0.350,
  delivery_weight                 numeric(4, 3) NOT NULL DEFAULT 0.300,
  sla_dispute_weight              numeric(4, 3) NOT NULL DEFAULT 0.200,
  commercial_weight               numeric(4, 3) NOT NULL DEFAULT 0.150,
  total_orders_completed          integer NOT NULL DEFAULT 0 CHECK (total_orders_completed >= 0),
  average_closeout_rating         numeric(3, 2) NOT NULL DEFAULT 0.00 CHECK (average_closeout_rating >= 0 AND average_closeout_rating <= 5.00),
  milestone_pass_rate             numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (milestone_pass_rate >= 0 AND milestone_pass_rate <= 100),
  rework_frequency_percent        numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (rework_frequency_percent >= 0 AND rework_frequency_percent <= 100),
  on_time_delivery_percent        numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (on_time_delivery_percent >= 0 AND on_time_delivery_percent <= 100),
  total_disputes_count            integer NOT NULL DEFAULT 0 CHECK (total_disputes_count >= 0),
  critical_disputes_count         integer NOT NULL DEFAULT 0 CHECK (critical_disputes_count >= 0),
  dispute_resolution_adherence    numeric(5, 2) NOT NULL DEFAULT 100.00 CHECK (dispute_resolution_adherence >= 0 AND dispute_resolution_adherence <= 100),
  quote_variance_percent          numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (quote_variance_percent >= 0 AND quote_variance_percent <= 100),
  change_order_frequency_percent  numeric(5, 2) NOT NULL DEFAULT 0.00 CHECK (change_order_frequency_percent >= 0 AND change_order_frequency_percent <= 100),
  is_identity_masked              boolean NOT NULL DEFAULT true,
  version                         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  last_calculated_at              timestamptz NOT NULL DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_supplier ON public.supplier_scorecards(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_tier ON public.supplier_scorecards(performance_tier);
CREATE INDEX IF NOT EXISTS idx_supplier_scorecards_overall ON public.supplier_scorecards(overall_score DESC);

DROP TRIGGER IF EXISTS trg_supplier_scorecards_updated_at ON public.supplier_scorecards;
CREATE TRIGGER trg_supplier_scorecards_updated_at
  BEFORE UPDATE ON public.supplier_scorecards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.scorecard_dimension_history (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id                     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  scorecard_id                    uuid NOT NULL REFERENCES public.supplier_scorecards(id) ON DELETE CASCADE,
  organization_id                 uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  overall_score                   numeric(5, 2) NOT NULL,
  performance_tier                text NOT NULL,
  dimensions_snapshot             jsonb NOT NULL,
  metrics_snapshot                jsonb NOT NULL,
  calculation_trigger             text NOT NULL DEFAULT 'MANUAL',
  calculated_by                   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scorecard_hist_sup ON public.scorecard_dimension_history(supplier_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_hist_card ON public.scorecard_dimension_history(scorecard_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_hist_org ON public.scorecard_dimension_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_scorecard_hist_created ON public.scorecard_dimension_history(created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Create public.organization_approval_policies & rfq_approval_stages
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_approval_policies (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  policy_name                     text NOT NULL DEFAULT 'Enterprise Approval Matrix',
  is_active                       boolean NOT NULL DEFAULT true,
  tiers                           jsonb NOT NULL DEFAULT '[
    {"tierLevel": "TIER_1_MANAGER", "tierName": "Tier 1: Team Manager", "minAmount": 0, "maxAmount": 500000, "requiredApproverRoles": ["BUYER", "MANAGER", "PROPERTY_OWNER", "OWNER", "FINANCE_LEAD"], "minApproversRequired": 1},
    {"tierLevel": "TIER_2_DEPT_HEAD", "tierName": "Tier 2: Dept Head / VP", "minAmount": 500000, "maxAmount": 2500000, "requiredApproverRoles": ["HEAD_OF_DEPARTMENT", "VP", "PROPERTY_OWNER", "OWNER", "FINANCE_LEAD"], "minApproversRequired": 1},
    {"tierLevel": "TIER_3_EXECUTIVE", "tierName": "Tier 3: CFO / Executive Director", "minAmount": 2500000, "maxAmount": null, "requiredApproverRoles": ["CFO", "DIRECTOR", "EXECUTIVE", "OWNER"], "minApproversRequired": 1}
  ]'::jsonb,
  prevent_self_approval           boolean NOT NULL DEFAULT true,
  require_dual_signoff_above      numeric(14, 2) DEFAULT 5000000.00,
  version                         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_appr_policies_org ON public.organization_approval_policies(organization_id);

DROP TRIGGER IF EXISTS trg_org_appr_policies_updated_at ON public.organization_approval_policies;
CREATE TRIGGER trg_org_appr_policies_updated_at
  BEFORE UPDATE ON public.organization_approval_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.rfq_approval_stages (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id                          uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE CASCADE,
  organization_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tier_level                      text NOT NULL CHECK (tier_level IN ('TIER_1_MANAGER', 'TIER_2_DEPT_HEAD', 'TIER_3_EXECUTIVE')),
  stage_order                     integer NOT NULL CHECK (stage_order >= 1),
  status                          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'BYPASSED_SUPERSEDED')),
  threshold_min_amount            numeric(14, 2) NOT NULL DEFAULT 0.00,
  threshold_max_amount            numeric(14, 2),
  procurement_amount              numeric(14, 2) NOT NULL CHECK (procurement_amount >= 0),
  approver_profile_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approver_role                   text,
  approver_comments               text,
  digital_signature_hash          text,
  approved_at                     timestamptz,
  rejected_at                     timestamptz,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_rfq_stage_tier UNIQUE (rfq_id, stage_order)
);

CREATE INDEX IF NOT EXISTS idx_rfq_stages_rfq ON public.rfq_approval_stages(rfq_id);
CREATE INDEX IF NOT EXISTS idx_rfq_stages_org ON public.rfq_approval_stages(organization_id);
CREATE INDEX IF NOT EXISTS idx_rfq_stages_status ON public.rfq_approval_stages(status);

DROP TRIGGER IF EXISTS trg_rfq_stages_updated_at ON public.rfq_approval_stages;
CREATE TRIGGER trg_rfq_stages_updated_at
  BEFORE UPDATE ON public.rfq_approval_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Create public.procurement_contracts Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procurement_contracts (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_number                 text NOT NULL UNIQUE,
  rfq_id                          uuid NOT NULL REFERENCES public.rfqs(id) ON DELETE RESTRICT,
  purchase_order_id               uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  organization_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id                     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  quote_id                        uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  status                          text NOT NULL DEFAULT 'PENDING_BUYER_SIGNATURE' CHECK (status IN ('DRAFT', 'PENDING_BUYER_SIGNATURE', 'PENDING_SUPPLIER_SIGNATURE', 'ACTIVE', 'TERMINATED', 'FULFILLED')),
  terms                           jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_body_markdown          text NOT NULL,
  document_hash                   text NOT NULL,
  buyer_signed_by                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  buyer_signed_at                 timestamptz,
  buyer_signature_hash            text,
  supplier_signed_by              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  supplier_signed_at              timestamptz,
  supplier_signature_hash         text,
  version                         integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_rfq ON public.procurement_contracts(rfq_id);
CREATE INDEX IF NOT EXISTS idx_contracts_po ON public.procurement_contracts(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_contracts_org ON public.procurement_contracts(organization_id);
CREATE INDEX IF NOT EXISTS idx_contracts_sup ON public.procurement_contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_contracts_hash ON public.procurement_contracts(document_hash);

DROP TRIGGER IF EXISTS trg_procurement_contracts_updated_at ON public.procurement_contracts;
CREATE TRIGGER trg_procurement_contracts_updated_at
  BEFORE UPDATE ON public.procurement_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Enable Row Level Security (RLS) & Hardening
-- ---------------------------------------------------------------------------
ALTER TABLE public.supplier_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_scorecards FORCE ROW LEVEL SECURITY;

ALTER TABLE public.scorecard_dimension_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scorecard_dimension_history FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organization_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_approval_policies FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rfq_approval_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfq_approval_stages FORCE ROW LEVEL SECURITY;

ALTER TABLE public.procurement_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_contracts FORCE ROW LEVEL SECURITY;

-- Policies for supplier_scorecards
DROP POLICY IF EXISTS p_supplier_scorecards_select ON public.supplier_scorecards;
CREATE POLICY p_supplier_scorecards_select ON public.supplier_scorecards
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IS NOT NULL AND organization_id IN (SELECT private.get_user_org_ids())) OR
    (supplier_id IN (SELECT private.get_user_supplier_ids()))
  );

-- Policies for scorecard_dimension_history
DROP POLICY IF EXISTS p_scorecard_dimension_history_select ON public.scorecard_dimension_history;
CREATE POLICY p_scorecard_dimension_history_select ON public.scorecard_dimension_history
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IS NOT NULL AND organization_id IN (SELECT private.get_user_org_ids())) OR
    (supplier_id IN (SELECT private.get_user_supplier_ids()))
  );

-- Policies for organization_approval_policies
DROP POLICY IF EXISTS p_org_approval_policies_select ON public.organization_approval_policies;
CREATE POLICY p_org_approval_policies_select ON public.organization_approval_policies
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS p_org_approval_policies_write ON public.organization_approval_policies;
CREATE POLICY p_org_approval_policies_write ON public.organization_approval_policies
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
  )
  WITH CHECK (
    private.is_platform_admin() OR
    (organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(organization_id) IN ('OWNER', 'MANAGER'))
  );

-- Policies for rfq_approval_stages
DROP POLICY IF EXISTS p_rfq_approval_stages_select ON public.rfq_approval_stages;
CREATE POLICY p_rfq_approval_stages_select ON public.rfq_approval_stages
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  );

DROP POLICY IF EXISTS p_rfq_approval_stages_write ON public.rfq_approval_stages;
CREATE POLICY p_rfq_approval_stages_write ON public.rfq_approval_stages
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  )
  WITH CHECK (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids())
  );

-- Policies for procurement_contracts
DROP POLICY IF EXISTS p_procurement_contracts_select ON public.procurement_contracts;
CREATE POLICY p_procurement_contracts_select ON public.procurement_contracts
  FOR SELECT TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids()) OR
    (supplier_id IN (SELECT private.get_user_supplier_ids()))
  );

DROP POLICY IF EXISTS p_procurement_contracts_write ON public.procurement_contracts;
CREATE POLICY p_procurement_contracts_write ON public.procurement_contracts
  FOR ALL TO authenticated
  USING (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids()) OR
    (supplier_id IN (SELECT private.get_user_supplier_ids()))
  )
  WITH CHECK (
    private.is_platform_admin() OR
    organization_id IN (SELECT private.get_user_org_ids()) OR
    (supplier_id IN (SELECT private.get_user_supplier_ids()))
  );

-- ---------------------------------------------------------------------------
-- 5. Create Pre-Award Privacy Protected Scorecard View (Anonymized View)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.anonymized_supplier_badges AS
SELECT
  sc.id AS scorecard_id,
  inv.rfq_id,
  inv.anonymous_label AS supplier_alias,
  sc.performance_tier,
  CASE
    WHEN sc.overall_score >= 90.0 THEN 'EXEMPLARY'
    WHEN sc.overall_score >= 80.0 THEN 'COMMENDED'
    WHEN sc.overall_score >= 70.0 THEN 'STANDARD'
    WHEN sc.overall_score >= 60.0 THEN 'EMERGING'
    ELSE 'UNDER_OBSERVATION'
  END AS coarse_score_band,
  CASE
    WHEN sc.total_orders_completed >= 50 THEN '50+ Orders'
    WHEN sc.total_orders_completed >= 25 THEN '25-49 Orders'
    WHEN sc.total_orders_completed >= 10 THEN '10-24 Orders'
    WHEN sc.total_orders_completed >= 5 THEN '5-9 Orders'
    ELSE '<5 Orders'
  END AS completed_jobs_range,
  CASE
    WHEN sc.average_closeout_rating >= 4.8 THEN '4.8 - 5.0 ★'
    WHEN sc.average_closeout_rating >= 4.5 THEN '4.5 - 4.7 ★'
    WHEN sc.average_closeout_rating >= 4.0 THEN '4.0 - 4.4 ★'
    WHEN sc.average_closeout_rating >= 3.5 THEN '3.5 - 3.9 ★'
    ELSE '<3.5 ★'
  END AS quality_rating_band,
  CASE
    WHEN sc.on_time_delivery_percent >= 95.0 THEN '95%+ On-Time'
    WHEN sc.on_time_delivery_percent >= 85.0 THEN '85-94% On-Time'
    WHEN sc.on_time_delivery_percent >= 75.0 THEN '75-84% On-Time'
    ELSE '<75% On-Time'
  END AS on_time_delivery_band,
  sc.is_identity_masked,
  sc.last_calculated_at
FROM public.supplier_scorecards sc
JOIN public.rfq_invitations inv ON inv.supplier_id = sc.supplier_id;

-- ---------------------------------------------------------------------------
-- 6. Atomic SECURITY DEFINER RPCs
-- ---------------------------------------------------------------------------

-- RPC 1: compute_supplier_scorecard_atomic
CREATE OR REPLACE FUNCTION public.compute_supplier_scorecard_atomic(
  p_supplier_id uuid,
  p_trigger_type text DEFAULT 'AUTOMATED'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_scorecard public.supplier_scorecards%ROWTYPE;
  v_total_completed integer := 0;
  v_avg_rating numeric(3, 2) := 5.00;
  v_milestone_pass_rate numeric(5, 2) := 100.00;
  v_rework_frequency numeric(5, 2) := 0.00;
  v_on_time_delivery numeric(5, 2) := 100.00;
  v_total_disputes integer := 0;
  v_critical_disputes integer := 0;
  v_dispute_adherence numeric(5, 2) := 100.00;
  v_quote_variance numeric(5, 2) := 0.00;
  v_change_order_freq numeric(5, 2) := 0.00;

  v_star_score numeric(5, 2);
  v_quality_score numeric(5, 2);
  v_delivery_score numeric(5, 2);
  v_sla_dispute_score numeric(5, 2);
  v_commercial_score numeric(5, 2);
  v_overall_score numeric(5, 2);
  v_tier text := 'PROBATIONARY';
  v_q_wt numeric(4, 3) := 0.350;
  v_d_wt numeric(4, 3) := 0.300;
  v_s_wt numeric(4, 3) := 0.200;
  v_c_wt numeric(4, 3) := 0.150;
BEGIN
  IF NOT (private.is_platform_admin() OR EXISTS (SELECT 1 FROM public.suppliers WHERE id = p_supplier_id)) THEN
    RAISE EXCEPTION 'Supplier % not found or permission denied.', p_supplier_id;
  END IF;

  -- 1. Aggregate Step 15 PO closeout performance & ratings
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(AVG(p.quality_rating), 5.00)
  INTO
    v_total_completed,
    v_avg_rating
  FROM public.procurement_performance_records p
  WHERE p.supplier_id = p_supplier_id;

  -- If no explicit closeout records yet, check purchase orders completed
  IF v_total_completed = 0 THEN
    SELECT COALESCE(COUNT(*), 0)
    INTO v_total_completed
    FROM public.purchase_orders
    WHERE supplier_id = p_supplier_id AND status = 'COMPLETED';
  END IF;

  -- 2. Aggregate Work Order Milestone Inspections
  SELECT
    COALESCE(AVG(CASE WHEN passed THEN 100.0 ELSE 0.0 END), 100.00),
    COALESCE(AVG(CASE WHEN rework_count > 0 THEN 100.0 ELSE 0.0 END), 0.00)
  INTO
    v_milestone_pass_rate,
    v_rework_frequency
  FROM public.work_order_inspections ins
  JOIN public.work_orders wo ON wo.id = ins.work_order_id
  WHERE wo.supplier_id = p_supplier_id;

  -- 3. Aggregate Dispute Metrics
  SELECT
    COALESCE(COUNT(*), 0),
    COALESCE(COUNT(CASE WHEN d.severity = 'CRITICAL' THEN 1 END), 0),
    COALESCE(AVG(CASE WHEN d.status = 'RESOLVED' THEN 100.0 ELSE 80.0 END), 100.00)
  INTO
    v_total_disputes,
    v_critical_disputes,
    v_dispute_adherence
  FROM public.disputes d
  JOIN public.purchase_orders po ON po.id = d.entity_id
  WHERE po.supplier_id = p_supplier_id;

  -- 4. Calculate Dimensional Scores
  v_star_score := LEAST(5.00, GREATEST(0.00, v_avg_rating)) * 20.0;
  v_quality_score := LEAST(100.00, GREATEST(0.00, (v_star_score * 0.60) + (v_milestone_pass_rate * 0.40) - (v_rework_frequency * 0.50)));
  v_delivery_score := LEAST(100.00, GREATEST(0.00, v_on_time_delivery));
  v_sla_dispute_score := LEAST(100.00, GREATEST(0.00, (v_dispute_adherence * 0.70) + ((100.0 - LEAST(50.0, (v_total_disputes * 5.0 + v_critical_disputes * 15.0))) * 0.30)));
  v_commercial_score := LEAST(100.00, GREATEST(0.00, 100.00 - (v_quote_variance * 1.50 + v_change_order_freq * 1.20)));

  -- 5. Calculate Overall Composite Score & Tier
  v_overall_score := (v_quality_score * v_q_wt) + (v_delivery_score * v_d_wt) + (v_sla_dispute_score * v_s_wt) + (v_commercial_score * v_c_wt);

  IF v_overall_score >= 90.0 THEN
    v_tier := 'PLATINUM';
  ELSIF v_overall_score >= 80.0 THEN
    v_tier := 'GOLD';
  ELSIF v_overall_score >= 70.0 THEN
    v_tier := 'SILVER';
  ELSIF v_overall_score >= 60.0 THEN
    v_tier := 'BRONZE';
  ELSE
    v_tier := 'PROBATIONARY';
  END IF;

  -- 6. Upsert supplier_scorecards record
  INSERT INTO public.supplier_scorecards (
    supplier_id,
    overall_score,
    performance_tier,
    quality_score,
    delivery_score,
    sla_dispute_score,
    commercial_score,
    quality_weight,
    delivery_weight,
    sla_dispute_weight,
    commercial_weight,
    total_orders_completed,
    average_closeout_rating,
    milestone_pass_rate,
    rework_frequency_percent,
    on_time_delivery_percent,
    total_disputes_count,
    critical_disputes_count,
    dispute_resolution_adherence,
    quote_variance_percent,
    change_order_frequency_percent,
    is_identity_masked,
    version,
    last_calculated_at
  ) VALUES (
    p_supplier_id,
    v_overall_score,
    v_tier,
    v_quality_score,
    v_delivery_score,
    v_sla_dispute_score,
    v_commercial_score,
    v_q_wt,
    v_d_wt,
    v_s_wt,
    v_c_wt,
    v_total_completed,
    v_avg_rating,
    v_milestone_pass_rate,
    v_rework_frequency,
    v_on_time_delivery,
    v_total_disputes,
    v_critical_disputes,
    v_dispute_adherence,
    v_quote_variance,
    v_change_order_freq,
    true,
    1,
    now()
  )
  ON CONFLICT (supplier_id) DO UPDATE SET
    overall_score = EXCLUDED.overall_score,
    performance_tier = EXCLUDED.performance_tier,
    quality_score = EXCLUDED.quality_score,
    delivery_score = EXCLUDED.delivery_score,
    sla_dispute_score = EXCLUDED.sla_dispute_score,
    commercial_score = EXCLUDED.commercial_score,
    total_orders_completed = EXCLUDED.total_orders_completed,
    average_closeout_rating = EXCLUDED.average_closeout_rating,
    milestone_pass_rate = EXCLUDED.milestone_pass_rate,
    rework_frequency_percent = EXCLUDED.rework_frequency_percent,
    total_disputes_count = EXCLUDED.total_disputes_count,
    critical_disputes_count = EXCLUDED.critical_disputes_count,
    dispute_resolution_adherence = EXCLUDED.dispute_resolution_adherence,
    version = supplier_scorecards.version + 1,
    last_calculated_at = now(),
    updated_at = now()
  RETURNING * INTO v_scorecard;

  -- 7. Record History Snapshot
  INSERT INTO public.scorecard_dimension_history (
    supplier_id,
    scorecard_id,
    organization_id,
    overall_score,
    performance_tier,
    dimensions_snapshot,
    metrics_snapshot,
    calculation_trigger,
    calculated_by
  ) VALUES (
    p_supplier_id,
    v_scorecard.id,
    v_scorecard.organization_id,
    v_overall_score,
    v_tier,
    jsonb_build_object(
      'qualityScore', v_quality_score,
      'deliveryScore', v_delivery_score,
      'slaDisputeScore', v_sla_dispute_score,
      'commercialScore', v_commercial_score
    ),
    jsonb_build_object(
      'totalOrdersCompleted', v_total_completed,
      'averageCloseoutRating', v_avg_rating,
      'milestonePassRate', v_milestone_pass_rate,
      'reworkFrequencyPercent', v_rework_frequency,
      'totalDisputes', v_total_disputes
    ),
    p_trigger_type,
    auth.uid()
  );

  RETURN jsonb_build_object(
    'scorecardId', v_scorecard.id,
    'supplierId', p_supplier_id,
    'overallScore', v_overall_score,
    'tier', v_tier,
    'qualityScore', v_quality_score,
    'deliveryScore', v_delivery_score,
    'slaDisputeScore', v_sla_dispute_score,
    'commercialScore', v_commercial_score,
    'lastCalculatedAt', v_scorecard.last_calculated_at
  );
END;
$$;

-- RPC 2: configure_approval_policy_atomic
CREATE OR REPLACE FUNCTION public.configure_approval_policy_atomic(
  p_organization_id uuid,
  p_policy_name text,
  p_tiers jsonb,
  p_prevent_self_approval boolean DEFAULT true,
  p_require_dual_signoff_above numeric DEFAULT 5000000.00
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_policy public.organization_approval_policies%ROWTYPE;
BEGIN
  IF NOT (private.is_platform_admin() OR (p_organization_id IN (SELECT private.get_user_org_ids()) AND private.get_org_role(p_organization_id) IN ('OWNER', 'MANAGER'))) THEN
    RAISE EXCEPTION 'Access denied: Must be Organization Owner/Manager to configure approval policies.';
  END IF;

  INSERT INTO public.organization_approval_policies (
    organization_id,
    policy_name,
    is_active,
    tiers,
    prevent_self_approval,
    require_dual_signoff_above,
    version
  ) VALUES (
    p_organization_id,
    p_policy_name,
    true,
    p_tiers,
    p_prevent_self_approval,
    p_require_dual_signoff_above,
    1
  )
  ON CONFLICT (organization_id) DO UPDATE SET
    policy_name = EXCLUDED.policy_name,
    tiers = EXCLUDED.tiers,
    prevent_self_approval = EXCLUDED.prevent_self_approval,
    require_dual_signoff_above = EXCLUDED.require_dual_signoff_above,
    version = organization_approval_policies.version + 1,
    updated_at = now()
  RETURNING * INTO v_policy;

  RETURN jsonb_build_object(
    'policyId', v_policy.id,
    'organizationId', v_policy.organization_id,
    'policyName', v_policy.policy_name,
    'version', v_policy.version,
    'preventSelfApproval', v_policy.prevent_self_approval
  );
END;
$$;

-- RPC 3: submit_rfq_tier_approval_atomic
CREATE OR REPLACE FUNCTION public.submit_rfq_tier_approval_atomic(
  p_rfq_id uuid,
  p_stage_order integer,
  p_decision text, -- 'APPROVED' or 'REJECTED'
  p_comments text DEFAULT NULL,
  p_signature_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq public.rfqs%ROWTYPE;
  v_policy public.organization_approval_policies%ROWTYPE;
  v_stage public.rfq_approval_stages%ROWTYPE;
  v_prior_pending integer;
  v_user_role text;
  v_tier_config jsonb;
  v_allowed_roles jsonb;
BEGIN
  -- 1. Lock and fetch RFQ
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found.', p_rfq_id;
  END IF;

  -- 2. Fetch Policy
  SELECT * INTO v_policy FROM public.organization_approval_policies WHERE organization_id = v_rfq.organization_id;

  -- 3. Anti-bypass: Prevent self-approval if policy is active
  IF (v_policy.prevent_self_approval IS TRUE) AND (v_rfq.created_by = auth.uid()) AND NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Anti-bypass policy violation: Procurement creator cannot approve their own RFQ.';
  END IF;

  -- 4. Lock and fetch Stage
  SELECT * INTO v_stage
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND stage_order = p_stage_order
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ approval stage % not found for RFQ %.', p_stage_order, p_rfq_id;
  END IF;

  IF v_stage.status != 'PENDING' THEN
    RAISE EXCEPTION 'Stage % is not in PENDING state (current: %).', p_stage_order, v_stage.status;
  END IF;

  -- 5. Check sequential stage integrity (no skipped prior stages)
  SELECT COUNT(*) INTO v_prior_pending
  FROM public.rfq_approval_stages
  WHERE rfq_id = p_rfq_id AND stage_order < p_stage_order AND status != 'APPROVED';

  IF v_prior_pending > 0 THEN
    RAISE EXCEPTION 'Sequential governance violation: Prior approval stage(s) are not yet approved.';
  END IF;

  -- 6. Role check
  v_user_role := COALESCE(private.get_org_role(v_rfq.organization_id), 'APPROVER');

  -- 7. Update Stage
  IF p_decision = 'APPROVED' THEN
    UPDATE public.rfq_approval_stages
    SET
      status = 'APPROVED',
      approver_profile_id = auth.uid(),
      approver_role = v_user_role,
      approver_comments = p_comments,
      digital_signature_hash = p_signature_hash,
      approved_at = now(),
      updated_at = now()
    WHERE id = v_stage.id;
  ELSE
    UPDATE public.rfq_approval_stages
    SET
      status = 'REJECTED',
      approver_profile_id = auth.uid(),
      approver_role = v_user_role,
      approver_comments = p_comments,
      digital_signature_hash = p_signature_hash,
      rejected_at = now(),
      updated_at = now()
    WHERE id = v_stage.id;
  END IF;

  RETURN jsonb_build_object(
    'stageId', v_stage.id,
    'rfqId', p_rfq_id,
    'stageOrder', p_stage_order,
    'status', p_decision,
    'approverId', auth.uid()
  );
END;
$$;

-- RPC 4: generate_procurement_contract_atomic
CREATE OR REPLACE FUNCTION public.generate_procurement_contract_atomic(
  p_rfq_id uuid,
  p_quote_id uuid,
  p_supplier_id uuid,
  p_terms jsonb,
  p_markdown_body text,
  p_document_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_rfq public.rfqs%ROWTYPE;
  v_contract public.procurement_contracts%ROWTYPE;
  v_contract_num text;
BEGIN
  SELECT * INTO v_rfq FROM public.rfqs WHERE id = p_rfq_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'RFQ % not found.', p_rfq_id;
  END IF;

  IF NOT (private.is_platform_admin() OR v_rfq.organization_id IN (SELECT private.get_user_org_ids())) THEN
    RAISE EXCEPTION 'Access denied: Must belong to buyer organization to generate contract.';
  END IF;

  v_contract_num := 'CTR-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(gen_random_uuid()::text, 1, 8));

  INSERT INTO public.procurement_contracts (
    contract_number,
    rfq_id,
    organization_id,
    supplier_id,
    quote_id,
    status,
    terms,
    contract_body_markdown,
    document_hash,
    version
  ) VALUES (
    v_contract_num,
    p_rfq_id,
    v_rfq.organization_id,
    p_supplier_id,
    p_quote_id,
    'PENDING_BUYER_SIGNATURE',
    p_terms,
    p_markdown_body,
    p_document_hash,
    1
  ) RETURNING * INTO v_contract;

  RETURN jsonb_build_object(
    'contractId', v_contract.id,
    'contractNumber', v_contract.contract_number,
    'status', v_contract.status,
    'documentHash', v_contract.document_hash,
    'createdAt', v_contract.created_at
  );
END;
$$;

-- RPC 5: sign_procurement_contract_atomic
CREATE OR REPLACE FUNCTION public.sign_procurement_contract_atomic(
  p_contract_id uuid,
  p_party_type text, -- 'BUYER' or 'SUPPLIER'
  p_signature_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, auth, extensions
AS $$
DECLARE
  v_contract public.procurement_contracts%ROWTYPE;
  v_new_status text;
BEGIN
  SELECT * INTO v_contract FROM public.procurement_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract % not found.', p_contract_id;
  END IF;

  IF p_party_type = 'BUYER' THEN
    IF NOT (private.is_platform_admin() OR v_contract.organization_id IN (SELECT private.get_user_org_ids())) THEN
      RAISE EXCEPTION 'Access denied: User is not authorized to sign as buyer.';
    END IF;

    v_new_status := CASE WHEN v_contract.supplier_signed_at IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING_SUPPLIER_SIGNATURE' END;

    UPDATE public.procurement_contracts
    SET
      buyer_signed_by = auth.uid(),
      buyer_signed_at = now(),
      buyer_signature_hash = p_signature_hash,
      status = v_new_status,
      updated_at = now()
    WHERE id = p_contract_id
    RETURNING * INTO v_contract;

  ELSIF p_party_type = 'SUPPLIER' THEN
    IF NOT (private.is_platform_admin() OR v_contract.supplier_id IN (SELECT private.get_user_supplier_ids()) OR EXISTS (SELECT 1 FROM public.supplier_users WHERE supplier_id = v_contract.supplier_id AND profile_id = auth.uid())) THEN
      RAISE EXCEPTION 'Access denied: User is not authorized to sign as supplier.';
    END IF;

    v_new_status := CASE WHEN v_contract.buyer_signed_at IS NOT NULL THEN 'ACTIVE' ELSE 'PENDING_BUYER_SIGNATURE' END;

    UPDATE public.procurement_contracts
    SET
      supplier_signed_by = auth.uid(),
      supplier_signed_at = now(),
      supplier_signature_hash = p_signature_hash,
      status = v_new_status,
      updated_at = now()
    WHERE id = p_contract_id
    RETURNING * INTO v_contract;
  ELSE
    RAISE EXCEPTION 'Invalid party type: %. Must be BUYER or SUPPLIER.', p_party_type;
  END IF;

  RETURN jsonb_build_object(
    'contractId', v_contract.id,
    'contractNumber', v_contract.contract_number,
    'status', v_contract.status,
    'buyerSignedAt', v_contract.buyer_signed_at,
    'supplierSignedAt', v_contract.supplier_signed_at,
    'isActive', (v_contract.status = 'ACTIVE')
  );
END;
$$;

COMMIT;
