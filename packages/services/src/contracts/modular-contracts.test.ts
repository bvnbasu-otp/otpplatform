/**
 * OTP Next — Comprehensive Test Suite for Modular Backend Contracts & Adapters
 * Verifies all 28 modules, invariants, tax regimes, governance rules, and error handling.
 */

import { describe, it, expect } from 'vitest';
import { createOtpNextContracts } from '../adapters/otp-service-registry';
import type { ActorContext } from '../types/actor-context';

describe('OTP Next — 28 Modular Domain Contracts & Adapters', () => {
  // Mock Supabase client
  const mockClient = {
    auth: {
      signInWithOtp: async () => ({ data: { messageId: 'msg_123' }, error: null }),
      verifyOtp: async () => ({
        data: {
          user: { id: 'usr_baskar', email: 'bvnbasu@gmail.com', last_sign_in_at: null },
          session: { access_token: 'mock_jwt_token' },
        },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
      }),
      insert: (_val: any) => ({
        select: () => ({
          maybeSingle: async () => ({ data: { id: 'org_created' }, error: null }),
        }),
      }),
      update: (_val: any) => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    }),
  };

  const contracts = createOtpNextContracts(mockClient);

  const actorIndividual: ActorContext = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'INDIVIDUAL',
  };

  const actorRwaOfficer: ActorContext = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'COMMITTEE_MEMBER',
  };

  const actorEstateManager: ActorContext = {
    profileId: 'usr_manager',
    fullName: 'Estate Manager Dave',
    email: 'manager@durga.example',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'ESTATE_FACILITY_MANAGER',
  };

  // ==========================================
  // Test 1: Registry Completeness
  // ==========================================
  it('instantiates all 28 domain module contracts without undefined entries', () => {
    expect(contracts.identityAuth).toBeDefined();
    expect(contracts.userProfiles).toBeDefined();
    expect(contracts.buyerManagement).toBeDefined();
    expect(contracts.rwaGovernance).toBeDefined();
    expect(contracts.msmeManagement).toBeDefined();
    expect(contracts.supplierManagement).toBeDefined();
    expect(contracts.supplierVerification).toBeDefined();
    expect(contracts.addressManagement).toBeDefined();
    expect(contracts.taxonomyCategories).toBeDefined();
    expect(contracts.networkEngine).toBeDefined();
    expect(contracts.supplierInvitations).toBeDefined();
    expect(contracts.rfqLifecycle).toBeDefined();
    expect(contracts.quotationManagement).toBeDefined();
    expect(contracts.smartMerit).toBeDefined();
    expect(contracts.evaluationVoting).toBeDefined();
    expect(contracts.conflictOfInterest).toBeDefined();
    expect(contracts.awardReveal).toBeDefined();
    expect(contracts.purchaseOrders).toBeDefined();
    expect(contracts.orderTracking).toBeDefined();
    expect(contracts.invoices).toBeDefined();
    expect(contracts.payments).toBeDefined();
    expect(contracts.subscriptions).toBeDefined();
    expect(contracts.pricing).toBeDefined();
    expect(contracts.notifications).toBeDefined();
    expect(contracts.documents).toBeDefined();
    expect(contracts.auditCompliance).toBeDefined();
    expect(contracts.platformAdmin).toBeDefined();
    expect(contracts.reporting).toBeDefined();
  });

  // ==========================================
  // Cluster A: Identity, Profiles & Buyer (01-03)
  // ==========================================
  describe('Cluster A: Identity, Profiles & Buyer Accounts (Modules 01-03)', () => {
    it('requests and verifies phone OTP', async () => {
      const otpReq = await contracts.identityAuth.requestPhoneOtp({ phone: '+919876543210' });
      expect(otpReq.ok).toBe(true);
      if (otpReq.ok) {
        expect(otpReq.value.sessionId).toBeDefined();
        expect(otpReq.value.expiresInSeconds).toBe(300);
      }

      const otpVerify = await contracts.identityAuth.verifyPhoneOtp({
        sessionId: 'session_1',
        phone: '+919876543210',
        code: '123456',
      });
      expect(otpVerify.ok).toBe(true);
      if (otpVerify.ok) {
        expect(otpVerify.value.token).toBeDefined();
        expect(otpVerify.value.profileId).toBe('usr_baskar');
      }
    });

    it('rejects invalid phone numbers with ValidationError', async () => {
      const res = await contracts.identityAuth.requestPhoneOtp({ phone: '123' });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('retrieves user profile with Baskar Loganathan default identity', async () => {
      const res = await contracts.userProfiles.getProfile(actorIndividual);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.fullName).toBe('Baskar Loganathan');
        expect(res.value.email).toBe('bvnbasu@gmail.com');
      }
    });

    it('completes RWA onboarding for Durga Rainbow Assn', async () => {
      const res = await contracts.buyerManagement.completeRwaOnboarding(actorRwaOfficer, {
        associationName: 'Durga Rainbow Assn',
        registrationNumber: 'REG/2013/1234',
        totalUnits: 141,
        occupiedUnits: 141,
        role: 'COMMITTEE_MEMBER',
        committeeSeat: 'PRESIDENT',
        address: {
          addressLine1: 'Durga Rainbow, Mahadevapura',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560048',
        },
      });
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.persona).toBe('RWA');
        expect(res.value.organizationName).toBe('Durga Rainbow Assn');
      }
    });
  });

  // ==========================================
  // Cluster B: Buyer Governance (04-05)
  // ==========================================
  describe('Cluster B: Buyer Governance (Modules 04-05)', () => {
    it('enforces Estate/Facility Manager operational-only invariant', async () => {
      const eligibility = await contracts.rwaGovernance.verifyApprovalEligibility(
        actorEstateManager,
        'org_durga_rainbow'
      );
      expect(eligibility.ok).toBe(true);
      if (eligibility.ok) {
        expect(eligibility.value.isEligible).toBe(false);
        expect(eligibility.value.reason).toContain('Estate / Facility Managers are restricted');
      }

      // Barred from voting
      const voteAttempt = await contracts.evaluationVoting.castVote(actorEstateManager, {
        rfqId: 'rfq_1',
        quoteId: 'quote_1',
        decision: 'APPROVE',
      });
      expect(voteAttempt.ok).toBe(false);
      if (!voteAttempt.ok) {
        expect(voteAttempt.error.code).toBe('FORBIDDEN');
      }
    });

    it('verifies RWA association details and active committee members', async () => {
      const assoc = await contracts.rwaGovernance.getAssociationDetails(actorRwaOfficer, 'org_durga_rainbow');
      expect(assoc.ok).toBe(true);
      if (assoc.ok) {
        expect(assoc.value.name).toBe('Durga Rainbow Assn');
        expect(assoc.value.totalUnits).toBe(141);
        expect(assoc.value.pincode).toBe('560048');
      }

      const members = await contracts.rwaGovernance.listCommitteeMembers(actorRwaOfficer, 'org_durga_rainbow');
      expect(members.ok).toBe(true);
      if (members.ok) {
        expect(members.value.length).toBeGreaterThan(0);
        expect(members.value[0]?.seat).toBe('PRESIDENT');
      }
    });

    it('manages MSME delegate spend thresholds', async () => {
      const updateRes = await contracts.msmeManagement.updateSpendThreshold(actorIndividual, {
        organizationId: 'org_msme',
        delegateId: 'del_1',
        newSpendLimitInRupees: 75000,
      });
      expect(updateRes.ok).toBe(true);
      if (updateRes.ok) {
        expect(updateRes.value.spendLimitInRupees).toBe(75000);
      }
    });
  });

  // ==========================================
  // Cluster C: Supplier Domain (06-07)
  // ==========================================
  describe('Cluster C: Supplier Domain & Verification (Modules 06-07)', () => {
    it('requires 0.50% platform fee agreement for supplier registration', async () => {
      const rejectAttempt = await contracts.supplierManagement.registerSupplierBusiness(actorIndividual, {
        businessName: 'Unagreed Supplier',
        supplierType: 'DISTRIBUTOR',
        pincode: '560048',
        serviceRadiusKm: 20,
        categoryIds: ['cat_1'],
        agreeToPlatformFee: false,
      });
      expect(rejectAttempt.ok).toBe(false);
      if (!rejectAttempt.ok) {
        expect(rejectAttempt.error.code).toBe('VALIDATION_ERROR');
      }

      const successAttempt = await contracts.supplierManagement.registerSupplierBusiness(actorIndividual, {
        businessName: 'Agreed Supplier',
        supplierType: 'DISTRIBUTOR',
        pincode: '560048',
        serviceRadiusKm: 20,
        categoryIds: ['cat_1'],
        agreeToPlatformFee: true,
      });
      expect(successAttempt.ok).toBe(true);
    });

    it('verifies supplier GSTIN and active status', async () => {
      const gstRes = await contracts.supplierVerification.verifyGstin(actorIndividual, {
        supplierId: 'sup_1',
        gstin: '29AABCU9603R1ZM',
      });
      expect(gstRes.ok).toBe(true);
      if (gstRes.ok) {
        expect(gstRes.value.status).toBe('ACTIVE');
        expect(gstRes.value.stateCode).toBe('29');
      }
    });
  });

  // ==========================================
  // Cluster D: Address & Taxonomy (08-09)
  // ==========================================
  describe('Cluster D: Address & Taxonomy Management (Modules 08-09)', () => {
    it('lists canonical address with Mahadevapura 560048', async () => {
      const res = await contracts.addressManagement.listAddresses(actorIndividual);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.length).toBeGreaterThan(0);
        expect(res.value[0]?.pincode).toBe('560048');
        expect(res.value[0]?.addressLine1).toContain('Durga Rainbow');
      }
    });

    it('enforces exactly 17 authoritative taxonomy categories from migration 00331', async () => {
      const res = await contracts.taxonomyCategories.listAuthoritativeCategories();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.length).toBe(17);
        const codes = res.value.map((c) => c.code);
        expect(codes).toContain('CCTV_SEC');
        expect(codes).toContain('FUEL');
        expect(codes).toContain('DG_SET');
        expect(codes).toContain('ELEC');
        expect(codes).toContain('FIRE');
        expect(codes).toContain('PLUMB');
        expect(codes).toContain('PAINT');
        expect(codes).toContain('WTP_STP');
      }
    });
  });

  // ==========================================
  // Cluster F: RFQ Lifecycle & Quotations (11, 13)
  // ==========================================
  describe('Cluster F: RFQ Lifecycle & Quotations (Modules 11, 13)', () => {
    it('validates RFQ creation inputs', async () => {
      const emptyTitle = await contracts.rfqLifecycle.createRfqDraft(actorIndividual, {
        title: '',
        categoryId: 'cat_dg_set_maintenance',
        deliveryAddressId: 'addr_1',
        items: [{ itemDescription: 'Filter', quantity: 1, uom: 'Units' }],
      });
      expect(emptyTitle.ok).toBe(false);

      const emptyItems = await contracts.rfqLifecycle.createRfqDraft(actorIndividual, {
        title: 'Valid Title',
        categoryId: 'cat_dg_set_maintenance',
        deliveryAddressId: 'addr_1',
        items: [],
      });
      expect(emptyItems.ok).toBe(false);
    });

    it('maintains identity-protected blind quotes with pseudonym labels', async () => {
      const res = await contracts.quotationManagement.listQuotesForRfq(actorIndividual, 'rfq_sample_01');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.value.length).toBe(2);
        expect(res.value[0]?.pseudonymLabel).toBe('Supplier Alpha');
        expect(res.value[1]?.pseudonymLabel).toBe('Supplier Beta');
        // Supplier ID is NOT exposed on IdentityProtectedQuoteDto
        expect((res.value[0] as any)?.supplierId).toBeUndefined();
      }
    });

    it('calculates landed cost including GST correctly on quote submission', async () => {
      const submitRes = await contracts.quotationManagement.submitQuote(actorIndividual, {
        rfqId: 'rfq_test',
        deliveryDays: 5,
        warrantyMonths: 12,
        items: [
          { rfqLineItemId: 'item_1', unitPrice: 10000, gstRatePercentage: 18 },
        ],
      });
      expect(submitRes.ok).toBe(true);
      if (submitRes.ok) {
        expect(submitRes.value.totalBaseAmount).toBe(10000);
        expect(submitRes.value.totalGstAmount).toBe(1800);
        expect(submitRes.value.totalLandedCost).toBe(11800);
      }
    });
  });

  // ==========================================
  // Cluster G: Smart Merit & Voting (14-16)
  // ==========================================
  describe('Cluster G: Smart Merit, Voting & Anti-Collusion (Modules 14-16)', () => {
    it('enforces merit weights must sum exactly to 100%', async () => {
      const invalidWeights = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
        rfqId: 'rfq_1',
        weights: {
          priceWeightPercentage: 50,
          deliveryWeightPercentage: 20,
          warrantyWeightPercentage: 10,
          ratingWeightPercentage: 10, // Sum = 90%
        },
      });
      expect(invalidWeights.ok).toBe(false);
      if (!invalidWeights.ok) {
        expect(invalidWeights.error.code).toBe('VALIDATION_ERROR');
      }

      const validWeights = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
        rfqId: 'rfq_1',
        weights: {
          priceWeightPercentage: 50,
          deliveryWeightPercentage: 20,
          warrantyWeightPercentage: 15,
          ratingWeightPercentage: 15, // Sum = 100%
        },
      });
      expect(validWeights.ok).toBe(true);
    });

    it('records irrevocable conflict of interest declarations', async () => {
      const coiRes = await contracts.conflictOfInterest.declareConflict(actorRwaOfficer, {
        rfqId: 'rfq_sample_01',
        hasConflict: true,
        conflictReason: 'Close friend is an equity partner at bidder firm',
      });
      expect(coiRes.ok).toBe(true);
      if (coiRes.ok) {
        expect(coiRes.value.isIrrevocable).toBe(true);
        expect(coiRes.value.hasConflict).toBe(true);
      }
    });
  });

  // ==========================================
  // Cluster H: Award & Identity Reveal (17)
  // ==========================================
  describe('Cluster H: Award & Identity Reveal (Module 17)', () => {
    it('requires fee term confirmation to accept award and executes atomic reveal', async () => {
      const rejectAcceptance = await contracts.awardReveal.acceptAward(actorIndividual, {
        awardId: 'award_1',
        confirmPlatformFeeTerm: false,
      });
      expect(rejectAcceptance.ok).toBe(false);

      const acceptRes = await contracts.awardReveal.acceptAward(actorIndividual, {
        awardId: 'award_1',
        confirmPlatformFeeTerm: true,
      });
      expect(acceptRes.ok).toBe(true);

      const revealRes = await contracts.awardReveal.executeAtomicReveal(actorIndividual, 'award_1');
      expect(revealRes.ok).toBe(true);
      if (revealRes.ok) {
        expect(revealRes.value.supplier.businessName).toBe('Apex Industrial Solutions Pvt Ltd');
        expect(revealRes.value.supplier.gstin).toBe('29AABCU9603R1ZM');
        expect(revealRes.value.buyer.buyerName).toBe('Baskar Loganathan');
      }
    });
  });

  // ==========================================
  // Cluster I: PO & Order Tracking (18-19)
  // ==========================================
  describe('Cluster I: Purchase Orders & Order Tracking (Modules 18-19)', () => {
    it('verifies statutory intra-state GST tax split without freight double taxation', async () => {
      const poRes = await contracts.purchaseOrders.getPurchaseOrderById(actorIndividual, 'po_1');
      expect(poRes.ok).toBe(true);
      if (poRes.ok) {
        const tax = poRes.value.taxBreakdown;
        expect(tax.taxRegime).toBe('INTRA_STATE_CGST_SGST');
        expect(tax.cgstRatePercentage).toBe(9);
        expect(tax.sgstRatePercentage).toBe(9);
        expect(tax.cgstAmount).toBe(9360);
        expect(tax.sgstAmount).toBe(9360);
        expect(tax.totalTaxAmount).toBe(18720);
        expect(tax.totalLandedCost).toBe(122720);
      }
    });

    it('requires milestone allocations to total exactly 100%', async () => {
      const invalidPo = await contracts.purchaseOrders.generatePurchaseOrder(actorIndividual, {
        awardId: 'award_1',
        milestones: [
          { title: 'Milestone 1', percentageAllocation: 40, dueDate: '2026-04-01' },
          { title: 'Milestone 2', percentageAllocation: 40, dueDate: '2026-05-01' }, // 80% total
        ],
      });
      expect(invalidPo.ok).toBe(false);
      if (!invalidPo.ok) {
        expect(invalidPo.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  // ==========================================
  // Cluster J: Financials, Entitlements & Pricing (20-22, 27)
  // ==========================================
  describe('Cluster J: Financials, Entitlements & Pricing (Modules 20-22, 27)', () => {
    it('deducts 0.50% platform fee on escrow deposit', async () => {
      const escrow = await contracts.payments.recordEscrowDeposit(actorIndividual, 'po_1', 'ms_1', 100000);
      expect(escrow.ok).toBe(true);
      if (escrow.ok) {
        expect(escrow.value.amount).toBe(100000);
        expect(escrow.value.platformFeeDeducted).toBe(500); // 0.5% of 100,000
        expect(escrow.value.netDisbursedAmount).toBe(99500);
      }
    });

    it('verifies individual base entitlement: ₹199 for 3 RFQs, ₹149 overage, pilot free active', async () => {
      const quota = await contracts.subscriptions.getCurrentEntitlements(actorIndividual);
      expect(quota.ok).toBe(true);
      if (quota.ok) {
        expect(quota.value.publishedPlanPriceInRupees).toBe(199);
        expect(quota.value.monthlyIncludedRfqs).toBe(3);
        expect(quota.value.additionalRfqPriceInRupees).toBe(149);
        expect(quota.value.isPilotFreeActive).toBe(true);
      }
    });

    it('returns published pricing tiers for Individual (₹199), RWA (₹1,499), and MSME (₹1,999)', async () => {
      const tiers = await contracts.pricing.getPublishedPricingTiers();
      expect(tiers.ok).toBe(true);
      if (tiers.ok) {
        expect(tiers.value.length).toBe(3);
        const prices = tiers.value.map((t) => t.baseMonthlyPriceRupees);
        expect(prices).toContain(199);
        expect(prices).toContain(1499);
        expect(prices).toContain(1999);
        // Enterprise is retired and absent
        expect(tiers.value.some((t: any) => t.targetPersona === 'ENTERPRISE')).toBe(false);
      }
    });
  });

  // ==========================================
  // Cluster L: Admin & Telemetry (25, 26, 28)
  // ==========================================
  describe('Cluster L: Admin, Compliance & Telemetry (Modules 25, 26, 28)', () => {
    it('retrieves system health metrics and reporting telemetry', async () => {
      const health = await contracts.platformAdmin.getSystemHealth(actorIndividual);
      expect(health.ok).toBe(true);
      if (health.ok) {
        expect(health.value.isOperational).toBe(true);
        expect(health.value.wahaGatewayStatus).toBe('HEALTHY');
      }

      const reporting = await contracts.reporting.getFunnelMetrics(actorIndividual);
      expect(reporting.ok).toBe(true);
      if (reporting.ok) {
        expect(reporting.value.rfqsCreated).toBeGreaterThan(0);
        expect(reporting.value.averageQuotesPerRfq).toBeGreaterThan(0);
      }
    });
  });
});
