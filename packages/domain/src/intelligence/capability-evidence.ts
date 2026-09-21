import { SupplierNetwork } from '../enums/supplier-network';
import {
  CapabilityEvidenceTier,
  type CandidateVerificationSummary,
} from '../types/supplier-network-engine';

export interface CapabilityEvidenceInput {
  network: SupplierNetwork;
  verificationStatus?: string | null;
  hasPlatformOrders?: boolean;
  isNetworkAuthenticated?: boolean;
  chamberAttestation?: boolean;
  claimedTier?: CapabilityEvidenceTier | string | null;
  categories?: string[];
}

/**
 * Capability Specialization & Evidence Tiering (Phase SN.3).
 *
 * Enforces:
 * 1. Authoritative verification tiering:
 *    - PLATFORM_VERIFIED (100 pts / 1.0 wt): Completed platform transactions / verified credentials.
 *    - NETWORK_VERIFIED (80 pts / 0.85 wt): Cryptographically authenticated external network badge.
 *    - CHAMBER_ATTESTED (60 pts / 0.65 wt): Association or trade chamber accredited.
 *    - SELF_DECLARED (30 pts / 0.35 wt): Self-declared vendor profile.
 * 2. Anti-tampering & Anti-masquerading:
 *    - Prevents unverified candidates from claiming platform or network verified status without proof.
 * 3. Strict Firewall:
 *    - Output strictly represents candidate discovery reliability, NEVER an award score or winner selection.
 */
export class CapabilityEvidenceEvaluator {
  /**
   * Evaluates capability evidence and computes verification tier and score.
   */
  public static evaluateEvidence(input: CapabilityEvidenceInput): CandidateVerificationSummary {
    const rawStatus = (input.verificationStatus ?? '').toUpperCase().trim();
    const claimedTier = (input.claimedTier ?? '').toUpperCase().trim();

    // 1. Check Platform Verification
    const isPlatform =
      input.network === SupplierNetwork.LOCAL_REGISTRY &&
      (input.hasPlatformOrders === true || rawStatus === 'VERIFIED' || rawStatus === 'PLATFORM_VERIFIED');

    if (isPlatform) {
      return {
        evidenceTier: CapabilityEvidenceTier.PLATFORM_VERIFIED,
        isPlatformVerified: true,
        isNetworkVerified: true,
        isChamberAttested: false,
        verificationScore: 100,
        tierExplanation: 'Direct platform transactional and credential verification (Tier 1)',
      };
    }

    // 2. Check Network Verification (e.g. Authenticated ONDC BPP with registry verification)
    const isNetwork =
      input.network === SupplierNetwork.ONDC &&
      (input.isNetworkAuthenticated === true ||
        rawStatus === 'NETWORK_VERIFIED' ||
        rawStatus === 'VERIFIED');

    if (isNetwork) {
      return {
        evidenceTier: CapabilityEvidenceTier.NETWORK_VERIFIED,
        isPlatformVerified: false,
        isNetworkVerified: true,
        isChamberAttested: false,
        verificationScore: 80,
        tierExplanation: 'Cryptographically verified external network registry credentials (Tier 2)',
      };
    }

    // 3. Check Chamber Attestation (e.g. BNI / Industry Association member)
    const isChamber =
      (input.network === SupplierNetwork.BNI ||
        input.network === SupplierNetwork.ASSOCIATION ||
        input.chamberAttestation === true ||
        rawStatus === 'CHAMBER_ATTESTED') &&
      input.network !== SupplierNetwork.DIRECT;

    if (isChamber) {
      return {
        evidenceTier: CapabilityEvidenceTier.CHAMBER_ATTESTED,
        isPlatformVerified: false,
        isNetworkVerified: false,
        isChamberAttested: true,
        verificationScore: 60,
        tierExplanation: 'Industry chamber / trade association verified membership (Tier 3)',
      };
    }

    // 4. Masquerade Defense: If candidate claimed PLATFORM_VERIFIED or NETWORK_VERIFIED
    // without authoritative backing, downgrade to SELF_DECLARED
    let explanation = 'Supplier self-declared capability and catalogue entries (Tier 4)';
    if (
      claimedTier === CapabilityEvidenceTier.PLATFORM_VERIFIED ||
      claimedTier === CapabilityEvidenceTier.NETWORK_VERIFIED ||
      rawStatus === 'VERIFIED'
    ) {
      explanation = 'Unverified claim downgraded to self-declared baseline (Tier 4)';
    }

    return {
      evidenceTier: CapabilityEvidenceTier.SELF_DECLARED,
      isPlatformVerified: false,
      isNetworkVerified: false,
      isChamberAttested: false,
      verificationScore: 30,
      tierExplanation: explanation,
    };
  }

  /**
   * Calculates capability match relevance factor (0-25) weighted by evidence tier.
   */
  public static calculateCapabilityRelevance(
    targetCategory: string,
    matchedCategories: string[],
    evidenceTier: CapabilityEvidenceTier,
    hasStructuredSpecsMatch = false,
  ): { relevanceScore: number; explanation: string } {
    const target = targetCategory.trim().toLowerCase();
    const hasExact = matchedCategories.some((c) => c.trim().toLowerCase() === target);
    const hasAny = matchedCategories.length > 0;

    let baseScore = hasExact ? 18 : hasAny ? 10 : 4;
    if (hasStructuredSpecsMatch) {
      baseScore += 4;
    }

    // Evidence tier multiplier
    let multiplier = 0.35;
    switch (evidenceTier) {
      case CapabilityEvidenceTier.PLATFORM_VERIFIED:
        multiplier = 1.0;
        break;
      case CapabilityEvidenceTier.NETWORK_VERIFIED:
        multiplier = 0.85;
        break;
      case CapabilityEvidenceTier.CHAMBER_ATTESTED:
        multiplier = 0.65;
        break;
      case CapabilityEvidenceTier.SELF_DECLARED:
      default:
        multiplier = 0.35;
        break;
    }

    const relevanceScore = Math.min(25, Math.max(0, Math.round(baseScore * multiplier + (hasExact ? 7 : 0))));
    return {
      relevanceScore,
      explanation: `Capability relevance: ${evidenceTier} (${relevanceScore}/25)`,
    };
  }
}
