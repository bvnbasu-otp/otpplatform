import { describe, expect, it } from 'vitest';
import {
  generateCrockfordAlias,
  sanitizeCandidateMatchReasons,
  validateCandidateAntiLeak,
  assertCandidateAntiLeak,
  FORBIDDEN_CANDIDATE_PII_FIELDS,
  CROCKFORD_BASE32_ALPHABET,
  type NormalizedSupplierCandidate,
  SupplierNetwork,
  ProviderExecutionStatus,
  TruthfulProviderStatus,
  IdentityMatchConfidence,
  IdentityResolutionMethod,
  CapabilityEvidenceTier,
  CapacityHeadroomStatus,
  CandidateFreshnessStatus,
  validatePan,
  CanonicalIdentityResolver,
  CapabilityEvidenceEvaluator,
  DynamicCapacityHeadroomCalculator,
  SupplierPerformanceIntelligenceEvaluator,
  FreshnessIntelligenceEvaluator,
  DiscoveryFeedbackSignalsEvaluator,
} from '../index';
import { IdentityProtectedViolationError } from '../errors/blind-violation';

describe('Supplier Network Engine Domain Contracts & SN.3 Intelligence Models', () => {
  describe('Crockford Base32 Pseudonym Generation', () => {
    it('generates deterministic pseudonyms of the specified length', () => {
      const alias1 = generateCrockfordAlias('rfq-101:supplier-1', 4);
      const alias2 = generateCrockfordAlias('rfq-101:supplier-1', 4);
      expect(alias1).toBe(alias2);
      expect(alias1).toHaveLength(4);
    });

    it('generates distinct pseudonyms for different supplier/RFQ seeds', () => {
      const aliasA = generateCrockfordAlias('rfq-101:supplier-A', 4);
      const aliasB = generateCrockfordAlias('rfq-101:supplier-B', 4);
      expect(aliasA).not.toBe(aliasB);
    });

    it('only uses valid Crockford Base32 characters (no I, L, O, U)', () => {
      for (let i = 0; i < 50; i++) {
        const alias = generateCrockfordAlias(`seed-${i}`, 4);
        for (const char of alias) {
          expect(CROCKFORD_BASE32_ALPHABET).toContain(char);
          expect(['I', 'L', 'O', 'U']).not.toContain(char);
        }
      }
    });
  });

  describe('Candidate Match Reasons Sanitization', () => {
    it('strips any network source fingerprints like source:BNI and source:ONDC', () => {
      const dirty = [
        'category_match',
        'source:BNI',
        'source:ONDC',
        'source:LOCAL_REGISTRY',
        'geo:local',
      ];
      const sanitized = sanitizeCandidateMatchReasons(dirty);
      expect(sanitized).toEqual(['category_match', 'geo:local']);
      expect(sanitized.some((r) => r.startsWith('source:'))).toBe(false);
    });

    it('normalizes provider-prefixed reasons into neutral descriptions', () => {
      const input = [
        'ondc:live_gateway_search',
        'bni:discovery',
        'direct:invite',
        'category:pumps',
      ];
      const result = sanitizeCandidateMatchReasons(input);
      expect(result).toEqual([
        'network_verified_search',
        'association_match',
        'direct_invite_match',
        'category:pumps',
      ]);
    });

    it('handles empty or non-array inputs gracefully', () => {
      expect(sanitizeCandidateMatchReasons([])).toEqual([]);
      expect(sanitizeCandidateMatchReasons(null as any)).toEqual([]);
    });
  });

  describe('SN3-01: Canonical Identity Resolution & PAN Validation', () => {
    it('validates standard 10-char Indian PAN numbers', () => {
      const valid = validatePan('ABCDE1234F');
      expect(valid.isValid).toBe(true);

      const companyPan = validatePan('AABCC5678C');
      expect(companyPan.isValid).toBe(true);
      expect(companyPan.entityType).toBe('Company (Private / Public Limited)');

      const invalidLength = validatePan('ABC123');
      expect(invalidLength.isValid).toBe(false);

      const invalidStructure = validatePan('12345ABCDE');
      expect(invalidStructure.isValid).toBe(false);
    });

    it('resolves exact canonical identity from known supplier registry entry', () => {
      const registry = [
        {
          canonicalSupplierId: 'supp-canonical-001',
          pan: 'ABCDE1234F',
          gstin: '29ABCDE1234F1Z5',
          tenantId: 'tenant-a',
        },
      ];

      const res = CanonicalIdentityResolver.resolveIdentity(
        {
          canonicalSupplierId: 'supp-canonical-001',
          pan: 'ABCDE1234F',
          tenantId: 'tenant-a',
        },
        registry,
      );

      expect(res.matchConfidence).toBe(IdentityMatchConfidence.EXACT_CANONICAL);
      expect(res.resolutionMethod).toBe(IdentityResolutionMethod.CANONICAL_UUID);
      expect(res.canonicalSupplierId).toBe('supp-canonical-001');
      expect(res.conflictDetected).toBe(false);
    });

    it('detects conflict when candidate PAN contradicts GSTIN-derived PAN', () => {
      const res = CanonicalIdentityResolver.resolveIdentity({
        pan: 'XYZAB5678C',
        gstin: '29ABCDE1234F1Z5', // Embedded PAN is ABCDE1234F
      });

      expect(res.matchConfidence).toBe(IdentityMatchConfidence.CONFLICT);
      expect(res.conflictDetected).toBe(true);
      expect(res.conflictReason).toContain('does not match');
    });

    it('prevents cross-tenant identity hijacking in known registry', () => {
      const registry = [
        {
          canonicalSupplierId: 'supp-secret-002',
          pan: 'ABCDE1234F',
          tenantId: 'tenant-alpha',
        },
      ];

      const res = CanonicalIdentityResolver.resolveIdentity(
        {
          canonicalSupplierId: 'supp-secret-002',
          tenantId: 'tenant-beta', // Foreign tenant
        },
        registry,
      );

      expect(res.matchConfidence).toBe(IdentityMatchConfidence.CONFLICT);
      expect(res.conflictDetected).toBe(true);
      expect(res.conflictReason).toContain('Tenant isolation violation');
    });

    it('deduplicates matching candidates into single canonical record with provenance aggregation', () => {
      const candidates = [
        {
          candidateId: 'cand-ondc-1',
          network: SupplierNetwork.ONDC,
          pan: 'ABCDE1234F',
          gstin: '29ABCDE1234F1Z5',
          businessName: 'Vendor Tech ONDC',
        },
        {
          candidateId: 'cand-bni-2',
          network: SupplierNetwork.BNI,
          pan: 'ABCDE1234F',
          businessName: 'Vendor Tech BNI',
        },
      ];

      const { deduped, conflicts } = CanonicalIdentityResolver.deduplicateCandidates(candidates);
      expect(conflicts).toHaveLength(0);
      expect(deduped).toHaveLength(1);
      expect(deduped[0]?.resolution.isMerged).toBe(true);
      expect(deduped[0]?.resolution.resolvedProvenanceCount).toBe(2);
    });
  });

  describe('SN3-02: Capability Specialization & Evidence Tiering', () => {
    it('accurately tiers Platform, Network, Chamber, and Self-Declared evidence', () => {
      const platform = CapabilityEvidenceEvaluator.evaluateEvidence({
        network: SupplierNetwork.LOCAL_REGISTRY,
        verificationStatus: 'VERIFIED',
        hasPlatformOrders: true,
      });
      expect(platform.evidenceTier).toBe(CapabilityEvidenceTier.PLATFORM_VERIFIED);
      expect(platform.verificationScore).toBe(100);

      const network = CapabilityEvidenceEvaluator.evaluateEvidence({
        network: SupplierNetwork.ONDC,
        isNetworkAuthenticated: true,
        verificationStatus: 'VERIFIED',
      });
      expect(network.evidenceTier).toBe(CapabilityEvidenceTier.NETWORK_VERIFIED);
      expect(network.verificationScore).toBe(80);

      const chamber = CapabilityEvidenceEvaluator.evaluateEvidence({
        network: SupplierNetwork.BNI,
        chamberAttestation: true,
      });
      expect(chamber.evidenceTier).toBe(CapabilityEvidenceTier.CHAMBER_ATTESTED);
      expect(chamber.verificationScore).toBe(60);

      const selfDeclared = CapabilityEvidenceEvaluator.evaluateEvidence({
        network: SupplierNetwork.DIRECT,
        verificationStatus: 'UNVERIFIED',
      });
      expect(selfDeclared.evidenceTier).toBe(CapabilityEvidenceTier.SELF_DECLARED);
      expect(selfDeclared.verificationScore).toBe(30);
    });

    it('prevents masquerading: downgrades unverified claims to self-declared', () => {
      const masquerader = CapabilityEvidenceEvaluator.evaluateEvidence({
        network: SupplierNetwork.DIRECT,
        claimedTier: CapabilityEvidenceTier.PLATFORM_VERIFIED, // False claim
        verificationStatus: 'VERIFIED',
      });
      expect(masquerader.evidenceTier).toBe(CapabilityEvidenceTier.SELF_DECLARED);
      expect(masquerader.verificationScore).toBe(30);
      expect(masquerader.tierExplanation).toContain('downgraded');
    });
  });

  describe('SN3-03: Dynamic Capacity Headroom', () => {
    it('computes sufficient capacity headroom (ratio >= 0.20)', () => {
      const headroom = DynamicCapacityHeadroomCalculator.calculateHeadroom({
        declaredCapacity: 1000,
        activeBacklog: 400,
        capacityUnit: 'UNITS',
        backlogUnit: 'UNITS',
      });

      expect(headroom.status).toBe(CapacityHeadroomStatus.SUFFICIENT);
      expect(headroom.headroomRatio).toBe(0.6);
      expect(headroom.availableHeadroomUnits).toBe(600);
      expect(headroom.isHeadroomKnown).toBe(true);
    });

    it('computes constrained capacity headroom (0 < ratio < 0.20)', () => {
      const headroom = DynamicCapacityHeadroomCalculator.calculateHeadroom({
        declaredCapacity: 1000,
        activeBacklog: 900,
        capacityUnit: 'KG',
      });

      expect(headroom.status).toBe(CapacityHeadroomStatus.CONSTRAINED);
      expect(headroom.headroomRatio).toBe(0.1);
      expect(headroom.availableHeadroomUnits).toBe(100);
    });

    it('computes exhausted capacity headroom (ratio <= 0)', () => {
      const headroom = DynamicCapacityHeadroomCalculator.calculateHeadroom({
        declaredCapacity: 500,
        activeBacklog: 600, // Backlog exceeds capacity
      });

      expect(headroom.status).toBe(CapacityHeadroomStatus.EXHAUSTED);
      expect(headroom.headroomRatio).toBe(0);
      expect(headroom.availableHeadroomUnits).toBe(0);
    });

    it('fails safely closed to UNKNOWN on invalid/negative/overflow numbers or unit mismatch', () => {
      const zeroCap = DynamicCapacityHeadroomCalculator.calculateHeadroom({
        declaredCapacity: 0,
        activeBacklog: 10,
      });
      expect(zeroCap.status).toBe(CapacityHeadroomStatus.UNKNOWN);
      expect(zeroCap.isHeadroomKnown).toBe(false);

      const unitMismatch = DynamicCapacityHeadroomCalculator.calculateHeadroom({
        declaredCapacity: 100,
        activeBacklog: 20,
        capacityUnit: 'HP',
        backlogUnit: 'KW',
      });
      expect(unitMismatch.status).toBe(CapacityHeadroomStatus.UNKNOWN);
      expect(unitMismatch.isHeadroomKnown).toBe(false);
    });
  });

  describe('SN3-04: Supplier Performance Intelligence', () => {
    it('computes 35/30/20/15 weighted performance summary', () => {
      const summary = SupplierPerformanceIntelligenceEvaluator.evaluatePerformance({
        dimensions: {
          qualityScore: 90, // 35% -> 31.5
          deliveryScore: 80, // 30% -> 24.0
          slaDisputeScore: 85, // 20% -> 17.0
          commercialScore: 70, // 15% -> 10.5
        },
        completedOrdersCount: 25,
      });

      expect(summary.hasHistoricalPerformance).toBe(true);
      expect(summary.status).toBe('MEASURED');
      expect(summary.compositeScore).toBeCloseTo(83, 0);
      expect(summary.performanceTier).toBe('GOLD');
      expect(summary.confidenceBoost).toBeGreaterThan(10);
    });

    it('preserves neutral baseline for suppliers with cold-start / zero history', () => {
      const coldStart = SupplierPerformanceIntelligenceEvaluator.evaluatePerformance({
        completedOrdersCount: 0,
      });

      expect(coldStart.hasHistoricalPerformance).toBe(false);
      expect(coldStart.status).toBe('INSUFFICIENT_HISTORY');
      expect(coldStart.compositeScore).toBeUndefined();
      expect(coldStart.confidenceBoost).toBe(5); // Neutral baseline, not penalized with 0
      expect(coldStart.explanation).toContain('cold start');
    });
  });

  describe('SN3-05: Freshness & Staleness Intelligence', () => {
    it('marks profiles verified within 180 days as PROFILE_FRESH without penalty', () => {
      const now = new Date();
      const verifiedDate = new Date(now.getTime() - 45 * 86400 * 1000); // 45 days ago

      const fresh = FreshnessIntelligenceEvaluator.evaluateFreshness(verifiedDate.toISOString(), now);
      expect(fresh.status).toBe(CandidateFreshnessStatus.PROFILE_FRESH);
      expect(fresh.ageInDays).toBe(45);
      expect(fresh.isStale).toBe(false);
      expect(fresh.stalenessDecayApplied).toBe(false);
      expect(fresh.confidencePenalty).toBe(0);
    });

    it('applies staleness decay to profiles older than 180 days', () => {
      const now = new Date();
      const staleDate = new Date(now.getTime() - 220 * 86400 * 1000); // 220 days ago

      const stale = FreshnessIntelligenceEvaluator.evaluateFreshness(staleDate.toISOString(), now);
      expect(stale.status).toBe(CandidateFreshnessStatus.PROFILE_STALE);
      expect(stale.ageInDays).toBe(220);
      expect(stale.isStale).toBe(true);
      expect(stale.stalenessDecayApplied).toBe(true);
      expect(stale.confidencePenalty).toBe(10);
      expect(stale.decayReasonCode).toBe('STALENESS_DECAY');
    });

    it('detects clock anomalies on future timestamps', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 10 * 86400 * 1000); // 10 days in future

      const anomaly = FreshnessIntelligenceEvaluator.evaluateFreshness(futureDate.toISOString(), now);
      expect(anomaly.isStale).toBe(true);
      expect(anomaly.decayReasonCode).toBe('CLOCK_ANOMALY');
      expect(anomaly.confidencePenalty).toBe(5);
    });
  });

  describe('SN3-06: Closed-Loop Discovery Feedback Signals', () => {
    it('evaluates feedback metrics when sample size is sufficient (>= 3 interactions)', () => {
      const signals = DiscoveryFeedbackSignalsEvaluator.evaluateSignals({
        invitationsReceived: 10,
        quotesSubmitted: 8, // 80% response
        quotesShortlisted: 4, // 50% conversion
        totalFulfillments: 5,
        successfulFulfillments: 5, // 100% success
      });

      expect(signals.isSignalReliable).toBe(true);
      expect(signals.invitationResponseRate).toBe(0.8);
      expect(signals.quoteConversionRate).toBe(0.5);
      expect(signals.fulfillmentSuccessRate).toBe(1.0);
      expect(signals.feedbackConfidenceAdjustment).toBeGreaterThan(0);
    });

    it('marks feedback signal unreliable and neutral when sample size < 3', () => {
      const signals = DiscoveryFeedbackSignalsEvaluator.evaluateSignals({
        invitationsReceived: 1,
        quotesSubmitted: 1,
      });

      expect(signals.isSignalReliable).toBe(false);
      expect(signals.feedbackConfidenceAdjustment).toBe(0); // Neutral
    });
  });

  describe('Anti-Leak Identity Protection Validator with Enriched SN.3 Fields', () => {
    const validCandidate: NormalizedSupplierCandidate = {
      candidateId: 'cand-101',
      canonicalSupplierId: 'supp-uuid-1',
      anonymousLabel: 'Supplier 7X9K',
      matchScore: 92,
      confidenceScore: 95,
      matchReasons: ['category_match', 'geo:local', 'verified_active'],
      capabilityMatch: {
        isMatch: true,
        matchedCategories: ['MOTOR_REWINDING'],
        capacityOk: true,
      },
      locationMatch: {
        isLocal: true,
        serviceAreaMatch: true,
        distanceKm: 4.5,
        deliveryCity: 'Bengaluru',
      },
      provenance: {
        primaryNetwork: SupplierNetwork.LOCAL_REGISTRY,
        discoveredNetworks: [SupplierNetwork.LOCAL_REGISTRY],
        discoveredAt: new Date().toISOString(),
        verified: true,
        truthfulStatus: TruthfulProviderStatus.LIVE_ACTIVE,
      },
      flags: {
        canReceiveRfq: true,
        canSubmitQuote: true,
        isVerifiedActive: true,
      },
      identityResolution: {
        matchConfidence: IdentityMatchConfidence.EXACT_CANONICAL,
        resolutionMethod: IdentityResolutionMethod.CANONICAL_UUID,
        canonicalSupplierId: 'supp-uuid-1',
        isMerged: false,
        conflictDetected: false,
        resolvedProvenanceCount: 1,
      },
      verificationSummary: {
        evidenceTier: CapabilityEvidenceTier.PLATFORM_VERIFIED,
        isPlatformVerified: true,
        isNetworkVerified: false,
        isChamberAttested: false,
        verificationScore: 100,
        tierExplanation: 'Platform verified',
      },
      capacityHeadroom: {
        status: CapacityHeadroomStatus.SUFFICIENT,
        declaredCapacity: 1000,
        activeBacklog: 300,
        availableHeadroomUnits: 700,
        headroomRatio: 0.7,
        isHeadroomKnown: true,
        explanation: 'Sufficient headroom',
      },
      performanceSummary: {
        hasHistoricalPerformance: true,
        status: 'MEASURED',
        compositeScore: 85,
        confidenceBoost: 13,
        explanation: 'Historical performance measured',
      },
      freshnessAssessment: {
        status: CandidateFreshnessStatus.PROFILE_FRESH,
        ageInDays: 30,
        isStale: false,
        stalenessDecayApplied: false,
        confidencePenalty: 0,
        explanation: 'Fresh profile',
      },
      feedbackSignals: {
        invitationResponseRate: 0.85,
        totalInvitationsReceived: 10,
        totalQuotesSubmitted: 9,
        feedbackConfidenceAdjustment: 4,
        isSignalReliable: true,
        explanation: 'Reliable signals',
      },
    };

    it('validates an enriched candidate with zero PII and zero leaks', () => {
      const res = validateCandidateAntiLeak(validCandidate);
      expect(res.valid).toBe(true);
      expect(res.violations).toHaveLength(0);
      expect(() => assertCandidateAntiLeak(validCandidate)).not.toThrow();
    });

    it('detects nested forbidden PII in sub-objects', () => {
      const leakedSub = {
        ...validCandidate,
        identityResolution: {
          ...validCandidate.identityResolution,
          pan: 'ABCDE1234F', // Leaked PAN in identityResolution
        },
      };

      const res = validateCandidateAntiLeak(leakedSub);
      expect(res.valid).toBe(false);
      expect(res.violations.some((v) => v.includes('pan'))).toBe(true);
      expect(() => assertCandidateAntiLeak(leakedSub)).toThrow(IdentityProtectedViolationError);
    });

    it('detects every forbidden PII field when injected into candidate', () => {
      for (const field of FORBIDDEN_CANDIDATE_PII_FIELDS) {
        const leaked = {
          ...validCandidate,
          [field]: 'sensitive_value_123',
        };
        const res = validateCandidateAntiLeak(leaked);
        expect(res.valid).toBe(false);
        expect(res.violations.some((v) => v.includes(field))).toBe(true);
        expect(() => assertCandidateAntiLeak(leaked)).toThrow(IdentityProtectedViolationError);
      }
    });

    it('detects source leakage in match reasons', () => {
      const leakedReasons = {
        ...validCandidate,
        matchReasons: ['category_match', 'source:BNI'],
      };
      const res = validateCandidateAntiLeak(leakedReasons);
      expect(res.valid).toBe(false);
      expect(res.violations[0]).toContain('source:BNI');
      expect(() => assertCandidateAntiLeak(leakedReasons)).toThrow(IdentityProtectedViolationError);
    });
  });

  describe('Provider Execution Enums', () => {
    it('defines canonical provider execution statuses', () => {
      expect(ProviderExecutionStatus.SUCCESS).toBe('SUCCESS');
      expect(ProviderExecutionStatus.EMPTY).toBe('EMPTY');
      expect(ProviderExecutionStatus.TIMEOUT).toBe('TIMEOUT');
      expect(ProviderExecutionStatus.UNAVAILABLE).toBe('UNAVAILABLE');
      expect(ProviderExecutionStatus.DISABLED).toBe('DISABLED');
      expect(ProviderExecutionStatus.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ProviderExecutionStatus.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    });

    it('defines truthful provider statuses for accurate labeling', () => {
      expect(TruthfulProviderStatus.LIVE_ACTIVE).toBe('LIVE_ACTIVE');
      expect(TruthfulProviderStatus.STUBBED_SIMULATION).toBe('STUBBED_SIMULATION');
      expect(TruthfulProviderStatus.DISABLED_GATE).toBe('DISABLED_GATE');
      expect(TruthfulProviderStatus.DEGRADED).toBe('DEGRADED');
    });
  });
});
