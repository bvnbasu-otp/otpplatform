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

/**
 * The mirror image: fields that name the buyer, forbidden on anything a
 * supplier receives before award.
 *
 * A supplier needs the job (what, how much, which city, by when) to price it.
 * Who is asking — organization, person, contact, street address, GSTIN, or the
 * ids that resolve to them — is released only through rfq_buyer_revealed once
 * the award is revealed. Checked at every depth, because a spec or commercial
 * block is free-form JSON and a buyer's phone number nests as easily as it sits
 * at the top.
 */
export const SUPPLIER_FACING_FORBIDDEN_BUYER_FIELDS = [
  'buyer_display_name',
  'buyerOrganization',
  'buyer_organization',
  'buyerOrganizationId',
  'buyer_organization_id',
  'buyerOrganizationName',
  'buyer_organization_name',
  'buyerName',
  'buyer_name',
  'organizationId',
  'organization_id',
  'organizationName',
  'organization_name',
  'orgName',
  'org_name',
  'createdBy',
  'created_by',
  'contactPerson',
  'contact_person',
  'contactPhone',
  'contact_phone',
  'contactEmail',
  'contact_email',
  'buyerContactPerson',
  'buyer_contact_person',
  'buyerContactPhone',
  'buyer_contact_phone',
  'buyerContactEmail',
  'buyer_contact_email',
  'phone',
  'mobile',
  'email',
  'fullName',
  'full_name',
  'address',
  'street',
  'line1',
  'line2',
  'buyerAddress',
  'buyer_address',
  'deliveryAddress',
  'delivery_address',
  'deliveryAddressSnapshot',
  'delivery_address_snapshot',
  'billingAddressSnapshot',
  'billing_address_snapshot',
  'gstin',
  'buyerGstin',
  'buyer_gstin',
  'taxRegistration',
  'tax_registration',
  'awardedByName',
  'awarded_by_name',
  'awardedByEmail',
  'awarded_by_email',
] as const;

export type SupplierFacingForbiddenBuyerField =
  (typeof SUPPLIER_FACING_FORBIDDEN_BUYER_FIELDS)[number];

const SUPPLIER_FACING_FORBIDDEN_SET: ReadonlySet<string> = new Set(
  SUPPLIER_FACING_FORBIDDEN_BUYER_FIELDS,
);

function isPlainContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

/** Dotted paths of every buyer-identity key present (non-null) at any depth. */
export function findSupplierFacingBuyerIdentityLeaks(payload: unknown): string[] {
  const leaks: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (value: unknown, path: string) => {
    if (!isPlainContainer(value) || seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (SUPPLIER_FACING_FORBIDDEN_SET.has(key) && child !== undefined && child !== null) {
        leaks.push(childPath);
      }
      walk(child, childPath);
    }
  };

  walk(payload, '');
  return leaks;
}

export function assertSupplierFacingPayloadSafe(payload: Record<string, unknown>): void {
  const leaks = findSupplierFacingBuyerIdentityLeaks(payload);
  if (leaks.length > 0) {
    throw new IdentityProtectedViolationError(leaks[0]!);
  }
}

/** A copy with every buyer-identity key removed at any depth. Input is not mutated. */
export function stripSupplierFacingBuyerIdentity<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripSupplierFacingBuyerIdentity(item)) as unknown as T;
  }
  if (!isPlainContainer(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SUPPLIER_FACING_FORBIDDEN_SET.has(key)) continue;
    out[key] = stripSupplierFacingBuyerIdentity(child);
  }
  return out as T;
}
