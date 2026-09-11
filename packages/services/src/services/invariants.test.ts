import { describe, expect, it, beforeEach } from 'vitest';
import { QuoteEvaluationServiceImpl } from '../evaluation/quote-evaluation-service-impl';
import { InMemoryRepositories } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import type { QuoteSnapshot } from '../repositories/entities';
import { TransitionError, ValidationError } from '../types/errors';

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
