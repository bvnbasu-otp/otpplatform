/**
 * OTP Next — Phase 5 Core Procurement Flows Test Suite
 * Verifies the complete 4-stage pipeline: TELL → REVIEW → DECIDE → TRACK
 * Tests contract integrations, tax splits, merit weightings, COI invariants, and atomic reveal.
 */

import { describe, it, expect } from 'vitest';
import { createOtpNextContracts } from '../adapters/otp-service-registry';
import type { ActorContext } from '../types/actor-context';

describe('OTP Next — Phase 5 Core Procurement Pipeline (TELL → REVIEW → DECIDE → TRACK)', () => {
  // Mock Supabase client providing storage for simulated state
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
          maybeSingle: async () => ({ data: { id: 'item_created' }, error: null }),
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
    profileId: 'usr_estate_mgr',
    fullName: 'Estate Manager',
    email: 'estate@durgarainbow.org',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'ESTATE_MANAGER',
  };

  // =========================================================================
  // STAGE 1: TELL (Intake, Category & Address Selection, RFQ Publishing)
  // =========================================================================
  describe('Stage 1: TELL (Requirement Specification & RFQ Intake)', () => {
    it('provides 17 authoritative categories without enterprise classification', async () => {
      const res = await contracts.taxonomyCategories.listAuthoritativeCategories();
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.length).toBe(17);
      const categoryCodes = res.value.map((c) => c.code);
      expect(categoryCodes).toContain('CAT_FACILITY_MAINTENANCE');
      expect(categoryCodes).toContain('CAT_SECURITY_SURVEILLANCE');
      expect(categoryCodes).toContain('CAT_GENERATOR_POWER');
    });

    it('retrieves saved delivery addresses with canonical Durga Rainbow address', async () => {
      const res = await contracts.addressManagement.listAddresses(actorIndividual);
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.length).toBeGreaterThan(0);
      const primary = res.value[0];
      expect(primary.addressLine1).toContain('Durga Rainbow');
      expect(primary.pincode).toBe('560048');
      expect(primary.city).toBe('Bengaluru');
    });

    it('creates a valid RFQ draft with line items, UOMs and target budgets', async () => {
      const res = await contracts.rfqLifecycle.createRfqDraft(actorIndividual, {
        title: 'DG Set Annual Maintenance & Routine Filter Spares',
        categoryId: 'cat_dg_set_maintenance',
        deliveryAddressId: 'addr_durga_rainbow_primary',
        requiredDeliveryDate: '2026-04-15',
        items: [
          {
            itemDescription: 'Quarterly Routine Maintenance (250 KVA DG Set)',
            quantity: 4,
            uom: 'Visits',
            targetUnitBudget: 15000,
          },
          {
            itemDescription: 'Lube Oil & Primary Fuel Filter Replacements',
            quantity: 2,
            uom: 'Sets',
            targetUnitBudget: 22000,
          },
        ],
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.rfqId).toBeDefined();
      expect(res.value.status).toBe('DRAFT');
      expect(res.value.itemsCount).toBe(2);
    });

    it('publishes the RFQ into the discovery network', async () => {
      const res = await contracts.rfqLifecycle.publishRfq(actorIndividual, 'rfq_test_tell_01');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.status).toBe('PUBLISHED');
      expect(res.value.publishedAt).toBeDefined();
    });
  });

  // =========================================================================
  // STAGE 2: REVIEW (Identity Protection, Landed Cost GST Split, Smart Merit)
  // =========================================================================
  describe('Stage 2: REVIEW (Quotation Comparison & Smart Merit Weighting)', () => {
    it('enforces identity protection with pseudonyms (Supplier Alpha, Beta) and masks contact details', async () => {
      const res = await contracts.quotationManagement.listQuotesForRfq(actorIndividual, 'rfq_test_tell_01');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.length).toBeGreaterThanOrEqual(2);

      for (const quote of res.value) {
        expect(quote.supplierPseudonym).toMatch(/^Supplier\s+(Alpha|Beta|Gamma|[A-Z])/);
        // Ensure no counterparty leaks in review stage
        expect((quote as any).supplierName).toBeUndefined();
        expect((quote as any).supplierPhone).toBeUndefined();
        expect((quote as any).supplierGstin).toBeUndefined();
      }
    });

    it('calculates complete landed cost with itemized GST breakdown', async () => {
      const res = await contracts.quotationManagement.listQuotesForRfq(actorIndividual, 'rfq_test_tell_01');
      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const alpha = res.value[0];
      expect(alpha.baseAmount).toBeGreaterThan(0);
      expect(alpha.gstAmount).toBeGreaterThan(0);
      expect(alpha.totalLandedCost).toBe(alpha.baseAmount + alpha.gstAmount);
      expect(alpha.currency).toBe('INR');
    });

    it('computes Smart Merit scores and accepts customized buyer weights totaling 100%', async () => {
      const initial = await contracts.smartMerit.getMeritComparison(actorIndividual, 'rfq_test_tell_01');
      expect(initial.ok).toBe(true);
      if (!initial.ok) return;
      expect(initial.value.recommendedQuoteId).toBeDefined();
      expect(initial.value.scores.length).toBeGreaterThanOrEqual(2);

      // Reconfigure weights: 60% price, 20% delivery, 10% warranty, 10% rating (sum = 100%)
      const customRes = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
        rfqId: 'rfq_test_tell_01',
        weights: {
          priceWeightPercentage: 60,
          deliveryWeightPercentage: 20,
          warrantyWeightPercentage: 10,
          ratingWeightPercentage: 10,
        },
      });

      expect(customRes.ok).toBe(true);
      if (!customRes.ok) return;
      expect(customRes.value.effectiveWeights.priceWeightPercentage).toBe(60);
      const topScore = customRes.value.scores[0];
      expect(topScore.overallMeritScore).toBeGreaterThan(0);
      expect(topScore.overallMeritScore).toBeLessThanOrEqual(100);
    });

    it('rejects invalid Smart Merit weights that do not sum to 100%', async () => {
      const invalidRes = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
        rfqId: 'rfq_test_tell_01',
        weights: {
          priceWeightPercentage: 50,
          deliveryWeightPercentage: 20,
          warrantyWeightPercentage: 10,
          ratingWeightPercentage: 10, // Sum = 90% (Invalid!)
        },
      });

      expect(invalidRes.ok).toBe(false);
      if (invalidRes.ok) return;
      expect(invalidRes.error.code).toBe('INVALID_MERIT_WEIGHTS');
    });
  });

  // =========================================================================
  // STAGE 3: DECIDE (RWA Governance, Quorum, COI Invariants, Award Issuance)
  // =========================================================================
  describe('Stage 3: DECIDE (Evaluation, Quorum, Irrevocable COI, Award Issuance)', () => {
    it('computes committee voting tally and confirms quorum requirement', async () => {
      const res = await contracts.evaluationVoting.getVotingTally(actorRwaOfficer, 'rfq_test_tell_01', 'quote_alpha');
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.totalCommitteeMembers).toBeGreaterThan(0);
      expect(res.value.quorumThresholdPercentage).toBe(50);
      expect(res.value.quorumAchieved).toBe(true);
    });

    it('strictly bars Estate / Facility Manager from casting approval votes', async () => {
      const res = await contracts.evaluationVoting.castVote(actorEstateManager, {
        rfqId: 'rfq_test_tell_01',
        quoteId: 'quote_alpha',
        decision: 'APPROVE',
        comment: 'Estate manager approval attempt',
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('ESTATE_MANAGER_APPROVAL_BARRED');
    });

    it('enforces irrevocable Conflict of Interest (COI) declarations under migration 00242', async () => {
      // Step 1: Declare COI
      const coiRes = await contracts.conflictOfInterest.declareConflict(actorRwaOfficer, {
        rfqId: 'rfq_test_tell_01',
        hasConflict: true,
        conflictReason: 'Vendor director is a first-degree family relative.',
      });

      expect(coiRes.ok).toBe(true);
      if (!coiRes.ok) return;
      expect(coiRes.value.hasConflict).toBe(true);
      expect(coiRes.value.isIrrevocable).toBe(true);

      // Step 2: Attempting to vote after declaring COI MUST be blocked
      const voteAttempt = await contracts.evaluationVoting.castVote(actorRwaOfficer, {
        rfqId: 'rfq_test_tell_01',
        quoteId: 'quote_alpha',
        decision: 'APPROVE',
      });

      expect(voteAttempt.ok).toBe(false);
      if (voteAttempt.ok) return;
      expect(voteAttempt.error.code).toBe('COI_BLOCKED');
    });

    it('issues formal award notice when approved by eligible committee member', async () => {
      const eligibleOfficer: ActorContext = {
        profileId: 'usr_committee_chair',
        fullName: 'Committee President',
        email: 'president@durgarainbow.org',
        persona: 'RWA',
        organizationId: 'org_durga_rainbow',
        orgRole: 'COMMITTEE_PRESIDENT',
      };

      const awardRes = await contracts.awardReveal.issueAwardNotice(eligibleOfficer, {
        rfqId: 'rfq_test_tell_01',
        selectedQuoteId: 'quote_alpha',
        notes: 'Awarded based on highest Smart Merit score (87.5/00) and verified warranty.',
      });

      expect(awardRes.ok).toBe(true);
      if (!awardRes.ok) return;
      expect(awardRes.value.awardId).toBeDefined();
      expect(awardRes.value.status).toBe('ISSUED');
      expect(awardRes.value.rfqId).toBe('rfq_test_tell_01');
    });
  });

  // =========================================================================
  // STAGE 4: TRACK (Atomic Reveal, Statutory PO Taxes, Milestone Sign-off)
  // =========================================================================
  describe('Stage 4: TRACK (Atomic Identity Reveal, Statutory PO, Milestones & Completion)', () => {
    it('unmasks supplier identity and legal coordinates via atomic reveal lock', async () => {
      const revealRes = await contracts.awardReveal.executeAtomicReveal(actorIndividual, 'award_test_01');
      expect(revealRes.ok).toBe(true);
      if (!revealRes.ok) return;

      expect(revealRes.value.revealedSupplierName).toBe('Apex Industrial Solutions');
      expect(revealRes.value.revealedSupplierGstin).toBe('29AABCU9603R1ZM');
      expect(revealRes.value.revealedSupplierPhone).toBe('+91 98450 12345');
      expect(revealRes.value.supplierVerified).toBe(true);
      expect(revealRes.value.platformFeePercentage).toBe(0.5);
    });

    it('verifies statutory Purchase Order tax split (Intra-state CGST 9% + SGST 9%)', async () => {
      const poRes = await contracts.purchaseOrders.getPurchaseOrderById(actorIndividual, 'po_sample_01');
      expect(poRes.ok).toBe(true);
      if (!poRes.ok) return;

      const po = poRes.value;
      expect(po.poNumber).toMatch(/^PO-2026-/);
      expect(po.taxType).toBe('INTRA_STATE');
      // Subtotal: 104,000, CGST 9%: 9,360, SGST 9%: 9,360, Total: 122,720
      expect(po.subtotalAmount).toBe(104000);
      expect(po.cgstAmount).toBe(9360);
      expect(po.sgstAmount).toBe(9360);
      expect(po.igstAmount).toBe(0);
      expect(po.totalLandedAmount).toBe(122720);
      expect(po.milestones.length).toBe(3);
    });

    it('executes progressive milestone inspections and final 100% completion sign-off', async () => {
      // Step 1: Submit Milestone 1 Inspection
      const inspectRes = await contracts.orderTracking.submitMilestoneInspection(actorIndividual, {
        poId: 'po_sample_01',
        milestoneId: 'ms_01',
        passedInspection: true,
        notes: 'Mobilization and spare parts receipt verified on site at Durga Rainbow.',
      });

      expect(inspectRes.ok).toBe(true);
      if (!inspectRes.ok) return;
      expect(inspectRes.value.milestoneStatus).toBe('INSPECTED_AND_PASSED');
      expect(inspectRes.value.eligibleForDisbursement).toBe(true);

      // Step 2: Confirm final order completion
      const completeRes = await contracts.orderTracking.confirmFinalCompletion(actorIndividual, 'po_sample_01');
      expect(completeRes.ok).toBe(true);
      if (!completeRes.ok) return;
      expect(completeRes.value.overallStatus).toBe('COMPLETED');
      expect(completeRes.value.completionPercentage).toBe(100);
      expect(completeRes.value.closedAt).toBeDefined();
    });
  });
});
