import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';

export interface RequirementRfqContext {
  requirementId: string;
  requirementTitle: string;
  requirementStatus: string;
  rfqId: string | null;
  rfqStatus: string | null;
  invitationCount: number;
}

export async function fetchRequirementRfqContext(requirementId: string): Promise<
  { ok: true; context: RequirementRfqContext } | { ok: false; error: string }
> {
  const { data: req, error: reqErr } = await supabase
    .from('requirements')
    .select('id, title, status')
    .eq('id', requirementId)
    .maybeSingle();

  if (reqErr) return { ok: false, error: reqErr.message };
  if (!req) return { ok: false, error: 'Requirement not found' };

  const { data: rfq } = await supabase
    .from('rfqs')
    .select('id, status')
    .eq('requirement_id', requirementId)
    .maybeSingle();

  const invitationCount = rfq?.id ? await fetchInvitationCount(rfq.id) : 0;

  return {
    ok: true,
    context: {
      requirementId: req.id,
      requirementTitle: req.title,
      requirementStatus: req.status,
      rfqId: rfq?.id ?? null,
      rfqStatus: rfq?.status ?? null,
      invitationCount,
    },
  };
}

async function fetchMinQuotesRequired(organizationId: string): Promise<number> {
  const { data } = await supabase
    .from('approval_policies')
    .select('threshold')
    .eq('organization_id', organizationId)
    .eq('is_default', true)
    .maybeSingle();

  const threshold = (data?.threshold ?? {}) as { minQuotesRequired?: number };
  return threshold.minQuotesRequired ?? 3;
}

export async function ensureRfqForRequirement(requirementId: string): Promise<
  { ok: true; rfqId: string; created: boolean } | { ok: false; error: string }
> {
  const profile = await fetchCurrentProfile();
  if (!profile) return { ok: false, error: 'Not authenticated' };

  const { data: req, error: reqErr } = await supabase
    .from('requirements')
    .select('id, title, organization_id, status')
    .eq('id', requirementId)
    .maybeSingle();

  if (reqErr || !req) return { ok: false, error: reqErr?.message ?? 'Requirement not found' };

  const { data: existing } = await supabase
    .from('rfqs')
    .select('id')
    .eq('requirement_id', requirementId)
    .maybeSingle();

  if (existing) return { ok: true, rfqId: existing.id, created: false };

  const minQuotes = await fetchMinQuotesRequired(req.organization_id);
  const quoteDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const evaluationDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .insert({
      requirement_id: requirementId,
      organization_id: req.organization_id,
      status: 'DRAFT',
      reveal_status: 'PROTECTED',
      title: `RFQ: ${req.title}`,
      quote_deadline: quoteDeadline,
      evaluation_deadline: evaluationDeadline,
      buyer_anonymous_to_suppliers: true,
      min_quotes_required: minQuotes,
      created_by: profile.profileId,
    })
    .select('id')
    .single();

  if (rfqErr) return { ok: false, error: rfqErr.message };

  if (req.status === 'SUBMITTED' || req.status === 'DRAFT') {
    await supabase
      .from('requirements')
      .update({ status: 'RFQ_CREATED', updated_at: new Date().toISOString() })
      .eq('id', requirementId);
  }

  return { ok: true, rfqId: rfq.id, created: true };
}

export async function discoverAndInvite(rfqId: string): Promise<
  { ok: true; invited: number; total: number } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('discover_and_invite_for_rfq', {
    p_rfq_id: rfqId,
  });

  if (error) return { ok: false, error: error.message };

  const result = data as { invited?: number; total?: number };
  return {
    ok: true,
    invited: result.invited ?? 0,
    total: result.total ?? 0,
  };
}

export async function fetchInvitationCount(rfqId: string): Promise<number> {
  const { data } = await supabase
    .from('rfq_supplier_networks')
    .select('invited_count')
    .eq('rfq_id', rfqId);

  return (data ?? []).reduce((sum, row) => sum + row.invited_count, 0);
}

export type DirectInviteKind = 'PHONE' | 'EMAIL';

/**
 * Invite a supplier the buyer already knows by phone or email.
 *
 * The RPC is idempotent by (rfqId, kind, value): a repeat submission for the
 * same contact returns `reused: true` and does not create a second invitation.
 */
export async function inviteDirectSupplier(
  rfqId: string,
  kind: DirectInviteKind,
  value: string,
): Promise<
  { ok: true; reused: boolean } | { ok: false; error: string }
> {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, error: 'A phone number or email is required' };
  }

  const { data, error } = await supabase.rpc('invite_direct_supplier', {
    p_rfq_id: rfqId,
    p_contact_kind: kind,
    p_contact_value: trimmed,
  });

  if (error) return { ok: false, error: error.message };

  const result = (data ?? {}) as { ok?: boolean; reused?: boolean };
  return { ok: true, reused: Boolean(result.reused) };
}

export async function openRfq(rfqId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .select('id, status, requirement_id')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqErr || !rfq) return { ok: false, error: rfqErr?.message ?? 'RFQ not found' };
  if (rfq.status !== 'DRAFT') {
    return { ok: false, error: `Cannot open RFQ from status ${rfq.status}` };
  }

  const invitationCount = await fetchInvitationCount(rfqId);
  if (invitationCount < 1) {
    return { ok: false, error: 'Run supplier discovery before opening the RFQ' };
  }

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from('rfqs')
    .update({ status: 'OPEN', updated_at: now })
    .eq('id', rfqId);

  if (updateErr) return { ok: false, error: updateErr.message };

  await supabase
    .from('requirements')
    .update({ status: 'QUOTING', updated_at: now })
    .eq('id', rfq.requirement_id);

  return { ok: true };
}
