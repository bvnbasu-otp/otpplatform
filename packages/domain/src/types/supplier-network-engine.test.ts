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
} from '../index';
import { IdentityProtectedViolationError } from '../errors/blind-violation';

describe('Supplier Network Engine Domain Contracts & Anti-Leak Models', () => {
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

  describe('Anti-Leak Identity Protection Validator', () => {
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
    };

    it('validates a clean candidate with zero PII and zero leaks', () => {
      const res = validateCandidateAntiLeak(validCandidate);
      expect(res.valid).toBe(true);
      expect(res.violations).toHaveLength(0);
      expect(() => assertCandidateAntiLeak(validCandidate)).not.toThrow();
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
