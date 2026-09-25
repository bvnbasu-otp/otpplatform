import { SupplierNetwork } from '../enums/supplier-network';
import {
  ProviderExecutionStatus,
  TruthfulProviderStatus,
} from '../enums/provider-execution';
import { IdentityProtectedViolationError } from '../errors/blind-violation';
import type {
  DistanceCalculationResult,
  LocationDescriptor,
} from '../gis/location-intelligence-port';
import type { PerformanceTier } from './vendor-intelligence';

/** Crockford Base32 alphabet (no I, L, O, U to avoid human transcription confusion) */
export const CROCKFORD_BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates an uncorrelatable Crockford Base32 pseudonym short code.
 */
export function generateCrockfordAlias(seed: string, len = 4): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  let num = Math.abs(hash);
  let out = '';
  for (let i = 0; i < len; i++) {
    out = CROCKFORD_BASE32_ALPHABET[num % 32] + out;
    num = Math.floor(num / 32);
  }
  return out;
}

export interface CandidateCapabilityMatch {
  isMatch: boolean;
  matchedCategories: string[];
  capacityOk?: boolean;
  capacityHeadroomRatio?: number;
  notes?: string;
}

export interface CandidateLocationMatch {
  isLocal: boolean;
  serviceAreaMatch: boolean;
  distanceKm?: number;
  deliveryCity?: string;
  deliveryPinCode?: string;
  estimatedTransitDays?: number;
  calculationMethod?: string;
}

export interface CandidateProvenance {
  primaryNetwork: SupplierNetwork;
  discoveredNetworks: SupplierNetwork[];
  externalRef?: string;
  discoveredAt: string;
  verified: boolean;
  truthfulStatus: TruthfulProviderStatus;
}

export interface CandidateFlags {
  canReceiveRfq: boolean;
  canSubmitQuote: boolean;
  isVerifiedActive: boolean;
}

/**
 * Circuit Breaker operational state for resilient provider execution.
 */
export const CircuitBreakerState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

export type CircuitBreakerState =
  (typeof CircuitBreakerState)[keyof typeof CircuitBreakerState];

export interface CircuitBreakerStatus {
  provider: SupplierNetwork;
  state: CircuitBreakerState;
  consecutiveFailures: number;
  failureThreshold: number;
  cooldownMs: number;
  lastFailureTimestamp?: number;
  lastSuccessTimestamp?: number;
  nextProbeTimestamp?: number;
}

export interface ProviderHealthReport {
  provider: SupplierNetwork;
  truthfulStatus: TruthfulProviderStatus;
  circuitBreaker: CircuitBreakerStatus;
  isAvailable: boolean;
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rateLimitedCalls: number;
  averageLatencyMs: number;
  lastError?: string;
  lastSeenTimestamp?: string;
}

/**
 * Verification level for dynamic discovery confidence assessment.
 */
export const DiscoveryVerificationLevel = {
  PLATFORM_VERIFIED: 'PLATFORM_VERIFIED',
  NETWORK_VERIFIED: 'NETWORK_VERIFIED',
  CHAMBER_ATTESTED: 'CHAMBER_ATTESTED',
  SELF_ATTESTED: 'SELF_ATTESTED',
  UNVERIFIED: 'UNVERIFIED',
} as const;

export type DiscoveryVerificationLevel =
  (typeof DiscoveryVerificationLevel)[keyof typeof DiscoveryVerificationLevel];

export interface ConfidenceFactorBreakdown {
  /** Capability match score contribution (0-25) */
  capabilityScore: number;
  /** Capacity headroom score contribution (0-15) */
  capacityScore: number;
  /** Geographic precision score contribution (0-25) */
  geographicScore: number;
  /** Verification credential level score contribution (0-20) */
  verificationScore: number;
  /** Multi-provider consensus agreement score contribution (0-10) */
  consensusScore: number;
  /** Freshness and payload completeness contribution (0-5) */
  freshnessScore: number;
  /** Detailed explanations for each factor */
  factorExplanations: string[];
}

export interface DiscoveryConfidenceAssessment {
  overallConfidenceScore: number; // 0-100
  factors: ConfidenceFactorBreakdown;
  verificationLevel: DiscoveryVerificationLevel;
  consensusProviderCount: number;
  isMultiNetworkVerified: boolean;
  recommendedForInvitation: boolean;
}

/**
 * Replay protection and payload digest verification.
 */
export interface PayloadIntegrityDigest {
  algorithm: 'sha256' | 'blake2b';
  digest: string;
  rawPayloadLength: number;
  computedAt: string;
}

