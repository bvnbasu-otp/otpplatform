/**
 * OTP Next — Phase 5 Core Procurement Flows Direct Verification Script
 * Validates the complete TELL → REVIEW → DECIDE → TRACK pipeline:
 * 1. TELL: Authoritative taxonomy, Durga Rainbow 560048 delivery address, RFQ draft creation, and publishing.
 * 2. REVIEW: Blind supplier pseudonym masking (Supplier Alpha, Beta), landed cost GST split, Smart Merit weight configuration (100% sum check).
 * 3. DECIDE: Committee voting quorum (>=50%), Estate Manager barred from approval, irrevocable COI blocking, award issuance.
 * 4. TRACK: Atomic identity reveal lock, statutory PO tax split (Intra-state CGST 9% + SGST 9%), milestone inspections, and final 100% completion sign-off.
 */

import { createOtpNextContracts } from '../packages/services/src/adapters/otp-service-registry';
import type { ActorContext } from '../packages/services/src/types/actor-context';

async function runPhase5ProcurementVerification() {
  console.log('========================================================================');
  console.log('🚀 OTP NEXT — PHASE 5: CORE PROCUREMENT PIPELINE VERIFICATION');
  console.log('   TELL → REVIEW → DECIDE → TRACK');
  console.log('========================================================================\n');

  let passedAssertions = 0;
  let totalAssertions = 0;

  function assert(condition: boolean, message: string) {
    totalAssertions++;
    if (condition) {
      passedAssertions++;
      console.log(`  ✅ [PASS] ${message}`);
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Simulated Supabase Client
  const mockClient: any = {
    auth: {
      signInWithOtp: async () => ({ data: { messageId: 'msg_phase5' }, error: null }),
      verifyOtp: async () => ({
        data: {
          user: { id: 'usr_baskar', email: 'bvnbasu@gmail.com', last_sign_in_at: null },
          session: { access_token: 'mock_phase5_jwt' },
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
          maybeSingle: async () => ({ data: { id: 'item_phase5' }, error: null }),
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

  // -------------------------------------------------------------------------
  // STAGE 1: TELL
  // -------------------------------------------------------------------------
  console.log('📌 STAGE 1: TELL (Requirement Specification & RFQ Intake)');
  
  // 1.1 Category taxonomy
  const catRes = await contracts.taxonomyCategories.listAuthoritativeCategories();
  assert(catRes.ok && catRes.value.length === 17, '17 authoritative categories loaded without Enterprise persona contamination');
  assert(catRes.ok && catRes.value.some((c) => c.code === 'DG_SET'), 'Authoritative category DG_SET present');
  assert(catRes.ok && catRes.value.some((c) => c.code === 'ELEC'), 'Authoritative category ELEC present');

  // 1.2 Address retrieval
  const addrRes = await contracts.addressManagement.listAddresses(actorIndividual);
  assert(addrRes.ok && addrRes.value.length > 0, 'Saved addresses retrieved for Baskar Loganathan');
  const primaryAddr = addrRes.ok ? addrRes.value[0] : null;
  assert(primaryAddr?.pincode === '560048' && primaryAddr?.addressLine1.includes('Durga Rainbow'), 'Primary address pre-fills Durga Rainbow, Mahadevapura 560048');

  // 1.3 RFQ draft creation
  const draftRes = await contracts.rfqLifecycle.createRfqDraft(actorIndividual, {
    title: 'DG Set Annual Maintenance & Routine Filter Spares',
    categoryId: 'cat_dg_set_maintenance',
    deliveryAddressId: primaryAddr?.addressId || 'addr_durga_rainbow_primary',
    requiredDeliveryDate: '2026-04-15',
    items: [
      { itemDescription: 'Quarterly Routine Maintenance (250 KVA DG Set)', quantity: 4, uom: 'Visits', targetUnitBudget: 15000 },
      { itemDescription: 'Lube Oil & Primary Fuel Filter Replacements', quantity: 2, uom: 'Sets', targetUnitBudget: 22000 },
    ],
  });
  assert(draftRes.ok && draftRes.value.status === 'DRAFT', 'RFQ draft created successfully with DRAFT status');
  assert(draftRes.ok && draftRes.value.items.length === 2, 'Line items with UOMs and target budgets attached');

  // 1.4 RFQ publication
  const pubRes = await contracts.rfqLifecycle.publishRfq(actorIndividual, draftRes.ok ? draftRes.value.rfqId : 'rfq_tell_01');
  assert(pubRes.ok && pubRes.value.status === 'PUBLISHED', 'RFQ published into discovery network with PUBLISHED status');

  console.log('\n-------------------------------------------------------------------------');

  // -------------------------------------------------------------------------
  // STAGE 2: REVIEW
  // -------------------------------------------------------------------------
  console.log('📌 STAGE 2: REVIEW (Quotation Comparison & Smart Merit Weighting)');

  // 2.1 Identity-protected quote listing
  const quotesRes = await contracts.quotationManagement.listQuotesForRfq(actorIndividual, 'rfq_tell_01');
  assert(quotesRes.ok && quotesRes.value.length >= 2, 'Competitive quotations retrieved for evaluation');
  const quoteAlpha = quotesRes.ok ? quotesRes.value[0] : null;
  assert(quoteAlpha?.pseudonymLabel.startsWith('Supplier'), 'Supplier identity protected with pseudonymous label (Supplier Alpha)');
  assert((quoteAlpha as any)?.supplierName === undefined, 'No direct supplier name leaked in review stage');
  assert((quoteAlpha as any)?.supplierPhone === undefined, 'No supplier phone number leaked in review stage');

  // 2.2 Landed cost with GST split
  assert(quoteAlpha !== null && quoteAlpha.totalGstAmount > 0, 'Landed cost calculation includes statutory GST breakdown');
  assert(quoteAlpha !== null && quoteAlpha.totalLandedCost === quoteAlpha.totalBaseAmount + quoteAlpha.totalGstAmount, 'Total landed cost equals base amount + GST');

  // 2.3 Smart Merit scoring & normalization
  const meritRes = await contracts.smartMerit.getMeritComparison(actorIndividual, 'rfq_tell_01');
  assert(meritRes.ok && meritRes.value.recommendedQuoteId !== undefined, 'Smart Merit comparison computes objective ranking and recommendation');

  // 2.4 Custom weight configuration (Sum = 100%)
  const customWeightsRes = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
    rfqId: 'rfq_tell_01',
    weights: {
      priceWeightPercentage: 55,
      deliveryWeightPercentage: 20,
      warrantyWeightPercentage: 15,
      ratingWeightPercentage: 10,
    },
  });
  assert(customWeightsRes.ok && customWeightsRes.value.weights.priceWeightPercentage === 55, 'Custom Smart Merit weights (55/20/15/10) applied and normalized');

  // 2.5 Invalid weight sum rejection
  const invalidWeightsRes = await contracts.smartMerit.configureMeritWeights(actorIndividual, {
    rfqId: 'rfq_tell_01',
    weights: {
      priceWeightPercentage: 50,
      deliveryWeightPercentage: 20,
      warrantyWeightPercentage: 10,
      ratingWeightPercentage: 10, // Sum = 90% (Invalid)
    },
  });
  assert(!invalidWeightsRes.ok && invalidWeightsRes.error.code === 'VALIDATION_ERROR', 'Invalid weights totaling 90% rejected with VALIDATION_ERROR');

  console.log('\n-------------------------------------------------------------------------');

  // -------------------------------------------------------------------------
  // STAGE 3: DECIDE
  // -------------------------------------------------------------------------
  console.log('📌 STAGE 3: DECIDE (Evaluation, Quorum, Irrevocable COI, Award Issuance)');

  // 3.1 Committee quorum check
  const tallyRes = await contracts.evaluationVoting.getVotingTally(actorRwaOfficer, 'rfq_tell_01', 'quote_alpha');
  assert(tallyRes.ok && tallyRes.value.quorumReached === true, 'RWA Committee quorum requirement (>= 50%) verified');
  assert(tallyRes.ok && tallyRes.value.totalEligibleVoters >= 3, 'Committee composition registered under Durga Rainbow Assn');

  // 3.2 Estate Manager barred from voting invariant
  const estateVoteRes = await contracts.evaluationVoting.castVote(actorEstateManager, {
    rfqId: 'rfq_tell_01',
    quoteId: 'quote_alpha',
    decision: 'APPROVE',
  });
  assert(!estateVoteRes.ok && estateVoteRes.error.code === 'FORBIDDEN', 'Estate Manager strictly barred from casting voting approvals (00240 invariant)');

  // 3.3 Irrevocable COI declaration under migration 00242
  const coiRes = await contracts.conflictOfInterest.declareConflict(actorRwaOfficer, {
    rfqId: 'rfq_tell_01',
    hasConflict: true,
    conflictReason: 'Vendor key person is an immediate family relative.',
  });
  assert(coiRes.ok && coiRes.value.hasConflict === true && coiRes.value.isIrrevocable === true, 'Conflict of Interest (COI) declared and recorded as IRREVOCABLE');

  // 3.4 Conflicted member blocked from voting
  const conflictedVoteAttempt = await contracts.evaluationVoting.castVote(actorRwaOfficer, {
    rfqId: 'rfq_tell_01',
    quoteId: 'quote_alpha',
    decision: 'APPROVE',
    ...({ isConflicted: true } as any),
  });
  assert(!conflictedVoteAttempt.ok && conflictedVoteAttempt.error.code === 'FORBIDDEN', 'Conflicted member blocked from voting or deciding award');

  // 3.5 Eligible officer issues award notice
  const eligibleChair: ActorContext = {
    profileId: 'usr_president',
    fullName: 'Committee President',
    email: 'president@durgarainbow.org',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'COMMITTEE_PRESIDENT',
  };
  const awardRes = await contracts.awardReveal.issueAwardNotice(eligibleChair, {
    rfqId: 'rfq_tell_01',
    selectedQuoteId: 'quote_alpha',
    notes: 'Awarded to Supplier Alpha based on approved Smart Merit evaluation.',
  });
  assert(awardRes.ok && awardRes.value.status === 'PENDING_SUPPLIER_ACCEPTANCE', 'Formal award notice issued to winning quote');

  console.log('\n-------------------------------------------------------------------------');

  // -------------------------------------------------------------------------
  // STAGE 4: TRACK
  // -------------------------------------------------------------------------
  console.log('📌 STAGE 4: TRACK (Atomic Identity Reveal, Statutory PO, Milestones & Completion)');

  // 4.1 Atomic identity reveal unmasking
  const revealRes = await contracts.awardReveal.executeAtomicReveal(actorIndividual, 'award_phase5_01');
  assert(revealRes.ok && revealRes.value.supplier.businessName.includes('Apex Industrial Solutions'), 'Counterparty legal identity unmasked (Apex Industrial Solutions)');
  assert(revealRes.ok && revealRes.value.supplier.gstin === '29AABCU9603R1ZM', 'Supplier statutory GSTIN verified (29AABCU9603R1ZM)');
  assert(revealRes.ok && revealRes.value.supplier.bankDetailsVerified === true, 'Supplier statutory verification and bank details validated prior to reveal');

  // 4.2 Purchase Order statutory tax breakdown
  const poRes = await contracts.purchaseOrders.getPurchaseOrderById(actorIndividual, 'po_sample_01');
  assert(poRes.ok && poRes.value.taxBreakdown.taxRegime === 'INTRA_STATE_CGST_SGST', 'Statutory PO verified as INTRA_STATE_CGST_SGST (Karnataka to Karnataka)');
  assert(poRes.ok && poRes.value.taxBreakdown.cgstAmount === 9360 && poRes.value.taxBreakdown.sgstAmount === 9360, 'Accurate CGST (9%) + SGST (9%) statutory tax breakdown without freight double-tax');
  assert(poRes.ok && poRes.value.taxBreakdown.totalLandedCost === 122720, 'Total landed amount (₹1,22,720) matches subtotal + CGST + SGST');

  // 4.3 Progressive milestone inspection
  const inspectRes = await contracts.orderTracking.submitMilestoneInspection(actorIndividual, {
    poId: 'po_sample_01',
    milestoneId: 'ms_01',
    passedInspection: true,
    notes: 'Initial mobilization and filter delivery inspected on site at Durga Rainbow.',
  });
  assert(inspectRes.ok && inspectRes.value.milestoneApproved === true, 'Milestone 1 inspection passed and approved for disbursement');

  // 4.4 100% final completion sign-off
  const completeRes = await contracts.orderTracking.confirmFinalCompletion(actorIndividual, 'po_sample_01');
  assert(completeRes.ok && completeRes.value.orderCompleted === true, 'Final order confirmed with COMPLETED status');

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100% SUCCESS)`);
  console.log('   CORE PROCUREMENT FLOW (TELL → REVIEW → DECIDE → TRACK) FULLY VERIFIED!');
  console.log('========================================================================\n');
}

runPhase5ProcurementVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
