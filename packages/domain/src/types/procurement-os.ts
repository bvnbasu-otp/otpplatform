import type { SupplierNetwork } from '../enums/supplier-network';

/** Maps internal supplier_source to open supplier network adapter. */
export function supplierSourceToNetwork(source: string): SupplierNetwork {
  switch (source) {
    case 'ONDC':
      return 'ONDC';
    case 'BNI':
      return 'BNI';
    case 'ASSOCIATION':
      return 'ASSOCIATION';
    case 'LOCAL_REGISTRY':
      return 'LOCAL_REGISTRY';
    case 'GOOGLE_PLACES':
    case 'PLACES':
      return 'GOOGLE_PLACES';
    case 'DIRECT':
    case 'REFERRAL':
    default:
      return 'DIRECT';
  }
}

export interface EvaluationWeights {
  price: number;
  delivery: number;
  warranty: number;
}

export interface ProcurementPolicyRules {
  policyType: string;
  minQuotesRequired: number;
  minCommitteeVotes: number;
  requestRoles: string[];
  approveRoles: string[];
  awardRoles: string[];
  evaluationWeights: EvaluationWeights;
  committeeVoteRequired: boolean;
  conflictDeclarationRequired: boolean;
  awardRequiresJustification: boolean;
}

export interface SupplierNetworkSummary {
  network: SupplierNetwork;
  label: string;
  invitedCount: number;
  quotedCount: number;
}

/**
 * How specific the matching baseline is — surfaced so the UI can be honest
 * about whether the buyer is seeing a subcategory-and-city band or a
 * category-wide one.
 */
export type MarketIntelligenceScope =
  | 'subcategory_city'
  | 'subcategory'
  | 'category_city'
  | 'category'
  | 'pilot';

export interface MarketIntelligenceSummary {
  categoryKey: string;
  locationCity: string | null;
  historicalPriceMin: number | null;
  historicalPriceMax: number | null;
  typicalDeliveryDaysMin: number | null;
  typicalDeliveryDaysMax: number | null;
  typicalWarrantyMonthsMin: number | null;
  typicalWarrantyMonthsMax: number | null;
  supplierPerformanceAvg: number | null;
  sampleSize: number;
  /** Live quotes on this RFQ for context */
  currentQuoteRangeMin?: number | null;
  currentQuoteRangeMax?: number | null;
  /** Which taxonomy code and geography the ladder actually matched. */
  matchedKey?: string;
  matchedScope?: MarketIntelligenceScope;
  matchedCity?: string | null;
  /** Source classification for transparency */
  sourceType?:
    | 'LIVE_API'
    | 'DATABASE_CACHE'
    | 'PLATFORM_TRANSACTED'
    | 'STATIC_REFERENCE'
    | 'HISTORICAL_BENCHMARK'
    | 'ESTIMATED_STATISTICAL'
    | 'UNAVAILABLE';
  sourceProviderName?: string;
  freshnessStatus?: 'FRESH' | 'AGING' | 'STALE' | 'EXPIRED' | 'UNAVAILABLE';
  confidenceLevel?: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
  confidenceScore?: number;
  confidenceMethodology?: string;
  isFallback?: boolean;
  fallbackReason?: string | null;
  observedAt?: string | null;
  /** Captured response integrity hash (SHA-256) for auditability */
  responseIntegrityHash?: string | null;
  /** Short note explaining what the band covers. */
  notes?: string | null;
  /** ISO timestamp of when the snapshot was stamped onto the requirement. */
  capturedAt?: string | null;
}
