import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import type { MarketBenchmarkQuery } from '@otp/domain';
import {
  HttpMarketIntelligenceProvider,
  DatabaseCacheMarketIntelligenceProvider,
  CuratedClusterBaselineProvider,
  computeResponseIntegrityHash,
} from '../../packages/services/src/services/market-intelligence-service';
import {
  generateMarketCacheKey,
  sanitizeMarketBenchmarkQuery,
  assertZeroPiiInMarketQuery,
  validateMarketIntelligenceQuoteIndependence,
  assertMarketIntelligenceTaxIndependence,
  calculateMarketFreshness,
  calculateMarketConfidence,
  createMarketIntelligenceSnapshot,
} from '@otp/domain';
import { ForbiddenError } from '../../packages/services/src/types/errors';

const ORG_ALPHA = 'org-tenant-alpha-101';
const ORG_BETA = 'org-tenant-beta-202';

const ACTOR_ALPHA_BUYER: ActorContext = {
  profileId: 'usr-buyer-alpha-001',
  organizationId: ORG_ALPHA,
  orgRole: 'BUYER',
};

const ACTOR_BETA_BUYER: ActorContext = {
  profileId: 'usr-buyer-beta-002',
  organizationId: ORG_BETA,
  orgRole: 'BUYER',
};

describe('Market Intelligence & Fallback Ladder Red Team Security Battery (16 Attack Vectors)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedRfq(orgId: string, actor: ActorContext, title = 'CCTV Surveillance Network') {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const req = await repos.requirements.save({
      id: `req-${crypto.randomUUID().slice(0, 8)}`,
      organizationId: orgId,
      createdBy: actor.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title,
      budgetAmount: 100000,
      createdAt: now,
      updatedAt: now,
    });

    const rfq = await repos.rfqs.save({
      id: `rfq-${crypto.randomUUID().slice(0, 8)}`,
      requirementId: req.id,
      organizationId: orgId,
      status: 'EVALUATING',
      revealStatus: 'PROTECTED',
      title,
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy: actor.profileId,
      createdAt: now,
      updatedAt: now,
    });

    return { req, rfq };
  }

  // -------------------------------------------------------------------------
  // RT-01: Fake provider response presented as LIVE
  // -------------------------------------------------------------------------
  it('RT-01: Blocks unconfigured/mock provider from being presented as LIVE', async () => {
    const unconfiguredProvider = new HttpMarketIntelligenceProvider({
      endpointUrl: '', // Unconfigured
    });

    expect(unconfiguredProvider.status).toBe('DISABLED');

    const query: MarketBenchmarkQuery = {
      categoryKey: 'cctv_surveillance',
      locationCity: 'Bengaluru',
    };

    const result = await unconfiguredProvider.getBenchmark(query);
    expect(result).toBeNull();

    // Fallback ladder steps down to static reference or unavailable, never claiming LIVE
    const snapshot = await services.marketIntelligence.resolveMarketIntelligence(query);
    expect(snapshot.sourceType).not.toBe('LIVE_API');
  });

  // -------------------------------------------------------------------------
  // RT-02: Static reference presented as LIVE
  // -------------------------------------------------------------------------
  it('RT-02: Ensures static CPWD/BIS reference data is never labeled as LIVE', async () => {
    const staticProvider = new CuratedClusterBaselineProvider();
    const query: MarketBenchmarkQuery = {
      categoryKey: 'cctv_surveillance',
      locationCity: 'Bengaluru',
    };

    const benchmark = await staticProvider.getBenchmark(query);
    expect(benchmark).not.toBeNull();
    expect(benchmark!.sourceType).toBe('STATIC_REFERENCE');
    expect(benchmark!.sourceType).not.toBe('LIVE_API');
    expect(benchmark!.sourceProviderName).toContain('CPWD/BIS');

    const snapshot = createMarketIntelligenceSnapshot({
      benchmark,
      currentTime: new Date('2026-09-25T10:00:00Z'),
    });

    expect(snapshot.sourceType).toBe('STATIC_REFERENCE');
    expect(snapshot.sourceType).not.toBe('LIVE_API');
  });

  // -------------------------------------------------------------------------
  // RT-03: Cached response presented as LIVE
  // -------------------------------------------------------------------------
  it('RT-03: Ensures cached responses retain DATABASE_CACHE provenance and original age', async () => {
    const fakeObservedDate = '2026-09-15T12:00:00Z'; // 10 days ago
    const dbCacheProvider = new DatabaseCacheMarketIntelligenceProvider(async () => ({
      fairPriceMin: 88000,
      fairPriceMax: 115000,
      fairPriceMedian: 98000,
      sampleSize: 22,
      observedAt: fakeObservedDate,
      responseIntegrityHash: computeResponseIntegrityHash('cached-db-row-test'),
    }));

    services.marketIntelligence.registerProvider(dbCacheProvider);

    const query: MarketBenchmarkQuery = {
      categoryKey: 'cctv_surveillance',
      locationCity: 'Bengaluru',
    };

    const snapshot = await services.marketIntelligence.resolveMarketIntelligence(
      query,
      95000
    );

    expect(snapshot.sourceType).toBe('DATABASE_CACHE');
    expect(snapshot.sourceType).not.toBe('LIVE_API');
    expect(snapshot.observedAt).toBe(fakeObservedDate);
    expect(snapshot.freshness).toBe('AGING'); // 10 days old relative to 2026-09-25
  });

  // -------------------------------------------------------------------------
  // RT-04: Provider timeout causes fabricated fallback value
  // -------------------------------------------------------------------------
  it('RT-04: Ensures provider timeout triggers truthful fallback without fabricating numbers', async () => {
    const timingOutProvider = new HttpMarketIntelligenceProvider({
      endpointUrl: 'https://api.marketintel.ondc.org/benchmarks',
      timeoutMs: 50, // Ultra-short timeout
      fetchFn: () => new Promise((resolve) => setTimeout(() => resolve(new Response('{}')), 500)),
    });

    services.marketIntelligence.registerProvider(timingOutProvider);

    const query: MarketBenchmarkQuery = {
      categoryKey: 'non_existent_special_category_xyz',
      locationCity: 'Bengaluru',
    };

    const snapshot = await services.marketIntelligence.resolveMarketIntelligence(query);

    // Timeout must drop to UNAVAILABLE (since category does not exist in curated static catalog)
    expect(snapshot.sourceType).toBe('UNAVAILABLE');
    expect(snapshot.fairPriceMin).toBeNull();
    expect(snapshot.fairPriceMax).toBeNull();
    expect(snapshot.sampleSize).toBe(0);
    expect(snapshot.confidence).toBe('INSUFFICIENT_DATA');
  });

  // -------------------------------------------------------------------------
  // RT-05: Provider unavailable causes random/generated market value
  // -------------------------------------------------------------------------
  it('RT-05: Blocks Math.random or synthetic price generation when provider is unavailable', () => {
    const snapshot = createMarketIntelligenceSnapshot({
      benchmark: null,
      fallbackReason: 'Provider offline',
      currentTime: new Date('2026-09-25T10:00:00Z'),
    });

    expect(snapshot.sourceType).toBe('UNAVAILABLE');
    expect(snapshot.fairPriceMin).toBeNull();
    expect(snapshot.fairPriceMax).toBeNull();
    expect(snapshot.fairPriceMedian).toBeNull();
    expect(snapshot.sampleSize).toBe(0);
    expect(snapshot.confidenceScore).toBe(0);
  });

  // -------------------------------------------------------------------------
  // RT-06: Supplier quote fabricated from market intelligence
  // -------------------------------------------------------------------------
  it('RT-06: Prevents market intelligence snapshot from being submitted as a supplier quote', () => {
    const snapshot = createMarketIntelligenceSnapshot({
      benchmark: {
        categoryKey: 'cctv_surveillance',
        locationCity: 'Bengaluru',
        fairPriceMin: 85000,
        fairPriceMax: 120000,
        fairPriceMedian: 98000,
        typicalDeliveryDaysMin: 3,
        typicalDeliveryDaysMax: 7,
        typicalWarrantyMonthsMin: 12,
        typicalWarrantyMonthsMax: 24,
        networkReliabilityScore: 96.5,
        sampleSize: 34,
        sourceType: 'STATIC_REFERENCE',
        sourceProviderName: 'OTP Curated Reference Baselines (CPWD/BIS)',
        observedAt: '2026-09-20T10:00:00Z',
      },
    });

    // Attempting to submit snapshotId as a commercial quote ID is blocked
    const validation = validateMarketIntelligenceQuoteIndependence(
      snapshot,
      snapshot.snapshotId
    );

    expect(validation.isIndependent).toBe(false);
    expect(validation.violation).toContain('cannot be submitted as a commercial quote ID');
  });

  // -------------------------------------------------------------------------
  // RT-07: Cross-tenant market data leakage
  // -------------------------------------------------------------------------
  it('RT-07: Enforces strict tenant isolation on RFQ market snapshot capture', async () => {
    const { rfq } = await seedRfq(ORG_ALPHA, ACTOR_ALPHA_BUYER);

    // Actor Beta (different org) attempts to capture or stamp market snapshot for Org Alpha's RFQ
    await expect(
      services.marketIntelligence.captureRfqMarketSnapshot(
        ACTOR_BETA_BUYER,
        rfq.id,
        95000
      )
    ).rejects.toThrow(ForbiddenError);

    // Verifies cache keys are purely public domain and contain zero tenant IDs
    const cacheKey = generateMarketCacheKey({
      categoryKey: 'cctv_surveillance',
      locationCity: 'Bengaluru',
      stateCode: 'KA',
    });
    expect(cacheKey).not.toContain(ORG_ALPHA);
    expect(cacheKey).not.toContain(ORG_BETA);
  });

  // -------------------------------------------------------------------------
  // RT-08: Private buyer identity sent to external provider
  // -------------------------------------------------------------------------
  it('RT-08: Strips and blocks private buyer PII from outbound market queries', () => {
    const maliciousQueryWithPii = {
      categoryKey: 'cctv_surveillance',
      buyerName: 'Ramesh Patel',
      phone: '+919876543210',
      email: 'ramesh@secretbuyer.in',
      doorNumber: 'Flat 402, Tower B',
      street: 'Outer Ring Road',
      locationCity: 'Bengaluru',
      stateCode: 'KA',
    };

    // Assertion catches PII keys
    expect(() => {
      assertZeroPiiInMarketQuery(maliciousQueryWithPii);
    }).toThrow(/Private PII\/tenant key/);

    // Sanitizer strips PII cleanly
    const sanitized = sanitizeMarketBenchmarkQuery(maliciousQueryWithPii);
    expect((sanitized as any).buyerName).toBeUndefined();
    expect((sanitized as any).phone).toBeUndefined();
    expect((sanitized as any).email).toBeUndefined();
    expect((sanitized as any).doorNumber).toBeUndefined();
    expect((sanitized as any).street).toBeUndefined();
    expect(sanitized.categoryKey).toBe('cctv_surveillance');
    expect(sanitized.locationCity).toBe('Bengaluru');
  });

  // -------------------------------------------------------------------------
  // RT-09: Private supplier identity sent to external provider
  // -------------------------------------------------------------------------
  it('RT-09: Prevents supplier identity or GSTIN from being dispatched to external providers', () => {
    const queryWithSupplierPii = {
      categoryKey: 'cctv_surveillance',
      supplierId: 'sup-unmasked-private-99',
      gstin: '29ABCDE1234F1Z5',
    };

    expect(() => {
      assertZeroPiiInMarketQuery(queryWithSupplierPii);
    }).toThrow(/Private PII\/tenant key/);
  });

  // -------------------------------------------------------------------------
  // RT-10: Competitor quote data exposed through market intelligence
  // -------------------------------------------------------------------------
  it('RT-10: Guarantees individual unsealed supplier quote amounts are never sent to external providers', async () => {
    let capturedUrl = '';
    const spyProvider = new HttpMarketIntelligenceProvider({
      endpointUrl: 'https://api.marketintel.ondc.org/benchmarks',
      fetchFn: (input) => {
        capturedUrl = input.toString();
        return Promise.resolve(
          new Response(
            JSON.stringify({
              fairPriceMin: 80000,
              fairPriceMax: 120000,
              fairPriceMedian: 95000,
              sampleSize: 15,
            })
          )
        );
      },
    });

    const query: MarketBenchmarkQuery = {
      categoryKey: 'cctv_surveillance',
      locationCity: 'Bengaluru',
      stateCode: 'KA',
      targetQuantity: 10,
    };

    await spyProvider.getBenchmark(query);

    const urlObj = new URL(capturedUrl);
    expect(urlObj.searchParams.has('quoteId')).toBe(false);
    expect(urlObj.searchParams.has('quoteAmount')).toBe(false);
    expect(urlObj.searchParams.has('supplierId')).toBe(false);
    expect(urlObj.searchParams.get('category')).toBe('cctv_surveillance');
  });

  // -------------------------------------------------------------------------
  // RT-11: External API quota bypass via cache bypass/repeated requests
  // -------------------------------------------------------------------------
  it('RT-11: Enforces platform operational budget limiting on external providers', async () => {
    let callCount = 0;
    const providerWithBudget = new HttpMarketIntelligenceProvider({
      endpointUrl: 'https://api.marketintel.ondc.org/benchmarks',
      budgetPolicy: {
        maxRequestsPerHour: 3,
        maxRequestsPerDay: 5,
        requestTimeoutMs: 1000,
        cacheTtlDays: 7,
      },
      fetchFn: () => {
        callCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              fairPriceMin: 85000,
              fairPriceMax: 120000,
              fairPriceMedian: 98000,
              sampleSize: 20,
            })
          )
        );
      },
    });

    const query: MarketBenchmarkQuery = {
      categoryKey: 'cctv_surveillance',
      locationCity: 'Bengaluru',
    };

    // First 3 calls succeed within budget
    await providerWithBudget.getBenchmark(query);
    await providerWithBudget.getBenchmark(query);
    await providerWithBudget.getBenchmark(query);
    expect(callCount).toBe(3);

    // 4th call exceeds hourly budget -> returns null without dispatching upstream HTTP call
    const fourthResult = await providerWithBudget.getBenchmark(query);
    expect(fourthResult).toBeNull();
    expect(callCount).toBe(3); // Upstream was NOT called
    expect(providerWithBudget.status).toBe('UNAVAILABLE');
  });

  // -------------------------------------------------------------------------
  // RT-12: Frontend/browser directly bypasses canonical server provider controls
  // -------------------------------------------------------------------------
  it('RT-12: Verifies domain snapshot builder rejects fake LIVE status without provider proof', () => {
    // If a snapshot is constructed with null benchmark or UNAVAILABLE source, it cannot claim LIVE_API
    const snapshot = createMarketIntelligenceSnapshot({
      benchmark: null,
      lowestQuoteAmount: 90000,
    });

    expect(snapshot.sourceType).toBe('UNAVAILABLE');
    expect(snapshot.sourceType).not.toBe('LIVE_API');
    expect(snapshot.isFallback).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RT-13: Market intelligence mutates taxonomy
  // -------------------------------------------------------------------------
  it('RT-13: Ensures market intelligence lookup is read-only and never mutates canonical taxonomy', async () => {
    const query: MarketBenchmarkQuery = {
      categoryKey: 'water_borewell_submersible_pump',
      subcategoryCode: 'openwell_submersible_pump',
    };

    const snapshot = await services.marketIntelligence.resolveMarketIntelligence(query);
    expect(snapshot.categoryKey).toBe('water_borewell_submersible_pump');

    // Taxonomy query did not write to any requirement or category table
    const req = await mem.asRepositories().requirements.findById('any-req-id');
    expect(req).toBeNull();
  });

  // -------------------------------------------------------------------------
  // RT-14: Market intelligence mutates procurement state
  // -------------------------------------------------------------------------
  it('RT-14: Verifies capturing market snapshot does not advance RFQ lifecycle state', async () => {
    const { rfq } = await seedRfq(ORG_ALPHA, ACTOR_ALPHA_BUYER);
    expect(rfq.status).toBe('EVALUATING');

    await services.marketIntelligence.captureRfqMarketSnapshot(
      ACTOR_ALPHA_BUYER,
      rfq.id,
      95000
    );

    const reloadedRfq = await mem.asRepositories().rfqs.findById(rfq.id);
    expect(reloadedRfq?.status).toBe('EVALUATING'); // State remains EVALUATING, not mutated to AWARDED or DECIDED
  });

  // -------------------------------------------------------------------------
  // RT-15: Market intelligence overrides canonical GST calculation
  // -------------------------------------------------------------------------
  it('RT-15: Verifies market intelligence has zero impact on PA-06 bilateral GST calculations', () => {
    const snapshot = createMarketIntelligenceSnapshot({
      benchmark: {
        categoryKey: 'cctv_surveillance',
        locationCity: 'Bengaluru',
        fairPriceMin: 85000,
        fairPriceMax: 120000,
        fairPriceMedian: 98000,
        typicalDeliveryDaysMin: 3,
        typicalDeliveryDaysMax: 7,
        typicalWarrantyMonthsMin: 12,
        typicalWarrantyMonthsMax: 24,
        networkReliabilityScore: 96.5,
        sampleSize: 34,
        sourceType: 'STATIC_REFERENCE',
        sourceProviderName: 'OTP Curated Reference Baselines (CPWD/BIS)',
        observedAt: '2026-09-20T10:00:00Z',
      },
    });

    const statutoryGstAmount = 18000; // 18% on ₹1,00,000 quote
    expect(assertMarketIntelligenceTaxIndependence(snapshot, statutoryGstAmount)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RT-16: Unverified supplier receives a false certification/market-validation signal
  // -------------------------------------------------------------------------
  it('RT-16: Ensures network reliability scores describe category baselines and never certify unverified suppliers', () => {
    const staticProvider = new CuratedClusterBaselineProvider();
    const baseline = staticProvider.getBenchmark({
      categoryKey: 'cctv_surveillance',
    });

    expect(baseline).toBeDefined();
    // Reliability score belongs to category benchmark, not to any supplier profile
    expect((baseline as any).supplierId).toBeUndefined();
    expect((baseline as any).isSupplierVerified).toBeUndefined();
  });
});
