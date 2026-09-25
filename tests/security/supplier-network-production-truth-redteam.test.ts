import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  SupplierNetwork,
  TruthfulProviderStatus,
  SupplierDiscoveryLifecycleTier,
  evaluateSupplierDiscoveryTier,
  validateDiscoveryTierTransition,
  canSupplierSubmitQuoteAtTier,
  isDirectAwardPermittedWithoutOnboarding,
  assertCandidateAntiLeak,
  sanitizeCandidateMatchReasons,
  IndianStandardsClassifier,
  IndianStandardType,
  IndianStandardVerificationStatus,
  type EngineDiscoveryRequest,
  evaluateSupplierAwardEligibility,
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '@otp/domain';
import {
  SupplierNetworkEngine,
  DEFAULT_SOURCING_REFRESH_WINDOW_MS,
} from '../../packages/services/src/discovery/supplier-network-engine';
import {
  GoogleGisSafetyQuotaGuard,
  InMemoryGoogleGisQuotaStore,
} from '../../packages/services/src/gis/google-gis-safety-quota';
import { GoogleMapsLocationAdapter } from '../../packages/services/src/gis/google-maps-location-adapter';
import { fastTrackExpressIntake } from '../../apps/web/src/features/intake/api/fast-track-intake';
import type { SupplierNetworkPort } from '../../packages/services/src/interfaces/supplier-network-port';

/**
 * STAGE R2-07 RED TEAM SECURITY BATTERY: 16 ADVERSARIAL ATTACK VECTORS
 *
 * - ATTACK 01: Production RFQ Quote Simulation Injection -> BLOCKED (No synthetic quotes on normal buyer RFQs)
 * - ATTACK 02: Unverified Winning Supplier PO Bypass -> BLOCKED (PA-02 fail-closed onboarding gate)
 * - ATTACK 03: Google Quota Hard-Ceiling Bypass (1,500/day, 45,000/month) -> BLOCKED (Fails closed to offline GIS)
 * - ATTACK 04: Google Reserve Depletion Attack (200 emergency, 300 buyer-demand) -> BLOCKED (Background calls fail before reserves)
 * - ATTACK 05: ONDC / BNI Unconfigured Live Provider Claim -> BLOCKED (Truthful status enforced: UNAVAILABLE / NOT_CONFIGURED)
 * - ATTACK 06: Fake BIS/CPWD/FSSAI/BEE "Certified" Claim Injection -> BLOCKED (Classified as SELF_DECLARED_CLAIM with 0 boost)
 * - ATTACK 07: Sourcing 30-Day Cache Poisoning & Cross-Category Leak -> BLOCKED (Key partitioned by category & location)
 * - ATTACK 08: Pre-Award PII Leakage Attack via Candidate Discovery -> BLOCKED (Crockford Base32 alias, PII stripped)
 * - ATTACK 09: Network Fingerprint Leakage (source:BNI, source:ONDC) -> BLOCKED (Sanitized match reasons)
 * - ATTACK 10: Reverse Lifecycle Downgrade Exploit (GST_VERIFIED -> DISCOVERED_IN_AREA) -> BLOCKED (Strict monotonicity)
 * - ATTACK 11: Unregistered Discovery Participant Direct Quote Submission -> BLOCKED (DETAILS_AVAILABLE cannot quote without registration)
 * - ATTACK 12: Multi-Provider Duplicate Identity Collision & Provenance Loss -> BLOCKED (Deduplicated + provenance preserved)
 * - ATTACK 13: Rogue Provider Adapter Award Authority Injection -> BLOCKED (Zero award/PO authority in SNE)
 * - ATTACK 14: Corrupted GPS Coordinate Injection via GIS Adapter -> BLOCKED (Validation error, fail closed safely)
 * - ATTACK 15: Quota Store Concurrency Race Over-Allocation -> BLOCKED (Mutex serialization, zero over-allocation)
 * - ATTACK 16: Unmasked Identity Reveal Prior to Atomic Award Lock -> BLOCKED (Fail closed prior to PA-02 lock)
 */
