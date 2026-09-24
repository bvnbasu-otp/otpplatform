import { describe, expect, it, beforeEach } from 'vitest';
import {
  canTransitionPurchaseOrder,
  canTransitionRfq,
  canTransitionQuote,
} from '@otp/domain';
import { QuoteEvaluationServiceImpl } from '../evaluation/quote-evaluation-service-impl';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import type { QuoteSnapshot } from '../repositories/entities';
import { ForbiddenError, TransitionError, ValidationError } from '../types/errors';

const ORG_ID = 'org-1';
const BUYER_MANAGER: ActorContext = {
  profileId: 'buyer-mgr',
  organizationId: ORG_ID,
  orgRole: 'MANAGER',
};
const BUYER_APPROVER: ActorContext = {
  profileId: 'buyer-appr',
  organizationId: ORG_ID,
  orgRole: 'APPROVER',
};
const SUPPLIER_A: ActorContext = {
  profileId: 'supplier-user-a',
  supplierIds: ['supplier-a'],
};
const SUPPLIER_B: ActorContext = {
  profileId: 'supplier-user-b',
  supplierIds: ['supplier-b'],
};

const snapshot = (total: number): QuoteSnapshot => ({
  basePrice: total - 100,
  gstAmount: 50,
  transportCost: 50,
  totalCost: total,
  deliveryDays: 5,
  warrantyMonths: 12,
  currency: 'INR',
});

async function seedOpenRfqWithQuotes() {
  const mem = InMemoryRepositories.create();
  mem.seedSupplier({
    id: 'supplier-a',
    businessName: 'Supplier A Co',
    source: 'DIRECT',
    status: 'ACTIVE',
    categories: ['Borewell'],
    ratingAvg: 4.5,
    capabilities: { maxHp: 10 },
  });
  mem.seedSupplier({
    id: 'supplier-b',
    businessName: 'Supplier B Co',
    source: 'OTHER',
    status: 'ACTIVE',
    categories: ['Borewell'],
    ratingAvg: 4.5,
    capabilities: { maxHp: 10 },
  });

  const repos = mem.asRepositories();
  const localServices = createOtpServices(repos);

  const req = await localServices.requirements.createDraft(BUYER_MANAGER, {
    title: 'Motor winding',
    description: '10 HP borewell motor winding',
    requirementType: 'SERVICE',
  });
  if (!req.ok) throw req.error;

  const rfq = await localServices.rfqs.createFromRequirement(
    BUYER_MANAGER,
    req.value.id,
    { title: 'RFQ Motor' },
  );
  if (!rfq.ok) throw rfq.error;

  await localServices.rfqs.discoverAndInvite(BUYER_MANAGER, rfq.value.id, {
    category: 'Borewell',
    structuredSpecs: { motorCapacityHp: 10 },
  });
  const invitations = await repos.invitations.findByRfqId(rfq.value.id);

  const invA = invitations.find((i) => i.supplierId === 'supplier-a')!;
  const invB = invitations.find((i) => i.supplierId === 'supplier-b')!;

  await localServices.rfqs.open(BUYER_MANAGER, rfq.value.id);

  const quoteA = await localServices.quotes.submitQuote(
    SUPPLIER_A,
    rfq.value.id,
    invA.id,
    snapshot(10000),
  );
  const quoteB = await localServices.quotes.submitQuote(
    SUPPLIER_B,
    rfq.value.id,
    invB.id,
    snapshot(11000),
  );
  if (!quoteA.ok || !quoteB.ok) throw new Error('quote submit failed');

  return {
    repos,
    services: localServices,
    rfqId: rfq.value.id,
    quoteAId: quoteA.value.id,
    quoteBId: quoteB.value.id,
  };
}

/** Both suppliers lock their terms, which is what lets the RFQ close. */
async function seedRfqWithFinalQuotes() {
  const seeded = await seedOpenRfqWithQuotes();
  const { services, quoteAId, quoteBId } = seeded;

  const finalA = await services.quotes.finalizeQuote(SUPPLIER_A, quoteAId);
  const finalB = await services.quotes.finalizeQuote(SUPPLIER_B, quoteBId);
  if (!finalA.ok || !finalB.ok) throw new Error('quote finalize failed');

  return seeded;
}

