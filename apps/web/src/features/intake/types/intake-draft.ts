import type {
  AttributeValue,
  FulfilmentMode,
  RequiredByMode,
  RequirementMode,
  SourcingMode,
} from '@otp/domain';

/**
 * The wizard's working copy of a requirement.
 *
 * Everything on it maps to a column or a documented jsonb key on `requirements`,
 * so a half-finished requirement survives a closed tab: the draft is a real
 * DRAFT row from the understanding step onward, not component state.
 */
export interface IntakeDraft {
  requirementId: string;
  organizationId: string;

  /** What the buyer typed, kept verbatim as the description. */
  originalText: string;
  title: string;

  categoryId: string | null;
  subcategoryId: string | null;
  requirementMode: RequirementMode | null;

  quantity: number | null;
  unit: string | null;
  attributes: Record<string, AttributeValue>;

  quality: QualityDetails;
  commercial: CommercialDetails;
  sourcing: SourcingChoices;

  requiredByMode: RequiredByMode | null;
  requiredByDays: number | null;
  requiredByDate: string | null;
  fulfilmentMode: FulfilmentMode | null;

  deliveryCity: string | null;
  deliveryPincode: string | null;
  deliveryLine1: string | null;
  /** Buyer-private. Never reaches a supplier before award reveal. */
  siteNotes: string | null;

  status: string;
}

export interface QualityDetails {
  warrantyMonths?: number | null;
  certifications?: string[];
  inspectionRequired?: boolean;
  sampleRequired?: boolean;
  notes?: string | null;
}

export interface CommercialDetails {
  budgetAmount?: number | null;
  paymentTerms?: string | null;
  priceIncludesTransport?: boolean;
  priceIncludesGst?: boolean;
  notes?: string | null;
}

/**
 * RFQ configuration gathered during intake.
 *
 * It is held on the draft rather than on an RFQ row because no RFQ exists until
 * the buyer publishes; creating one early would drag the requirement out of
 * DRAFT and make the wizard unresumable for a buyer who is not an org manager.
 */
export interface SourcingChoices {
  sourcingMode: SourcingMode;
  minQuotesRequired: number;
  quoteDeadlineDays: number;
  evaluationWeights: Record<string, number>;
  evaluationWeightsSource: 'SUGGESTED' | 'CUSTOM';
  geographicReach?: 'PAN_INDIA' | 'LOCAL' | 'STATE';
}

export const DEFAULT_SOURCING: SourcingChoices = {
  sourcingMode: 'IDENTITY_PROTECTED',
  minQuotesRequired: 3,
  quoteDeadlineDays: 7,
  evaluationWeights: {},
  evaluationWeightsSource: 'SUGGESTED',
  geographicReach: 'LOCAL',
};
