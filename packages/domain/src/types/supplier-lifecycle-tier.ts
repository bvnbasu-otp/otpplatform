import {
  SupplierDiscoveryLifecycleTier,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '../enums/supplier';
import { validateGstin } from '../gst/gstin-validator';

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
 */
export const FIVE_TIER_LIFECYCLE_SEQUENCE: readonly SupplierDiscoveryLifecycleTier[] = [
  SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
  SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE,
  SupplierDiscoveryLifecycleTier.OTP_REGISTERED,
  SupplierDiscoveryLifecycleTier.OTP_VERIFIED,
  SupplierDiscoveryLifecycleTier.GST_VERIFIED,
] as const;

/**
 * Evaluates the truthful 5-tier lifecycle status of a supplier candidate.
 * 
 * Hierarchy:
 * Tier 1 (DISCOVERED_IN_AREA): Discovered via radius / geographic directory search. No verified contact details yet.
 * Tier 2 (DETAILS_AVAILABLE): Business name and valid phone or email available for quote invite dispatch.
 * Tier 3 (OTP_REGISTERED): Claimed or registered profile on OTP platform.
 * Tier 4 (OTP_VERIFIED): Verified phone/email/identity credentials on platform.
 * Tier 5 (GST_VERIFIED): Validated statutory GSTIN (Luhn Mod-36 checksum) + 2-stage verification complete.
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