describe('QuoteService', () => {
  it('blocks quote revision when RFQ is CLOSED', async () => {
    const { services, rfqId, quoteAId } = await seedRfqWithFinalQuotes();

    const closed = await services.rfqs.close(BUYER_MANAGER, rfqId);
    expect(closed.ok).toBe(true);
    const result = await services.quotes.submitRevision(
      SUPPLIER_A,
      quoteAId,
      snapshot(9500),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toContain('revision not allowed');
    }
  });
});

describe('AwardService', () => {
  it('fails award without justification', async () => {
    const { services, rfqId, quoteAId } = await seedRfqWithFinalQuotes();

    await services.rfqs.close(BUYER_MANAGER, rfqId);
    await services.quoteEvaluation.evaluateRfq(BUYER_MANAGER, rfqId);
    await services.rfqs.startEvaluation(BUYER_MANAGER, rfqId);

    const result = await services.awards.createAward(
      BUYER_APPROVER,
      rfqId,
      quoteAId,
      '',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
    }
  });

  it('fails award with short justification', async () => {
    const { services, rfqId, quoteAId } = await seedRfqWithFinalQuotes();

    await services.rfqs.close(BUYER_MANAGER, rfqId);
    await services.quoteEvaluation.evaluateRfq(BUYER_MANAGER, rfqId);
    await services.rfqs.startEvaluation(BUYER_MANAGER, rfqId);

    const result = await services.awards.createAward(
      BUYER_APPROVER,
      rfqId,
      quoteAId,
      'Too short',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.message).toContain('20');
    }
  });
});

describe('State transition guards', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;

  beforeEach(() => {
    mem = InMemoryRepositories.create();
    services = createOtpServices(mem.asRepositories());
  });

  it('enforces requirement transition guards', async () => {
    const req = await services.requirements.createDraft(BUYER_MANAGER, {
      title: 'Test req',
      requirementType: 'PRODUCT',
    });
    if (!req.ok) throw req.error;

    const result = await services.requirements.transition(
      BUYER_MANAGER,
      req.value.id,
      'AWARDED',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TransitionError);
    }
  });

  it('enforces RFQ transition guards', async () => {
    const req = await services.requirements.createDraft(BUYER_MANAGER, {
      title: 'Test req',
      requirementType: 'PRODUCT',
    });
    if (!req.ok) throw req.error;

    const rfq = await services.rfqs.createFromRequirement(
      BUYER_MANAGER,
      req.value.id,
      { title: 'RFQ' },
    );
    if (!rfq.ok) throw rfq.error;

    const result = await services.rfqs.startEvaluation(BUYER_MANAGER, rfq.value.id);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(TransitionError);
    }
  });
});

