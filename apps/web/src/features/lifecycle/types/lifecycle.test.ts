import { describe, expect, it } from 'vitest';
import {
  currentLifecycleStage,
  deriveLifecycleStages,
  LIFECYCLE_STAGES,
  type LifecycleSignals,
} from './lifecycle';

function currentId(signals: LifecycleSignals) {
  return currentLifecycleStage(deriveLifecycleStages(signals))?.id;
}

describe('deriveLifecycleStages', () => {
  it('always returns every stage in golden-path order', () => {
    const stages = deriveLifecycleStages({});
    expect(stages.map((s) => s.id)).toEqual(LIFECYCLE_STAGES.map((s) => s.id));
  });

  it('sits on Requirement for a draft with no RFQ', () => {
    expect(currentId({ requirementStatus: 'DRAFT' })).toBe('REQUIREMENT');
  });

  it('advances to sourcing once an RFQ exists in draft', () => {
    expect(currentId({ requirementStatus: 'RFQ_CREATED', rfqStatus: 'DRAFT' })).toBe('SOURCING');
  });

  it('tracks open quoting', () => {
    expect(currentId({ requirementStatus: 'QUOTING', rfqStatus: 'OPEN' })).toBe('QUOTING');
  });

  it('tracks negotiation and Q&A', () => {
    expect(currentId({ requirementStatus: 'NEGOTIATION', rfqStatus: 'CLARIFICATION' })).toBe(
      'CLARIFICATION',
    );
  });

  it('tracks the seeded pilot state (evaluating, still identity-protected)', () => {
    const stages = deriveLifecycleStages({
      requirementStatus: 'EVALUATION',
      rfqStatus: 'EVALUATING',
      revealStatus: 'PROTECTED',
    });

    expect(currentLifecycleStage(stages)?.id).toBe('EVALUATION');
    expect(stages.slice(0, 4).every((s) => s.state === 'DONE')).toBe(true);
    expect(stages.slice(5).every((s) => s.state === 'PENDING')).toBe(true);
  });

  it('advances to award on reveal', () => {
    expect(currentId({ rfqStatus: 'AWARDED', revealStatus: 'REVEALED' })).toBe('AWARD');
  });

  it('advances to purchase order once a draft PO exists', () => {
    expect(currentId({ rfqStatus: 'AWARDED', poStatus: 'DRAFT' })).toBe('PURCHASE_ORDER');
  });

  it('advances to fulfillment on an accepted PO even without a work order', () => {
    expect(currentId({ poStatus: 'ACCEPTED' })).toBe('FULFILLMENT');
  });

  it('advances to fulfillment while the work order runs', () => {
    expect(currentId({ poStatus: 'IN_PROGRESS', workOrderStatus: 'IN_PROGRESS' })).toBe(
      'FULFILLMENT',
    );
  });

  it('advances to payment once an invoice is submitted', () => {
    expect(
      currentId({ poStatus: 'IN_PROGRESS', workOrderStatus: 'COMPLETED', invoiceStatus: 'PAID' }),
    ).toBe('PAYMENT');
  });

  it('marks every stage done when the requirement completes', () => {
    const stages = deriveLifecycleStages({
      requirementStatus: 'COMPLETED',
      poStatus: 'COMPLETED',
      invoiceStatus: 'PAID',
      paymentStatus: 'VERIFIED',
    });

    expect(stages.every((s) => s.state === 'DONE')).toBe(true);
  });

  it('a later entity outranks a stale earlier status', () => {
    // Requirement never moved past QUOTING but fulfillment is already underway.
    expect(currentId({ requirementStatus: 'QUOTING', workOrderStatus: 'IN_PROGRESS' })).toBe(
      'FULFILLMENT',
    );
  });

  it('flags cancellation on the stage it stopped at', () => {
    const stages = deriveLifecycleStages({
      requirementStatus: 'CANCELLED',
      rfqStatus: 'CANCELLED',
    });

    const stopped = stages.find((s) => s.state === 'CANCELLED');
    expect(stopped?.id).toBe('SOURCING');
    expect(stages.some((s) => s.state === 'CURRENT')).toBe(false);
  });
});
