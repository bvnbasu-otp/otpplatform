import { describe, expect, it } from 'vitest';
import {
  evaluateSettlementReconciliation,
  canResolveSettlementException,
  type SettlementExceptionRecord,
} from './settlement-reconciliation';

describe('OTP Phase 5C.5: Settlement Reconciliation & Financial Exception Domain Model', () => {
  describe('evaluateSettlementReconciliation', () => {
    it('classifies exact match when paid and UTR amount equal net settlement', () => {
      // Gross ₹1,00,000, TDS ₹2,000, Fee ₹500 -> Expected Net ₹97,500
      const res = evaluateSettlementReconciliation({
        invoiceGrossAmount: 100000,
        tdsAmount: 2000,
        platformFeeAmount: 500,
        paidAllocatedAmount: 97500,
        utrNumber: 'UTR-HDFC-992200',
        utrClearedAmount: 97500,
      });

      expect(res.status).toBe('MATCHED');
      expect(res.discrepancyType).toBe('NONE');
      expect(res.varianceAmount).toBe(0);
      expect(res.requiresException).toBe(false);
    });

    it('detects duplicate UTR in the same organization', () => {
      const res = evaluateSettlementReconciliation({
        invoiceGrossAmount: 100000,
        tdsAmount: 2000,
        platformFeeAmount: 500,
        paidAllocatedAmount: 97500,
        utrNumber: 'UTR-HDFC-DUPLICATE',
        utrClearedAmount: 97500,
        existingUtrsInOrg: ['UTR-AXIS-001', 'UTR-HDFC-DUPLICATE'],
      });

      expect(res.status).toBe('MISMATCH');
      expect(res.discrepancyType).toBe('DUPLICATE_UTR');
      expect(res.requiresException).toBe(true);
      expect(res.exceptionSeverity).toBe('HIGH');
    });

    it('detects UTR amount mismatch against system recorded paid amount', () => {
      const res = evaluateSettlementReconciliation({
        invoiceGrossAmount: 100000,
        tdsAmount: 2000,
        platformFeeAmount: 500,
        paidAllocatedAmount: 97500,
        utrNumber: 'UTR-HDFC-112233',
        utrClearedAmount: 95000, // ₹2,500 difference
      });

      expect(res.status).toBe('MISMATCH');
      expect(res.discrepancyType).toBe('UTR_AMOUNT_MISMATCH');
      expect(res.varianceAmount).toBe(2500);
      expect(res.requiresException).toBe(true);
      expect(res.exceptionSeverity).toBe('CRITICAL');
    });

    it('detects excess allocation exceeding net settlement obligation', () => {
      const res = evaluateSettlementReconciliation({
        invoiceGrossAmount: 50000,
        tdsAmount: 1000,
        platformFeeAmount: 250, // Net: ₹48,750
        paidAllocatedAmount: 50000, // Excess by ₹1,250
      });

      expect(res.status).toBe('MISMATCH');
      expect(res.discrepancyType).toBe('EXCESS_ALLOCATION');
      expect(res.varianceAmount).toBe(1250);
      expect(res.requiresException).toBe(true);
    });

    it('classifies partial settlement cleanly', () => {
      const res = evaluateSettlementReconciliation({
        invoiceGrossAmount: 100000,
        tdsAmount: 2000,
        platformFeeAmount: 500,
        paidAllocatedAmount: 50000, // Partial
      });

      expect(res.status).toBe('PARTIAL');
      expect(res.discrepancyType).toBe('UNDER_ALLOCATION');
      expect(res.varianceAmount).toBe(47500);
      expect(res.requiresException).toBe(false);
    });
  });

  describe('canResolveSettlementException', () => {
    const mockException: SettlementExceptionRecord = {
      id: 'exc-001',
      organizationId: 'org-1',
      reconciliationId: 'rec-001',
      exceptionType: 'UTR_AMOUNT_MISMATCH',
      severity: 'HIGH',
      status: 'OPEN',
      amountInDispute: 2500,
      reason: 'Bank cleared ₹2,500 less than invoice',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('allows resolution with substantive explanation', () => {
      const check = canResolveSettlementException(
        mockException,
        'Shortfall was recovered in secondary remittance advice UTR-881920',
      );
      expect(check.allowed).toBe(true);
    });

    it('rejects resolution with empty or insufficient explanation', () => {
      const check = canResolveSettlementException(mockException, 'ok');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('at least 5 characters');
    });

    it('rejects resolution on already resolved exception', () => {
      const resolvedExc = { ...mockException, status: 'RESOLVED' as const };
      const check = canResolveSettlementException(resolvedExc, 'Already handled');
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain('already resolved');
    });
  });
});
