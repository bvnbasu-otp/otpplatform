import type { MatchedSupplier } from './discovery';
import type { Attachment } from '@/features/attachments';

export interface RfqReviewRequirement {
  id: string;
  title: string;
  description: string | null;
  status: string;
  categoryName: string | null;
  requirementMode: string | null;
  quantity: number | null;
  unit: string | null;
  deliveryCity: string | null;
  deliveryPincode: string | null;
  deliveryLine1: string | null;
  siteNotes: string | null;
  requiredByText: string | null;
  budgetFormatted: string | null;
  budgetAmount: number | null;
  attributes: Record<string, any>;
  qualityNotes: string | null;
  paymentTerms: string | null;
  priceIncludesTransport: boolean;
  priceIncludesGst: boolean;
  geographicReach: string | null;
}

export interface RfqReviewRfq {
  id: string;
  status: string;
  title: string;
  quoteDeadline: string; // ISO string
  evaluationDeadline: string; // ISO string
  minQuotesRequired: number;
  buyerInstructions: string;
}

export interface RfqReviewGovernance {
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

export interface RfqReviewValidation {
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

export interface RfqReviewData {
  requirement: RfqReviewRequirement;
  rfq: RfqReviewRfq;
  selectedSuppliers: MatchedSupplier[];
  attachments: Attachment[];
  governance: RfqReviewGovernance;
  validation: RfqReviewValidation;
}

export type RfqDeadlinePreset = '3_DAYS' | '5_DAYS' | '7_DAYS' | '14_DAYS' | 'CUSTOM';
