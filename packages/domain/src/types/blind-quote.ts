/**
 * Identity-protected quote representation for buyer/committee APIs.
 * Constitution: no supplier_id, name, contact, address, or source before reveal.
 */
import type { QuoteStatus } from '../enums/procurement';

export interface IdentityProtectedQuote {
  quoteId: string;
  anonymousLabel: string;
  version: number;
  status: QuoteStatus;
  basePrice: number;
  gstAmount: number;
  transportCost: number;
  totalCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  isDeliveryDaysEstimated?: boolean;
  isWarrantyEstimated?: boolean;
  evaluationScore: number | null;
  /**
   * Reliability signals, banded.
   *
   * A buyer may legitimately weigh who delivers on time; they may not learn
   * who. Ratings arrive rounded to the half star and on-time percentages to the
   * nearest five, so a distinctive exact figure cannot be used to recognise a
   * supplier across RFQs.
   */
  supplierRatingAvg: number | null;
  pastPerformanceScore: number | null;
  /** How much work the supplier has completed, as a band: "New", "5-19", "50+". */
  experienceBand?: string | null;
  verificationStatus?: string | null;
  isGstVerified?: boolean;
  paymentTermsDays?: number | null;
  submittedAt: string | null;
}

/**
 * Fields explicitly forbidden on identity-protected buyer payloads pre-reveal.
 * Used for validation in API layer and tests.
 *
 * Three groups, for three different ways a supplier gets identified:
 *  - who they are (id, name, contact, address, city, GSTIN);
 *  - how they were found (source, match score and reasons), which lets a buyer
 *    rank on something other than the offer in front of them (INV-062);
 *  - what they attached. An uploaded file called "Aqua Prime quotation.pdf"
 *    names the supplier as surely as a business_name column does, and so does
 *    the profile that uploaded it.
 */
export const IDENTITY_PROTECTED_FORBIDDEN_FIELDS = [
  'supplierId',
  'supplier_id',
  'businessName',
  'business_name',
  'contactPhone',
  'contact_phone',
  'contactEmail',
  'contact_email',
  'phone',
  'email',
  'address',
  'gstin',
  'city',
  'pincode',
  'source',
  'sourceRef',
  'source_ref',
  'matchScore',
  'match_score',
  'matchReasons',
  'match_reasons',
  'originalFilename',
  'original_filename',
  'uploadedBy',
  'uploaded_by',
] as const;

export type IdentityProtectedForbiddenField = (typeof IDENTITY_PROTECTED_FORBIDDEN_FIELDS)[number];

// Legacy aliases
export const BLIND_FORBIDDEN_FIELDS = IDENTITY_PROTECTED_FORBIDDEN_FIELDS;
export type BlindForbiddenField = IdentityProtectedForbiddenField;
export type BlindQuote = IdentityProtectedQuote;

import { IdentityProtectedViolationError, BlindViolationError } from '../errors/blind-violation';

export function assertIdentityProtectedPayloadSafe(
  payload: Record<string, unknown>,
): void {
  for (const field of IDENTITY_PROTECTED_FORBIDDEN_FIELDS) {
    if (field in payload && payload[field] !== undefined) {
      throw new IdentityProtectedViolationError(field);
    }
  }
}

// Legacy function alias
export const assertBlindPayloadSafe = assertIdentityProtectedPayloadSafe;
