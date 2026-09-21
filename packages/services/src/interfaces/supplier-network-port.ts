import type { SupplierNetwork, CapabilityEvidenceTier } from '@otp/domain';

/**
 * Supplier Network Abstraction Layer — each adapter connects an external network
 * (ONDC, BNI, association, direct, OTP local registry) to OTP's common supplier model.
 *
 * Discovery answers: "Who can fulfil this requirement?"
 * Procurement (RFQ → identity-protected evaluation → award) remains fully internal to OTP.
 */
export interface NetworkSupplierCapability {
  categories: string[];
  serviceArea?: { city?: string; pinCode?: string; radiusKm?: number };
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'NETWORK_VERIFIED' | 'PLATFORM_VERIFIED' | 'CHAMBER_ATTESTED' | 'SELF_DECLARED';
}

export interface NetworkDiscoveryCandidate {
  externalRef: string;
  network: SupplierNetwork;
  businessName: string;
  capability: NetworkSupplierCapability;
  /** Internal eligibility only — never shown in identity-protected evaluation */
  matchScore: number;
  matchReasons: string[];
  canReceiveRfq: boolean;
  canSubmitQuote: boolean;

  /* SN.3 Provider-internal resolution metadata (stripped from buyer-side payloads) */
  canonicalSupplierId?: string;
  pan?: string;
  gstin?: string;
  tenantId?: string;
  declaredCapacity?: number;
  observedCapacity?: number;
  activeBacklog?: number;
  capacityUnit?: string;
  backlogUnit?: string;
  lastVerifiedAt?: string;
  hasPlatformOrders?: boolean;
  isNetworkAuthenticated?: boolean;
  chamberAttestation?: boolean;
  claimedTier?: CapabilityEvidenceTier | string;
  performanceMetrics?: {
    qualityScore?: number;
    deliveryScore?: number;
    slaDisputeScore?: number;
    commercialScore?: number;
    completedOrdersCount?: number;
    performanceTier?: string;
  };
  feedbackStats?: {
    invitationsReceived?: number;
    quotesSubmitted?: number;
    quotesShortlisted?: number;
    successfulFulfillments?: number;
    totalFulfillments?: number;
  };
}

export interface SupplierNetworkPort {
  readonly network: SupplierNetwork;
  /** Declares whether this provider adapter is live active or a stubbed simulation */
  readonly isTruthfulLive?: boolean;
  /** Optional health or status indicator */
  isEnabled?(): boolean;
  discover(criteria: {
    category: string;
    location?: { city?: string; pinCode?: string };
    structuredSpecs?: Record<string, unknown>;
  }): Promise<NetworkDiscoveryCandidate[]>;
}