export interface CallbackReplayRecord {
  messageId: string;
  provider: SupplierNetwork;
  transactionId: string;
  tenantId?: string;
  rfqId?: string;
  payloadDigest: string;
  receivedAt: string;
  processedAt?: string;
  expiresAt: string;
}

/**
 * Async provider callback & webhook types.
 */
export interface AsyncProviderCallbackPayload<TBody = unknown> {
  provider: SupplierNetwork;
  messageId: string;
  transactionId: string;
  timestamp: string | number; // ISO string or epoch millis/seconds
  tenantId?: string;
  rfqId?: string;
  authHeader?: string;
  signature?: string;
  body: TBody;
  headers?: Record<string, string | string[]>;
}

export interface CallbackVerificationResult {
  valid: boolean;
  rejectionCode?:
    | 'INVALID_SIGNATURE'
    | 'TIMESTAMP_EXPIRED'
    | 'FUTURE_TIMESTAMP'
    | 'REPLAY_DETECTED'
    | 'INTEGRITY_MISMATCH'
    | 'TENANT_MISMATCH'
    | 'MALFORMED_PAYLOAD'
    | 'UNAUTHORIZED_PROVIDER';
  rejectionReason?: string;
  tenantId?: string;
  rfqId?: string;
  messageId?: string;
}

export interface CallbackProcessingResult {
  success: boolean;
  messageId: string;
  provider: SupplierNetwork;
  candidatesProcessed: number;
  candidates: NormalizedSupplierCandidate[];
  verification: CallbackVerificationResult;
  processedAt: string;
  durationMs: number;
}

/* ========================================================================= */
/* SN.3 SUPPLIER INTELLIGENCE & IDENTITY RESOLUTION ENUMS & CONTRACTS        */
/* ========================================================================= */

/**
 * Canonical match confidence level for identity resolution.
 */
export const IdentityMatchConfidence = {
  EXACT_CANONICAL: 'EXACT_CANONICAL',
  VERIFIED_MATCH: 'VERIFIED_MATCH',
  PROBABLE_MATCH: 'PROBABLE_MATCH',
  UNRESOLVED: 'UNRESOLVED',
  CONFLICT: 'CONFLICT',
} as const;

export type IdentityMatchConfidence =
  (typeof IdentityMatchConfidence)[keyof typeof IdentityMatchConfidence];

/**
 * Primary method utilized to establish canonical identity.
 */
export const IdentityResolutionMethod = {
  CANONICAL_UUID: 'CANONICAL_UUID',
  GSTIN_LUHN_MOD36: 'GSTIN_LUHN_MOD36',
  PAN_STRUCTURE: 'PAN_STRUCTURE',
  MULTI_PROVIDER_CONSENSUS: 'MULTI_PROVIDER_CONSENSUS',
  EXTERNAL_REF: 'EXTERNAL_REF',
  UNRESOLVED: 'UNRESOLVED',
} as const;

export type IdentityResolutionMethod =
  (typeof IdentityResolutionMethod)[keyof typeof IdentityResolutionMethod];

/**
 * Canonical supplier identity resolution summary.
 * ZERO PII LEAKAGE: Contains NO raw PAN, GSTIN, legal names, or banking details.
 */
export interface CanonicalIdentityResolution {
  matchConfidence: IdentityMatchConfidence;
  resolutionMethod: IdentityResolutionMethod;
  canonicalSupplierId?: string;
  isMerged: boolean;
  conflictDetected: boolean;
  conflictReason?: string;
  resolvedProvenanceCount: number;
}

/**
 * Capability verification tiering.
 */
export const CapabilityEvidenceTier = {
  PLATFORM_VERIFIED: 'PLATFORM_VERIFIED',
  NETWORK_VERIFIED: 'NETWORK_VERIFIED',
  CHAMBER_ATTESTED: 'CHAMBER_ATTESTED',
  SELF_DECLARED: 'SELF_DECLARED',
} as const;

export type CapabilityEvidenceTier =
  (typeof CapabilityEvidenceTier)[keyof typeof CapabilityEvidenceTier];

/**
 * Capability specialization and evidence verification summary.
 */
export interface CandidateVerificationSummary {
  evidenceTier: CapabilityEvidenceTier;
  isPlatformVerified: boolean;
  isNetworkVerified: boolean;
  isChamberAttested: boolean;
  verificationScore: number; // 0 - 100
  tierExplanation: string;
}

