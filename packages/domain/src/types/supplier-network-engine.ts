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
}

export interface EngineDiscoveryResponse {
  candidates: NormalizedSupplierCandidate[];
  providerSummaries: ProviderExecutionSummary[];
  totalCandidatesDiscovered: number;
  totalUniqueCandidates: number;
  durationMs: number;
  hasPartialFailures: boolean;
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
      return r;
    });
}

/**
 * Validates that a candidate payload strictly adheres to anti-leak identity protection.
 */
export function validateCandidateAntiLeak(candidate: unknown): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];
  if (!candidate || typeof candidate !== 'object') {
    return { valid: false, violations: ['Invalid candidate payload: expected object'] };
  }

  const obj = candidate as Record<string, any>;

  for (const field of FORBIDDEN_CANDIDATE_PII_FIELDS) {
    if (field in obj && obj[field] !== undefined && obj[field] !== null && obj[field] !== '') {
      violations.push(`Forbidden PII field "${field}" present in candidate`);
    }
  }

  // Check matchReasons for source leakage
  if (Array.isArray(obj.matchReasons)) {
    for (const r of obj.matchReasons) {
      if (typeof r === 'string' && r.toLowerCase().startsWith('source:')) {
        violations.push(`Network source fingerprint "${r}" detected in matchReasons`);
      }
    }
  }

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
