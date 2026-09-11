import { describe, expect, it } from 'vitest';
import {
  buildDecisionReceipt,
  describeComparison,
  type ReceiptSupplier,
} from './decision-receipt';

function supplier(overrides: Partial<ReceiptSupplier> & { quoteId: string }): ReceiptSupplier {
  return {
    anonymousLabel: 'Supplier A',
    supplierId: `sup-${overrides.quoteId}`,
    businessName: 'Test Supplier',
    totalCost: 10_000,
    evaluationScore: 80,
    rating: null,
    priorOrders: 0,
    ...overrides,
  };
}

describe('buildDecisionReceipt', () => {
  it('returns null for a single supplier because there is nothing to compare', () => {
    const only = supplier({ quoteId: 'q1' });
    expect(buildDecisionReceipt([only], 'q1')).toBeNull();
  });

  it('returns null when the winning quote is not among the suppliers', () => {
    const suppliers = [supplier({ quoteId: 'q1' }), supplier({ quoteId: 'q2' })];
    expect(buildDecisionReceipt(suppliers, 'missing')).toBeNull();
  });

  it('returns null when no reputation signal exists to compare against', () => {
    const suppliers = [
      supplier({ quoteId: 'q1', evaluationScore: 90 }),
      supplier({ quoteId: 'q2', evaluationScore: 80 }),
    ];
    expect(buildDecisionReceipt(suppliers, 'q1')).toBeNull();
  });

  it('reports the amount avoided when the highest rated supplier was pricier and lost', () => {
    const suppliers = [
      supplier({ quoteId: 'win', evaluationScore: 90, totalCost: 10_000, rating: 4.1 }),
      supplier({ quoteId: 'famous', evaluationScore: 82, totalCost: 11_500, rating: 4.9 }),
    ];

    const receipt = buildDecisionReceipt(suppliers, 'win');

    expect(receipt).not.toBeNull();
    expect(receipt?.reputationAgreed).toBe(false);
    expect(receipt?.costAvoided).toBe(1_500);
    expect(receipt?.headline).toBe('Following the familiar name would have cost ₹1,500 more.');
  });

  it('states plainly when reputation and merit agree', () => {
    const suppliers = [
      supplier({ quoteId: 'win', evaluationScore: 90, rating: 4.9, priorOrders: 2 }),
      supplier({ quoteId: 'other', evaluationScore: 70, rating: 4.0 }),
    ];

    const receipt = buildDecisionReceipt(suppliers, 'win');

    expect(receipt?.reputationAgreed).toBe(true);
    expect(receipt?.costAvoided).toBeNull();
    expect(receipt?.headline).toContain('pointed the same way');
    expect(receipt?.comparisons.every((c) => c.agreedWithMerit)).toBe(true);
  });

  it('does not claim savings when the recognisable supplier was actually cheaper', () => {
    const suppliers = [
      supplier({ quoteId: 'win', evaluationScore: 90, totalCost: 10_000 }),
      supplier({ quoteId: 'known', evaluationScore: 75, totalCost: 9_000, priorOrders: 3 }),
    ];

    const receipt = buildDecisionReceipt(suppliers, 'win');

    expect(receipt?.costAvoided).toBeNull();
    expect(receipt?.headline).toContain('did not submit the strongest overall offer');
  });

  it('skips the rating signal when the top rating is tied', () => {
    const suppliers = [
      supplier({ quoteId: 'win', evaluationScore: 90, rating: 4.5 }),
      supplier({ quoteId: 'other', evaluationScore: 70, rating: 4.5 }),
    ];

    expect(buildDecisionReceipt(suppliers, 'win')).toBeNull();
  });

  it('ranks suppliers by identity-protected score regardless of who was awarded', () => {
    const suppliers = [
      supplier({ quoteId: 'low', evaluationScore: 60, rating: 4.9 }),
      supplier({ quoteId: 'high', evaluationScore: 95, rating: 4.0 }),
      supplier({ quoteId: 'mid', evaluationScore: 80, rating: 4.2 }),
    ];

    const receipt = buildDecisionReceipt(suppliers, 'high');

    expect(receipt?.meritOrder.map((b) => b.quoteId)).toEqual(['high', 'mid', 'low']);
  });

  it('picks the deepest relationship when several suppliers are incumbents', () => {
    const candidates = [
      supplier({ quoteId: 'win', evaluationScore: 90 }),
      supplier({ quoteId: 'once', evaluationScore: 80, priorOrders: 1 }),
      supplier({ quoteId: 'often', evaluationScore: 70, priorOrders: 4 }),
    ];

    const receipt = buildDecisionReceipt(candidates, 'win');
    const incumbent = receipt?.comparisons.find((c) => c.kind === 'INCUMBENT');

    expect(incumbent?.supplier.quoteId).toBe('often');
    expect(incumbent?.reason).toBe('You have ordered from them 4 times before');
  });

  it('matches the seeded Greenview borewell RFQ', () => {
    const candidates = [
      supplier({
        quoteId: 'q-aquaflow',
        anonymousLabel: 'Supplier A',
        businessName: 'AquaFlow Borewell Services',
        totalCost: 10_030,
        evaluationScore: 88,
        rating: 4.5,
      }),
      supplier({
        quoteId: 'q-deepwell',
        anonymousLabel: 'Supplier B',
        businessName: 'DeepWell Motor Experts',
        totalCost: 9_204,
        evaluationScore: 85,
        rating: 4.2,
        priorOrders: 1,
      }),
      supplier({
        quoteId: 'q-hydrotech',
        anonymousLabel: 'Supplier C',
        businessName: 'HydroTech Winding Co',
        totalCost: 10_856,
        evaluationScore: 86.5,
        rating: 4.7,
      }),
    ];

    const receipt = buildDecisionReceipt(candidates, 'q-aquaflow');

    expect(receipt?.winner.businessName).toBe('AquaFlow Borewell Services');
    expect(receipt?.costAvoided).toBe(826);

    const rated = receipt?.comparisons.find((c) => c.kind === 'HIGHEST_RATED');
    expect(rated?.supplier.businessName).toBe('HydroTech Winding Co');
    expect(rated?.meritRank).toBe(2);

    const incumbent = receipt?.comparisons.find((c) => c.kind === 'INCUMBENT');
    expect(incumbent?.supplier.businessName).toBe('DeepWell Motor Experts');
    expect(describeComparison(incumbent!)).toBe(
      'Quoted ₹826 less than the winning quote but ranked #3 once delivery and warranty were weighed.',
    );
  });
});
