import type { SupplierNetwork } from '@otp/domain';

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
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'NETWORK_VERIFIED';
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
}

export interface SupplierNetworkPort {
  readonly network: SupplierNetwork;
  discover(criteria: {
    category: string;
    location?: { city?: string; pinCode?: string };
    structuredSpecs?: Record<string, unknown>;
  }): Promise<NetworkDiscoveryCandidate[]>;
}