/**
 * Capacity headroom operational status.
 */
export const CapacityHeadroomStatus = {
  SUFFICIENT: 'SUFFICIENT',
  CONSTRAINED: 'CONSTRAINED',
  EXHAUSTED: 'EXHAUSTED',
  UNKNOWN: 'UNKNOWN',
} as const;

export type CapacityHeadroomStatus =
  (typeof CapacityHeadroomStatus)[keyof typeof CapacityHeadroomStatus];

/**
 * Dynamic capacity headroom evaluation.
 */
export interface CandidateCapacityHeadroom {
  status: CapacityHeadroomStatus;
  declaredCapacity?: number;
  observedCapacity?: number;
  activeBacklog?: number;
  availableHeadroomUnits?: number;
  headroomRatio?: number; // 0.0 - 1.0 (undefined if UNKNOWN)
  unit?: string;
  isHeadroomKnown: boolean;
  explanation: string;
}

/**
 * Supplier performance intelligence summary (35/30/20/15 scorecard metrics).
 * STRICT FIREWALL: Discovery confidence boost only, ZERO award authority.
 */
export interface CandidatePerformanceSummary {
  hasHistoricalPerformance: boolean;
  performanceTier?: PerformanceTier;
  compositeScore?: number; // 0 - 100
  qualityScore?: number; // 0 - 100 (35% weight)
  deliveryScore?: number; // 0 - 100 (30% weight)
  slaDisputeScore?: number; // 0 - 100 (20% weight)
  commercialScore?: number; // 0 - 100 (15% weight)
  completedOrdersCount?: number;
  status: 'MEASURED' | 'INSUFFICIENT_HISTORY';
  confidenceBoost: number; // 0 - 20 discovery confidence bonus
  explanation: string;
}

/**
 * Freshness and staleness assessment status.
 */
export const CandidateFreshnessStatus = {
  PROFILE_FRESH: 'PROFILE_FRESH',
  PROFILE_STALE: 'PROFILE_STALE',
  FRESHNESS_UNKNOWN: 'FRESHNESS_UNKNOWN',
} as const;

export type CandidateFreshnessStatus =
  (typeof CandidateFreshnessStatus)[keyof typeof CandidateFreshnessStatus];

/**
 * Freshness assessment with deterministic 180-day staleness threshold.
 */
export interface CandidateFreshnessAssessment {
  status: CandidateFreshnessStatus;
  ageInDays: number;
  lastVerifiedAt?: string;
  isStale: boolean;
  stalenessDecayApplied: boolean;
  confidencePenalty: number;
  decayReasonCode?: 'STALENESS_DECAY' | 'CLOCK_ANOMALY' | 'NONE';
  explanation: string;
}

/**
 * Closed-loop discovery feedback signals from historical procurement outcomes.
 */
export interface CandidateFeedbackSignals {
  invitationResponseRate?: number; // 0.0 - 1.0
  quoteConversionRate?: number; // 0.0 - 1.0
  fulfillmentSuccessRate?: number; // 0.0 - 1.0
  totalInvitationsReceived: number;
  totalQuotesSubmitted: number;
  feedbackConfidenceAdjustment: number; // -10 to +10
  isSignalReliable: boolean;
  explanation: string;
}

/**
 * Provider-neutral normalized supplier candidate representation.
 * STRICT FIREWALL: Contains ZERO pre-award PII, ZERO network fingerprint leaks,
 * and ZERO authority to self-award or self-issue purchase orders.
 */
export interface NormalizedSupplierCandidate {
  /** Unique session candidate identifier */
  candidateId: string;
  /** Internal canonical supplier UUID if resolved from local registry */
  canonicalSupplierId?: string;
  /** Non-correlatable anonymous Crockford Base32 alias (e.g., 'Supplier 7X9K') */
  anonymousLabel: string;
  /** Match score 0–100 */
  matchScore: number;
  /** Confidence score 0–100 */
  confidenceScore: number;
  /** Sanitized match reasons (strictly free of source fingerprints or PII) */
  matchReasons: string[];
  /** Capability match breakdown */
  capabilityMatch: CandidateCapabilityMatch;
  /** Location intelligence breakdown */
  locationMatch: CandidateLocationMatch;
  /** Provenance metadata (retained internally, stripped before buyer-side view) */
  provenance: CandidateProvenance;
  /** Operational capability flags */
  flags: CandidateFlags;

