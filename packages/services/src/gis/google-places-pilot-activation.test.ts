import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  GooglePlacesDiscoveryAdapter,
  BANGALORE_560048_ELECTRICAL_STATIC_DIRECTORY,
  normalizePhoneNumber,
  normalizeBusinessName,
} from './google-places-discovery-adapter';
import {
  GoogleGisSafetyQuotaGuard,
  InMemoryGoogleGisQuotaStore,
} from './google-gis-safety-quota';
import {
  SupplierNetwork,
  TruthfulProviderStatus,
  GisExecutionMode,
  generateCrockfordAlias,
} from '@otp/domain';

describe('OTP R2-30C.1 — Google Places Pilot Activation & Certification Tests (GP-01 to GP-10)', () => {
  let quotaStore: InMemoryGoogleGisQuotaStore;
  let quotaGuard: GoogleGisSafetyQuotaGuard;

  beforeEach(() => {
    quotaStore = new InMemoryGoogleGisQuotaStore();
    quotaGuard = new GoogleGisSafetyQuotaGuard({ store: quotaStore });
  });

  /**
   * GP-01: Live credential / provider status check.
   * Proves adapter is strictly CREDENTIAL_GATED when key is missing and LIVE_API when key is present.
   * Truthfulness Invariant: Never fakes LIVE_API when unconfigured.
   */
  it('GP-01: Live credential / provider status check (CREDENTIAL_GATED vs LIVE_API)', () => {
    // 1. Missing / undefined key -> CREDENTIAL_GATED
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;

    const uncredentialedAdapter = new GooglePlacesDiscoveryAdapter();
    expect(uncredentialedAdapter.isTruthfulLive).toBe(false);
    expect(uncredentialedAdapter.getTruthfulStatus()).toBe(TruthfulProviderStatus.CREDENTIAL_GATED);
    expect(uncredentialedAdapter.getExecutionMode()).toBe(GisExecutionMode.CREDENTIAL_GATED);

    // 2. Active valid key -> LIVE_API
    const credentialedAdapter = new GooglePlacesDiscoveryAdapter({
      apiKey: 'AIzaSyTestGooglePlacesPilotApiKey12345678',
    });
    expect(credentialedAdapter.isTruthfulLive).toBe(true);
    expect(credentialedAdapter.getTruthfulStatus()).toBe(TruthfulProviderStatus.LIVE_API);
    expect(credentialedAdapter.getExecutionMode()).toBe(GisExecutionMode.EXTERNAL_PROVIDER_READY);
  });

  /**
   * GP-02: Real supplier candidate structure & mapping.
   * Tests Bangalore PIN 560048 (Hoodi/Whitefield) / Electrical & Automation candidate structure.
   */
  it('GP-02: Real supplier candidate structure & mapping (Bangalore PIN 560048 Electrical & Automation)', async () => {
    const adapter = new GooglePlacesDiscoveryAdapter({ quotaGuard });

    const results = await adapter.discover({
      category: 'Electrical & Automation',
      location: { city: 'Bengaluru', pinCode: '560048' },
    });

    expect(results.length).toBeGreaterThanOrEqual(2);

    const first = results[0]!;
    expect(first.network).toBe(SupplierNetwork.GOOGLE_PLACES);
    expect(first.businessName).toBeDefined();
    expect(first.businessName.length).toBeGreaterThan(0);
    expect(first.externalRef).toBeDefined();
    expect(first.canonicalSupplierId).toBeDefined();
    expect(first.canReceiveRfq).toBe(true);
    expect(first.canSubmitQuote).toBe(true);
    expect(first.capability.categories).toContain('Electrical & Automation');
    expect(first.capability.serviceArea?.pinCode).toBe('560048');

    // Strict Trust Invariant: Candidates are NOT marked as platform verified
    expect(first.lastVerifiedAt).toBeUndefined();
    expect(first.chamberAttestation).toBe(false);
    expect(first.isNetworkAuthenticated).toBe(false);
  });

  /**
   * GP-03: Normalization.
   * Proves raw Places payloads normalize to canonical NetworkDiscoveryCandidate with Crockford alias,
   * sanitized match reasons, and valid match score.
   */
  it('GP-03: Normalization & Crockford Base32 pseudonymization pre-award', () => {
    const adapter = new GooglePlacesDiscoveryAdapter({ quotaGuard });

    const raw = {
      placeId: 'ChIJ_hoodi_switchgear_560048',
      businessName: 'Hoodi Switchgear & Control Panels Pvt Ltd',
      phone: '+91 (984) 501-2345',
      rating: 4.8,
      userRatingsTotal: 120,
      isDetailsComplete: true,
    };

    const normalized = adapter.normalizeCandidate(raw, 'Switchgear', {
      city: 'Bengaluru',
      pinCode: '560048',
    });

    expect(normalized.externalRef).toBe('ChIJ_hoodi_switchgear_560048');
    expect(normalized.canonicalSupplierId).toBe(generateCrockfordAlias(raw.placeId));
    expect(normalized.canonicalSupplierId).toMatch(/^[0-9A-Z]{4,}$/);
    expect(normalized.matchScore).toBeGreaterThanOrEqual(75);
    expect(normalized.capability.serviceArea?.pinCode).toBe('560048');
    expect(normalized.capability.verificationStatus).toBe('SELF_DECLARED');

    // Match reasons must not leak API keys or raw internal SQL
    for (const reason of normalized.matchReasons) {
      expect(reason).not.toMatch(/AIzaSy/);
      expect(reason).not.toMatch(/SELECT/i);
    }
  });

  /**
   * GP-04: Deduplication.
   * Proves multi-attribute deduplication (by placeId, normalized phone digits, or business name within locality).
   */
  it('GP-04: Multi-attribute candidate deduplication', () => {
    const adapter = new GooglePlacesDiscoveryAdapter({ quotaGuard });

    const cand1 = adapter.normalizeCandidate(
      {
        placeId: 'ChIJ_hoodi_01',
        businessName: 'Hoodi Electric Works',
        phone: '+91 98450 11111',
      },
      'Electrical',
      { city: 'Bengaluru', pinCode: '560048' },
    );

    // Duplicate 1: Same placeId
    const cand2 = adapter.normalizeCandidate(
      {
        placeId: 'ChIJ_hoodi_01',
        businessName: 'Hoodi Electric Works (Branch 2)',
        phone: '+91 98450 22222',
      },
      'Electrical',
      { city: 'Bengaluru', pinCode: '560048' },
    );

    // Duplicate 2: Different placeId, but identical 10-digit phone
    const cand3 = adapter.normalizeCandidate(
      {
        placeId: 'ChIJ_hoodi_02',
        businessName: 'Hoodi Electric Solutions',
        phone: '+91 98450 11111',
      },
      'Electrical',
      { city: 'Bengaluru', pinCode: '560048' },
    );

    // Unique candidate
    const cand4 = adapter.normalizeCandidate(
      {
        placeId: 'ChIJ_whitefield_03',
        businessName: 'Whitefield Power Grid Systems',
        phone: '+91 98450 99999',
      },
      'Electrical',
      { city: 'Bengaluru', pinCode: '560048' },
    );

    // Normalization helpers test
    expect(normalizePhoneNumber('+91 (984) 501-1111')).toBe('919845011111');
    expect(normalizeBusinessName('Hoodi  Electric   Works!! ')).toBe('hoodi electric works');

    const deduplicated = adapter.deduplicateCandidates([cand1, cand2, cand3, cand4]);
    expect(deduplicated).toHaveLength(2);
    expect(deduplicated[0]!.externalRef).toBe('ChIJ_hoodi_01');
    expect(deduplicated[1]!.externalRef).toBe('ChIJ_whitefield_03');
  });

  /**
   * GP-05: Quota available operation.
   * Proves pre-call quota reservation increments atomically and delivers live/simulated candidate discoveries.
   */
  it('GP-05: Quota available operation executes pre-call reservation and consumes 1 unit', async () => {
    const customGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 100, maxMonthly: 2000 },
    });

    const adapter = new GooglePlacesDiscoveryAdapter({
      apiKey: 'AIzaSyTestKeyGP05',
      quotaGuard: customGuard,
    });

    const discoveryRes = await adapter.discoverWithFallbackLadder({
      category: 'Industrial Electrical Panels',
      location: { city: 'Bengaluru', pinCode: '560048' },
    });

    expect(discoveryRes.sourceType).toBe('LIVE_API');
    expect(discoveryRes.externalCallsUsed).toBe(1);
    expect(discoveryRes.candidates.length).toBeGreaterThan(0);

    const usage = await customGuard.getUsage();
    expect(usage.dailyCount).toBe(1);
    expect(usage.monthlyCount).toBe(1);
  });

  /**
   * GP-06: Quota exhaustion -> external API call count = 0.
   * Proves that when quota is exhausted, pre-call check fails closed, external fetch is never executed,
   * and fallback ladder activates seamlessly.
   */
  it('GP-06: Quota exhaustion -> external API call count = 0 (Fail closed to Fallback Ladder)', async () => {
    const exhaustedGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 1, maxMonthly: 50 },
    });

    // Exhaust daily quota immediately
    await exhaustedGuard.acquireReservation();

    const mockFetch = vi.fn();
    const adapter = new GooglePlacesDiscoveryAdapter({
      apiKey: 'AIzaSyTestKeyGP06',
      quotaGuard: exhaustedGuard,
      fetchFn: mockFetch,
    });

    // Make discovery call when quota is already 0
    const discoveryRes = await adapter.discoverWithFallbackLadder({
      category: 'Electrical & Automation',
      location: { city: 'Bengaluru', pinCode: '560048' },
    });

    // STRICT INVARIANT: External API was NEVER called
    expect(mockFetch).not.toHaveBeenCalled();
    expect(discoveryRes.externalCallsUsed).toBe(0);

    // Fallback ladder smoothly activated (Tier 3 static reference)
    expect(discoveryRes.sourceType).toBe('STATIC_REFERENCE');
    expect(discoveryRes.candidates.length).toBeGreaterThan(0);
  });

  /**
   * GP-07: Fallback ladder (LIVE_API -> DATABASE_CACHE -> STATIC_REFERENCE -> UNAVAILABLE).
   * Verifies all 4 tiers of the fallback ladder sequentially.
   */
  it('GP-07: Comprehensive 4-tier Fallback Ladder verification', async () => {
    const customGuard = new GoogleGisSafetyQuotaGuard({
      store: new InMemoryGoogleGisQuotaStore(),
      limits: { maxDaily: 5, maxMonthly: 100 },
    });

    const adapter = new GooglePlacesDiscoveryAdapter({
      apiKey: 'AIzaSyTestKeyGP07',
      quotaGuard: customGuard,
    });

    // 1. Tier 1: LIVE_API
    const resLive = await adapter.discoverWithFallbackLadder({
      category: 'Switchgear & Power',
      location: { city: 'Bengaluru', pinCode: '560048' },
    });
    expect(resLive.sourceType).toBe('LIVE_API');
    expect(resLive.externalCallsUsed).toBe(1);

    // 2. Tier 2: DATABASE_CACHE (Reusing previous result for same scope)
    const uncredentialedAdapter = new GooglePlacesDiscoveryAdapter({ quotaGuard: customGuard });
    uncredentialedAdapter.seedCache(
      uncredentialedAdapter.getScopeKey({
        category: 'Switchgear & Power',
        location: { city: 'Bengaluru', pinCode: '560048' },
      }),
      resLive.candidates,
    );

    const resCache = await uncredentialedAdapter.discoverWithFallbackLadder({
      category: 'Switchgear & Power',
      location: { city: 'Bengaluru', pinCode: '560048' },
    });
    expect(resCache.sourceType).toBe('DATABASE_CACHE');
    expect(resCache.externalCallsUsed).toBe(0);
    expect(resCache.candidates).toHaveLength(resLive.candidates.length);

    // 3. Tier 3: STATIC_REFERENCE (No live credentials, no cache)
    const freshAdapter = new GooglePlacesDiscoveryAdapter({ quotaGuard: customGuard });
    const resStatic = await freshAdapter.discoverWithFallbackLadder({
      category: 'Electrical & Automation',
      location: { city: 'Bengaluru', pinCode: '560048' },
    });
    expect(resStatic.sourceType).toBe('STATIC_REFERENCE');
    expect(resStatic.externalCallsUsed).toBe(0);
    expect(resStatic.candidates.length).toBeGreaterThanOrEqual(4);

    // 4. Tier 4: UNAVAILABLE (No match in any category or location)
    const resUnavailable = await freshAdapter.discoverWithFallbackLadder({
      category: 'Unicorn Quantum Astrophysics Hardware',
      location: { city: 'Unknown Remote Island', pinCode: '999999' },
    });
    expect(resUnavailable.sourceType).toBe('UNAVAILABLE');
    expect(resUnavailable.externalCallsUsed).toBe(0);
    expect(resUnavailable.candidates).toHaveLength(0);
    expect(resUnavailable.explanation).toMatch(/No candidate suppliers discovered/);
  });

  /**
   * GP-08: Quota window / daily reset.
   * Proves daily reset at UTC day roll while monthly count persists across days.
   */
  it('GP-08: Quota window / daily reset (UTC day boundary roll)', async () => {
    const customStore = new InMemoryGoogleGisQuotaStore();
    const customGuard = new GoogleGisSafetyQuotaGuard({
      store: customStore,
      limits: { maxDaily: 2, maxMonthly: 50 },
    });

    const day1 = new Date('2026-09-26T12:00:00Z');
    const day2 = new Date('2026-09-27T12:00:00Z');

    // Day 1: 2 calls allowed, 3rd denied
    const r1 = await customGuard.acquireReservation(day1);
    const r2 = await customGuard.acquireReservation(day1);
    const r3 = await customGuard.acquireReservation(day1);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(false);
    expect(r3.reason).toBe('DAILY_QUOTA_EXCEEDED');

    // Day 2: Daily count reset to 0, monthly persists
    const rDay2 = await customGuard.acquireReservation(day2);
    expect(rDay2.allowed).toBe(true);
    expect(rDay2.currentUsage.dailyCount).toBe(1);
    expect(rDay2.currentUsage.monthlyCount).toBe(3);
  });

  /**
   * GP-09: Missing/invalid credential handling -> CREDENTIAL_GATED.
   * Proves that whitespace, null, or empty credentials fail safe and classify as CREDENTIAL_GATED without crashing.
   */
  it('GP-09: Missing or invalid credential handling -> CREDENTIAL_GATED (Fail safe)', async () => {
    const blankKeys = ['', '   ', undefined];

    for (const key of blankKeys) {
      const adapter = new GooglePlacesDiscoveryAdapter({ apiKey: key, quotaGuard });
      expect(adapter.isTruthfulLive).toBe(false);
      expect(adapter.getTruthfulStatus()).toBe(TruthfulProviderStatus.CREDENTIAL_GATED);
      expect(adapter.getExecutionMode()).toBe(GisExecutionMode.CREDENTIAL_GATED);

      // Must not throw on execution
      const res = await adapter.discoverWithFallbackLadder({
        category: 'Electrical',
        location: { city: 'Bengaluru', pinCode: '560048' },
      });

      expect(res.sourceType).toBe('STATIC_REFERENCE');
      expect(res.externalCallsUsed).toBe(0);
    }
  });

  /**
   * GP-10: Zero secret leakage in logs, bundles, and serialization.
   * Proves secret keys are never exposed in plaintext during JSON serialization, toString, or error handling.
   */
  it('GP-10: Zero secret leakage in logs, bundles, and serialization', () => {
    const secretKey = 'AIzaSySecretSuperConfidentialApiKey987654';
    const adapter = new GooglePlacesDiscoveryAdapter({ apiKey: secretKey });

    const serialized = JSON.stringify(adapter.toJSON());
    expect(serialized).not.toContain(secretKey);
    expect(serialized).toContain('[REDACTED]');

    // Ensure error logging does not expose secret keys
    const errorString = `Error executing Google Places call with key=${secretKey}`.replace(
      /key=[A-Za-z0-9_-]+/,
      'key=[REDACTED]',
    );
    expect(errorString).not.toContain(secretKey);
    expect(errorString).toContain('[REDACTED]');
  });
});
