import { supabase } from '@/lib/supabase';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import { fetchMatchedSuppliers } from '@/features/requirement/api/rfq-lifecycle';
import { fetchIdentityProtectedQuotes } from './fetch-identity-protected-quotes';
import { fetchClarificationMessagesForBuyer } from '@/features/clarification/api/clarification';
import { fetchProcurementPolicy } from '@/features/procurement-os/api/fetch-procurement-os';
import { fetchRequirementAttachments } from '@/features/attachments/api/attachments';
import { ensureSimulatedQuotesForRfq } from './simulate-quotes';
import type {
  ActiveRfqMonitoringData,
  RfqActionRequired,
  RfqMonitoringMetrics,
  RfqMonitoringSupplierResponse,
} from '../types/rfq-monitoring';

function formatTimeRemaining(deadlineIso: string): {
  text: string;
  isApproaching: boolean;
  isExpired: boolean;
} {
  const deadline = new Date(deadlineIso);
  if (isNaN(deadline.getTime())) {
    return { text: 'Flexible deadline', isApproaching: false, isExpired: false };
  }

  const now = Date.now();
  const diffMs = deadline.getTime() - now;

  if (diffMs <= 0) {
    return { text: 'Quote window closed', isApproaching: false, isExpired: true };
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffDays = Math.floor(diffHours / 24);

  const isApproaching = diffMs < 24 * 60 * 60 * 1000;

  if (diffDays > 1) {
    return { text: `${diffDays} days remaining`, isApproaching, isExpired: false };
  }
  if (diffDays === 1) {
    return { text: `1 day, ${diffHours % 24}h remaining`, isApproaching, isExpired: false };
  }
  if (diffHours > 0) {
    return { text: `${diffHours}h ${diffMinutes}m remaining`, isApproaching, isExpired: false };
  }
  return { text: `${diffMinutes}m remaining`, isApproaching, isExpired: false };
}

export async function fetchActiveRfqMonitoringData(
  rfqIdOrRequirementId: string
): Promise<{ ok: true; data: ActiveRfqMonitoringData } | { ok: false; error: string }> {
  const profile = await fetchCurrentProfile();
  if (!profile) {
    return { ok: false, error: 'User is not authenticated' };
  }

  // Determine if param is an rfqId or requirementId
  let rfqId = rfqIdOrRequirementId;
  let reqId = rfqIdOrRequirementId;

  const { data: rfqRow } = await supabase
    .from('rfqs')
    .select('id, requirement_id')
    .or(`id.eq.${rfqIdOrRequirementId},requirement_id.eq.${rfqIdOrRequirementId}`)
    .maybeSingle();

  if (rfqRow) {
    rfqId = rfqRow.id;
    reqId = rfqRow.requirement_id;
  }

  // Fetch all parallel resources
  const [rfqRes, reqRes, suppRes, quotesRes, msgRes, polRes, attRes] = await Promise.all([
    supabase
      .from('rfqs')
      .select('id, requirement_id, organization_id, status, title, quote_deadline, evaluation_deadline, min_quotes_required, created_at, updated_at')
      .eq('id', rfqId)
      .maybeSingle(),
    supabase
      .from('requirements')
      .select('id, title, status, description, quantity, unit, delivery_city, delivery_pincode, delivery_line1, site_notes, required_by_mode, required_by_days, required_by_date, commercial, organization_id, category_id, requirement_type, quality')
      .eq('id', reqId)
      .maybeSingle(),
    fetchMatchedSuppliers(rfqId),
    fetchIdentityProtectedQuotes(rfqId),
    fetchClarificationMessagesForBuyer(rfqId),
    fetchProcurementPolicy(rfqId),
    fetchRequirementAttachments(reqId),
  ]);

  if (rfqRes.error || !rfqRes.data) {
    return { ok: false, error: rfqRes.error?.message ?? 'RFQ not found' };
  }
  if (reqRes.error || !reqRes.data) {
    return { ok: false, error: reqRes.error?.message ?? 'Requirement not found' };
  }

  const rfq = rfqRes.data;
  const req = reqRes.data;

  // Commercial & Budget formatting
  const comm = (req.commercial ?? {}) as Record<string, any>;
  const rawBudget = comm.budgetAmount ?? comm.targetBudget ?? comm.estimatedTotal;
  const budgetAmount = rawBudget ? Number(rawBudget) : null;
  const budgetFormatted = budgetAmount ? `₹${budgetAmount.toLocaleString('en-IN')}` : null;

  const sourcing = (comm.__sourcing ?? {}) as Record<string, any>;
  const geographicReach = sourcing.reach ?? 'LOCAL';
  const buyerInstructions = sourcing.instructions ?? comm.notes ?? '';

  let requiredByText = 'Flexible timeline';
  if (req.required_by_mode === 'IMMEDIATE') {
    requiredByText = '⚡ ASAP / Immediate';
  } else if (req.required_by_mode === 'WITHIN_DAYS' && req.required_by_days) {
    requiredByText = req.required_by_days === 7 ? '⏱️ This week (7 days)' : `Within ${req.required_by_days} days`;
  } else if (req.required_by_mode === 'SPECIFIC_DATE' && req.required_by_date) {
    requiredByText = `By ${req.required_by_date}`;
  }

  const quantityText = req.quantity ? `${req.quantity} ${req.unit ?? 'units'}` : null;
  const quality = (req.quality ?? {}) as Record<string, any>;
  const qualityNotes = quality.notes ?? null;

  // Supplier invitations & Quotes integration
  let suppliers = suppRes.ok ? suppRes.suppliers : [];
  let quotes = quotesRes.ok ? quotesRes.quotes : [];

  // Deterministic quote simulation guarantee: ensure 3-5 quotes exist for active sourcing
  if (quotes.length === 0 && (rfq.status === 'OPEN' || rfq.status === 'CLARIFICATION' || rfq.status === 'QUOTING' || rfq.status === 'DRAFT')) {
    await ensureSimulatedQuotesForRfq(rfqId);
    const [retryQuotesRes, retrySuppRes] = await Promise.all([
      fetchIdentityProtectedQuotes(rfqId),
      fetchMatchedSuppliers(rfqId),
    ]);
    if (retryQuotesRes.ok && retryQuotesRes.quotes.length > 0) {
      quotes = retryQuotesRes.quotes;
    }
    if (retrySuppRes.ok && retrySuppRes.suppliers.length > 0) {
      suppliers = retrySuppRes.suppliers;
    }
  }

  const messages = msgRes.ok ? msgRes.messages : [];
  const attachments = attRes.ok ? attRes.attachments : [];

  // Quote lookup by anonymous label
  const quoteByLabel = new Map(quotes.map((q) => [q.anonymousLabel, q]));

  // Build supplier response list
  const supplierResponses: RfqMonitoringSupplierResponse[] = suppliers.map((s) => {
    const q = quoteByLabel.get(s.anonymousLabel);
    const hasQuoted = Boolean(q);
    const isDeclined = s.status === 'DECLINED';
    const isViewed = s.status === 'VIEWED' || Boolean(s.viewedAt);

    let status: RfqMonitoringSupplierResponse['status'] = 'INVITED';
    let statusLabel = 'Invited • Awaiting Response';

    if (hasQuoted) {
      status = 'QUOTED';
      statusLabel = '✓ Quote Submitted';
    } else if (isDeclined) {
      status = 'DECLINED';
      statusLabel = 'Declined';
    } else if (isViewed) {
      status = 'VIEWED';
      statusLabel = 'Viewed RFQ';
    }

    return {
      invitationId: s.invitationId,
      anonymousLabel: s.anonymousLabel,
      network: s.network,
      networkLabel: s.networkLabel,
      matchScore: s.matchScore,
      matchLevel: s.matchLevel,
      isLocal: s.isLocal,
      distanceKm: s.distanceKm,
      status,
      statusLabel,
      invitedAt: s.invitedAt ?? null,
      viewedAt: s.viewedAt ?? null,
      declinedAt: s.declinedAt ?? null,
      declineReason: s.declineReason ?? null,
      quote: q
        ? {
            quoteId: q.quoteId,
            totalCost: q.totalCost,
            basePrice: q.basePrice,
            gstAmount: q.gstAmount,
            deliveryDays: q.deliveryDays,
            warrantyMonths: q.warrantyMonths,
            submittedAt: q.submittedAt,
          }
        : null,
    };
  });

  // Calculate Metrics
  const invitedCount = suppliers.length;
  const quotesCount = quotes.length;
  const declinedCount = supplierResponses.filter((s) => s.status === 'DECLINED').length;
  const viewedCount = supplierResponses.filter(
    (s) => s.status === 'VIEWED' || s.status === 'QUOTED'
  ).length;
  const pendingCount = Math.max(0, invitedCount - quotesCount - declinedCount);
  const responseRatePercent = Math.round((quotesCount / (invitedCount || 1)) * 100);

  const minQuotesRequired = rfq.min_quotes_required ?? 3;
  const isQuorumMet = quotesCount >= minQuotesRequired;

  const quoteDeadline = rfq.quote_deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const evaluationDeadline = rfq.evaluation_deadline || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  const timeRemaining = formatTimeRemaining(quoteDeadline);

  // Unanswered clarifications (last message from supplier)
  const unansweredClarificationsCount = messages.filter((m) => m.authorSide === 'SUPPLIER').length;

  const metrics: RfqMonitoringMetrics = {
    invitedCount,
    viewedCount,
    quotesCount,
    declinedCount,
    pendingCount,
    responseRatePercent,
    isQuorumMet,
    unansweredClarificationsCount,
    timeRemainingText: timeRemaining.text,
    isDeadlineApproaching: timeRemaining.isApproaching,
    isDeadlineExpired: timeRemaining.isExpired,
  };

  // Action Required Determination
  let actionRequired: RfqActionRequired;

  if (unansweredClarificationsCount > 0) {
    actionRequired = {
      type: 'UNANSWERED_CLARIFICATIONS',
      title: 'Supplier Questions Pending',
      description: `${unansweredClarificationsCount} supplier question(s) awaiting your clarification response.`,
      actionLabel: 'Open Q&A Thread →',
      actionUrl: `/rfq/${rfq.id}/clarification`,
      severity: 'urgent',
    };
  } else if (isQuorumMet) {
    actionRequired = {
      type: 'QUORUM_MET',
      title: 'Quorum Reached — Ready for Evaluation',
      description: `Target quorum of ${minQuotesRequired} quotes has been met (${quotesCount} quotes received). You can evaluate now or wait for additional responses.`,
      actionLabel: 'Proceed to Evaluation →',
      actionUrl: `/rfq/${rfq.id}/evaluation`,
      severity: 'success',
    };
  } else if (timeRemaining.isApproaching && !timeRemaining.isExpired) {
    actionRequired = {
      type: 'DEADLINE_APPROACHING',
      title: 'Quote Deadline Approaching',
      description: `Responses close in ${timeRemaining.text}. Extend the window if suppliers require additional quoting time.`,
      actionLabel: 'Extend Deadline ✎',
      actionUrl: '#extend-deadline',
      severity: 'warning',
    };
  } else if (timeRemaining.isExpired) {
    actionRequired = {
      type: 'RFQ_CLOSED',
      title: 'Quoting Window Closed',
      description: `Quote response window has ended with ${quotesCount} received quote(s). Proceed to evaluate sealed quotes.`,
      actionLabel: 'Compare Received Quotes →',
      actionUrl: `/rfq/${rfq.id}/evaluation`,
      severity: 'info',
    };
  } else if (quotesCount === 0) {
    actionRequired = {
      type: 'AWAITING_QUOTES',
      title: 'Sourcing Active — Awaiting Quotes',
      description: `Broadcasting to ${invitedCount} verified supplier(s). Initial responses are expected with a 30 Min Target from Supplier.`,
      actionLabel: 'View Market Intelligence →',
      actionUrl: `/rfq/${rfq.id}/market-intelligence`,
      severity: 'info',
    };
  } else {
    actionRequired = {
      type: 'NONE',
      title: 'Quotes Inbound',
      description: `${quotesCount} of ${minQuotesRequired} quotes received. Monitoring live inbound supplier responses.`,
      actionLabel: 'View Inbound Quotes →',
      actionUrl: `/rfq/${rfq.id}/evaluation`,
      severity: 'info',
    };
  }

  // Governance
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

  const data: ActiveRfqMonitoringData = {
    rfq: {
      id: rfq.id,
      requirementId: req.id,
      title: rfq.title || `RFQ: ${req.title}`,
      status: rfq.status,
      quoteDeadline,
      evaluationDeadline,
      minQuotesRequired,
      createdAt: rfq.created_at,
      updatedAt: rfq.updated_at,
    },
    requirement: {
      id: req.id,
      title: req.title,
      description: req.description,
      status: req.status,
      categoryName: req.category_id,
      requirementMode: req.requirement_type,
      deliveryCity: req.delivery_city,
      deliveryPincode: req.delivery_pincode,
      deliveryLine1: req.delivery_line1,
      siteNotes: req.site_notes,
      budgetFormatted,
      budgetAmount,
      requiredByText,
      quantityText,
      paymentTerms: comm.paymentTerms ?? '100% on delivery',
      priceIncludesGst: Boolean(comm.priceIncludesGst ?? true),
      priceIncludesTransport: Boolean(comm.priceIncludesTransport ?? true),
      geographicReach,
      qualityNotes,
      buyerInstructions,
    },
    metrics,
    actionRequired,
    supplierResponses,
    governance: {
      orgType: polRes.ok ? polRes.policyType : 'INDIVIDUAL',
      policyType: policy.policyType,
      minQuotesRequired: policy.minQuotesRequired,
      minCommitteeVotes: policy.minCommitteeVotes,
      committeeVoteRequired: policy.committeeVoteRequired,
      evaluationWeights: policy.evaluationWeights,
      isFastTrack,
    },
    attachmentsCount: attachments.length,
    clarificationMessagesCount: messages.length,
  };

  return { ok: true, data };
}
