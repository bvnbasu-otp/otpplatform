/**
 * Supplier discovery — aggregates Supplier Network adapters (ONDC, BNI, Association,
 * Direct, Local registry) into OTP's common supplier model.
 *
 * Discovery answers: "Who can fulfil this?" — separate from procurement (RFQ → identity-protected evaluation).
 * match_score and source are internal only; never exposed in identity-protected evaluation payloads.
 */
export interface DiscoveryCriteria {
  category: string;
  location?: { city?: string; pinCode?: string };
  structuredSpecs?: Record<string, unknown>;
}

export interface DiscoveryResult {
  supplierId: string;
  eligibilityScore: number;
  matchScore: number;
  matchReasons: string[];
  source: string;
}

export interface SupplierDiscoveryService {
  discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]>;
}
