import {
  SupplierDiscoveryLifecycleTier,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '../enums/supplier';
import { validateGstin } from '../gst/gstin-validator';
import { validatePan } from '../tax/tds-calculator';

export { SupplierDiscoveryLifecycleTier };

export interface SupplierDiscoveryCandidateInput {
  supplierId?: string;
  businessName?: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  pan?: string | null;
  isOtpRegistered?: boolean;
  isOtpVerified?: boolean;
  isGstVerified?: boolean;
  coordinates?: { lat: number; lng: number } | null;
  city?: string | null;
  pinCode?: string | null;
}

export interface SupplierDiscoveryTierEvaluation {
  tier: SupplierDiscoveryLifecycleTier;
  rank: number; // 1 to 5
  canReceiveInvitation: boolean;
  canSubmitQuote: boolean;
  requiresAwardOnboarding: boolean;
  isStatutoryVerified: boolean;
  explanation: string;
}

/**
 * Ordered sequence of 5-tier supplier discovery lifecycle.
 * Monotonic rule: "Discovery is not registration. Registration is not verification. Verification is not GST verification."
 */
export const FIVE_TIER_LIFECYCLE_SEQUENCE: readonly SupplierDiscoveryLifecycleTier[] = [
  SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
  SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
  SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
  SupplierDiscoveryLifecycleTier.OTP_VERIFIED,
  SupplierDiscoveryLifecycleTier.GST_VERIFIED,
] as const;

/**
 * Discrete capability boundaries across the 5 canonical supplier lifecycle tiers.
 */
export interface SupplierTierCapabilities {
  tier: SupplierDiscoveryLifecycleTier;
  rank: number; // 1 to 5
  canAppearInNetworkDiscovery: boolean;
  canReceiveRfqInvitation: boolean;
  canSubmitQuote: boolean;
  canClaimProfile: boolean;
  badgeLabel: string;
  badgeVariant: 'neutral' | 'info' | 'secondary' | 'primary' | 'success';
  isWinningEligible: boolean;
  canDirectRevealOnAward: boolean;
  canAcceptPurchaseOrder: boolean;
  canParticipateInSettlement: boolean;
  requiresStatutoryOnboardingGate: boolean;
  description: string;
}

export const SUPPLIER_TIER_CAPABILITY_MATRIX: Record<
  SupplierDiscoveryLifecycleTier,
  SupplierTierCapabilities
> = {
  [SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA]: {
    tier: SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
    rank: 1,
    canAppearInNetworkDiscovery: true,
    canReceiveRfqInvitation: false,
    canSubmitQuote: false,
    canClaimProfile: true,
    badgeLabel: 'Discovered in Area',
    badgeVariant: 'neutral',
    isWinningEligible: false,
    canDirectRevealOnAward: false,
    canAcceptPurchaseOrder: false,
    canParticipateInSettlement: false,
    requiresStatutoryOnboardingGate: true,
    description:
      'Discovered via spatial radius / directory crawl. No verified contact details. Cannot receive automated invitations or quote.',
  },
  [SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE]: {
    tier: SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
    rank: 2,
    canAppearInNetworkDiscovery: true,
    canReceiveRfqInvitation: true,
    canSubmitQuote: false, // Must claim/open magic link first to quote
    canClaimProfile: true,
    badgeLabel: 'Contact Details Available',
    badgeVariant: 'info',
    isWinningEligible: false,
    canDirectRevealOnAward: false,
    canAcceptPurchaseOrder: false,
    canParticipateInSettlement: false,
    requiresStatutoryOnboardingGate: true,
    description:
      'Contact phone/email identified. Eligible for tokenized magic-link quote invitation dispatch (/q/:token). Must claim/register to quote.',
  },
  [SupplierDiscoveryLifecycleTier.OTP_REGISTERED]: {
    tier: SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
    rank: 3,
    canAppearInNetworkDiscovery: true,
    canReceiveRfqInvitation: true,
    canSubmitQuote: true, // Sealed/masked bids permitted
    canClaimProfile: true,
    badgeLabel: 'OTP Registered',
    badgeVariant: 'secondary',
    isWinningEligible: true, // Gated at award
    canDirectRevealOnAward: false, // Blocked by PA-02 gate
    canAcceptPurchaseOrder: false, // Blocked by statutory gate
    canParticipateInSettlement: false, // Blocked by statutory gate
    requiresStatutoryOnboardingGate: true,
    description:
      'Profile registered or claimed on OTP. Permitted to submit identity-protected quotes. Statutory 2-stage verification required upon winning.',
  },
  [SupplierDiscoveryLifecycleTier.OTP_VERIFIED]: {
    tier: SupplierDiscoveryLifecycleTier.OTP_VERIFIED,
    rank: 4,
    canAppearInNetworkDiscovery: true,
    canReceiveRfqInvitation: true,
    canSubmitQuote: true,
    canClaimProfile: true,
    badgeLabel: 'OTP Verified',
    badgeVariant: 'primary',
    isWinningEligible: true,
    canDirectRevealOnAward: false, // Still requires GST verification check if applicable
    canAcceptPurchaseOrder: false,
    canParticipateInSettlement: false,
    requiresStatutoryOnboardingGate: true,
    description:
      'Identity and contact credentials validated on platform. Statutory GST validation required before direct unmasked contract execution.',
  },
  [SupplierDiscoveryLifecycleTier.GST_VERIFIED]: {
    tier: SupplierDiscoveryLifecycleTier.GST_VERIFIED,
    rank: 5,
    canAppearInNetworkDiscovery: true,
    canReceiveRfqInvitation: true,
    canSubmitQuote: true,
    canClaimProfile: true,
    badgeLabel: 'GST Verified',
    badgeVariant: 'success',
    isWinningEligible: true,
    canDirectRevealOnAward: true, // PA-02 bypass allowed for fully verified
    canAcceptPurchaseOrder: true,
    canParticipateInSettlement: true,
    requiresStatutoryOnboardingGate: false,
    description:
      'Full statutory verification complete (GSTIN syntax + Luhn Mod-36 checksum + 2-stage verification). Eligible for instant reveal and PO execution.',
  },
};

/**
 * Returns the discrete capabilities for a given lifecycle tier.
 */
export function getSupplierTierCapabilities(
  tier: SupplierDiscoveryLifecycleTier,
): SupplierTierCapabilities {
  const capabilities = SUPPLIER_TIER_CAPABILITY_MATRIX[tier];
  if (!capabilities) {
    throw new Error(`Unknown supplier lifecycle tier: ${tier}`);
  }
  return capabilities;
}

/**
 * Discovered Supplier Domain Representation.
 * Represents unauthenticated, discovered supplier data in the discovery pool.
 * INVARIANT: Never creates a login user account or awards a verified badge.
 */
export interface DiscoveredSupplierProfile {
  id: string;
  businessName: string;
  category: string;
  subcategories: string[];
  city: string;
  state: string;
  pinCode: string;
  coordinates?: { lat: number; lng: number } | null;
  phone?: string | null;
  email?: string | null;
  primaryNetwork: string;
  discoveredNetworks: string[];
  discoveredAt: string;
  lastSeenAt: string;
  confidenceScore: number; // 0 to 100
  relationshipHistory: Array<{
    rfqId: string;
    invitedAt: string;
    responded: boolean;
  }>;
  isAccountCreated: false;
  hasVerifiedBadge: false;
  tier: SupplierDiscoveryLifecycleTier;
}

/**
 * Factory for creating truthful discovered supplier representation.
 */
export function createDiscoveredSupplierRepresentation(params: {
  id: string;
  businessName: string;
  category: string;
  subcategories?: string[];
  city: string;
  state: string;
  pinCode: string;
  coordinates?: { lat: number; lng: number } | null;
  phone?: string | null;
  email?: string | null;
  primaryNetwork: string;
  discoveredNetworks?: string[];
  discoveredAt?: string;
  lastSeenAt?: string;
  confidenceScore?: number;
  relationshipHistory?: Array<{ rfqId: string; invitedAt: string; responded: boolean }>;
}): DiscoveredSupplierProfile {
  const hasContact = Boolean(
    (params.phone && params.phone.trim().length >= 10) ||
    (params.email && params.email.includes('@')),
  );

  const tier = hasContact
    ? SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE
    : SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA;

  const now = new Date().toISOString();

  return {
    id: params.id,
    businessName: params.businessName.trim(),
    category: params.category.trim(),
    subcategories: params.subcategories ?? [],
    city: params.city.trim(),
    state: params.state.trim(),
    pinCode: params.pinCode.trim(),
    coordinates: params.coordinates ?? null,
    phone: params.phone?.trim() || null,
    email: params.email?.trim() || null,
    primaryNetwork: params.primaryNetwork,
    discoveredNetworks: params.discoveredNetworks && params.discoveredNetworks.length > 0
      ? params.discoveredNetworks
      : [params.primaryNetwork],
    discoveredAt: params.discoveredAt ?? now,
    lastSeenAt: params.lastSeenAt ?? now,
    confidenceScore: Math.max(0, Math.min(100, params.confidenceScore ?? 50)),
    relationshipHistory: params.relationshipHistory ?? [],
    isAccountCreated: false,
    hasVerifiedBadge: false,
    tier,
  };
}

/**
 * Evaluates the truthful 5-tier lifecycle status of a supplier candidate.
 */
export function evaluateSupplierDiscoveryTier(
  input: SupplierDiscoveryCandidateInput,
): SupplierDiscoveryTierEvaluation {
  const hasGstin = Boolean(input.gstin && input.gstin.trim().length === 15);
  const isGstinChecksumValid = hasGstin ? validateGstin(input.gstin!).valid : false;
  const isGstVerified = Boolean(input.isGstVerified && isGstinChecksumValid);

  // Tier 5: GST_VERIFIED
  if (isGstVerified && (input.isOtpRegistered || input.isOtpVerified)) {
    return {
      tier: SupplierDiscoveryLifecycleTier.GST_VERIFIED,
      rank: 5,
      canReceiveInvitation: true,
      canSubmitQuote: true,
      requiresAwardOnboarding: false,
      isStatutoryVerified: true,
      explanation: 'Statutory GSTIN and credentials verified with active OTP profile (Tier 5)',
    };
  }

  // Tier 4: OTP_VERIFIED
  if (input.isOtpVerified) {
    return {
      tier: SupplierDiscoveryLifecycleTier.OTP_VERIFIED,
      rank: 4,
      canReceiveInvitation: true,
      canSubmitQuote: true,
      requiresAwardOnboarding: true, // Needs GST/statutory check before unmasking/PO
      isStatutoryVerified: false,
      explanation: 'OTP platform verified identity; statutory GST onboarding required before award reveal (Tier 4)',
    };
  }

  // Tier 3: OTP_REGISTERED
  if (input.isOtpRegistered) {
    return {
      tier: SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
      rank: 3,
      canReceiveInvitation: true,
      canSubmitQuote: true,
      requiresAwardOnboarding: true,
      isStatutoryVerified: false,
      explanation: 'Registered OTP profile; KYC and statutory verification required (Tier 3)',
    };
  }

  // Tier 2: DETAILS_AVAILABLE
  const hasContact = Boolean(
    (input.phone && input.phone.trim().length >= 10) ||
    (input.email && input.email.includes('@'))
  );

  if (hasContact) {
    return {
      tier: SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
      rank: 2,
      canReceiveInvitation: true,
      canSubmitQuote: false, // Must claim/register via magic link first
      requiresAwardOnboarding: true,
      isStatutoryVerified: false,
      explanation: 'Contact details available for invitation dispatch via tokenized link (Tier 2)',
    };
  }

  // Tier 1: DISCOVERED_IN_AREA
  return {
    tier: SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
    rank: 1,
    canReceiveInvitation: false,
    canSubmitQuote: false,
    requiresAwardOnboarding: true,
    isStatutoryVerified: false,
    explanation: 'Discovered in geographic radius; awaiting contact details enrichment (Tier 1)',
  };
}

export class IllegalLifecycleTransitionError extends Error {
  constructor(
    public readonly currentTier: SupplierDiscoveryLifecycleTier,
    public readonly targetTier: SupplierDiscoveryLifecycleTier,
    message?: string,
  ) {
    super(
      message ||
        `Illegal backward supplier lifecycle transition from ${currentTier} to ${targetTier}. Lifecycle progression is strictly monotonic.`,
    );
    this.name = 'IllegalLifecycleTransitionError';
  }
}

/**
 * Validates whether a transition between discovery lifecycle tiers is legal.
 * Transitions must be progressive or idempotent. Regressions without cause are denied.
 */
export function validateDiscoveryTierTransition(
  currentTier: SupplierDiscoveryLifecycleTier,
  targetTier: SupplierDiscoveryLifecycleTier,
): { valid: boolean; reason?: string } {
  const currentIndex = FIVE_TIER_LIFECYCLE_SEQUENCE.indexOf(currentTier);
  const targetIndex = FIVE_TIER_LIFECYCLE_SEQUENCE.indexOf(targetTier);

  if (currentIndex === -1 || targetIndex === -1) {
    return { valid: false, reason: 'Invalid lifecycle tier specified' };
  }

  if (targetIndex >= currentIndex) {
    return { valid: true };
  }

  return {
    valid: false,
    reason: `Illegal backward transition from ${currentTier} to ${targetTier}`,
  };
}

/**
 * Asserts monotonic tier transition, throwing an error on illegal regressions.
 */
export function assertMonotonicTierTransition(
  currentTier: SupplierDiscoveryLifecycleTier,
  targetTier: SupplierDiscoveryLifecycleTier,
): void {
  const validation = validateDiscoveryTierTransition(currentTier, targetTier);
  if (!validation.valid) {
    throw new IllegalLifecycleTransitionError(currentTier, targetTier, validation.reason);
  }
}

/**
 * Checks whether a tier can submit competitive quotes directly.
 */
export function canSupplierSubmitQuoteAtTier(tier: SupplierDiscoveryLifecycleTier): boolean {
  return (
    tier === SupplierDiscoveryLifecycleTier.OTP_REGISTERED ||
    tier === SupplierDiscoveryLifecycleTier.OTP_VERIFIED ||
    tier === SupplierDiscoveryLifecycleTier.GST_VERIFIED
  );
}

/**
 * Checks whether a supplier at the given tier can be awarded and revealed
 * directly without passing through the Stage 2 statutory onboarding gate (PA-02).
 */
export function isDirectAwardPermittedWithoutOnboarding(tier: SupplierDiscoveryLifecycleTier): boolean {
  return tier === SupplierDiscoveryLifecycleTier.GST_VERIFIED;
}

// ---------------------------------------------------------------------------
// Supplier Claim & Registration Flow Models
// ---------------------------------------------------------------------------

export type SupplierClaimMatchStatus =
  | 'CONFIRMED_MATCH'
  | 'REVIEW_REQUIRED'
  | 'NO_MATCH_NEW_ENTITY'
  | 'CONFLICT_DETECTED';

export interface SupplierClaimInput {
  claimedByProfileId: string;
  contactPhone: string;
  contactEmail: string;
  legalBusinessName: string;
  gstin?: string | null;
  pan?: string | null;
  verificationMethod: 'PHONE_OTP' | 'EMAIL_OTP' | 'MAGIC_LINK';
  otpVerified: boolean;
}

export interface SupplierClaimMatchEvaluation {
  status: SupplierClaimMatchStatus;
  matchConfidence: number; // 0 to 100
  matchedCandidateId?: string | null;
  targetTier: SupplierDiscoveryLifecycleTier;
  requiresManualReview: boolean;
  reasons: string[];
}

/**
 * Evaluates a supplier claiming an existing discovered or candidate record.
 * Avoids duplicate creation and flags uncertain matches for manual review.
 */
export function evaluateSupplierClaimMatch(
  candidate: SupplierDiscoveryCandidateInput | null,
  claim: SupplierClaimInput,
): SupplierClaimMatchEvaluation {
  const reasons: string[] = [];

  if (!candidate) {
    return {
      status: 'NO_MATCH_NEW_ENTITY',
      matchConfidence: 0,
      targetTier: SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
      requiresManualReview: false,
      reasons: ['No existing candidate match found; creating new registered supplier entity.'],
    };
  }

  let confidence = 0;

  // 1. Phone match
  const cleanCandPhone = candidate.phone ? candidate.phone.replace(/\D/g, '').slice(-10) : '';
  const cleanClaimPhone = claim.contactPhone ? claim.contactPhone.replace(/\D/g, '').slice(-10) : '';
  const phoneMatched = Boolean(cleanCandPhone && cleanClaimPhone && cleanCandPhone === cleanClaimPhone);

  if (phoneMatched) {
    confidence += 35;
    reasons.push('Contact phone matched discovered record.');
  }

  // 2. Email match
  const emailMatched = Boolean(
    candidate.email &&
    claim.contactEmail &&
    candidate.email.trim().toLowerCase() === claim.contactEmail.trim().toLowerCase(),
  );

  if (emailMatched) {
    confidence += 25;
    reasons.push('Contact email matched discovered record.');
  }

  // 3. PAN match / conflict
  const cleanCandPan = candidate.pan?.trim().toUpperCase();
  const cleanClaimPan = claim.pan?.trim().toUpperCase();

  if (cleanCandPan && cleanClaimPan) {
    if (cleanCandPan === cleanClaimPan) {
      confidence += 30;
      reasons.push('Permanent Account Number (PAN) matched candidate record.');
    } else {
      reasons.push(`PAN conflict detected: Candidate PAN (${cleanCandPan}) differs from Claim PAN (${cleanClaimPan}).`);
      return {
        status: 'CONFLICT_DETECTED',
        matchConfidence: 0,
        matchedCandidateId: candidate.supplierId,
        targetTier: SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
        requiresManualReview: true,
        reasons,
      };
    }
  }

  // 4. GSTIN match / conflict
  const cleanCandGst = candidate.gstin?.trim().toUpperCase();
  const cleanClaimGst = claim.gstin?.trim().toUpperCase();

  if (cleanCandGst && cleanClaimGst) {
    if (cleanCandGst === cleanClaimGst) {
      confidence += 40;
      reasons.push('GSTIN matched candidate record exactly.');
    } else {
      reasons.push(`GSTIN conflict detected: Candidate GSTIN (${cleanCandGst}) differs from Claim GSTIN (${cleanClaimGst}).`);
      return {
        status: 'CONFLICT_DETECTED',
        matchConfidence: 0,
        matchedCandidateId: candidate.supplierId,
        targetTier: SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
        requiresManualReview: true,
        reasons,
      };
    }
  }

  // 5. Business Name similarity
  if (candidate.businessName && claim.legalBusinessName) {
    const normA = candidate.businessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normB = claim.legalBusinessName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normA.includes(normB) || normB.includes(normA)) {
      confidence += 15;
      reasons.push('Business legal name closely corresponds to candidate record.');
    }
  }

  // Cap confidence at 100
  const finalConfidence = Math.min(100, confidence);

  // Require OTP verification for claim resolution
  if (!claim.otpVerified) {
    return {
      status: 'REVIEW_REQUIRED',
      matchConfidence: finalConfidence,
      matchedCandidateId: candidate.supplierId,
      targetTier: SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
      requiresManualReview: true,
      reasons: [...reasons, 'OTP verification of claimant contact credentials has not been satisfied.'],
    };
  }

  // Confidence threshold: >= 40 is confirmed match, < 40 is review required
  if (finalConfidence >= 40) {
    const hasValidGst = Boolean(cleanClaimGst && validateGstin(cleanClaimGst).valid);
    const targetTier = hasValidGst
      ? SupplierDiscoveryLifecycleTier.GST_VERIFIED
      : SupplierDiscoveryLifecycleTier.OTP_REGISTERED;

    return {
      status: 'CONFIRMED_MATCH',
      matchConfidence: finalConfidence,
      matchedCandidateId: candidate.supplierId,
      targetTier,
      requiresManualReview: false,
      reasons,
    };
  }

  return {
    status: 'REVIEW_REQUIRED',
    matchConfidence: finalConfidence,
    matchedCandidateId: candidate.supplierId,
    targetTier: SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
    requiresManualReview: true,
    reasons: [...reasons, 'Match confidence below 40% threshold. Admin review required to prevent hijacking.'],
  };
}

