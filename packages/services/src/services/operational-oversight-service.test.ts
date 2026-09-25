import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories, createId, timestamp } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { OperationalOversightService } from './operational-oversight-service';

const FOUNDER_ACTOR: ActorContext = {
  profileId: 'usr-founder-001',
  isFounder: true,
  isPlatformAdmin: true,
};

const SUPERADMIN_ACTOR: ActorContext = {
  profileId: 'usr-admin-002',
  isFounder: false,
  isPlatformAdmin: true,
};

const BUYER_ACTOR: ActorContext = {
  profileId: 'usr-buyer-003',
  organizationId: 'org-buyer-001',
  orgRole: 'OWNER',
  isFounder: false,
  isPlatformAdmin: false,
};

describe('Operational Oversight & Executive Telemetry Service', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;
  let oversight: OperationalOversightService;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
    oversight = new OperationalOversightService(repos, services.audit);
  });

  it('allows Founder to retrieve authoritative executive cockpit metrics', async () => {
    const repos = mem.asRepositories();
    const now = timestamp();

    // Seed production Purchase Orders representing RWA and MSME buyers
    await repos.purchaseOrders.save({
      id: 'po-prod-001',
      awardId: 'award-001',
      poNumber: 'PO-2026-001',
      organizationId: 'org-rwa-01',
      rfqId: 'rfq-01',
      supplierId: 'sup-01',
      totalAmount: 118000,
      status: 'COMPLETED',
      currency: 'INR',
      createdAt: now,
      updatedAt: now,
    });
    await repos.purchaseOrders.save({
      id: 'po-prod-002',
      awardId: 'award-002',
      poNumber: 'PO-2026-002',
      organizationId: 'org-msme-02',
      rfqId: 'rfq-02',
      supplierId: 'sup-02',
      totalAmount: 0,
      status: 'COMPLETED',
      currency: 'INR',
      createdAt: now,
      updatedAt: now,
    });

    const metricsRes = await oversight.getFounderExecutiveMetrics(FOUNDER_ACTOR);
    expect(metricsRes.ok).toBe(true);

    if (metricsRes.ok) {
      const metrics = metricsRes.value;
      expect(metrics.isFounderAuthorized).toBe(true);
      expect(metrics.adoption.totalBuyersCount).toBe(2);
      expect(metrics.financials.cumulativeGmvInr).toBe(118000);
      expect(metrics.financials.totalPlatformFeesInr).toBe(500); // 0.50% of ₹1,00,000 base
      expect(metrics.financials.totalBuyerRewardsInr).toBe(100);  // 0.10% of ₹1,00,000 base
      expect(metrics.network.networkCacheHitRatePercent).toBe(94.2);
      expect(metrics.network.supplierAcquisitionCostProxy.isProxy).toBe(true);
    }
  });

  it('prohibits non-admin / non-founder from accessing executive metrics', async () => {
    const metricsRes = await oversight.getFounderExecutiveMetrics(BUYER_ACTOR);
    expect(metricsRes.ok).toBe(false);
    if (!metricsRes.ok) {
      expect(metricsRes.error.message).toContain('Founder/CEO executive privileges required');
    }
  });

  it('records attributable admin audit entry with data minimization', async () => {
    const logRes = await oversight.logAdminAuditAction(SUPERADMIN_ACTOR, {
      scope: 'SUPPLIER_VERIFICATION',
      action: 'APPROVE_GSTIN_STAGE_2',
      targetType: 'SUPPLIER',
      targetId: 'sup-2026-001',
      reason: 'GSTIN and PAN verified with official portal',
      beforeSnapshot: {
        status: 'OTP_REGISTERED',
        token: 'secret-magic-token-xyz',
      },
      afterSnapshot: {
        status: 'GST_VERIFIED',
      },
    });

    expect(logRes.ok).toBe(true);
    if (logRes.ok) {
      expect(logRes.value.beforeSnapshot?.token).toBe('[REDACTED_SECRET]');
      expect(logRes.value.afterSnapshot?.status).toBe('GST_VERIFIED');
    }
  });

  it('enforces platform role transaction isolation', () => {
    const voteCheck = oversight.assertBuyerTransactionIsolation(SUPERADMIN_ACTOR, 'COMMITTEE_VOTE');
    expect(voteCheck.ok).toBe(false);

    const spendCheck = oversight.assertBuyerTransactionIsolation(FOUNDER_ACTOR, 'MSME_SPEND_APPROVAL');
    expect(spendCheck.ok).toBe(false);
  });
});
