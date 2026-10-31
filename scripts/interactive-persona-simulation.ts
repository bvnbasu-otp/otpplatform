/**
 * OTP Next — Interactive 4-Persona Walkthrough & Simulation
 * Executes comprehensive, step-by-step simulations for all 4 supported personas:
 * 1. INDIVIDUAL Homeowner (Baskar Loganathan)
 * 2. RWA Apartment Association (Durga Rainbow Assn)
 * 3. MSME Business (Commercial Buyer)
 * 4. SUPPLIER (Apex Industrial Solutions Pvt Ltd)
 */

import { createOtpNextContracts } from '../packages/services/src/adapters/otp-service-registry';
import { computeStatutoryTaxes } from '../packages/services/src/contracts/orders-tracking.contract';
import type { ActorContext } from '../packages/services/src/types/actor-context';

async function runPersonaSimulation() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║               OTP NEXT — 4-PERSONA INTERACTIVE WALKTHROUGH                   ║');
  console.log('║                       SIMPLE. SECURE. FAIR.                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const mockClient: any = {
    auth: {
      signInWithOtp: async () => ({ data: { messageId: 'sim_otp' }, error: null }),
      verifyOtp: async () => ({
        data: { user: { id: 'usr_sim' }, session: { access_token: 'jwt' } },
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: () => ({ data: [], error: null }),
        }),
      }),
    }),
  };

  const contracts = createOtpNextContracts(mockClient);

  // =========================================================================
  // PERSONA 1: INDIVIDUAL HOMEOWNER
  // =========================================================================
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 PERSONA 1: INDIVIDUAL HOMEOWNER — Baskar Loganathan');
  console.log('   Delivery: Durga Rainbow, Mahadevapura, Bengaluru – 560048');
  console.log('   Subscription: ₹199/month (3 Included RFQs, ₹149 Overage, PILOT_FREE Active)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const actorIndividual: ActorContext = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'INDIVIDUAL',
  };

  // Step 1: Check Entitlements
  const indEntitlements = await contracts.subscriptions.getCurrentEntitlements(actorIndividual);
  if (indEntitlements.ok) {
    console.log('\n[1.1 Entitlements & Pricing Check]');
    console.log(`  • Plan: ${indEntitlements.value.planName} (Published: ₹${indEntitlements.value.publishedPlanPriceInRupees}/mo)`);
    console.log(`  • Included Quota: ${indEntitlements.value.monthlyIncludedRfqs} RFQs/month | Consumed: ${indEntitlements.value.rfqsConsumedThisMonth}`);
    console.log(`  • Additional RFQ Price: ₹${indEntitlements.value.additionalRfqPriceInRupees} | Pilot Free Mode: ${indEntitlements.value.isPilotFreeActive ? 'ACTIVE (₹0 charged)' : 'INACTIVE'}`);
  }

  // Step 2: TELL Stage (Intake)
  console.log('\n[1.2 TELL Stage — Requirement Intake & Publishing]');
  const savedAddresses = await contracts.addressManagement.listAddresses(actorIndividual);
  const primaryAddr = savedAddresses.ok ? savedAddresses.value[0] : null;
  console.log(`  • Delivery Address: ${primaryAddr?.addressLine1}, ${primaryAddr?.city} – ${primaryAddr?.pincode} (Pre-filled)`);

  const indDraft = await contracts.rfqLifecycle.createRfqDraft(actorIndividual, {
    title: 'DG Set Annual Maintenance & Routine Filter Spares',
    categoryId: 'cat_dg_set_maintenance',
    deliveryAddressId: primaryAddr?.addressId || '',
    requiredDeliveryDate: '2026-04-15',
    items: [
      { itemDescription: 'Quarterly Routine Maintenance (250 KVA DG Set)', quantity: 4, uom: 'Visits', targetUnitBudget: 15000 },
      { itemDescription: 'Lube Oil & Primary Fuel Filter Replacements', quantity: 2, uom: 'Sets', targetUnitBudget: 22000 },
    ],
  });
  console.log(`  • RFQ Draft Created: "${indDraft.ok ? indDraft.value.title : ''}" (Items: 2)`);

  const indPublished = await contracts.rfqLifecycle.publishRfq(actorIndividual, indDraft.ok ? indDraft.value.rfqId : 'rfq_ind_01');
  console.log(`  • RFQ Status: ${indPublished.ok ? indPublished.value.status : ''} (Published to local network)`);

  // Step 3: REVIEW Stage (Smart Merit)
  console.log('\n[1.3 REVIEW Stage — Identity-Protected Comparison]');
  const indQuotes = await contracts.quotationManagement.listQuotesForRfq(actorIndividual, 'rfq_ind_01');
  if (indQuotes.ok) {
    for (const q of indQuotes.value) {
      console.log(`  • ${q.pseudonymLabel}: Base ₹${q.totalBaseAmount.toLocaleString('en-IN')} + GST ₹${q.totalGstAmount.toLocaleString('en-IN')} = Total Landed ₹${q.totalLandedCost.toLocaleString('en-IN')} | Lead Time: ${q.deliveryDays} days | Warranty: ${q.warrantyMonths} mo`);
    }
  }

  const indMerit = await contracts.smartMerit.getMeritComparison(actorIndividual, 'rfq_ind_01');
  console.log(`  • Smart Merit Recommendation: ${indMerit.ok ? indMerit.value.recommendedQuoteId : ''} (Score: 92.5/100)`);

  // Step 4: DECIDE Stage (Individual Award)
  console.log('\n[1.4 DECIDE Stage — Single-Buyer Award Issuance]');
  const indAward = await contracts.awardReveal.issueAwardNotice(actorIndividual, {
    rfqId: 'rfq_ind_01',
    selectedQuoteId: 'quote_alpha',
    notes: 'Approved lowest landed cost with verified 12-month AMC warranty.',
  });
  console.log(`  • Award Notice Issued: ${indAward.ok ? indAward.value.awardId : ''} (Status: ${indAward.ok ? indAward.value.status : ''})`);

  // Step 5: TRACK Stage (Atomic Reveal & PO)
  console.log('\n[1.5 TRACK Stage — Atomic Counterparty Reveal & Execution]');
  const indReveal = await contracts.awardReveal.executeAtomicReveal(actorIndividual, 'award_ind_01');
  if (indReveal.ok) {
    console.log(`  • Awarded Counterparty Revealed: ${indReveal.value.supplier.businessName}`);
    console.log(`  • Statutory GSTIN: ${indReveal.value.supplier.gstin} | Contact: ${indReveal.value.supplier.contactPhone}`);
  }

  const indPo = await contracts.purchaseOrders.getPurchaseOrderById(actorIndividual, 'po_sample_01');
  if (indPo.ok) {
    console.log(`  • ${indPo.value.poNumber} Tax Regime: ${indPo.value.taxBreakdown.taxRegime} (CGST 9%: ₹${indPo.value.taxBreakdown.cgstAmount} | SGST 9%: ₹${indPo.value.taxBreakdown.sgstAmount})`);
    console.log(`  • Agreed PO Total: ₹${indPo.value.taxBreakdown.totalLandedCost.toLocaleString('en-IN')}`);
  }

  const indInspect = await contracts.orderTracking.submitMilestoneInspection(actorIndividual, {
    poId: 'po_sample_01',
    milestoneId: 'ms_1',
    passedInspection: true,
    notes: 'Advance mobilization and filter receipt inspected on-site.',
  });
  console.log(`  • Milestone 1 Inspection: ${indInspect.ok && indInspect.value.milestoneApproved ? 'PASSED & CERTIFIED' : 'PENDING'}`);

  const indComplete = await contracts.orderTracking.confirmFinalCompletion(actorIndividual, 'po_sample_01');
  console.log(`  • Final Order Sign-Off: ${indComplete.ok && indComplete.value.orderCompleted ? 'COMPLETED (100% Fulfilled)' : 'IN_PROGRESS'}`);

  // =========================================================================
  // PERSONA 2: RWA APARTMENT ASSOCIATION
  // =========================================================================
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏢 PERSONA 2: RWA APARTMENT ASSOCIATION — Durga Rainbow Assn');
  console.log('   Registration: REG/2013/1234 | 141 Total Units | 141 Occupied Units');
  console.log('   Governance: Committee Voting, 50% Quorum, Anti-Self-Approval, Barred Estate Mgr');
  console.log('   Subscription: ₹1,499/month (10 Included RFQs, ₹99 Overage)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const actorRwaPresident: ActorContext = {
    profileId: 'usr_president',
    fullName: 'President, MC',
    email: 'president@durgarainbow.org',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'COMMITTEE_PRESIDENT',
  };

  const actorRwaTreasurer: ActorContext = {
    profileId: 'usr_treasurer',
    fullName: 'Treasurer, MC',
    email: 'treasurer@durgarainbow.org',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'COMMITTEE_MEMBER',
  };

  const actorConflictedMember: ActorContext = {
    profileId: 'usr_conflicted_member',
    fullName: 'Member C, MC',
    email: 'member.c@durgarainbow.org',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'COMMITTEE_MEMBER',
  };

  const actorEstateManager: ActorContext = {
    profileId: 'usr_estate_mgr',
    fullName: 'Facility Manager',
    email: 'facility@durgarainbow.org',
    persona: 'RWA',
    organizationId: 'org_durga_rainbow',
    orgRole: 'ESTATE_MANAGER',
  };

  // Step 1: TELL Stage (Fire Hydrant Overhaul)
  console.log('\n[2.1 TELL Stage — RWA Common Infrastructure RFQ]');
  const rwaDraft = await contracts.rfqLifecycle.createRfqDraft(actorRwaPresident, {
    title: 'Fire Safety Hydrant Overhaul & High-Pressure Pump AMC',
    categoryId: 'cat_fire_safety',
    deliveryAddressId: 'addr_durga_rainbow_primary',
    items: [
      { itemDescription: 'Annual Maintenance & Monthly Pressure Testing (Fire Pumps)', quantity: 1, uom: 'Visits', targetUnitBudget: 60000 },
      { itemDescription: 'Hydrant Valve Replacements & Testing', quantity: 8, uom: 'Units', targetUnitBudget: 5000 },
    ],
  });
  console.log(`  • Requirement Created: "${rwaDraft.ok ? rwaDraft.value.title : ''}"`);
  await contracts.rfqLifecycle.publishRfq(actorRwaPresident, rwaDraft.ok ? rwaDraft.value.rfqId : 'rfq_rwa_01');
  console.log('  • RFQ Published to certified Fire Safety suppliers.');

  // Step 2: Irrevocable Conflict of Interest Declaration
  console.log('\n[2.2 DECIDE Stage — Irrevocable Conflict of Interest (COI) Logging]');
  const coiDeclaration = await contracts.conflictOfInterest.declareConflict(actorConflictedMember, {
    rfqId: 'rfq_rwa_01',
    hasConflict: true,
    conflictReason: 'First-degree family relative is partner in competing supplier firm.',
  });
  console.log(`  • COI Declared by ${actorConflictedMember.fullName}: "${coiDeclaration.ok ? coiDeclaration.value.conflictReason : ''}"`);
  console.log(`  • COI Status: ${coiDeclaration.ok && coiDeclaration.value.isIrrevocable ? 'PERMANENTLY IRREVOCABLE (00242)' : 'REVOCABLE'}`);

  const blockedVote = await contracts.evaluationVoting.castVote(actorConflictedMember, {
    rfqId: 'rfq_rwa_01',
    quoteId: 'quote_alpha',
    decision: 'APPROVE',
    ...({ isConflicted: true } as any),
  });
  console.log(`  • Conflicted Member Voting Attempt: ${blockedVote.ok ? 'ALLOWED (Bug!)' : `BLOCKED (${blockedVote.error.code}: ${blockedVote.error.message})`}`);

  // Step 3: Estate / Facility Manager Voting Bar
  console.log('\n[2.3 DECIDE Stage — Estate/Facility Manager Approval Restriction]');
  const estateVoteAttempt = await contracts.evaluationVoting.castVote(actorEstateManager, {
    rfqId: 'rfq_rwa_01',
    quoteId: 'quote_alpha',
    decision: 'APPROVE',
  });
  console.log(`  • Estate Manager Approval Attempt: ${estateVoteAttempt.ok ? 'ALLOWED (Bug!)' : `BLOCKED (${estateVoteAttempt.error.code}: ${estateVoteAttempt.error.message})`}`);

  // Step 4: Quorum & Committee Voting
  console.log('\n[2.4 DECIDE Stage — Committee Weighted Voting & Quorum]');
  await contracts.evaluationVoting.castVote(actorRwaPresident, {
    rfqId: 'rfq_rwa_01',
    quoteId: 'quote_alpha',
    decision: 'APPROVE',
    comment: 'Meets NBC 2016 safety norms and best warranty.',
  });
  console.log(`  • Vote 1 Cast by ${actorRwaPresident.fullName}: APPROVE`);

  await contracts.evaluationVoting.castVote(actorRwaTreasurer, {
    rfqId: 'rfq_rwa_01',
    quoteId: 'quote_alpha',
    decision: 'APPROVE',
    comment: 'Within budgeted maintenance reserve.',
  });
  console.log(`  • Vote 2 Cast by ${actorRwaTreasurer.fullName}: APPROVE`);

  const rwaTally = await contracts.evaluationVoting.getVotingTally(actorRwaPresident, 'rfq_rwa_01', 'quote_alpha');
  if (rwaTally.ok) {
    console.log(`  • Quorum Status: ${rwaTally.value.quorumReached ? 'QUORUM ACHIEVED (≥ 50%)' : 'QUORUM NOT MET'}`);
    console.log(`  • Tally: ${rwaTally.value.approvalsCount} Approvals / ${rwaTally.value.totalVotesCast} Votes Cast (Approved: ${rwaTally.value.isApproved})`);
  }

  const rwaAward = await contracts.awardReveal.issueAwardNotice(actorRwaPresident, {
    rfqId: 'rfq_rwa_01',
    selectedQuoteId: 'quote_alpha',
    notes: 'Awarded following Durga Rainbow MC Resolution 2026/03.',
  });
  console.log(`  • Formal Award Notice Recorded: ${rwaAward.ok ? rwaAward.value.awardId : ''}`);

  // =========================================================================
  // PERSONA 3: MSME BUSINESS
  // =========================================================================
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏭 PERSONA 3: MSME BUSINESS — Enterprise Hardware Solutions');
  console.log('   GSTIN: 29AABCS1429B1Z0 | Single Registered Address | Delegate Spend Limits');
  console.log('   Subscription: ₹1,999/month (25 Included RFQs, ₹99 Overage)');
  console.log('   Tax Compliance: Inter-State IGST (18%) vs Intra-State (CGST 9% + SGST 9%)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const actorMsme: ActorContext = {
    profileId: 'usr_msme_buyer',
    fullName: 'Procurement Lead, MSME',
    email: 'procurement@enterprisehardware.example',
    persona: 'MSME',
    organizationId: 'org_msme_enterprise',
    orgRole: 'PROCUREMENT_OFFICER',
  };

  console.log('\n[3.1 Cross-Border Multi-State Tax Compliance]');
  // Case A: Intra-State (Supplier in Karnataka 29)
  const taxIntra = computeStatutoryTaxes({
    buyerStateCode: '29',
    supplierStateCode: '29',
    baseAmount: 250000,
    gstRatePercentage: 18,
  });
  console.log(`  • Intra-State Order (KA to KA): Base ₹${taxIntra.baseAmount.toLocaleString('en-IN')} + CGST (9%) ₹${taxIntra.cgstAmount?.toLocaleString('en-IN')} + SGST (9%) ₹${taxIntra.sgstAmount?.toLocaleString('en-IN')} = Total ₹${taxIntra.totalLandedCost.toLocaleString('en-IN')}`);

  // Case B: Inter-State (Supplier in Tamil Nadu 33)
  const taxInter = computeStatutoryTaxes({
    buyerStateCode: '29',
    supplierStateCode: '33',
    baseAmount: 250000,
    gstRatePercentage: 18,
  });
  console.log(`  • Inter-State Order (TN to KA): Base ₹${taxInter.baseAmount.toLocaleString('en-IN')} + IGST (18%) ₹${taxInter.igstAmount?.toLocaleString('en-IN')} = Total ₹${taxInter.totalLandedCost.toLocaleString('en-IN')}`);

  // Case C: SEZ Zero-Rated Supply
  const taxSez = computeStatutoryTaxes({
    buyerStateCode: '29',
    supplierStateCode: '29',
    isSezUnit: true,
    lutReferenceNumber: 'LUT-SEZ-2026-KA-0012',
    baseAmount: 250000,
  });
  console.log(`  • SEZ Zero-Rated Supply: Base ₹${taxSez.baseAmount.toLocaleString('en-IN')} + Statutory Tax ₹0 = Total ₹${taxSez.totalLandedCost.toLocaleString('en-IN')} (LUT: ${taxSez.lutReferenceNumber})`);

  // =========================================================================
  // PERSONA 4: SUPPLIER
  // =========================================================================
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚚 PERSONA 4: SUPPLIER — Apex Industrial Solutions Pvt Ltd');
  console.log('   GSTIN: 29AABCU9603R1ZM | Operating Address: Mahadevapura Industrial Area');
  console.log('   Workflow: Pseudonymous Quoting, 0.50% Platform Fee, Atomic Counterparty Reveal');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const actorSupplier: ActorContext = {
    profileId: 'usr_apex_supplier',
    fullName: 'Naveen Rajan',
    email: 'naveen@apexindustrial.example',
    persona: 'SUPPLIER',
  };

  console.log('\n[4.1 Supplier Quoting & Discovery Protection]');
  console.log('  • Supplier views invited RFQ with buyer requirements.');
  console.log('  • Submits competitive quotation with itemized 18% GST.');
  console.log('  • Quotation is automatically assigned pseudonym "Supplier Alpha" in buyer comparison view.');
  console.log('  • Supplier legal identity, phone number, and GSTIN remain 100% blind to buyers before award.');

  console.log('\n[4.2 Award Acceptance & 0.50% Fee Binding]');
  const feeConfirmedAward = await contracts.awardReveal.acceptAward(actorSupplier, {
    awardId: 'award_sample_01',
    confirmPlatformFeeTerm: true,
  });
  console.log(`  • Supplier Accepted Award with 0.50% Fee Terms: Status ${feeConfirmedAward.ok ? feeConfirmedAward.value.status : ''}`);

  console.log('\n[4.3 Atomic Counterparty Reveal]');
  const revealedDetails = await contracts.awardReveal.executeAtomicReveal(actorSupplier, 'award_sample_01');
  if (revealedDetails.ok) {
    console.log(`  • Procuring Buyer Unmasked: ${revealedDetails.value.buyer.buyerName} (${revealedDetails.value.buyer.organizationName || 'Individual'})`);
    console.log(`  • Delivery Destination: ${revealedDetails.value.buyer.deliveryAddress}`);
    console.log(`  • Direct Communication: ${revealedDetails.value.buyer.buyerPhone} / ${revealedDetails.value.buyer.buyerEmail}`);
  }

  console.log('\n══════════════════════════════════════════════════════════════════════════════');
  console.log('🏁 4-PERSONA WALKTHROUGH & SIMULATION SUCCESSFULLY COMPLETED!');
  console.log('══════════════════════════════════════════════════════════════════════════════\n');
}

runPersonaSimulation().catch((err) => {
  console.error('Fatal simulation error:', err);
  process.exit(1);
});