// ---------------------------------------------------------------------------
// 2-Stage Verification Gate Models
// ---------------------------------------------------------------------------

export interface Stage1OtpVerificationInput {
  pan?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  phoneOtpVerified?: boolean;
  emailOtpVerified?: boolean;
  authorizedRepName?: string | null;
}

export interface Stage1OtpVerificationResult {
  isValid: boolean;
  errors: Record<string, string>;
  verifiedFields: string[];
  status: TruthfulVerificationStatus;
}

/**
 * Evaluates Stage 1: OTP & Business Identity Verification Gate.
 */
export function evaluateStage1OtpVerification(
  input: Stage1OtpVerificationInput,
): Stage1OtpVerificationResult {
  const errors: Record<string, string> = {};
  const verifiedFields: string[] = [];

  if (!input.authorizedRepName || input.authorizedRepName.trim().length < 2) {
    errors.authorizedRepName = 'Authorized representative name is required.';
  } else {
    verifiedFields.push('authorizedRepName');
  }

  if (!input.contactPhone || !/^[0-9+\s-]{10,15}$/.test(input.contactPhone.trim())) {
    errors.contactPhone = 'Valid contact phone number is required.';
  } else if (!input.phoneOtpVerified) {
    errors.contactPhone = 'Phone OTP verification is required.';
  } else {
    verifiedFields.push('contactPhone');
  }

  if (input.contactEmail) {
    if (!input.contactEmail.includes('@') || !input.contactEmail.includes('.')) {
      errors.contactEmail = 'Valid business email is required.';
    } else if (input.emailOtpVerified) {
      verifiedFields.push('contactEmail');
    }
  }

  if (input.pan) {
    const panCheck = validatePan(input.pan);
    if (!panCheck.isValid) {
      errors.pan = `Invalid PAN: ${panCheck.error}`;
    } else {
      verifiedFields.push('pan');
    }
  }

  const isValid = Object.keys(errors).length === 0;
  const status = isValid
    ? TruthfulVerificationStatus.VERIFIED
    : TruthfulVerificationStatus.PENDING;

  return {
    isValid,
    errors,
    verifiedFields,
    status,
  };
}

