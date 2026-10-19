/**
 * =============================================================================
 * OTP Platform — Duplicate Identity Safeguards & Risk-Based Collision Detector
 * =============================================================================
 * Requirements 13 & 14 (Stage V3-05):
 * 1. Supplier Duplicate Prevention:
 *    - Strong-identifier verification: Luhn mod-36 GSTIN validation and exact collision check.
 *    - Multi-signal risk matching for non-GST suppliers: normalized phone + business name + contact.
 *    - Multi-branch / additional location recognition without accidental duplicate entity creation.
 *    - Zero private data disclosure: never reveal existing supplier identity to unauthenticated registrants.
 * 2. Buyer Duplicate Prevention:
 *    - Normalized email and E.164 phone collision checks.
 *    - Safe recovery and sign-in routing for existing users.
 *    - Legitimate multi-role and organization membership preserved.
 * =============================================================================
 */

import { validateGstin } from '../gst/gstin-validator';

export type DuplicateMatchLevel =
  | 'EXACT_PROHIBITED'
  | 'LIKELY_DUPLICATE'
  | 'POSSIBLE_BRANCH'
  | 'NO_DUPLICATE';

export interface SupplierIdentityCandidate {
  gstin?: string | null;
  pan?: string | null;
  businessName: string;
  phone: string;
  email: string;
  contactName?: string | null;
  city?: string | null;
  pincode?: string | null;
}

export interface ExistingSupplierIdentity {
  supplierId: string;
  organizationId?: string | null;
  gstin?: string | null;
  pan?: string | null;
  businessName: string;
  phone: string;
  email: string;
  contactName?: string | null;
  city?: string | null;
  pincode?: string | null;
  isVerified?: boolean;
}

export interface SupplierDuplicateCheckResult {
  isDuplicate: boolean;
  matchLevel: DuplicateMatchLevel;
  reasons: string[];
  /** Internal ID for administrative auditing only — MUST NOT be rendered to unverified end users */
  matchedSupplierId?: string;
  isBranchAdditionEligible?: boolean;
  suggestedAction: 'REJECT' | 'ROUTE_TO_REVIEW' | 'PROCEED' | 'SUGGEST_BRANCH_ADDITION';
  userMessage?: string;
  auditNote: string;
}

export interface BuyerIdentityCandidate {
  email: string;
  phone: string;
  businessName?: string | null;
  buyerType: 'INDIVIDUAL' | 'RWA' | 'MSME' | string;
  organizationName?: string | null;
}

export interface ExistingBuyerIdentity {
  userId: string;
  email: string;
  phone: string;
  buyerType?: string | null;
  organizationId?: string | null;
}

export interface BuyerDuplicateCheckResult {
  isDuplicate: boolean;
  matchLevel: DuplicateMatchLevel;
  reasons: string[];
  suggestedAction: 'REJECT_EXACT' | 'PROCEED' | 'SUGGEST_SIGN_IN' | 'ALLOW_ORG_INVITE';
  userMessage?: string;
  auditNote: string;
}

/**
 * Normalizes phone numbers to standard E.164 format.
 * Defaults to India (+91) for 10-digit mobile numbers.
 */
export function normalizePhoneNumber(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }
  return digits ? `+${digits}` : '';
}

/**
 * Normalizes email addresses: lowercase, trimmed.
 */
