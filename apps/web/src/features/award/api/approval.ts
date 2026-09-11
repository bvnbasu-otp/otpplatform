import { supabase } from '@/lib/supabase';
import type { ApprovalInstanceStatus } from '@otp/domain';

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