export interface Stage2GstVerificationInput {
  gstin?: string | null;
  pan?: string | null;
  legalBusinessName?: string | null;
  providerResponse?: {
    status: 'ACTIVE' | 'CANCELLED' | 'SUSPENDED' | 'UNAVAILABLE' | 'TIMEOUT';
    legalName?: string;
    tradeName?: string;
    active?: boolean;
  } | null;
}

export interface Stage2GstVerificationResult {
  isValid: boolean;
  errors: Record<string, string>;
  checksumValid: boolean;
  panAligned: boolean;
  isOfflineFallback: boolean;
  status: TruthfulVerificationStatus;
}

/**
 * Evaluates Stage 2: Statutory GST Verification Gate.
 * Enforces Luhn Mod-36 checksum, PAN correlation, and truthful offline fallback.
 */
export function evaluateStage2GstVerification(
  input: Stage2GstVerificationInput,
): Stage2GstVerificationResult {
  const errors: Record<string, string> = {};
  let checksumValid = false;
  let panAligned = false;
  let isOfflineFallback = false;

  if (!input.gstin || !input.gstin.trim()) {
    errors.gstin = 'GSTIN is mandatory for statutory Stage 2 verification.';
    return {
      isValid: false,
      errors,
      checksumValid: false,
      panAligned: false,
      isOfflineFallback: false,
      status: TruthfulVerificationStatus.NOT_PROVIDED,
    };
  }

  const cleanGst = input.gstin.trim().toUpperCase();
  const gstinCheck = validateGstin(cleanGst);

  if (!gstinCheck.valid) {
    errors.gstin = `Invalid GSTIN: ${gstinCheck.error}`;
    return {
      isValid: false,
      errors,
      checksumValid: false,
      panAligned: false,
      isOfflineFallback: false,
      status: TruthfulVerificationStatus.FAILED,
    };
  }

  checksumValid = true;

  // PAN correlation
  const embeddedPan = cleanGst.substring(2, 12);
  const cleanPan = input.pan?.trim().toUpperCase();

  if (cleanPan) {
    if (cleanPan !== embeddedPan) {
      errors.pan = `PAN (${cleanPan}) does not match the PAN embedded in GSTIN (${embeddedPan}).`;
      return {
        isValid: false,
        errors,
        checksumValid: true,
        panAligned: false,
        isOfflineFallback: false,
        status: TruthfulVerificationStatus.FAILED,
      };
    }
    panAligned = true;
  } else {
    panAligned = true; // Derived from GSTIN
  }

  // Provider response evaluation & truthful offline fallback
  if (input.providerResponse) {
    if (
      input.providerResponse.status === 'UNAVAILABLE' ||
      input.providerResponse.status === 'TIMEOUT'
    ) {
      // Graceful offline fallback: checksum valid but external lookup pending
      isOfflineFallback = true;
      return {
        isValid: true,
        errors: {},
        checksumValid: true,
        panAligned,
        isOfflineFallback: true,
        status: TruthfulVerificationStatus.PENDING, // Truthful pending status
      };
    }

    if (input.providerResponse.status !== 'ACTIVE' || input.providerResponse.active === false) {
      errors.gstin = `GSTIN status returned by official registry is ${input.providerResponse.status}. Must be ACTIVE.`;
      return {
        isValid: false,
        errors,
        checksumValid: true,
        panAligned,
        isOfflineFallback: false,
        status: TruthfulVerificationStatus.FAILED,
      };
    }
  }

  return {
    isValid: true,
    errors: {},
    checksumValid: true,
    panAligned,
    isOfflineFallback,
    status: TruthfulVerificationStatus.VERIFIED,
  };
}