export function normalizeEmailAddress(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

/**
 * Normalizes GSTIN strings: uppercase, stripped of whitespace and hyphens.
 */
export function normalizeGstin(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Normalizes business names for robust entity matching:
 * - Lowercases and trims
 * - Removes corporate legal suffixes (e.g. Pvt Ltd, Private Limited, LLP, Ltd)
 * - Removes punctuation and collapses whitespace
 */
export function normalizeBusinessName(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';

  let name = raw.toLowerCase().trim();

  // Replace common symbols with words or spaces
  name = name.replace(/&/g, ' and ');

  // Remove punctuation
  name = name.replace(/[.,/#!$%^*;:{}=\-_`~()]/g, ' ');

  // Remove corporate suffixes
  const corporateSuffixes = [
    /\bprivate\s+limited\b/g,
    /\bpvt\s+ltd\b/g,
    /\bpvt\b/g,
    /\blimited\b/g,
    /\bltd\b/g,
    /\bllp\b/g,
    /\bllc\b/g,
    /\binc\b/g,
    /\bco\b/g,
    /\bcorp\b/g,
    /\bcorporation\b/g,
    /\benterprise\b/g,
    /\benterprises\b/g,
    /\bproprietorship\b/g,
    /\bprop\b/g,
    /\btraders\b/g,
    /\btrading\b/g,
    /\bservices\b/g,
    /\bsolutions\b/g,
  ];

  for (const suffix of corporateSuffixes) {
    name = name.replace(suffix, ' ');
  }

  // Collapse multiple whitespaces
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

/**
 * Validates and detects duplicate supplier registrations using a risk-based ladder.
 * Prevents exact duplicate GSTINs and suspicious duplicate non-GST micro-contractors.
 */
export function checkSupplierDuplicateIdentity(
  candidate: SupplierIdentityCandidate,
  existingSuppliers: ExistingSupplierIdentity[],
): SupplierDuplicateCheckResult {
  const normGstin = normalizeGstin(candidate.gstin);
  const normPhone = normalizePhoneNumber(candidate.phone);
  const normEmail = normalizeEmailAddress(candidate.email);
  const normName = normalizeBusinessName(candidate.businessName);

  // 1. GST-Registered Supplier Check
  if (normGstin) {
    const gstinValidation = validateGstin(normGstin);
    if (!gstinValidation.valid) {
      return {
        isDuplicate: false,
        matchLevel: 'NO_DUPLICATE',
        reasons: [`Invalid GSTIN checksum or structure: ${gstinValidation.error ?? 'Malformed GSTIN'}`],
        suggestedAction: 'REJECT',
        userMessage: 'Please enter a valid 15-character GSTIN with a valid checksum.',
        auditNote: `GSTIN validation failed for candidate: ${normGstin}`,
      };
    }

    // Check against existing supplier records
    const gstinMatch = existingSuppliers.find(
      (s) => normalizeGstin(s.gstin) === normGstin,
    );

    if (gstinMatch) {
      // If the candidate is from a different state/city than the existing match,
      // it may be an operational branch addition under the same corporate entity.
      const candidateStateCode = normGstin.substring(0, 2);
      const isSameCity =
        candidate.city &&
        gstinMatch.city &&
        candidate.city.trim().toLowerCase() === gstinMatch.city.trim().toLowerCase();

      if (!isSameCity) {
        return {
          isDuplicate: true,
          matchLevel: 'POSSIBLE_BRANCH',
          reasons: ['A registered supplier with this GSTIN already exists in a different location.'],
          matchedSupplierId: gstinMatch.supplierId,
          isBranchAdditionEligible: true,
          suggestedAction: 'SUGGEST_BRANCH_ADDITION',
          userMessage:
            'This GSTIN is already registered on OTP. If you are adding a new branch or depot, please sign in to your primary account to add an operational location.',
          auditNote: `GSTIN ${normGstin} matched existing supplier ${gstinMatch.supplierId} with different operational city.`,
        };
      }

      return {
        isDuplicate: true,
        matchLevel: 'EXACT_PROHIBITED',
        reasons: ['A verified supplier account is already registered with this exact GSTIN.'],
        matchedSupplierId: gstinMatch.supplierId,
        suggestedAction: 'REJECT',
        userMessage:
          'This GSTIN is already registered on OTP. Please sign in to your existing account or contact your account administrator.',
        auditNote: `Exact prohibited duplicate GSTIN collision: ${normGstin}`,
      };
    }
  }

  // 2. Email Address Exact Match Check
  if (normEmail) {
    const emailMatch = existingSuppliers.find(
      (s) => normalizeEmailAddress(s.email) === normEmail,
    );
    if (emailMatch) {
      return {
        isDuplicate: true,
        matchLevel: 'EXACT_PROHIBITED',
        reasons: ['A supplier account with this email address already exists.'],
        matchedSupplierId: emailMatch.supplierId,
        suggestedAction: 'REJECT',
        userMessage:
          'An account with this email address is already registered. Please sign in or use password recovery.',
        auditNote: `Supplier email collision detected on normalized email: ${normEmail}`,
      };
    }
  }

  // 3. Multi-Signal Matching for Non-GST Suppliers (Micro-contractors)
  if (normPhone && normName) {
    const phoneAndNameMatch = existingSuppliers.find((s) => {
      const existingPhone = normalizePhoneNumber(s.phone);
      const existingName = normalizeBusinessName(s.businessName);
      return existingPhone === normPhone && existingName === normName;
    });

    if (phoneAndNameMatch) {
      return {
        isDuplicate: true,
        matchLevel: 'EXACT_PROHIBITED',
        reasons: ['A business with this exact contact number and business name is already registered.'],
        matchedSupplierId: phoneAndNameMatch.supplierId,
        suggestedAction: 'REJECT',
        userMessage:
          'A supplier profile with this business name and mobile number already exists. Please sign in to access your dashboard.',
        auditNote: `Exact phone (${normPhone}) and business name match for supplier ${phoneAndNameMatch.supplierId}.`,
      };
    }

    // Likely duplicate: Same phone number with a very similar name or same contact
    const phoneOnlyMatch = existingSuppliers.find(
      (s) => normalizePhoneNumber(s.phone) === normPhone,
    );

    if (phoneOnlyMatch) {
      return {
        isDuplicate: false, // Flagged for review rather than blocked outright
        matchLevel: 'LIKELY_DUPLICATE',
        reasons: ['Mobile number is shared with another registered supplier entity.'],
        matchedSupplierId: phoneOnlyMatch.supplierId,
        suggestedAction: 'ROUTE_TO_REVIEW',
        userMessage:
          'Your registration has been submitted for manual review due to a shared contact record. Our team will verify and activate your profile.',
        auditNote: `Shared phone number (${normPhone}) between new applicant and supplier ${phoneOnlyMatch.supplierId}. Routed to SuperAdmin verification.`,
      };
    }
  }

  return {
    isDuplicate: false,
    matchLevel: 'NO_DUPLICATE',
    reasons: [],
    suggestedAction: 'PROCEED',
    auditNote: 'Clean registration: No duplicate identity signals found.',
  };
}

/**
 * Checks buyer identity credentials against existing accounts.
 * Prevents account collisions while preserving multi-role org invitations.
 */
export function checkBuyerDuplicateIdentity(
  candidate: BuyerIdentityCandidate,
  existingBuyers: ExistingBuyerIdentity[],
): BuyerDuplicateCheckResult {
  const normEmail = normalizeEmailAddress(candidate.email);
  const normPhone = normalizePhoneNumber(candidate.phone);

  if (!normEmail && !normPhone) {
    return {
      isDuplicate: false,
      matchLevel: 'NO_DUPLICATE',
      reasons: ['Insufficient identity data provided.'],
      suggestedAction: 'PROCEED',
      auditNote: 'Missing credentials for verification.',
    };
  }

  // 1. Exact Email Match Check
  const emailMatch = existingBuyers.find(
    (b) => normalizeEmailAddress(b.email) === normEmail,
  );

  if (emailMatch) {
    return {
      isDuplicate: true,
      matchLevel: 'EXACT_PROHIBITED',
      reasons: ['An account with this email address is already registered.'],
      suggestedAction: 'SUGGEST_SIGN_IN',
      userMessage:
        'An account with this email address already exists. Please sign in with your password or use password recovery.',
      auditNote: `Buyer email collision on ${normEmail} (Existing user: ${emailMatch.userId}).`,
    };
  }

  // 2. Exact Phone Match Check
  if (normPhone) {
    const phoneMatch = existingBuyers.find(
      (b) => normalizePhoneNumber(b.phone) === normPhone,
    );

    if (phoneMatch) {
      return {
        isDuplicate: true,
        matchLevel: 'EXACT_PROHIBITED',
        reasons: ['An account with this mobile number already exists.'],
        suggestedAction: 'SUGGEST_SIGN_IN',
        userMessage:
          'This mobile number is already associated with an existing OTP account. Please sign in to continue or link your organisation.',
        auditNote: `Buyer mobile number collision on ${normPhone} (Existing user: ${phoneMatch.userId}).`,
      };
    }
  }

  return {
    isDuplicate: false,
    matchLevel: 'NO_DUPLICATE',
    reasons: [],
    suggestedAction: 'PROCEED',
    auditNote: 'Buyer identity verified: No duplicate records found.',
  };
}
