import { supabase } from '@/lib/supabase';
import type { ProcurementPolicyRules, SupplierNetworkSummary } from '@otp/domain';
import { networkLabel } from '../lib/network-labels';

interface ThresholdJson {
  type?: string;
  minVotes?: number;
  minQuotesRequired?: number;
  requestRoles?: string[];
  approveRoles?: string[];
  awardRoles?: string[];
  evaluationWeights?: { price: number; delivery: number; warranty: number };
  committeeVoteRequired?: boolean;
  conflictDeclarationRequired?: boolean;
  awardRequiresJustification?: boolean;
}

export async function fetchSupplierNetworkSummary(rfqId: string): Promise<
  { ok: true; networks: SupplierNetworkSummary[]; totalInvited: number } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfq_supplier_networks')
    .select('network, invited_count, quoted_count')
    .eq('rfq_id', rfqId);

  if (error) return { ok: false, error: error.message };

  const networks: SupplierNetworkSummary[] = (data ?? []).map((row) => {
    const network = row.network as SupplierNetworkSummary['network'];
    return {
      network,
      label: networkLabel(network),
      invitedCount: row.invited_count,
      quotedCount: row.quoted_count,
    };
  });

  return {
    ok: true,
    networks: networks.sort((a, b) => b.invitedCount - a.invitedCount),
    totalInvited: networks.reduce((sum, n) => sum + n.invitedCount, 0),
  };
}

export async function fetchProcurementPolicy(rfqId: string): Promise<
  { ok: true; policy: ProcurementPolicyRules; policyType: string } | { ok: false; error: string }
> {
  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .select('organization_id, min_quotes_required')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqErr) return { ok: false, error: rfqErr.message };
  if (!rfq) return { ok: false, error: 'RFQ not found' };

  const { data: policyRow } = await supabase
    .from('approval_policies')
    .select('policy_type, threshold')
    .eq('organization_id', rfq.organization_id)
    .eq('is_default', true)
    .maybeSingle();

  // Fetch organization type for smart fallback
  const { data: orgData } = await supabase
    .from('organizations')
    .select('org_type')
    .eq('id', rfq.organization_id)
    .maybeSingle();

  const orgType = orgData?.org_type ?? 'INDIVIDUAL';
  const threshold = (policyRow?.threshold ?? {}) as ThresholdJson;
  const isIndividual = orgType === 'INDIVIDUAL' || threshold.type === 'individual_direct';
  const isCommunity = orgType === 'COMMUNITY' || policyRow?.policy_type === 'COMMUNITY_SIMPLE_MAJORITY';

  const policyType =
    policyRow?.policy_type ??
    (isCommunity
      ? 'COMMUNITY_SIMPLE_MAJORITY'
      : isIndividual
        ? 'INDIVIDUAL_DIRECT'
        : 'MANAGER_ONLY');

  const policy: ProcurementPolicyRules = {
    policyType,
    minQuotesRequired: threshold.minQuotesRequired ?? rfq.min_quotes_required ?? (isIndividual ? 2 : 3),
    minCommitteeVotes: isCommunity ? (threshold.minVotes ?? 2) : 1,
    requestRoles: threshold.requestRoles ?? (isCommunity ? ['BUYER', 'MANAGER'] : ['BUYER', 'OWNER']),
    approveRoles: threshold.approveRoles ?? (isCommunity ? ['COMMITTEE_MEMBER', 'MANAGER', 'OWNER'] : ['BUYER', 'OWNER']),
    awardRoles: threshold.awardRoles ?? (isCommunity ? ['MANAGER', 'OWNER'] : ['BUYER', 'OWNER']),
    evaluationWeights: threshold.evaluationWeights ?? { price: 40, delivery: 30, warranty: 30 },
    committeeVoteRequired: threshold.committeeVoteRequired ?? isCommunity,
    conflictDeclarationRequired: threshold.conflictDeclarationRequired ?? isCommunity,
    awardRequiresJustification: threshold.awardRequiresJustification ?? !isIndividual,
  };

  return { ok: true, policy, policyType };
}

export interface RfqCriterionWeight {
  code: string;
  name: string;
  percent: number;
}

/**
 * The weights that will actually decide this RFQ.
 *
 * The organisation's policy carries a default set, but criteria are chosen per
 * requirement, so a screen that shows the default beside a table scored on
 * something else is worse than showing nothing.
 */
export async function fetchRfqEvaluationWeights(rfqId: string): Promise<
  { ok: true; weights: RfqCriterionWeight[] } | { ok: false; error: string }
> {
  const [{ data: rfq, error: rfqErr }, { data: criteria, error: critErr }] =
    await Promise.all([
      supabase.from('rfqs').select('evaluation_weights').eq('id', rfqId).maybeSingle(),
      supabase.from('evaluation_criteria').select('code, name, sort_order'),
    ]);

  if (rfqErr) return { ok: false, error: rfqErr.message };
  if (critErr) return { ok: false, error: critErr.message };
  if (!rfq) return { ok: false, error: 'RFQ not found' };

  const nameFor = new Map(
    ((criteria ?? []) as { code: string; name: string }[]).map((c) => [c.code, c.name]),
  );

  const stored = (rfq.evaluation_weights ?? {}) as Record<string, number>;
  const weights = Object.entries(stored)
    .map(([code, percent]) => ({
      code,
      name: nameFor.get(code) ?? code,
      percent: Number(percent),
    }))
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));

  return { ok: true, weights };
}
