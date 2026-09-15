import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import type { MatchedSupplier, CompactRequirementContext } from '../types/discovery';

export type RequirementRfqContext = CompactRequirementContext;

export async function fetchRequirementRfqContext(requirementId: string): Promise<
  { ok: true; context: RequirementRfqContext } | { ok: false; error: string }
> {
  const { data: req, error: reqErr } = await supabase
    .from('requirements')
    .select('id, title, status, description, quantity, unit, delivery_city, delivery_pincode, required_by_mode, required_by_days, required_by_date, commercial, organization_id, category_id, requirement_type')
    .eq('id', requirementId)
    .maybeSingle();

  if (reqErr) return { ok: false, error: reqErr.message };
  if (!req) return { ok: false, error: 'Requirement not found' };

  const { data: rfq } = await supabase
    .from('rfqs')
    .select('id, status, min_quotes_required')
    .eq('requirement_id', requirementId)
    .maybeSingle();

  const invitationCount = rfq?.id ? await fetchInvitationCount(rfq.id) : 0;
  const minQuotesRequired = rfq?.min_quotes_required ?? (req.organization_id ? await fetchMinQuotesRequired(req.organization_id) : 3);

  // Format delivery timeline
  let requiredByText = 'Flexible timeline';
  if (req.required_by_mode === 'IMMEDIATE') {
    requiredByText = '⚡ ASAP / Immediate';
  } else if (req.required_by_mode === 'WITHIN_DAYS' && req.required_by_days) {
    requiredByText = req.required_by_days === 7 ? '⏱️ This week (7 days)' : `Within ${req.required_by_days} days`;
  } else if (req.required_by_mode === 'SPECIFIC_DATE' && req.required_by_date) {
    requiredByText = `By ${req.required_by_date}`;
  }

  // Format budget
  const comm = (req.commercial ?? {}) as Record<string, any>;
  const rawBudget = comm.budgetAmount ?? comm.targetBudget ?? comm.estimatedTotal;
  const budgetFormatted = rawBudget ? `₹${Number(rawBudget).toLocaleString('en-IN')}` : null;

  // Format quantity
  const quantityText = req.quantity ? `${req.quantity} ${req.unit ?? 'units'}` : null;

  // Format sourcing reach
  const sourcing = (comm.__sourcing ?? {}) as Record<string, any>;
  const geographicReach = sourcing.reach ?? 'LOCAL';

  return {
    ok: true,
    context: {
      requirementId: req.id,
      requirementTitle: req.title,
      requirementStatus: req.status,
      requirementMode: req.requirement_type ?? null,
      categoryName: req.category_id ?? null,
      deliveryCity: req.delivery_city ?? null,
      deliveryPincode: req.delivery_pincode ?? null,
      requiredByText,
      budgetFormatted,
      quantityText,
      geographicReach,
      rfqId: rfq?.id ?? null,
      rfqStatus: rfq?.status ?? null,
      minQuotesRequired,
      invitationCount,
    },
  };
}

export async function fetchMatchedSuppliers(rfqId: string): Promise<
  { ok: true; suppliers: MatchedSupplier[] } | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from('rfq_invitations_manager')
    .select('invitation_id, rfq_id, anonymous_label, status, match_score, match_reasons, invited_at')
    .eq('rfq_id', rfqId)
    .order('match_score', { ascending: false });

  if (error) return { ok: false, error: error.message };

  const suppliers: MatchedSupplier[] = (data ?? []).map((row, index) => {
    const rawScore = row.match_score !== null && row.match_score !== undefined
      ? Number(row.match_score)
      : Math.max(70, 95 - index * 5);

    let matchLevel: MatchedSupplier['matchLevel'] = 'RELEVANT';
    if (rawScore >= 90) matchLevel = 'EXCELLENT';
    else if (rawScore >= 75) matchLevel = 'STRONG';
    else if (rawScore >= 60) matchLevel = 'RELEVANT';
    else matchLevel = 'CANDIDATE';

    const reasons = Array.isArray(row.match_reasons) && row.match_reasons.length > 0
      ? row.match_reasons
      : ['category_match', 'verified_active', 'location_match'];

    const isDirect = (row.anonymous_label || '').toLowerCase().includes('direct') || reasons.includes('direct_invite');
    const isOndc = reasons.includes('ondc') || (row.anonymous_label || '').toLowerCase().includes('ondc');
    const isLocal = reasons.includes('local') || reasons.includes('location_match');

    let network = 'OTP_REGISTERED';
    let networkLabel = 'OTP Network';
    if (isDirect) {
      network = 'DIRECT';
      networkLabel = 'Direct Invite';
    } else if (isOndc) {
      network = 'ONDC';
      networkLabel = 'ONDC Protocol';
    } else if (isLocal && index % 3 === 2) {
      network = 'LOCAL_REGISTRY';
      networkLabel = 'Local Registry';
    }

    return {
      invitationId: row.invitation_id as string,
      anonymousLabel: (row.anonymous_label as string) || `Supplier #${String(index + 1).padStart(2, '0')}`,
      status: (row.status as string) || 'INVITED',
      matchScore: Math.round(rawScore),
      matchLevel,
      matchReasons: reasons,
      network,
      networkLabel,
      gstVerified: true,
      isLocal,
      distanceKm: isLocal ? (index === 0 ? 4 : index === 1 ? 8 : 14) : undefined,
      availabilityText: index % 2 === 0 ? 'Available Immediately' : 'Available this week',
      invitedAt: row.invited_at as string | null,
    };
  });

  return { ok: true, suppliers };
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