// ---------------------------------------------------------------------------
// Existing Verified Supplier Multi-RFQ Reuse & Snapshots
// ---------------------------------------------------------------------------

export interface SupplierTransactionSnapshot {
  supplierId: string;
  legalBusinessName: string;
  tradeName?: string | null;
  pan: string;
  gstin?: string | null;
  registeredAddress: Record<string, unknown>;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  verifiedAt: string;
  lifecycleState: SupplierLifecycleState;
  verificationStatus: TruthfulVerificationStatus;
  snapshotCreatedAt: string;
}

/**
 * Generates an immutable transaction snapshot for historical POs and invoices.
 * Ensures future supplier profile mutations never mutate past legal contracts.
 */
export function createSupplierTransactionSnapshot(supplier: {
  id: string;
  legalBusinessName?: string | null;
  businessName?: string | null;
  tradeName?: string | null;
  pan?: string | null;
  gstin?: string | null;
  registeredAddress?: Record<string, unknown> | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  verifiedAt?: string | null;
  lifecycleState?: SupplierLifecycleState | string;
  verificationStatus?: TruthfulVerificationStatus | string;
}): SupplierTransactionSnapshot {
  const now = new Date().toISOString();
  return {
    supplierId: supplier.id,
    legalBusinessName: supplier.legalBusinessName || supplier.businessName || 'Verified Supplier',
    tradeName: supplier.tradeName || null,
    pan: supplier.pan ? supplier.pan.toUpperCase() : '',
    gstin: supplier.gstin ? supplier.gstin.toUpperCase() : null,
    registeredAddress: supplier.registeredAddress || {},
    contactPerson: supplier.contactPerson || '',
    contactPhone: supplier.contactPhone || '',
    contactEmail: supplier.contactEmail || '',
    verifiedAt: supplier.verifiedAt || now,
    lifecycleState: (supplier.lifecycleState as SupplierLifecycleState) || SupplierLifecycleState.VERIFIED,
    verificationStatus: (supplier.verificationStatus as TruthfulVerificationStatus) || TruthfulVerificationStatus.VERIFIED,
    snapshotCreatedAt: now,
  };
}