  /* SN.3 Additive Supplier Intelligence & Identity Enrichment */
  identityResolution?: CanonicalIdentityResolution;
  performanceSummary?: CandidatePerformanceSummary;
  verificationSummary?: CandidateVerificationSummary;
  capacityHeadroom?: CandidateCapacityHeadroom;
  freshnessAssessment?: CandidateFreshnessAssessment;
  feedbackSignals?: CandidateFeedbackSignals;
}

export interface ProviderExecutionSummary {
  provider: SupplierNetwork;
  status: ProviderExecutionStatus;
  candidateCount: number;
  durationMs: number;
  truthfulStatus: TruthfulProviderStatus;
  isTruthfulLive: boolean;
  errorMessage?: string;
}

export interface EngineDiscoveryRequest {
  rfqId?: string;
  organizationId?: string;
  category: string;
  location?: LocationDescriptor;
  structuredSpecs?: Record<string, unknown>;
  maxCandidates?: number;
  excludedSupplierIds?: string[];
  enabledProviders?: SupplierNetwork[];
  timeoutMs?: number;
  forceRefresh?: boolean;
}

export interface EngineDiscoveryResponse {
  candidates: NormalizedSupplierCandidate[];
  providerSummaries: ProviderExecutionSummary[];
  totalCandidatesDiscovered: number;
  totalUniqueCandidates: number;
  durationMs: number;
  hasPartialFailures: boolean;
  isCached?: boolean;
  cacheAgeDays?: number;
}

/** Forbidden PII field names that must NEVER appear on candidate payloads */
export const FORBIDDEN_CANDIDATE_PII_FIELDS = [
  'email',
  'contactEmail',
  'phone',
  'contactPhone',
  'contactPerson',
  'legalName',
  'businessName',
  'pan',
  'panNumber',
  'gstin',
  'taxRegistration',
  'bankAccount',
  'bankAccountNumber',
  'ifsc',
  'addressLine',
  'addressLine1',
  'addressLine2',
  'streetAddress',
] as const;

/**
 * Sanitizes match reasons by removing any network source fingerprints (e.g. 'source:BNI', 'source:ONDC').
 */
export function sanitizeCandidateMatchReasons(reasons: string[]): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons
    .map((r) => String(r).trim())
    .filter((r) => r.length > 0)
    .filter((r) => !r.toLowerCase().startsWith('source:'))
    .map((r) => {
      // Normalize any stray network references
      if (/^ondc:/i.test(r)) return 'network_verified_search';
      if (/^bni:/i.test(r)) return 'association_match';
      if (/^association:/i.test(r)) return 'industry_network_match';
      if (/^direct:/i.test(r)) return 'direct_invite_match';
      if (/^local_registry:/i.test(r)) return 'registry_catalog_match';
      return r;
    });
}

/**
 * Validates that a candidate payload strictly adheres to anti-leak identity protection.
 * Recursively scans nested structures to ensure no PII or source fingerprints leak.
 */
export function validateCandidateAntiLeak(candidate: unknown): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, violations: ['Invalid candidate payload: expected object'] };
  }

  const forbiddenSet = new Set<string>(FORBIDDEN_CANDIDATE_PII_FIELDS);

  function checkObject(obj: any, path = ''): void {
    if (!obj || typeof obj !== 'object') return;

    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        if (typeof item === 'string' && item.toLowerCase().startsWith('source:')) {
          violations.push(`Network source fingerprint "${item}" detected at ${path}[${idx}]`);
        } else if (typeof item === 'object') {
          checkObject(item, `${path}[${idx}]`);
        }
      });
      return;
    }

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const currentPath = path ? `${path}.${key}` : key;

      if (forbiddenSet.has(key)) {
        if (val !== undefined && val !== null && val !== '') {
          violations.push(`Forbidden PII field "${currentPath}" present in candidate`);
        }
      }

      if (key === 'matchReasons' && Array.isArray(val)) {
        for (const r of val) {
          if (typeof r === 'string' && r.toLowerCase().startsWith('source:')) {
            violations.push(`Network source fingerprint "${r}" detected in matchReasons`);
          }
        }
      }

      if (typeof val === 'object' && val !== null) {
        checkObject(val, currentPath);
      }
    }
  }

  checkObject(candidate);

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * Asserts that a candidate payload complies with anti-leak invariants. Throws if invalid.
 */
export function assertCandidateAntiLeak(candidate: unknown): void {
  const result = validateCandidateAntiLeak(candidate);
  if (!result.valid) {
    throw new IdentityProtectedViolationError(result.violations.join('; '));
  }
}
