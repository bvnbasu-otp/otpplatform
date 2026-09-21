import { supabase } from '@/lib/supabase';
import type {
  ApprovalInstanceStatus,
  RfqApprovalStage,
  OrganizationDelegation,
  ApprovalExecutionResult,
} from '@otp/domain';

export interface ApprovalSummary {
  id: string;
  rfqId: string;
  policyId: string;
  status: ApprovalInstanceStatus;
  requestedAt: string;
  resolvedAt: string | null;
}

interface ApprovalRow {
  id: string;
  rfq_id: string;
  policy_id: string;
  status: ApprovalInstanceStatus;
  requested_at: string;
  resolved_at: string | null;
}

function mapApproval(row: ApprovalRow): ApprovalSummary {
  return {
    id: row.id,
    rfqId: row.rfq_id,
    policyId: row.policy_id,
    status: row.status,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
  };
}

export async function fetchApproval(rfqId: string): Promise<
  { ok: true; approval: ApprovalSummary | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('approval_instances')
    .select('id, rfq_id, policy_id, status, requested_at, resolved_at')
    .eq('rfq_id', rfqId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, approval: null };
  return { ok: true, approval: mapApproval(data as ApprovalRow) };
}

export async function fetchRfqApprovalStages(rfqId: string): Promise<
  { ok: true; stages: RfqApprovalStage[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfq_approval_stages')
    .select('*')
    .eq('rfq_id', rfqId)
    .order('stage_order', { ascending: true });

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, stages: [] };

  const stages: RfqApprovalStage[] = (data as any[]).map((row) => ({
    id: row.id,
    rfqId: row.rfq_id,
    organizationId: row.organization_id,
    tierLevel: row.tier_level,
    stageOrder: row.stage_order,
    status: row.status,
    thresholdMinAmount: Number(row.threshold_min_amount || 0),
    thresholdMaxAmount: row.threshold_max_amount != null ? Number(row.threshold_max_amount) : null,
    procurementAmount: Number(row.procurement_amount || 0),
    approverProfileId: row.approver_profile_id,
    approverRole: row.approver_role,
    approverComments: row.approver_comments || row.notes,
    digitalSignatureHash: row.digital_signature_hash,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { ok: true, stages };
}

export async function fetchUserActiveDelegations(organizationId: string): Promise<
  { ok: true; delegations: OrganizationDelegation[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('organization_delegations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, delegations: [] };

  const delegations: OrganizationDelegation[] = (data as any[]).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    delegatorId: row.delegator_id,
    delegateeId: row.delegatee_id,
    permissions: row.permissions || [],
    spendCapAmount: row.spend_cap_amount != null ? Number(row.spend_cap_amount) : null,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    revokedAt: row.revoked_at,
    notes: row.notes,
    createdAt: row.created_at,
  }));

  return { ok: true, delegations };
}

export async function submitTierApprovalAtomic(params: {
  rfqId: string;
  tierLevel: string;
  notes?: string;
  delegationId?: string;
}): Promise<{ ok: true; result: ApprovalExecutionResult } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('submit_rfq_tier_approval_atomic', {
    p_rfq_id: params.rfqId,
    p_tier_level: params.tierLevel,
    p_notes: params.notes || null,
    p_delegation_id: params.delegationId || null,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, result: data as ApprovalExecutionResult };
}

export async function requestApproval(rfqId: string): Promise<
  { ok: true; approvalId: string } | { ok: false; error: string }
> {
  const { data: rfq } = await supabase
    .from('rfqs')
    .select('organization_id')
    .eq('id', rfqId)
    .maybeSingle();

  if (!rfq) return { ok: false, error: 'RFQ not found' };

  const { data: policy } = await supabase
    .from('approval_policies')
    .select('id')
    .eq('organization_id', rfq.organization_id)
    .eq('is_default', true)
    .maybeSingle();

  if (!policy) return { ok: false, error: 'No default approval policy' };

  const { data, error } = await supabase
    .from('approval_instances')
    .insert({
      rfq_id: rfqId,
      policy_id: policy.id,
      status: 'PENDING',
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, approvalId: data.id };
}

export async function approve(approvalId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { error } = await supabase
    .from('approval_instances')
    .update({
      status: 'APPROVED',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', approvalId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