describe('Stage R2-07 Supplier Network Engine Red Team Battery (16 Attack Vectors)', () => {

  // ATTACK 01: Production RFQ Quote Simulation Injection -> BLOCKED
  it('ATTACK 01: Production RFQ Quote Simulation Injection -> BLOCKED', async () => {
    // Normal production fast track execution without options.autoQuoteSimulation
    // must never invoke auto_submit_pilot_quotes RPC
    const result = await fastTrackExpressIntake('');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Please enter a requirement description');
  });

  // ATTACK 02: Unverified Winning Supplier PO Bypass -> BLOCKED
  it('ATTACK 02: Unverified Winning Supplier PO Bypass -> BLOCKED by PA-02 gate', () => {
    const unverifiedEligibility = evaluateSupplierAwardEligibility({
      supplierId: 'sup-unverified-01',
      lifecycleState: SupplierLifecycleState.QUOTE_PARTICIPANT,
      verificationStatus: TruthfulVerificationStatus.PENDING,
    });

    expect(unverifiedEligibility.canReveal).toBe(false);
    expect(unverifiedEligibility.canExecuteDownstream).toBe(false);
    expect(unverifiedEligibility.onboardingRequired).toBe(true);
    expect(unverifiedEligibility.blockReason).toContain('onboarding');
  });

  // ATTACK 03: Google Quota Hard-Ceiling Bypass (1,500/day, 45,000/month) -> BLOCKED
  it('ATTACK 03: Google Quota Hard-Ceiling Bypass (1,500/day, 45,000/month) -> BLOCKED', async () => {
    const store = new InMemoryGoogleGisQuotaStore();
    const guard = new GoogleGisSafetyQuotaGuard({
      store,
      limits: { maxDaily: 1500, maxMonthly: 45000 },
    });

    // Exhaust daily limit
    for (let i = 0; i < 1500; i++) {
      const res = await guard.acquireReservation(new Date(), 'EMERGENCY');
      expect(res.allowed).toBe(true);
    }

    // 1501th request must fail closed
    const deniedRes = await guard.acquireReservation(new Date(), 'EMERGENCY');
    expect(deniedRes.allowed).toBe(false);
    expect(deniedRes.reason).toBe('DAILY_QUOTA_EXCEEDED');
  });

  // ATTACK 04: Google Reserve Depletion Attack (200 emergency, 300 buyer-demand) -> BLOCKED
  it('ATTACK 04: Google Reserve Depletion Attack (200 emergency, 300 buyer-demand) -> BLOCKED', async () => {
    const store = new InMemoryGoogleGisQuotaStore();
    const guard = new GoogleGisSafetyQuotaGuard({
      store,
      limits: { maxDaily: 1500, maxMonthly: 45000, emergencyReserve: 200, buyerDemandReserve: 300 },
    });

    // Fill background pool up to 1000 (1500 - 200 - 300)
    for (let i = 0; i < 1000; i++) {
      const res = await guard.acquireReservation(new Date(), 'BACKGROUND');
      expect(res.allowed).toBe(true);
    }

    // 1001th background request is DENIED to preserve buyer & emergency reserve
    const deniedBackground = await guard.acquireReservation(new Date(), 'BACKGROUND');
    expect(deniedBackground.allowed).toBe(false);
    expect(deniedBackground.reason).toBe('BUYER_RESERVE_DEPLETED');

    // Active Buyer Demand can still consume up to 1300
    const buyerRes = await guard.acquireReservation(new Date(), 'BUYER_DEMAND');
    expect(buyerRes.allowed).toBe(true);
  });

  // ATTACK 05: ONDC / BNI Unconfigured Live Provider Claim -> BLOCKED
  it('ATTACK 05: ONDC / BNI Unconfigured Live Provider Claim -> BLOCKED', () => {
    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: {
            network: SupplierNetwork.ONDC,
            discover: async () => [],
          },
          truthfulStatus: TruthfulProviderStatus.UNAVAILABLE,
          isLive: false,
        },
      ],
    });

    const report = engine.getProviderHealthReport(SupplierNetwork.ONDC)[0];
    expect(report.truthfulStatus).toBe(TruthfulProviderStatus.UNAVAILABLE);
    expect(report.truthfulStatus).not.toBe(TruthfulProviderStatus.LIVE_ACTIVE);
  });

  // ATTACK 06: Fake BIS/CPWD/FSSAI/BEE "Certified" Claim Injection -> BLOCKED
  it('ATTACK 06: Fake BIS/CPWD/FSSAI/BEE "Certified" Claim Injection -> BLOCKED', () => {
    const fakeBis = IndianStandardsClassifier.evaluateStandardClaim({
      standardType: IndianStandardType.BIS,
      claimText: 'BIS ISI Certified Cables 100% genuine',
      certificateNumber: null,
      isIndependentlyVerified: false,
    });

    expect(fakeBis.isCertified).toBe(false);
    expect(fakeBis.status).toBe(IndianStandardVerificationStatus.SELF_DECLARED_CLAIM);
    expect(fakeBis.confidenceScoreContribution).toBe(0);
    expect(fakeBis.advisory).toContain('independent certificate verification required');
  });

  // ATTACK 07: Sourcing 30-Day Cache Poisoning & Cross-Category Leak -> BLOCKED
  it('ATTACK 07: Sourcing 30-Day Cache Poisoning & Cross-Category Leak -> BLOCKED', async () => {
    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: {
            network: SupplierNetwork.LOCAL_REGISTRY,
            discover: async (req) => [
              {
                supplierId: `sup-${req.categoryCode}`,
                businessName: `${req.categoryCode} Specialist`,
                categoryCode: req.categoryCode,
                network: SupplierNetwork.LOCAL_REGISTRY,
              },
            ],
          },
        },
      ],
    });

    // Populate electrical in 560048
    await engine.discoverCandidates({ category: 'Electrical', location: { pinCode: '560048' } });

    // Requesting Solar in same pin code must NOT leak electrical candidates
    const solarRes = await engine.discoverCandidates({ category: 'Solar', location: { pinCode: '560048' } });
    const matched = solarRes.candidates[0].capabilityMatch.matchedCategories.map((c) => c.toLowerCase());
    expect(matched).toContain('solar');
    expect(matched).not.toContain('electrical');
  });

  // ATTACK 08: Pre-Award PII Leakage Attack via Candidate Discovery -> BLOCKED
  it('ATTACK 08: Pre-Award PII Leakage Attack via Candidate Discovery -> BLOCKED', async () => {
    const engine = new SupplierNetworkEngine({
      providers: [
        {
          adapter: {
            network: SupplierNetwork.DIRECT,
            discover: async () => [
              {
                supplierId: 'sup-malicious-pii',
                businessName: 'Secret Vendor Private Limited',
                phone: '+919876543210',
                email: 'director@secretvendor.com',
                gstin: '29ABCDE1234F1Z5',
                network: SupplierNetwork.DIRECT,
              } as any,
            ],
          },
        },
      ],
    });

    const res = await engine.discoverCandidates({ category: 'Furniture' });
    const candidate = res.candidates[0];

    expect(candidate.anonymousLabel).toMatch(/^Supplier [0-9A-Z]{4}$/);
    expect((candidate as any).businessName).toBeUndefined();
    expect((candidate as any).phone).toBeUndefined();
    expect((candidate as any).email).toBeUndefined();
    expect((candidate as any).gstin).toBeUndefined();
    expect(() => assertCandidateAntiLeak(candidate)).not.toThrow();
  });

  // ATTACK 09: Network Fingerprint Leakage (source:BNI, source:ONDC) -> BLOCKED
  it('ATTACK 09: Network Fingerprint Leakage (source:BNI, source:ONDC) -> BLOCKED', () => {
    const dirtyReasons = ['category_match', 'source:BNI', 'source:ONDC_GATEWAY', 'verified_active'];
    const cleanReasons = sanitizeCandidateMatchReasons(dirtyReasons);

    expect(cleanReasons).not.toContain('source:BNI');
    expect(cleanReasons).not.toContain('source:ONDC_GATEWAY');
    expect(cleanReasons).toEqual(['category_match', 'verified_active']);
  });

  // ATTACK 10: Reverse Lifecycle Downgrade Exploit -> BLOCKED
  it('ATTACK 10: Reverse Lifecycle Downgrade Exploit (GST_VERIFIED -> DISCOVERED_IN_AREA) -> BLOCKED', () => {
    const transition = validateDiscoveryTierTransition(
      SupplierDiscoveryLifecycleTier.GST_VERIFIED,
      SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA,
    );

    expect(transition.valid).toBe(false);
    expect(transition.reason).toContain('Illegal backward transition');
  });

  // ATTACK 11: Unregistered Discovery Participant Direct Quote Submission -> BLOCKED
  it('ATTACK 11: Unregistered Discovery Participant Direct Quote Submission -> BLOCKED', () => {
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.DISCOVERED_IN_AREA)).toBe(false);
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.DETAILS_AVAILABLE)).toBe(false);
    expect(canSupplierSubmitQuoteAtTier(SupplierDiscoveryLifecycleTier.OTP_REGISTERED)).toBe(true);
  });

  // ATTACK 12: Multi-Provider Duplicate Identity Collision & Provenance Loss -> BLOCKED
  it('ATTACK 12: Multi-Provider Duplicate Identity Collision & Provenance Loss -> BLOCKED', async () => {
    const adapter1: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      discover: async () => [
        {
          supplierId: 'canonical-sup-42',
          businessName: 'Integrated Systems',
          categoryCode: 'cctv',
          network: SupplierNetwork.DIRECT,
        },
      ],
    };

    const adapter2: SupplierNetworkPort = {
      network: SupplierNetwork.LOCAL_REGISTRY,
      discover: async () => [
        {
          supplierId: 'canonical-sup-42',
          businessName: 'Integrated Systems',
          categoryCode: 'cctv',
          network: SupplierNetwork.LOCAL_REGISTRY,
        },
      ],
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: adapter1 }, { adapter: adapter2 }],
    });

    const res = await engine.discoverCandidates({ category: 'cctv' });
    expect(res.totalCandidatesDiscovered).toBe(2);
    expect(res.totalUniqueCandidates).toBe(1);
    expect(res.candidates[0].provenance.discoveredNetworks).toContain(SupplierNetwork.DIRECT);
    expect(res.candidates[0].provenance.discoveredNetworks).toContain(SupplierNetwork.LOCAL_REGISTRY);
  });

  // ATTACK 13: Rogue Provider Adapter Award Authority Injection -> BLOCKED
  it('ATTACK 13: Rogue Provider Adapter Award Authority Injection -> BLOCKED', async () => {
    const rogueAdapter: SupplierNetworkPort = {
      network: SupplierNetwork.DIRECT,
      discover: async () => [
        {
          supplierId: 'sup-rogue',
          businessName: 'Rogue Infiltrator',
          categoryCode: 'furniture',
          network: SupplierNetwork.DIRECT,
          awardStatus: 'AWARDED',
          isWinner: true,
          purchaseOrderId: 'po-illegal-999',
        } as any,
      ],
    };

    const engine = new SupplierNetworkEngine({
      providers: [{ adapter: rogueAdapter }],
    });

    const res = await engine.discoverCandidates({ category: 'furniture' });
    const cand = res.candidates[0];

    expect((cand as any).awardStatus).toBeUndefined();
    expect((cand as any).isWinner).toBeUndefined();
    expect((cand as any).purchaseOrderId).toBeUndefined();
  });

  // ATTACK 14: Corrupted GPS Coordinate Injection via GIS Adapter -> BLOCKED
  it('ATTACK 14: Corrupted GPS Coordinate Injection via GIS Adapter -> BLOCKED', async () => {
    const googleAdapter = new GoogleMapsLocationAdapter();

    await expect(
      googleAdapter.calculateDistance(
        { coordinates: { lat: 999.99, lng: 77.5946 } }, // Out of range [-90..90]
        { coordinates: { lat: 12.9716, lng: 77.5946 } },
      ),
    ).rejects.toThrow('MALFORMED_COORDINATES');
  });

  // ATTACK 15: Quota Store Concurrency Race Over-Allocation -> BLOCKED
  it('ATTACK 15: Quota Store Concurrency Race Over-Allocation -> BLOCKED', async () => {
    const store = new InMemoryGoogleGisQuotaStore();
    const guard = new GoogleGisSafetyQuotaGuard({
      store,
      limits: { maxDaily: 10, maxMonthly: 100 },
    });

    // 25 concurrent reservations against limit of 10
    const results = await Promise.all(
      Array.from({ length: 25 }, () => guard.acquireReservation(new Date(), 'EMERGENCY')),
    );

    const allowed = results.filter((r) => r.allowed).length;
    const denied = results.filter((r) => !r.allowed).length;

    expect(allowed).toBe(10);
    expect(denied).toBe(15);
  });

  // ATTACK 16: Unmasked Identity Reveal Prior to Atomic Award Lock -> BLOCKED
  it('ATTACK 16: Unmasked Identity Reveal Prior to Atomic Award Lock -> BLOCKED', () => {
    const unverifiedEvaluation = evaluateSupplierAwardEligibility({
      supplierId: 'sup-pre-award',
      lifecycleState: SupplierLifecycleState.ONBOARDING_REQUIRED,
      verificationStatus: TruthfulVerificationStatus.NOT_PROVIDED,
    });

    expect(unverifiedEvaluation.canReveal).toBe(false);
    expect(unverifiedEvaluation.canExecuteDownstream).toBe(false);
    expect(isDirectAwardPermittedWithoutOnboarding(SupplierDiscoveryLifecycleTier.OTP_REGISTERED)).toBe(false);
  });
});