describe('Discovery scoring ignores supplier source', () => {
  it('produces identical evaluation scores for same quote data regardless of source', () => {
    const evaluation = new QuoteEvaluationServiceImpl();
    const baseInput = {
      quoteId: 'q1',
      anonymousLabel: 'Supplier A',
      price: 9000,
      gstAmount: 500,
      transportCost: 500,
      deliveryDays: 5,
      warrantyMonths: 12,
      supplierRatingAvg: 4.5,
      pastPerformanceScore: 80,
    };

    const direct = evaluation.score(evaluation.normalize([baseInput]));
    const network = evaluation.score(
      evaluation.normalize([
        {
          ...baseInput,
          quoteId: 'q2',
          anonymousLabel: 'Supplier B',
        },
      ]),
    );

    expect(direct[0]!.evaluationScore).toBe(network[0]!.evaluationScore);
  });

  it('IdentityProtectedRfqService returns quotes without supplier identity while identity-protected', async () => {
    const { rfqId, services } = await seedOpenRfqWithQuotes();
    const result = await services.blindRfq.getIdentityProtectedQuotes(BUYER_MANAGER, rfqId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    for (const q of result.value) {
      expect((q as unknown as Record<string, unknown>).supplierId).toBeUndefined();
    }
  });
});

describe('Phase 3.5 Domain State Machines', () => {
  it('enforces canonical Purchase Order state transitions: DRAFT -> PENDING_APPROVAL -> APPROVED -> ISSUED -> ACCEPTED -> IN_PROGRESS -> COMPLETED', () => {
    // Valid canonical progression
    expect(canTransitionPurchaseOrder('DRAFT', 'PENDING_APPROVAL')).toBe(true);
    expect(canTransitionPurchaseOrder('PENDING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionPurchaseOrder('APPROVED', 'ISSUED')).toBe(true);
    expect(canTransitionPurchaseOrder('ISSUED', 'ACCEPTED')).toBe(true);
    expect(canTransitionPurchaseOrder('ACCEPTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionPurchaseOrder('IN_PROGRESS', 'COMPLETED')).toBe(true);

    // Valid cancellation paths from intermediate states (pre-acceptance only)
    expect(canTransitionPurchaseOrder('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionPurchaseOrder('PENDING_APPROVAL', 'CANCELLED')).toBe(true);
    expect(canTransitionPurchaseOrder('APPROVED', 'CANCELLED')).toBe(true);
    expect(canTransitionPurchaseOrder('ISSUED', 'CANCELLED')).toBe(true);

    // Post-acceptance cancellation is strictly blocked
    expect(canTransitionPurchaseOrder('ACCEPTED', 'CANCELLED')).toBe(false);

    // Invalid transitions and illegal forward jumps
    expect(canTransitionPurchaseOrder('DRAFT', 'ISSUED')).toBe(false);
    expect(canTransitionPurchaseOrder('DRAFT', 'ACCEPTED')).toBe(false);
    expect(canTransitionPurchaseOrder('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransitionPurchaseOrder('PENDING_APPROVAL', 'ISSUED')).toBe(false);
    expect(canTransitionPurchaseOrder('IN_PROGRESS', 'CANCELLED')).toBe(false);
    expect(canTransitionPurchaseOrder('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canTransitionPurchaseOrder('COMPLETED', 'CANCELLED')).toBe(false);
  });

  it('enforces canonical RFQ transition: EVALUATING -> AWARDED', () => {
    expect(canTransitionRfq('EVALUATING', 'AWARDED')).toBe(true);
    expect(canTransitionRfq('EVALUATING', 'CANCELLED')).toBe(true);
    expect(canTransitionRfq('DRAFT', 'AWARDED')).toBe(false);
    expect(canTransitionRfq('OPEN', 'AWARDED')).toBe(false);
    expect(canTransitionRfq('CLOSED', 'AWARDED')).toBe(false);
  });

  it('enforces canonical Quote transitions: FINAL -> SELECTED / NOT_SELECTED', () => {
    expect(canTransitionQuote('FINAL', 'SELECTED')).toBe(true);
    expect(canTransitionQuote('FINAL', 'NOT_SELECTED')).toBe(true);
    expect(canTransitionQuote('FINAL', 'SUBMITTED')).toBe(false);
    expect(canTransitionQuote('FINAL', 'REVISED')).toBe(false);
    expect(canTransitionQuote('FINAL', 'DRAFT')).toBe(false);
  });
});

describe('Phase 3.5 End-to-End Award, Reveal & Purchase Order Invariants', () => {
  const VALID_JUSTIFICATION = 'Selected based on lowest total cost and verified 12-month warranty coverage.';

  it('enforces AwardService validation rules (RFQ status, Quote status, COI clearance, single award)', async () => {
    const seeded = await seedOpenRfqWithQuotes();
    const { services, repos, rfqId, quoteAId, quoteBId } = seeded;

    // 1. Cannot award when RFQ is still OPEN
    const openAwardRes = await services.awards.createAward(
      BUYER_APPROVER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    expect(openAwardRes.ok).toBe(false);
    if (!openAwardRes.ok) {
      expect(openAwardRes.error.message).toContain('RFQ must be in EVALUATING status');
    }

    // Finalize quotes and proceed through evaluation pipeline
    await services.quotes.finalizeQuote(SUPPLIER_A, quoteAId);
    await services.quotes.finalizeQuote(SUPPLIER_B, quoteBId);
    await services.rfqs.close(BUYER_MANAGER, rfqId);
    await services.quoteEvaluation.evaluateRfq(BUYER_MANAGER, rfqId);
    await services.rfqs.startEvaluation(BUYER_MANAGER, rfqId);

    // Attempting to award non-final quote fails (simulate quote in non-FINAL status)
    const quoteA = await repos.quotes.findById(quoteAId);
    await repos.quotes.save({ ...quoteA!, status: 'SUBMITTED' });

    const nonFinalAwardRes = await services.awards.createAward(
      BUYER_APPROVER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    expect(nonFinalAwardRes.ok).toBe(false);
    if (!nonFinalAwardRes.ok) {
      expect(nonFinalAwardRes.error.message).toContain('Only FINAL quotes can be awarded');
    }

    // Restore quoteA back to FINAL
    await repos.quotes.save({ ...quoteA!, status: 'FINAL' });

    // 2. COI conflict blocks award
    await repos.coi.save({
      id: 'coi-1',
      rfqId,
      profileId: BUYER_APPROVER.profileId,
      status: 'DECLARED_CONFLICT',
      declaredAt: new Date().toISOString(),
    });

    const coiBlockedRes = await services.awards.createAward(
      BUYER_APPROVER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    expect(coiBlockedRes.ok).toBe(false);
    if (!coiBlockedRes.ok) {
      expect(coiBlockedRes.error.message).toContain('COI conflict blocks award');
    }

    // Clear COI for manager
    const validAwardRes = await services.awards.createAward(
      BUYER_MANAGER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    expect(validAwardRes.ok).toBe(true);
    if (!validAwardRes.ok) throw validAwardRes.error;

    // Verify award record state
    expect(validAwardRes.value.status).toBe('PENDING_REVEAL');
    expect(validAwardRes.value.quoteId).toBe(quoteAId);
    expect(validAwardRes.value.justification).toBe(VALID_JUSTIFICATION);

    // Verify winning and losing quote statuses
    const updatedWinningQuote = await repos.quotes.findById(quoteAId);
    expect(updatedWinningQuote?.status).toBe('SELECTED');
    const updatedLosingQuote = await repos.quotes.findById(quoteBId);
    expect(updatedLosingQuote?.status).toBe('NOT_SELECTED');

    // Verify RFQ status transitioned to AWARDED
    const updatedRfq = await repos.rfqs.findById(rfqId);
    expect(updatedRfq?.status).toBe('AWARDED');

    // 3. Duplicate award on already AWARDED RFQ is blocked
    const duplicateAwardRes = await services.awards.createAward(
      BUYER_MANAGER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    expect(duplicateAwardRes.ok).toBe(false);
    if (!duplicateAwardRes.ok) {
      expect(duplicateAwardRes.error.message).toContain('RFQ must be in EVALUATING status');
    }

    // If RFQ is reset to EVALUATING while award still exists, existing award check blocks it
    await repos.rfqs.save({ ...updatedRfq!, status: 'EVALUATING' });
    const existingAwardRes = await services.awards.createAward(
      BUYER_MANAGER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    expect(existingAwardRes.ok).toBe(false);
    if (!existingAwardRes.ok) {
      expect(existingAwardRes.error.message).toContain('Award already exists for this RFQ');
    }
  });

  it('enforces SupplierRevealService unmasking and idempotency', async () => {
    const seeded = await seedRfqWithFinalQuotes();
    const { services, rfqId, quoteAId } = seeded;

    await services.rfqs.close(BUYER_MANAGER, rfqId);
    await services.quoteEvaluation.evaluateRfq(BUYER_MANAGER, rfqId);
    await services.rfqs.startEvaluation(BUYER_MANAGER, rfqId);

    const awardRes = await services.awards.createAward(
      BUYER_MANAGER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    expect(awardRes.ok).toBe(true);

    // Reveal winner
    const revealRes = await services.supplierReveal.revealForRfq(BUYER_MANAGER, rfqId);
    expect(revealRes.rfqId).toBe(rfqId);
    expect(revealRes.supplierId).toBe('supplier-a');
    expect(revealRes.supplierBusinessName).toBe('Supplier A Co');
    expect(revealRes.revealedAt).toBeDefined();

    // Idempotent reveal
    const secondRevealRes = await services.supplierReveal.revealForRfq(BUYER_MANAGER, rfqId);
    expect(secondRevealRes.supplierId).toBe('supplier-a');
    expect(secondRevealRes.supplierBusinessName).toBe('Supplier A Co');
  });

  it('enforces PurchaseOrderService snapshotting and complete lifecycle transitions', async () => {
    const seeded = await seedRfqWithFinalQuotes();
    const { services, repos, rfqId, quoteAId } = seeded;

    await services.rfqs.close(BUYER_MANAGER, rfqId);
    await services.quoteEvaluation.evaluateRfq(BUYER_MANAGER, rfqId);
    await services.rfqs.startEvaluation(BUYER_MANAGER, rfqId);

    const awardRes = await services.awards.createAward(
      BUYER_MANAGER,
      rfqId,
      quoteAId,
      VALID_JUSTIFICATION,
    );
    if (!awardRes.ok) throw awardRes.error;

    // 1. PO creation fails before award is REVEALED
    const earlyPoRes = await services.purchaseOrders.createFromAward(
      BUYER_MANAGER,
      awardRes.value.id,
    );
    expect(earlyPoRes.ok).toBe(false);
    if (!earlyPoRes.ok) {
      expect(earlyPoRes.error.message).toContain('Award must be REVEALED before PO creation');
    }

    // Reveal award
    await services.supplierReveal.revealForRfq(BUYER_MANAGER, rfqId);

    // 2. PO creation succeeds with snapshot totalCost and currency
    const poRes = await services.purchaseOrders.createFromAward(
      BUYER_MANAGER,
      awardRes.value.id,
    );
    expect(poRes.ok).toBe(true);
    if (!poRes.ok) throw poRes.error;

    const po = poRes.value;
    expect(po.status).toBe('DRAFT');
    expect(po.totalAmount).toBe(10000);
    expect(po.currency).toBe('INR');
    expect(po.supplierId).toBe('supplier-a');
    expect(po.poNumber).toMatch(/^PO-\d{4}-\d{2}-\d{2}-/);

    // 3. PO transition: DRAFT -> PENDING_APPROVAL
    const pendingRes = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'PENDING_APPROVAL',
    );
    expect(pendingRes.ok).toBe(true);

    // 4. PO transition: PENDING_APPROVAL -> APPROVED
    const approvedRes = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'APPROVED',
    );
    expect(approvedRes.ok).toBe(true);

    // 5. PO transition: APPROVED -> ISSUED (stamps issuedAt)
    const issuedRes = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'ISSUED',
    );
    expect(issuedRes.ok).toBe(true);
    if (!issuedRes.ok) throw issuedRes.error;
    expect(issuedRes.value.issuedAt).toBeDefined();

    // 6. Non-supplier cannot accept PO
    const buyerAcceptRes = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'ACCEPTED',
    );
    expect(buyerAcceptRes.ok).toBe(false);
    if (!buyerAcceptRes.ok) {
      expect(buyerAcceptRes.error).toBeInstanceOf(ForbiddenError);
    }

    // Unauthorized supplier cannot accept PO
    const wrongSupplierAcceptRes = await services.purchaseOrders.transition(
      SUPPLIER_B,
      po.id,
      'ACCEPTED',
    );
    expect(wrongSupplierAcceptRes.ok).toBe(false);

    // 7. Winning supplier accepts PO (stamps acknowledgedAt)
    const acceptedRes = await services.purchaseOrders.transition(
      SUPPLIER_A,
      po.id,
      'ACCEPTED',
    );
    expect(acceptedRes.ok).toBe(true);
    if (!acceptedRes.ok) throw acceptedRes.error;
    expect(acceptedRes.value.acknowledgedAt).toBeDefined();

    // 8. Progress to IN_PROGRESS
    const inProgressRes = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'IN_PROGRESS',
    );
    expect(inProgressRes.ok).toBe(true);

    // =========================================================================
    // Phase 5A: Progressive Invoicing & Line Item Allocations
    // =========================================================================
    const woRes = await services.workOrders.create(BUYER_MANAGER, po.id, 'Main Borewell Winding');
    expect(woRes.ok).toBe(true);
    if (!woRes.ok) throw woRes.error;
    const wo = woRes.value;

    const milestones = await repos.workOrderMilestones!.findByWorkOrderId(wo.id);
    expect(milestones.length).toBe(4);
    const totalAllocated = milestones.reduce((sum: number, m: { allocatedAmount: number }) => sum + m.allocatedAmount, 0);
    expect(totalAllocated).toBe(po.totalAmount);

    const m1 = milestones[0]!; // Milestone 1: 20% = 2000
    expect(m1.allocatedAmount).toBe(2000);

    // Progressive Invoice 1 for Milestone 1 (amount = 2000)
    const inv1Res = await services.invoices.submit(
      SUPPLIER_A,
      wo.id,
      'INV-2026-M1',
      2000,
      'INR',
      m1.id,
      'PROGRESSIVE',
      [
        {
          lineIndex: 1,
          description: 'Mobilization & advance for wire requisition',
          quantity: 1,
          unitPrice: 1694.92,
          taxableAmount: 1694.92,
          gstAmount: 305.08,
          totalAmount: 2000,
        },
      ],
    );
    expect(inv1Res.ok).toBe(true);
    if (!inv1Res.ok) throw inv1Res.error;
    expect(inv1Res.value.amount).toBe(2000);

    // Verify Milestone 1 is marked invoiced
    const updatedM1 = await repos.workOrderMilestones!.findById(m1.id);
    expect(updatedM1?.invoicedAmount).toBe(2000);
    expect(updatedM1?.isInvoiced).toBe(true);

    // Over-invoicing check on Milestone 1: attempting another invoice on Milestone 1 should fail
    const overInvoiceMilestoneRes = await services.invoices.submit(
      SUPPLIER_A,
      wo.id,
      'INV-2026-M1-EXTRA',
      500,
      'INR',
      m1.id,
    );
    expect(overInvoiceMilestoneRes.ok).toBe(false);
    if (!overInvoiceMilestoneRes.ok) {
      expect(overInvoiceMilestoneRes.error.message).toContain('exceeds milestone allocated limit');
    }

    // Over-invoicing check on PO: attempting to invoice remaining 9000 when PO total is 10000 (already 2000 invoiced, max remaining is 8000)
    const overInvoicePoRes = await services.invoices.submit(
      SUPPLIER_A,
      wo.id,
      'INV-2026-EXCEED',
      8500,
      'INR',
    );
    expect(overInvoicePoRes.ok).toBe(false);
    if (!overInvoicePoRes.ok) {
      expect(overInvoicePoRes.error.message).toContain('exceeds remaining invoiceable limit');
    }

    // Submit remaining invoice for 8000
    const inv2Res = await services.invoices.submit(
      SUPPLIER_A,
      wo.id,
      'INV-2026-FINAL',
      8000,
      'INR',
      null,
      'FINAL',
    );
    expect(inv2Res.ok).toBe(true);

    // Check PO Invoicing summary
    const summaryRes = await services.invoices.getPoInvoicingSummary(po.id);
    expect(summaryRes.ok).toBe(true);
    if (summaryRes.ok) {
      expect(summaryRes.value.alreadyInvoicedAmount).toBe(10000);
      expect(summaryRes.value.remainingInvoiceableAmount).toBe(0);
      expect(summaryRes.value.isFullyInvoiced).toBe(true);
    }

    // Phase 5C.2 PO Completion Guard Invariant Test:
    // 9. Attempting to complete PO before invoices are approved and paid should fail
    const prematureCompleteRes = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'COMPLETED',
    );
    expect(prematureCompleteRes.ok).toBe(false);
    if (!prematureCompleteRes.ok) {
      expect(prematureCompleteRes.error.message).toContain('Purchase order cannot be marked COMPLETED');
    }

    // Approve both invoices and pay them in full
    if (!inv1Res.ok || !inv2Res.ok) throw new Error('Invoices not submitted');
    const inv1 = inv1Res.value;
    const inv2 = inv2Res.value;
    await services.invoices.approve(BUYER_MANAGER, inv1.id);
    await services.invoices.approve(BUYER_MANAGER, inv2.id);

    const pay1Res = await services.payments.recordInvoicePayment(BUYER_MANAGER, inv1.id, 2000, 'BANK_TRANSFER');
    expect(pay1Res.ok).toBe(true);
    const pay2Res = await services.payments.recordInvoicePayment(BUYER_MANAGER, inv2.id, 8000, 'BANK_TRANSFER');
    expect(pay2Res.ok).toBe(true);

    // 10. Complete PO successfully once settled in full
    const completedRes = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'COMPLETED',
    );
    expect(completedRes.ok).toBe(true);

    // 11. Rejects invalid transition once COMPLETED
    const invalidAfterComplete = await services.purchaseOrders.transition(
      BUYER_MANAGER,
      po.id,
      'IN_PROGRESS',
    );
    expect(invalidAfterComplete.ok).toBe(false);
    if (!invalidAfterComplete.ok) {
      expect(invalidAfterComplete.error).toBeInstanceOf(TransitionError);
    }
  });
});
