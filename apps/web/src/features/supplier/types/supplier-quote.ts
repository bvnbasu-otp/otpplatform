import type {
  FulfilmentMode,
  InviteStatus,
  QuoteStatus,
  RequiredByMode,
  RequirementMode,
  RfqStatus,
  SourcingMode,
} from '@otp/domain';

export interface QuoteSnapshotInput {
  basePrice: number;
  gstAmount: number;
  transportCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  currency: string;
  notes?: string;
}

export interface SupplierQuoteSnapshot extends QuoteSnapshotInput {
  totalCost: number;
}

/**
 * An enquiry as the invited supplier sees it.
 *
 * Read from rfqs_supplier_masked, which carries the whole specification but
 * shows the buyer as "Identity protected" unless they chose to be named. The
 * enquiry is referred to by publicRef rather than its database id, because that
 * is the reference a supplier can quote over the phone.
 */
export interface SupplierInvitation {
  invitationId: string;
  rfqId: string;
  publicRef: string | null;
  anonymousLabel: string;
  status: InviteStatus;
  invitedAt: string;
  rfqTitle: string;
  rfqStatus: RfqStatus;
  quoteDeadline: string | null;
  /** Either the buying organization's name or "Identity protected". */
  buyerDisplayName: string;
  buyerAnonymous: boolean;
  buyerReliabilityScore?: number;
  buyerReliabilityTier?: string;
  sourcingMode: SourcingMode | null;
  minQuotesRequired: number | null;
  category?: string | null;
  subcategory?: string | null;
  deliveryCity?: string | null;
  quantity?: number | null;
  unit?: string | null;
}

/** Everything a supplier needs to price the job, and nothing that names the buyer. */
export interface SupplierRfqDetail extends SupplierInvitation {
  description: string | null;
  category: string | null;
  subcategory: string | null;
  requirementMode: RequirementMode | null;
  quantity: number | null;
  unit: string | null;
  attributes: Record<string, unknown>;
  quality: Record<string, unknown>;
  commercial: Record<string, unknown>;
  requiredByMode: RequiredByMode | null;
  requiredByDays: number | null;
  requiredByDate: string | null;
  fulfilmentMode: FulfilmentMode | null;
  deliveryCity: string | null;
  /** What the buyer says will decide it, so effort can go where it counts. */
  evaluationWeights: Record<string, number>;
}

export interface SupplierQuote {
  quoteId: string;
  rfqId: string;
  invitationId: string;
  status: QuoteStatus;
  currentVersion: number;
  submittedAt: string | null;
  snapshot: SupplierQuoteSnapshot | null;
}

export function computeTotalCost(input: QuoteSnapshotInput): number {
  return input.basePrice + input.gstAmount + input.transportCost;
}

export function toSnapshotPayload(
  input: QuoteSnapshotInput,
): Record<string, unknown> {
  return {
    basePrice: input.basePrice,
    gstAmount: input.gstAmount,
    transportCost: input.transportCost,
    totalCost: computeTotalCost(input),
    deliveryDays: input.deliveryDays,
    warrantyMonths: input.warrantyMonths,
    currency: input.currency,
    notes: input.notes,
  };
}
