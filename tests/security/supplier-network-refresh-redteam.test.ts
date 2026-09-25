import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryRepositories } from '../../packages/services/src/repositories/in-memory';
import { createOtpServices, type OtpServices } from '../../packages/services/src/factory/create-otp-services';
import type { ActorContext } from '../../packages/services/src/types/actor-context';
import {
  SupplierTruthfulVerificationStage,
  CANONICAL_INDIAN_PROCUREMENT_STANDARDS,
  IndianProcurementStandardsEvaluator,
  DEFAULT_SUPPLIER_REFRESH_POLICY,
  DEFAULT_PROVIDER_BUDGET_CONFIGS,
} from '@otp/domain';

const ORG_A = 'org-buyer-ka-01';
const BUYER_ACTOR: ActorContext = {
  profileId: 'usr-buyer-001',
  organizationId: ORG_A,
  orgRole: 'BUYER',
};

const SUPERADMIN_ACTOR: ActorContext = {
  profileId: 'usr-admin-001',
  isPlatformAdmin: true,
};

describe('Supplier Network Engine & Discovery Policy Red-Team Security Battery (R2-07 Red Team)', () => {
  let mem: InMemoryRepositories;
  let services: OtpServices;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    const repos = mem.asRepositories();
    services = createOtpServices(repos);
  });

  // -------------------------------------------------------------------------
  // RT-01: External discovery does not grant fake OTP Verified status
  // -------------------------------------------------------------------------
  it('RT-01: Discovered supplier from Google Places is marked truthfully as DETAILS_AVAILABLE or DISCOVERED_IN_AREA, never falsely claiming OTP_VERIFIED', async () => {
    const manager = services.managedSupplierNetwork;
    const scope = {
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
      category: 'Electrical & Automation',
    };

    const res = await manager.prepareLocationNetwork(scope, SUPERADMIN_ACTOR);
    expect(res.ok).toBe(true);

    for (const sup of res.report.suppliers) {
      if (!sup.isOtpRegistered && !sup.isGstVerified) {
        expect(sup.verificationStage).not.toBe(SupplierTruthfulVerificationStage.OTP_VERIFIED);
        expect(sup.verificationStage).not.toBe(SupplierTruthfulVerificationStage.OTP_REGISTERED);
      }
    }
  });

  // -------------------------------------------------------------------------
  // RT-02: 30-Day Freshness Scope Reuse (Zero API Consumption)
  // -------------------------------------------------------------------------
  it('RT-02: Investor Demo Scenario: Pre-warmed 560048 Electrical scope reuses network with 0 API calls for Buyer RFQ', async () => {
    const manager = services.managedSupplierNetwork;
    const scope = {
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
      category: 'Electrical & Automation',
    };

    // 1. Superadmin prepares location network
    const prepRes = await manager.prepareLocationNetwork(scope, SUPERADMIN_ACTOR);
    expect(prepRes.ok).toBe(true);
    expect(prepRes.externalCallsExecuted).toBe(2);

    // 2. Buyer creates RFQ in 560048
    const rfqRes = await manager.discoverForBuyerRfq(scope, BUYER_ACTOR);
    expect(rfqRes.reusedExistingNetwork).toBe(true);
    expect(rfqRes.externalCallsUsed).toBe(0);
    expect(rfqRes.suppliers.length).toBeGreaterThanOrEqual(2);
    expect(rfqRes.freshness.status).toBe('FRESH');
  });

  // -------------------------------------------------------------------------
  // RT-03: Emergency Reserve Buffer Locks Proactive Discovery
  // -------------------------------------------------------------------------
  it('RT-03: Provider quota guard prevents proactive discovery when emergency reserve buffer is entered', async () => {
    const manager = services.managedSupplierNetwork;
    // Simulate quota at 1450 (50 remaining < 200 emergency buffer)
    (manager as any).dailyUsageCount = 1450;

    const proactiveEval = manager.evaluateQuota('GOOGLE_PLACES', 'P4_SUPERADMIN_PROACTIVE', 2);
    expect(proactiveEval.allowed).toBe(false);
    expect(proactiveEval.reserveTierApplied).toBe('EMERGENCY_RESERVE');

    // P1 Active Buyer RFQ is still permitted
    const buyerRfqEval = manager.evaluateQuota('GOOGLE_PLACES', 'P1_ACTIVE_BUYER_RFQ', 2);
    expect(buyerRfqEval.allowed).toBe(true);
  });

  // -------------------------------------------------------------------------
  // RT-04: Non-destructive Refresh (Historical Observations Preserved)
  // -------------------------------------------------------------------------
  it('RT-04: Controlled refresh updates lastSeenAt and appends discovery observations without destroying existing supplier records', async () => {
    const manager = services.managedSupplierNetwork;
    const scope = {
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
      category: 'Electrical & Automation',
    };

    // First discovery
    await manager.prepareLocationNetwork(scope, SUPERADMIN_ACTOR);
    const initialCount = (manager as any).observations.length;
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // Force refresh
    const refreshRes = await manager.prepareLocationNetwork({ ...scope, forceRefresh: true }, SUPERADMIN_ACTOR);
    expect(refreshRes.ok).toBe(true);
    expect((manager as any).observations.length).toBeGreaterThan(initialCount);
  });

  // -------------------------------------------------------------------------
  // RT-05: Indian Standard BIS / CPWD / FSSAI Mapping Verification
  // -------------------------------------------------------------------------
  it('RT-05: Standard compliance evaluation deterministically maps BIS IS 694 and CPWD specifications with explainability', () => {
    const elecResult = IndianProcurementStandardsEvaluator.evaluateCompliance({
      category: 'Electrical & Automation',
      declaredStandards: ['IS 694'],
      itemDescription: 'Copper fire-resistant building wires',
    });

    expect(elecResult.totalConfidenceBoost).toBeGreaterThanOrEqual(15);
    expect(elecResult.isMandatoryCompliant).toBe(true);
    expect(elecResult.complianceSummary).toContain('IS 694');

    const foodResult = IndianProcurementStandardsEvaluator.evaluateCompliance({
      category: 'Food, Catering & Hospitality',
      declaredStandards: ['FSSAI LICENSE / REGISTRATION'],
    });
    expect(foodResult.totalConfidenceBoost).toBeGreaterThanOrEqual(20);
    expect(foodResult.isMandatoryCompliant).toBe(true);
  });
});
