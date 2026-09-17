import { describe, expect, it } from 'vitest';
import {
  calculateAuthorizedPoCommitment,
  calculateChangeOrderTotals,
  canTransitionChangeOrder,
  validateChangeOrderCommitment,
} from './change-order';

describe('Phase 5C.4 — PO Change Orders & Financial Amendment Engine', () => {
  describe('Line Item Delta & Totals Calculation', () => {
    it('calculates net, tax, and total deltas from item inputs', () => {
      const items = [
        {
          quantityDelta: 2,
          unitPrice: 5000,
          taxAmountDelta: 1800, // 18% of 10,000
        },
        {
          quantityDelta: 1,
          unitPrice: 20000,
          taxAmountDelta: 3600, // 18% of 20,000
        },
      ];

      const totals = calculateChangeOrderTotals(items);
      expect(totals.netAmountDelta).toBe(30000);
      expect(totals.taxAmountDelta).toBe(5400);
      expect(totals.totalDelta).toBe(35400);
    });

    it('handles negative line item deltas for scope de-scoping', () => {
      const items = [
        {
          amountDelta: -10000,
          taxAmountDelta: -1800,
          totalDelta: -11800,
        },
      ];

      const totals = calculateChangeOrderTotals(items);
      expect(totals.netAmountDelta).toBe(-10000);
      expect(totals.taxAmountDelta).toBe(-1800);
      expect(totals.totalDelta).toBe(-11800);
    });
  });

  describe('Current Authorized Commitment Calculation', () => {
    it('aggregates original PO total and committed change order deltas', () => {
      const originalPoTotal = 100000;
      const changeOrders = [
        { totalDelta: 25000, status: 'COMMITTED' },
        { totalDelta: -5000, status: 'COMMITTED' },
        { totalDelta: 50000, status: 'DRAFT' }, // Ignored (not committed)
        { totalDelta: 10000, status: 'APPROVED' }, // Ignored (not committed)
      ];

      const current = calculateAuthorizedPoCommitment(
        originalPoTotal,
        changeOrders,
      );
      // 100,000 + 25,000 - 5,000 = 120,000
      expect(current).toBe(120000);
    });
  });

  describe('Negative Change Order Guard (Invoiced Floor Invariant)', () => {
    it('allows positive scope expansion without restriction', () => {
      const validation = validateChangeOrderCommitment({
        originalPoTotal: 100000,
        existingCommittedChangeOrders: [],
        changeOrderToCommit: { totalDelta: 30000 },
        cumulativeInvoicedAmount: 80000,
      });

      expect(validation.isValid).toBe(true);
      expect(validation.revisedAuthorizedTotal).toBe(130000);
    });

    it('allows negative change order when revised total remains >= cumulative invoiced amount', () => {
      const validation = validateChangeOrderCommitment({
        originalPoTotal: 100000,
        existingCommittedChangeOrders: [],
        changeOrderToCommit: { totalDelta: -15000 }, // reduces to 85,000
        cumulativeInvoicedAmount: 70000,
      });

      expect(validation.isValid).toBe(true);
      expect(validation.revisedAuthorizedTotal).toBe(85000);
    });

    it('strictly rejects negative change order reducing commitment below cumulative invoiced amount (REV-5C4-CO-BELOW-INVOICED)', () => {
      const validation = validateChangeOrderCommitment({
        originalPoTotal: 100000,
        existingCommittedChangeOrders: [],
        changeOrderToCommit: { totalDelta: -40000 }, // would reduce to 60,000
        cumulativeInvoicedAmount: 75000, // already billed 75,000
      });

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('REV-5C4-CO-BELOW-INVOICED');
      expect(validation.revisedAuthorizedTotal).toBe(60000);
      expect(validation.cumulativeInvoicedAmount).toBe(75000);
    });

    it('rejects change order resulting in negative total commitment', () => {
      const validation = validateChangeOrderCommitment({
        originalPoTotal: 50000,
        existingCommittedChangeOrders: [],
        changeOrderToCommit: { totalDelta: -60000 },
        cumulativeInvoicedAmount: 0,
      });

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('negative amount');
    });
  });

  describe('Change Order Lifecycle State Machine', () => {
    it('allows valid state progression: DRAFT -> SUBMITTED -> APPROVED -> COMMITTED', () => {
      expect(canTransitionChangeOrder('DRAFT', 'SUBMITTED')).toBe(true);
      expect(canTransitionChangeOrder('SUBMITTED', 'APPROVED')).toBe(true);
      expect(canTransitionChangeOrder('APPROVED', 'COMMITTED')).toBe(true);
    });

    it('allows rejection at DRAFT, SUBMITTED, and APPROVED stages', () => {
      expect(canTransitionChangeOrder('DRAFT', 'REJECTED')).toBe(true);
      expect(canTransitionChangeOrder('SUBMITTED', 'REJECTED')).toBe(true);
      expect(canTransitionChangeOrder('APPROVED', 'REJECTED')).toBe(true);
    });

    it('enforces COMMITTED as terminal state (no transitions allowed)', () => {
      expect(canTransitionChangeOrder('COMMITTED', 'DRAFT')).toBe(false);
      expect(canTransitionChangeOrder('COMMITTED', 'SUBMITTED')).toBe(false);
      expect(canTransitionChangeOrder('COMMITTED', 'APPROVED')).toBe(false);
      expect(canTransitionChangeOrder('COMMITTED', 'REJECTED')).toBe(false);
    });

    it('allows revising a REJECTED change order back to DRAFT', () => {
      expect(canTransitionChangeOrder('REJECTED', 'DRAFT')).toBe(true);
      expect(canTransitionChangeOrder('REJECTED', 'COMMITTED')).toBe(false);
    });
  });
});
