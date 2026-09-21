import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import type { MarketBenchmarkQuery, MarketBenchmarkResult } from '@otp/domain';

const BUYER_ORG_ID = 'org-c83-buyer-01';
const BUYER_CREATOR: ActorContext = {
  profileId: 'usr-buyer-c83-creator',
  organizationId: BUYER_ORG_ID,
  orgRole: 'BUYER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'usr-buyer-c83-manager',
  organizationId: BUYER_ORG_ID,
  orgRole: 'MANAGER',
};

describe('OTP Phase C8.3: Dynamic Threshold Routing & Market Intelligence Service Integration', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  async function seedRfq(budget: number, title: string) {
    const repos = mem.asRepositories();
    const now = new Date().toISOString();

    const req = await repos.requirements.save({
      id: 'req-c83-test-01',
      organizationId: BUYER_ORG_ID,
      createdBy: BUYER_CREATOR.profileId,
      requirementType: 'PROJECT',
      status: 'RFQ_CREATED',
      title,
      budgetAmount: budget,
      createdAt: now,
      updatedAt: now,
    });

    const rfq = await repos.rfqs.save({
      id: 'rfq-c83-test-01',
      requirementId: req.id,
      organizationId: BUYER_ORG_ID,
      status: 'EVALUATING',
      revealStatus: 'PROTECTED',
      title,
      buyerAnonymousToSuppliers: true,
      minQuotesRequired: 3,
      createdBy: BUYER_CREATOR.profileId,
      createdAt: now,
      updatedAt: now,
    });

    return { req, rfq };
  }

  describe('Dynamic Threshold Routing Evaluation via EnterpriseApprovalMatrixService', () => {
    it('evaluates dynamic route for ₹12 Lakhs procurement to Tier 2 Dept Head', async () => {
      const { rfq } = await seedRfq(1200000, 'Commercial CCTV & Access Control Infrastructure');

      const route = await services.enterpriseApprovalMatrix.evaluateApprovalRoute(BUYER_MANAGER, {
        rfqId: rfq.id,
        procurementAmount: 1200000,
      });

      expect(route.requiredApprovalLevel).toBe('TIER_2_DEPT_HEAD');
      expect(route.requiredTierLevels).toEqual(['TIER_1_MANAGER', 'TIER_2_DEPT_HEAD']);
      expect(route.executiveGate).toBe(false);
      expect(route.delegationAllowed).toBe(true);
      expect(route.applicableTiers).toHaveLength(2);
    });

    it('evaluates dynamic route for ₹45 Lakhs procurement to Tier 3 Executive Gate', async () => {
      const { rfq } = await seedRfq(4500000, 'Heavy Industrial DG Genset Installation');

      const route = await services.enterpriseApprovalMatrix.evaluateApprovalRoute(BUYER_MANAGER, {
        rfqId: rfq.id,
        procurementAmount: 4500000,
      });

      expect(route.requiredApprovalLevel).toBe('TIER_3_EXECUTIVE');
      expect(route.executiveGate).toBe(true);
      expect(route.delegationAllowed).toBe(false);
      expect(route.evaluationReason).toContain('Executive director sign-off required (Tier 3 Gate)');
    });
  });

  describe('Live Market Intelligence Fallback & Provider Orchestration', () => {
    it('resolves curated cluster benchmark with honest AGING status and MEDIUM confidence', async () => {
      const query: MarketBenchmarkQuery = {
        categoryKey: 'cctv_surveillance',
        locationCity: 'Bengaluru',
      };

      const snapshot = await services.marketIntelligence.resolveMarketIntelligence(query, 92000);

      expect(snapshot.sourceType).toBe('HISTORICAL_BENCHMARK');
      expect(snapshot.freshness).toBe('AGING');
      expect(snapshot.confidence).toBe('MEDIUM');
      expect(snapshot.fairPriceMedian).toBe(98000);
      expect(snapshot.quoteVariancePercent).toBe(-6.1);
      expect(snapshot.isFallback).toBe(false);
    });

    it('captures an immutable snapshot onto an RFQ evaluation record and logs audit event', async () => {
      const { rfq } = await seedRfq(100000, 'CCTV Surveillance Camera Network');

      const snapshot = await services.marketIntelligence.captureRfqMarketSnapshot(BUYER_MANAGER, rfq.id, 95000);

      expect(snapshot.rfqId).toBe(rfq.id);
      expect(snapshot.categoryKey).toBe('cctv_surveillance');
      expect(snapshot.fairPriceMin).toBe(85000);
      expect(snapshot.fairPriceMax).toBe(120000);
    });

    it('supports live provider registration taking priority over cluster baselines', async () => {
      const liveMockProvider = {
        providerId: 'ondc-live-registry-adapter',
        providerName: 'ONDC Real-Time Commodity Index',
        supportedSourceType: 'LIVE_API' as const,
        async getBenchmark(query: MarketBenchmarkQuery): Promise<MarketBenchmarkResult | null> {
          if (query.categoryKey === 'cctv_surveillance') {
            return {
              categoryKey: query.categoryKey,
              locationCity: 'Bengaluru',
              fairPriceMin: 88000,
              fairPriceMax: 105000,
              fairPriceMedian: 92000,
              typicalDeliveryDaysMin: 2,
              typicalDeliveryDaysMax: 4,
              typicalWarrantyMonthsMin: 24,
              typicalWarrantyMonthsMax: 36,
              networkReliabilityScore: 99.1,
              sampleSize: 55,
              sourceType: 'LIVE_API',
              sourceProviderName: 'ONDC Real-Time Commodity Index',
              observedAt: new Date().toISOString(), // FRESH
            };
          }
          return null;
        },
      };

      services.marketIntelligence.registerProvider(liveMockProvider);

      const query: MarketBenchmarkQuery = {
        categoryKey: 'cctv_surveillance',
        locationCity: 'Bengaluru',
      };

      const snapshot = await services.marketIntelligence.resolveMarketIntelligence(query, 91000);

      expect(snapshot.sourceType).toBe('LIVE_API');
      expect(snapshot.sourceProviderName).toBe('ONDC Real-Time Commodity Index');
      expect(snapshot.freshness).toBe('FRESH');
      expect(snapshot.confidence).toBe('HIGH');
      expect(snapshot.sampleSize).toBe(55);
    });
  });
});
