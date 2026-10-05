import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import type { MatchedSupplier, CompactRequirementContext } from '../types/discovery';
import type {
  RfqReviewData,
  RfqValidationChecklistItem,
  BroadcastReadinessState,
} from '../types/rfq-review';
import { fetchRequirementAttachments } from '@/features/attachments/api/attachments';
import { fetchProcurementPolicy } from '@/features/procurement-os/api/fetch-procurement-os';
import { formatDateIST } from '@/lib/date-utils';
import {
  classifyCoverageResponse,
  discoveryRequirementIssues,
  type DiscoveryNetwork,
  type DiscoverySourceOutcome,
} from '../lib/discovery-source';

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
    .select('invitation_id, rfq_id, anonymous_label, status, match_score, match_reasons, invited_at, viewed_at, declined_at, decline_reason')
    .eq('rfq_id', rfqId)
    .order('match_score', { ascending: false });

  if (error) return { ok: false, error: error.message };

  const suppliers: MatchedSupplier[] = (data ?? []).map((row, index) => {
    const rawScore = row.match_score !== null && row.match_score !== undefined
      ? Number(row.match_score)
      : null;

    let matchLevel: MatchedSupplier['matchLevel'] = 'CANDIDATE';
    if (rawScore !== null) {
      if (rawScore >= 90) matchLevel = 'EXCELLENT';
      else if (rawScore >= 75) matchLevel = 'STRONG';
      else if (rawScore >= 60) matchLevel = 'RELEVANT';
      else matchLevel = 'CANDIDATE';
    }

    const reasons = Array.isArray(row.match_reasons) ? (row.match_reasons as string[]) : [];
    const isDirect = reasons.includes('direct_invite');
    const isPlacesDiscovery = reasons.includes('discovered_in_area') || reasons.includes('pin_coverage');
    const isGstVerified = reasons.includes('gst_verified');
    // Stamped only when supplier_discovery_trust_tier found a real OTP login.
    const isOtpRegistered = reasons.includes('otp_registered') || isGstVerified;
    const isLocal = reasons.includes('local') || reasons.includes('location_match') || isPlacesDiscovery;

    let network = 'DISCOVERED_IN_AREA';
    let networkLabel = 'Discovered in area';
    if (isDirect) {
      network = 'DIRECT';
      networkLabel = 'Direct invite';
    } else if (isPlacesDiscovery && isOtpRegistered) {
      network = 'GOOGLE_PLACES';
      networkLabel = 'Google Places and OTP registered';
    } else if (isPlacesDiscovery) {
      // A geographic hit is not an OTP registration or a verification.
      network = 'GOOGLE_PLACES';
      networkLabel = 'Discovered in area';
    } else if (isGstVerified) {
      network = 'OTP_REGISTERED';
      networkLabel = 'GST verified supplier';
    } else if (isOtpRegistered) {
      network = 'OTP_REGISTERED';
      networkLabel = 'OTP registered supplier';
    }

    return {
      invitationId: row.invitation_id as string,
      anonymousLabel: (row.anonymous_label as string) || `Supplier #${String(index + 1).padStart(2, '0')}`,
      status: (row.status as string) || 'INVITED',
      matchScore: rawScore !== null ? Math.round(rawScore) : 0,
      matchLevel,
      matchReasons: reasons,
      network,
      networkLabel,
      gstVerified: isGstVerified,
      isLocal,
      distanceKm: undefined,
      availabilityText: 'Availability not confirmed before quote',
      invitedAt: (row.invited_at as string) || null,
      viewedAt: (row.viewed_at as string) || null,
      declinedAt: (row.declined_at as string) || null,
      declineReason: (row.decline_reason as string) || null,
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

export interface DiscoveryInviteResult {
  ok: true;
  invited: number;
  total: number;
  outcome: string | null;
  quotingOpened: boolean;
  googlePlacesInvited: number;
  otpRegisteredInvited: number;
}

function readInvitePayload(data: unknown): DiscoveryInviteResult {
  const result = (data ?? {}) as {
    invited?: number;
    total?: number;
    outcome?: string;
    quoting_opened?: boolean;
    google_places_invited?: number;
    otp_registered_invited?: number;
    success?: boolean;
  };
  return {
    ok: true,
    invited: result.invited ?? 0,
    total: result.total ?? 0,
    outcome: result.outcome ?? null,
    quotingOpened: Boolean(result.quoting_opened),
    googlePlacesInvited: result.google_places_invited ?? 0,
    otpRegisteredInvited: result.otp_registered_invited ?? 0,
  };
}

export async function discoverAndInvite(
  rfqId: string,
  network: DiscoveryNetwork = 'GOOGLE_PLACES',
): Promise<DiscoveryInviteResult | { ok: false; error: string; outcome?: DiscoverySourceOutcome }> {
  const args: { p_rfq_id: string; p_network?: DiscoveryNetwork } = { p_rfq_id: rfqId };
  // The deployed function accepts p_rfq_id alone. p_network is sent only for the
  // explicit OTP search, which exists after 00232. The default remains Google Places.
  if (network === 'OTP_REGISTERED') args.p_network = 'OTP_REGISTERED';
  const res = await supabase.rpc('discover_and_invite_for_rfq', args);

  if (!res || res.error) return { ok: false, error: res?.error?.message ?? 'Unknown RPC error' };
  const payload = readInvitePayload(res.data);
  if (payload.outcome === 'INVALID_REQUIREMENT') {
    return {
      ok: false,
      outcome: 'INVALID_REQUIREMENT',
      error: 'Discovery could not use this requirement. Check the delivery PIN, city, state, and category.',
    };
  }
  return payload;
}

function coverageState(row: {
  delivery_city?: string | null;
  delivery_pincode?: string | null;
  attributes?: unknown;
  structured_specs?: unknown;
}): { city: string; state: string; pincode: string } {
  const specs = (row.structured_specs ?? {}) as { deliveryLocation?: Record<string, string> };
  const location = specs.deliveryLocation ?? {};
  const attributes = (row.attributes ?? {}) as { delivery_state?: string };
  return {
    pincode: (row.delivery_pincode || location.pincode || location.postalCode || '').trim(),
    city: (row.delivery_city || location.city || '').trim(),
    state: (location.state || attributes.delivery_state || '').trim(),
  };
}

/**
 * Runs Google Places for this requirement's own PIN, city, state, and category.
 * Does not invent a PIN and does not search the OTP network.
 */
export async function prepareGooglePlacesCoverage(rfqId: string): Promise<
  | { ok: true; outcome: 'GOOGLE_PLACES_DISCOVERY' | 'ZERO_RESULTS' }
  | { ok: false; outcome: DiscoverySourceOutcome; error: string }
> {
  const { data: rfq, error: rfqErr } = await supabase
    .from('rfqs')
    .select('requirement_id')
    .eq('id', rfqId)
    .maybeSingle();
  if (rfqErr || !rfq?.requirement_id) {
    return { ok: false, outcome: 'SERVICE_FAILURE', error: rfqErr?.message ?? 'RFQ not found' };
  }

  const { data: req, error: reqErr } = await supabase
    .from('requirements')
    .select('delivery_city, delivery_pincode, category_id, subcategory_id, attributes, structured_specs')
    .eq('id', rfq.requirement_id)
    .maybeSingle();
  if (reqErr || !req) {
    return { ok: false, outcome: 'SERVICE_FAILURE', error: reqErr?.message ?? 'Requirement not found' };
  }

  let category = '';
  if (req.category_id) {
    const { data: categoryRow } = await supabase
      .from('requirement_categories')
      .select('name')
      .eq('id', req.category_id)
      .maybeSingle();
    category = (categoryRow?.name as string | undefined)?.trim() ?? '';
  }
  if (!category && req.subcategory_id) {
    const { data: subcategoryRow } = await supabase
      .from('requirement_subcategories')
      .select('name')
      .eq('id', req.subcategory_id)
      .maybeSingle();
    category = (subcategoryRow?.name as string | undefined)?.trim() ?? '';
  }

  const geo = coverageState(req);
  const invalid = discoveryRequirementIssues({ ...geo, category });
  if (invalid) {
    return { ok: false, outcome: 'INVALID_REQUIREMENT', error: invalid };
  }

  const invoked = await supabase.functions.invoke('location-pin-coverage', {
    body: {
      state: geo.state,
      city: geo.city,
      pincode: geo.pincode,
      category,
      forceRefresh: false,
      executeDiscovery: true,
      asyncMode: false,
    },
  });

  if (invoked.error) {
    return {
      ok: false,
      outcome: 'SERVICE_FAILURE',
      error: invoked.error.message || 'Google Places discovery did not finish',
    };
  }

  const data = (invoked.data ?? {}) as {
    ok?: boolean;
    error?: string;
    message?: string;
    knownSuppliersCount?: number;
  };
  const outcome = classifyCoverageResponse(data);
  if (outcome === 'GOOGLE_PLACES_DISCOVERY') return { ok: true, outcome };
  if (outcome === 'ZERO_RESULTS') return { ok: true, outcome: 'ZERO_RESULTS' };
  return {
    ok: false,
    outcome,
    error: data.message || data.error || 'Google Places discovery did not finish',
  };
}

export async function discoverForRequirement(
  rfqId: string,
  network: DiscoveryNetwork,
): Promise<DiscoveryInviteResult | { ok: false; error: string; outcome?: DiscoverySourceOutcome }> {
  if (network === 'OTP_REGISTERED') return discoverAndInvite(rfqId, 'OTP_REGISTERED');

  const prepared = await prepareGooglePlacesCoverage(rfqId);
  if (!prepared.ok) return prepared;
  const invited = await discoverAndInvite(rfqId, 'GOOGLE_PLACES');
  if (!invited.ok) return invited;
  if (prepared.outcome === 'ZERO_RESULTS') {
    return { ...invited, outcome: 'ZERO_RESULTS', quotingOpened: false };
  }
  return invited;
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
  | {
      ok: true;
      reused: boolean;
      shareLinkAvailable: boolean;
      token?: string;
      quickQuotePath?: string;
      quickQuoteUrl?: string;
    }
  | { ok: false; error: string }
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

  const result = (data ?? {}) as {
    ok?: boolean;
    reused?: boolean;
    token?: string | null;
    quickQuotePath?: string | null;
  };
  // A contact that belongs to an existing supplier comes back with no share link.
  const token = result.token || undefined;
  const quickQuotePath = result.quickQuotePath || (token ? `/q/${token}` : undefined);
  const origin =
    typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'https://otp.market';
  const quickQuoteUrl = quickQuotePath ? `${origin}${quickQuotePath}` : undefined;

  return {
    ok: true,
    reused: Boolean(result.reused),
    shareLinkAvailable: Boolean(quickQuoteUrl),
    token,
    quickQuotePath,
    quickQuoteUrl,
  };
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
  // Discovery opens a DRAFT RFQ server-side, and a retry may find it open already.
  if (rfq.status === 'OPEN') return { ok: true };
  if (rfq.status !== 'DRAFT') {
    return { ok: false, error: `Cannot open RFQ from status ${rfq.status}` };
  }

  const invitationCount = await fetchInvitationCount(rfqId);
  if (invitationCount < 1) {
    return { ok: false, error: 'Run supplier discovery before opening the RFQ' };
  }

  const now = new Date().toISOString();

  const { data: opened, error: updateErr } = await supabase
    .from('rfqs')
    .update({ status: 'OPEN', updated_at: now })
    .eq('id', rfqId)
    .eq('status', 'DRAFT')
    .select('id');

  if (updateErr) return { ok: false, error: updateErr.message };
  if (!Array.isArray(opened) || opened.length === 0) {
    const { data: after } = await supabase.from('rfqs').select('status').eq('id', rfqId).maybeSingle();
    return after?.status === 'OPEN'
      ? { ok: true }
      : { ok: false, error: `Cannot open RFQ from status ${after?.status ?? 'unknown'}` };
  }

  await supabase
    .from('requirements')
    .update({ status: 'QUOTING', updated_at: now })
    .eq('id', rfq.requirement_id);

  return { ok: true };
}

export async function updateRfqDeadline(
  rfqId: string,
  deadlineIso: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const deadlineDate = new Date(deadlineIso);
  if (isNaN(deadlineDate.getTime())) {
    return { ok: false, error: 'Invalid deadline date format' };
  }
  if (deadlineDate.getTime() <= Date.now()) {
    return { ok: false, error: 'Quote deadline must be in the future' };
  }

  const { error } = await supabase
    .from('rfqs')
    .update({ quote_deadline: deadlineIso, updated_at: new Date().toISOString() })
    .eq('id', rfqId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateRfqInstructions(
  requirementId: string,
  instructions: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: req } = await supabase
    .from('requirements')
    .select('commercial')
    .eq('id', requirementId)
    .maybeSingle();

  const currentCommercial = (req?.commercial ?? {}) as Record<string, any>;
  const currentSourcing = (currentCommercial.__sourcing ?? {}) as Record<string, any>;

  const updatedCommercial = {
    ...currentCommercial,
    __sourcing: {
      ...currentSourcing,
      instructions: instructions.trim(),
    },
  };

  const { error } = await supabase
    .from('requirements')
    .update({ commercial: updatedCommercial, updated_at: new Date().toISOString() })
    .eq('id', requirementId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchRfqReviewData(
  requirementId: string,
  providedRfqId?: string | null,
): Promise<{ ok: true; data: RfqReviewData } | { ok: false; error: string }> {
  const ensure = await ensureRfqForRequirement(requirementId);
  if (!ensure.ok) return { ok: false, error: ensure.error };

  const rfqId = providedRfqId || ensure.rfqId;

  const [reqRes, rfqRes, suppRes, attRes, polRes] = await Promise.all([
    supabase
      .from('requirements')
      .select('id, title, status, description, quantity, unit, attributes, delivery_city, delivery_pincode, delivery_line1, site_notes, required_by_mode, required_by_days, required_by_date, commercial, organization_id, category_id, requirement_type, quality')
      .eq('id', requirementId)
      .maybeSingle(),
    supabase
      .from('rfqs')
      .select('id, status, title, quote_deadline, evaluation_deadline, min_quotes_required')
      .eq('id', rfqId)
      .maybeSingle(),
    fetchMatchedSuppliers(rfqId),
    fetchRequirementAttachments(requirementId),
    fetchProcurementPolicy(rfqId),
  ]);

  if (reqRes.error || !reqRes.data) {
    return { ok: false, error: reqRes.error?.message ?? 'Requirement not found' };
  }
  if (rfqRes.error || !rfqRes.data) {
    return { ok: false, error: rfqRes.error?.message ?? 'RFQ not found' };
  }

  const req = reqRes.data;
  const rfq = rfqRes.data;

  // Format delivery timeline
  let requiredByText = 'Flexible timeline';
  if (req.required_by_mode === 'IMMEDIATE') {
    requiredByText = '⚡ ASAP / Immediate';
  } else if (req.required_by_mode === 'WITHIN_DAYS' && req.required_by_days) {
    requiredByText = req.required_by_days === 7 ? '⏱️ This week (7 days)' : `Within ${req.required_by_days} days`;
  } else if (req.required_by_mode === 'SPECIFIC_DATE' && req.required_by_date) {
    requiredByText = `By ${req.required_by_date}`;
  }

  // Format budget & commercial
  const comm = (req.commercial ?? {}) as Record<string, any>;
  const rawBudget = comm.budgetAmount ?? comm.targetBudget ?? comm.estimatedTotal;
  const budgetAmount = rawBudget ? Number(rawBudget) : null;
  const budgetFormatted = budgetAmount ? `₹${budgetAmount.toLocaleString('en-IN')}` : null;

  const sourcing = (comm.__sourcing ?? {}) as Record<string, any>;
  const geographicReach = sourcing.reach ?? 'LOCAL';
  const buyerInstructions = sourcing.instructions ?? comm.notes ?? '';

  const quality = (req.quality ?? {}) as Record<string, any>;
  const qualityNotes = quality.notes ?? null;

  // Default quote deadline to 7 days from now if missing
  const quoteDeadline = rfq.quote_deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const evaluationDeadline = rfq.evaluation_deadline ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  let selectedSuppliers = suppRes.ok ? suppRes.suppliers : [];
  if (selectedSuppliers.length === 0 && rfq.id) {
    // Auto-discover verified suppliers so the sourcing pool is populated
    await discoverAndInvite(rfq.id);
    const retrySuppRes = await fetchMatchedSuppliers(rfq.id);
    if (retrySuppRes.ok && retrySuppRes.suppliers.length > 0) {
      selectedSuppliers = retrySuppRes.suppliers;
    }
  }

  const attachments = attRes.ok ? attRes.attachments : [];

  const policy = polRes.ok
    ? polRes.policy
    : {
        policyType: 'INDIVIDUAL_DIRECT',
        minQuotesRequired: 2,
        minCommitteeVotes: 1,
        requestRoles: ['BUYER'],
        approveRoles: ['BUYER'],
        awardRoles: ['BUYER'],
        evaluationWeights: { price: 40, delivery: 30, warranty: 30 },
        committeeVoteRequired: false,
        conflictDeclarationRequired: false,
        awardRequiresJustification: false,
      };

  const isFastTrack = policy.policyType === 'INDIVIDUAL_DIRECT' || !policy.committeeVoteRequired;

  // Validation & Checkpoint Engine
  const errors: string[] = [];
  const warnings: string[] = [];
  const checklist: RfqValidationChecklistItem[] = [];

  // Check 1: Scope & Title Specifications
  const hasValidTitle = Boolean(req.title?.trim());
  const hasValidDesc = Boolean(req.description?.trim());
  if (!hasValidTitle || !hasValidDesc) {
    errors.push('Requirement title and description are required before broadcasting.');
    checklist.push({
      id: 'spec',
      label: 'Scope & Specifications',
      status: 'FAIL',
      message: 'Title and detailed description are required.',
      actionUrl: `/requirements/${req.id}`,
      actionLabel: 'Edit Spec',
    });
  } else {
    checklist.push({
      id: 'spec',
      label: 'Scope & Specifications',
      status: 'PASS',
      message: `Complete (${req.title})`,
    });
  }

  // Check 2: Delivery Location
  const hasCity = Boolean(req.delivery_city?.trim());
  const hasPincode = Boolean(req.delivery_pincode?.trim());
  if (!hasCity || !hasPincode) {
    errors.push('Delivery city and PIN code are required.');
    checklist.push({
      id: 'location',
      label: 'Delivery Location',
      status: 'FAIL',
      message: 'Delivery city and 6-digit PIN code must be specified.',
      actionUrl: `/requirements/${req.id}`,
      actionLabel: 'Set Location',
    });
  } else {
    checklist.push({
      id: 'location',
      label: 'Delivery Location',
      status: 'PASS',
      message: `${req.delivery_city} • PIN ${req.delivery_pincode}`,
    });
  }

  // Check 3: Verified Supplier Sourcing Pool
  if (selectedSuppliers.length === 0) {
    errors.push('At least 1 verified supplier must be selected in the sourcing pool.');
    checklist.push({
      id: 'suppliers',
      label: 'Supplier Sourcing Pool',
      status: 'FAIL',
      message: 'At least 1 verified supplier must be selected to broadcast.',
      actionUrl: `/requirements/${req.id}/discover`,
      actionLabel: 'Discover Suppliers',
    });
  } else if (selectedSuppliers.length < policy.minQuotesRequired) {
    warnings.push(`Selected pool (${selectedSuppliers.length}) is below policy quorum recommendation (${policy.minQuotesRequired} suppliers).`);
    checklist.push({
      id: 'suppliers',
      label: 'Supplier Sourcing Pool',
      status: 'WARN',
      message: `${selectedSuppliers.length} supplier(s) selected (recommended: ${policy.minQuotesRequired} for full quorum).`,
      actionUrl: `/requirements/${req.id}/discover`,
      actionLabel: 'Add Suppliers',
    });
  } else {
    checklist.push({
      id: 'suppliers',
      label: 'Supplier Sourcing Pool',
      status: 'PASS',
      message: `${selectedSuppliers.length} verified suppliers selected (quorum met).`,
    });
  }

  // Check 4: Quote Response Deadline
  const deadlineDate = new Date(quoteDeadline);
  const isValidDate = !isNaN(deadlineDate.getTime());
  const isFuture = isValidDate && deadlineDate.getTime() > Date.now();

  if (!isValidDate || !isFuture) {
    errors.push('Quote response deadline must be a valid date in the future.');
    checklist.push({
      id: 'deadline',
      label: 'Quote Response Deadline',
      status: 'FAIL',
      message: 'Deadline is invalid or in the past.',
    });
  } else if (deadlineDate.getTime() - Date.now() < 24 * 60 * 60 * 1000) {
    warnings.push('Quote deadline is within 24 hours. Consider giving suppliers 3–7 days to quote.');
    checklist.push({
      id: 'deadline',
      label: 'Quote Response Deadline',
      status: 'WARN',
      message: 'Deadline is within 24 hours (short window).',
    });
  } else {
    checklist.push({
      id: 'deadline',
      label: 'Quote Response Deadline',
      status: 'PASS',
      message: `Set to ${formatDateIST(deadlineDate)}`,
    });
  }

  // Check 5: Category & Classification (Advisory)
  if (req.category_id?.trim()) {
    checklist.push({
      id: 'category',
      label: 'Category Classification',
      status: 'PASS',
      message: req.category_id.replace(/_/g, ' '),
    });
  } else {
    checklist.push({
      id: 'category',
      label: 'Category Classification',
      status: 'WARN',
      message: 'General category (unclassified)',
      actionUrl: `/requirements/${req.id}`,
      actionLabel: 'Classify',
    });
  }

  // Check 6: Quantity & Unit (Advisory)
  if (req.quantity && req.quantity > 0 && req.unit?.trim()) {
    checklist.push({
      id: 'quantity',
      label: 'Quantity & Units',
      status: 'PASS',
      message: `${req.quantity} ${req.unit}`,
    });
  } else {
    checklist.push({
      id: 'quantity',
      label: 'Quantity & Units',
      status: 'WARN',
      message: 'Quantity flexible / based on scope description',
    });
  }

  // Check 7: Commercial Baseline Ceiling (Advisory)
  if (budgetAmount) {
    checklist.push({
      id: 'budget',
      label: 'Commercial Ceiling',
      status: 'PASS',
      message: `${budgetFormatted} (Private benchmark)`,
    });
  } else {
    warnings.push('No internal budget ceiling set. Suppliers will submit open market rates.');
    checklist.push({
      id: 'budget',
      label: 'Commercial Ceiling',
      status: 'WARN',
      message: 'Open market rates (no internal budget ceiling)',
    });
  }

  // Check 8: Technical Drawings & BoQ (Advisory)
  if (attachments.length > 0) {
    checklist.push({
      id: 'attachments',
      label: 'Drawings & BoQ Files',
      status: 'PASS',
      message: `${attachments.length} file(s) attached (metadata stripped)`,
    });
  } else {
    warnings.push('No technical drawings or BoQ files attached.');
    checklist.push({
      id: 'attachments',
      label: 'Drawings & BoQ Files',
      status: 'WARN',
      message: 'Quoting based on written specifications',
    });
  }

  // Compute Deterministic Readiness State
  let readinessState: BroadcastReadinessState = 'READY';
  if (errors.length > 0) {
    readinessState = 'BLOCKED';
  } else if (warnings.length > 0) {
    readinessState = 'WARNING';
  }

  const reviewData: RfqReviewData = {
    requirement: {
      id: req.id,
      title: req.title,
      description: req.description,
      status: req.status,
      categoryName: req.category_id,
      requirementMode: req.requirement_type,
      quantity: req.quantity ? Number(req.quantity) : null,
      unit: req.unit,
      deliveryCity: req.delivery_city,
      deliveryPincode: req.delivery_pincode,
      deliveryLine1: req.delivery_line1,
      siteNotes: req.site_notes,
      requiredByText,
      budgetFormatted,
      budgetAmount,
      attributes: (req.attributes ?? {}) as Record<string, any>,
      qualityNotes,
      paymentTerms: comm.paymentTerms ?? '100% on delivery',
      priceIncludesTransport: Boolean(comm.priceIncludesTransport ?? true),
      priceIncludesGst: Boolean(comm.priceIncludesGst ?? true),
      geographicReach,
    },
    rfq: {
      id: rfq.id,
      status: rfq.status,
      title: rfq.title,
      quoteDeadline,
      evaluationDeadline,
      minQuotesRequired: policy.minQuotesRequired,
      buyerInstructions,
    },
    selectedSuppliers,
    attachments,
    governance: {
      orgType: polRes.ok ? polRes.policyType : 'INDIVIDUAL',
      policyType: policy.policyType,
      minQuotesRequired: policy.minQuotesRequired,
      minCommitteeVotes: policy.minCommitteeVotes,
      committeeVoteRequired: policy.committeeVoteRequired,
      evaluationWeights: policy.evaluationWeights,
      isFastTrack,
    },
    validation: {
      state: readinessState,
      status: readinessState,
      errors,
      warnings,
      isValid: errors.length === 0,
      checklist,
    },
  };

  return { ok: true, data: reviewData };
}

type PublishRfqResult = { ok: true; rfqId: string; invitedCount: number } | { ok: false; error: string };

const publishesInFlight = new Map<string, Promise<PublishRfqResult>>();

/**
 * One deliberate publish: saves deadline and instructions, invites suppliers,
 * opens the RFQ. Concurrent calls for the same RFQ share one execution, a
 * failed save stops before anything is published, and re-publishing an RFQ
 * that is already open succeeds without creating anything new.
 */
export function publishRfq(input: {
  rfqId: string;
  requirementId: string;
  quoteDeadline?: string;
  instructions?: string;
}): Promise<PublishRfqResult> {
  const existing = publishesInFlight.get(input.rfqId);
  if (existing) return existing;
  const run = runPublishRfq(input).finally(() => publishesInFlight.delete(input.rfqId));
  publishesInFlight.set(input.rfqId, run);
  return run;
}

async function runPublishRfq(input: {
  rfqId: string;
  requirementId: string;
  quoteDeadline?: string;
  instructions?: string;
}): Promise<PublishRfqResult> {
  const { rfqId, requirementId, quoteDeadline, instructions } = input;

  if (quoteDeadline) {
    const deadlineRes = await updateRfqDeadline(rfqId, quoteDeadline);
    if (!deadlineRes.ok) return deadlineRes;
  }

  if (instructions !== undefined) {
    const instrRes = await updateRfqInstructions(requirementId, instructions);
    if (!instrRes.ok) return instrRes;
  }

  let count = await fetchInvitationCount(rfqId);
  if (count === 0) {
    const discRes = await discoverAndInvite(rfqId);
    if (!discRes.ok) return discRes;
    count = discRes.total;
  }

  const openRes = await openRfq(rfqId);
  if (!openRes.ok) return openRes;

  return { ok: true, rfqId, invitedCount: count };
}
