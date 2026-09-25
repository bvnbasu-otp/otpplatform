import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices, type OtpServices } from '../factory/create-otp-services';
import { ManagedSupplierNetworkService } from '../services/managed-supplier-network-service';
import { SupplierTruthfulVerificationStage } from '@otp/domain';

describe('ManagedSupplierNetworkService (R2-07 30-Day Refresh & Quota Engine)', () => {
  let mem: InMemoryRepositories;
  let services: OtpServices;
  let manager: ManagedSupplierNetworkService;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
    manager = services.managedSupplierNetwork;
  });

  describe('1. 30-Day Refresh Policy & Zero Redundant External Calls', () => {
    it('assesses never discovered scope correctly', () => {
      const scope = {
        state: 'Karnataka',
        city: 'Bengaluru',
        pincode: '560048',
        category: 'Electrical & Automation',
      };

      const assessment = manager.assessScopeFreshness(scope);
      expect(assessment.status).toBe('NEVER_DISCOVERED');
      expect(assessment.knownSupplierCount).toBe(0);
      expect(assessment.canReuseCachedNetwork).toBe(false);
      expect(assessment.requiresExternalDiscovery).toBe(true);
    });

    it('executes discovery, stores normalized suppliers and transitions scope to FRESH', async () => {
      const scope = {
        state: 'Karnataka',
        city: 'Bengaluru',
        pincode: '560048',
        category: 'Electrical & Automation',
      };

      const prepResult = await manager.prepareLocationNetwork(scope);
      expect(prepResult.ok).toBe(true);
      expect(prepResult.status).toBe('FRESH');
      expect(prepResult.externalCallsExecuted).toBe(2);
      expect(prepResult.newSuppliersDiscovered).toBeGreaterThanOrEqual(2);
      expect(prepResult.report.suppliers.length).toBeGreaterThanOrEqual(2);

      // Verify scope is now FRESH
      const freshAssessment = manager.assessScopeFreshness(scope);
      expect(freshAssessment.status).toBe('FRESH');
      expect(freshAssessment.canReuseCachedNetwork).toBe(true);
      expect(freshAssessment.requiresExternalDiscovery).toBe(false);
    });

    it('subsequent buyer RFQ in fresh scope reuses network with 0 external API calls', async () => {
      const scope = {
        state: 'Karnataka',
        city: 'Bengaluru',
        pincode: '560048',
        category: 'Electrical & Automation',
      };

      // 1. Superadmin prepares location
      await manager.prepareLocationNetwork(scope);

      // 2. Buyer RFQ created in same location & category
      const rfqDiscovery = await manager.discoverForBuyerRfq(scope);
      expect(rfqDiscovery.reusedExistingNetwork).toBe(true);
      expect(rfqDiscovery.externalCallsUsed).toBe(0);
      expect(rfqDiscovery.suppliers.length).toBeGreaterThanOrEqual(2);
      expect(rfqDiscovery.freshness.status).toBe('FRESH');
    });
  });

  describe('2. Quota-Aware Discovery & Priority Safeguards', () => {
    it('enforces emergency reserve blocking proactive superadmin discoveries when quota is low', () => {
      // Mock daily usage near limit
      const customManager = new ManagedSupplierNetworkService(undefined, undefined, undefined, {
        GOOGLE_PLACES: {
          provider: 'GOOGLE_PLACES',
          dailyRequestLimit: 1500,
          monthlyRequestLimit: 45000,
          emergencyReserveBuffer: 200,
          buyerDemandReserveBuffer: 300,
          proactiveDiscoveryBudget: 500,
          maxCallsPerLocationCategory: 3,
        },
      });

      // Manually evaluate quota when remaining is 150 (<= 200 emergency reserve)
      (customManager as any).dailyUsageCount = 1350; // 150 remaining

      const proactiveEval = customManager.evaluateQuota('GOOGLE_PLACES', 'P4_SUPERADMIN_PROACTIVE', 2);
      expect(proactiveEval.allowed).toBe(false);
      expect(proactiveEval.reserveTierApplied).toBe('EMERGENCY_RESERVE');
      expect(proactiveEval.rejectionReason).toContain('Emergency Reserve');

      // But active buyer RFQ (P1) is still permitted
      const buyerRfqEval = customManager.evaluateQuota('GOOGLE_PLACES', 'P1_ACTIVE_BUYER_RFQ', 2);
      expect(buyerRfqEval.allowed).toBe(true);
      expect(buyerRfqEval.reserveTierApplied).toBe('EMERGENCY_RESERVE');
    });
  });

  describe('3. New Buyer Onboarding Pre-Warm', () => {
    it('returns truthful coverage state for newly registered buyer location', async () => {
      const location = {
        state: 'Karnataka',
        city: 'Bengaluru',
        pincode: '560048',
      };

      // Before pre-warming: 0 coverage, triggers discovery within quota
      const onboardingRes = await manager.evaluateOnboardingLocation(location, 'Electrical');
      expect(onboardingRes.triggeredDiscovery).toBe(true);
      expect(onboardingRes.hasCoverage).toBe(true);
      expect(onboardingRes.knownSuppliersCount).toBeGreaterThan(0);
      expect(onboardingRes.statusLabel).toContain('discovered');

      // Second check: already covered
      const secondCheck = await manager.evaluateOnboardingLocation(location, 'Electrical');
      expect(secondCheck.triggeredDiscovery).toBe(false);
      expect(secondCheck.statusLabel).toContain('already has');
    });
  });

  describe('4. Superadmin & Founder Telemetry Aggregation', () => {
    it('provides comprehensive telemetry metrics covering freshness, coverage, and budget', async () => {
      // Seed some activity
      await manager.prepareLocationNetwork({
        state: 'Karnataka',
        city: 'Bengaluru',
        pincode: '560048',
        category: 'Electrical & Automation',
      });

      const telemetry = manager.getTelemetrySnapshot();
      expect(telemetry.coverage.totalActivatedPincodes).toBeGreaterThanOrEqual(1);
      expect(telemetry.coverage.totalSuppliersInNetwork).toBeGreaterThanOrEqual(2);
      expect(telemetry.providerUsage.todayRequests).toBe(2);
      expect(telemetry.providerUsage.remainingDailyBudget).toBeLessThanOrEqual(1498);
      expect(telemetry.freshness.freshUnder30Days).toBe(1);
    });
  });
});
