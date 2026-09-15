import type { MatchedSupplier } from '@/features/requirement/types/discovery';
import type { IdentityProtectedQuote } from '@otp/domain';

export type RfqMonitoringStatus =
  | 'DRAFT'
  | 'OPEN'
  | 'QUOTING'
  | 'CLARIFICATION'
  | 'EVALUATING'
  | 'CLOSED'
  | 'AWARDED'
  | 'CANCELLED';

export type RfqActionRequiredType =
  | 'UNANSWERED_CLARIFICATIONS'
  | 'QUORUM_MET'
  | 'DEADLINE_APPROACHING'
  | 'AWAITING_QUOTES'
  | 'RFQ_CLOSED'
  | 'NONE';

export interface RfqActionRequired {
  type: RfqActionRequiredType;
  title: string;
  description: string;
  actionLabel: string;
  actionUrl: string;
  severity: 'urgent' | 'info' | 'success' | 'warning';
}

export interface RfqMonitoringMetrics {
  invitedCount: number;
  viewedCount: number;
  quotesCount: number;
  declinedCount: number;
  pendingCount: number;
  responseRatePercent: number;
  isQuorumMet: boolean;
  unansweredClarificationsCount: number;
  timeRemainingText: string;
  isDeadlineApproaching: boolean;
  isDeadlineExpired: boolean;
}

export interface RfqMonitoringSupplierResponse {
  invitationId: string;
  anonymousLabel: string;
  network: string;
  networkLabel: string;
  matchScore: number;
  matchLevel: MatchedSupplier['matchLevel'];
  isLocal: boolean;
  distanceKm?: number;
  status: 'INVITED' | 'VIEWED' | 'QUOTED' | 'DECLINED' | 'ACCEPTED';
  statusLabel: string;
  invitedAt: string | null;
  viewedAt: string | null;
  declinedAt: string | null;
  declineReason?: string | null;
  quote: {
    quoteId: string;
    totalCost: number;
    basePrice: number;
    gstAmount: number;
    deliveryDays: number;
    warrantyMonths: number;
    submittedAt: string | null;
  } | null;
}

export interface RfqMonitoringRequirementSummary {
  id: string;
  title: string;
  description: string | null;
  status: string;
  categoryName: string | null;
  requirementMode: string | null;
  deliveryCity: string | null;
  deliveryPincode: string | null;
  deliveryLine1: string | null;
  siteNotes: string | null;
  budgetFormatted: string | null;
  budgetAmount: number | null;
  requiredByText: string | null;
  quantityText: string | null;
  paymentTerms: string | null;
  priceIncludesGst: boolean;
  priceIncludesTransport: boolean;
  geographicReach: string | null;
  qualityNotes: string | null;
  buyerInstructions: string;
}

export interface RfqMonitoringRfqSummary {
  id: string;
  requirementId: string;
  title: string;
  status: string;
  quoteDeadline: string;
  evaluationDeadline: string;
  minQuotesRequired: number;
  createdAt: string;
  updatedAt: string;
}

export interface RfqMonitoringGovernance {
  orgType: string;
  policyType: string;
  minQuotesRequired: number;
  minCommitteeVotes: number;
  committeeVoteRequired: boolean;
  evaluationWeights: {
    price: number;
    delivery: number;
    warranty: number;
  };
  isFastTrack: boolean;
}

export interface ActiveRfqMonitoringData {
  rfq: RfqMonitoringRfqSummary;
  requirement: RfqMonitoringRequirementSummary;
  metrics: RfqMonitoringMetrics;
  actionRequired: RfqActionRequired;
  supplierResponses: RfqMonitoringSupplierResponse[];
  governance: RfqMonitoringGovernance;
  attachmentsCount: number;
  clarificationMessagesCount: number;
}
