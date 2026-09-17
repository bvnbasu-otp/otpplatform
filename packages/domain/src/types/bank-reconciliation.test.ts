import { describe, expect, it } from 'vitest';
import {
  calculateReconciliationSummary,
  normalizeUtr,
  reconcileBankRemittance,
} from './bank-reconciliation';

describe('Phase 5C.4 — Bank Remittance & UTR Reconciliation Engine', () => {
  describe('UTR Normalization', () => {
    it('normalizes UTR string (strips spaces, hyphens, uppercases)', () => {
      expect(normalizeUtr('  hdfc-r5-20260917-00123  ')).toBe(
        'HDFCR52026091700123',
      );
    });
  });

  describe('UTR Matching & Discrepancy Detection', () => {
    it('successfully matches when amounts match within allowable date drift', () => {
      const record = reconcileBankRemittance({
        organizationId: 'org-100',
        buyerPayment: {
          id: 'pay-001',
          amount: 50000,
          recordedAt: '2026-09-15T10:00:00Z',
          reference: 'HDFCR52026091700123',
        },
        bankAdvice: {
          utrNumber: 'HDFCR52026091700123',
          clearedAmount: 50000,
          clearedAt: '2026-09-17T14:30:00Z', // 2 days drift <= 7 days
          bankName: 'HDFC Bank',
        },
      });

      expect(record.status).toBe('MATCHED');
      expect(record.discrepancyType).toBe('NONE');
      expect(record.amountDifference).toBe(0);
      expect(record.dateDriftDays).toBe(2);
    });

    it('flags AMOUNT_MISMATCH discrepancy when bank cleared amount differs', () => {
      const record = reconcileBankRemittance({
        organizationId: 'org-100',
        buyerPayment: {
          id: 'pay-002',
          amount: 75000,
          recordedAt: '2026-09-15T10:00:00Z',
        },
        bankAdvice: {
          utrNumber: 'SBIN009988776655',
          clearedAmount: 70000, // ₹5,000 short (e.g. unexpected bank fee / haircut)
          clearedAt: '2026-09-16T12:00:00Z',
        },
      });

      expect(record.status).toBe('DISCREPANCY');
      expect(record.discrepancyType).toBe('AMOUNT_MISMATCH');
      expect(record.amountDifference).toBe(5000);
      expect(record.discrepancyDetails).toContain('Amount mismatch');
    });

    it('flags UNKNOWN_UTR discrepancy when bank cleared payment has no buyer record', () => {
      const record = reconcileBankRemittance({
        organizationId: 'org-100',
        buyerPayment: null, // No matching payment
        bankAdvice: {
          utrNumber: 'ICIC998877112233',
          clearedAmount: 120000,
          clearedAt: '2026-09-17T09:00:00Z',
        },
      });

      expect(record.status).toBe('DISCREPANCY');
      expect(record.discrepancyType).toBe('UNKNOWN_UTR');
      expect(record.bankClearedAmount).toBe(120000);
      expect(record.discrepancyDetails).toContain('no matching buyer payment');
    });

    it('flags DUPLICATE_UTR discrepancy when same UTR appears again', () => {
      const record = reconcileBankRemittance({
        organizationId: 'org-100',
        buyerPayment: {
          id: 'pay-003',
          amount: 25000,
          recordedAt: '2026-09-10T10:00:00Z',
        },
        bankAdvice: {
          utrNumber: 'AXIS001122334455',
          clearedAmount: 25000,
          clearedAt: '2026-09-11T10:00:00Z',
        },
        existingUtrRecords: [
          { id: 'rec-old-001', utrNumber: 'AXIS001122334455' },
        ],
      });

      expect(record.status).toBe('DISCREPANCY');
      expect(record.discrepancyType).toBe('DUPLICATE_UTR');
      expect(record.discrepancyDetails).toContain('Duplicate UTR');
    });

    it('flags DATE_DRIFT discrepancy when clearance is beyond allowable max drift', () => {
      const record = reconcileBankRemittance({
        organizationId: 'org-100',
        buyerPayment: {
          id: 'pay-004',
          amount: 40000,
          recordedAt: '2026-08-01T10:00:00Z',
        },
        bankAdvice: {
          utrNumber: 'KKBK554433221100',
          clearedAmount: 40000,
          clearedAt: '2026-08-20T10:00:00Z', // 19 days drift
        },
        maxAllowedDateDriftDays: 7,
      });

      expect(record.status).toBe('DISCREPANCY');
      expect(record.discrepancyType).toBe('DATE_DRIFT');
      expect(record.dateDriftDays).toBe(19);
    });
  });

  describe('Reconciliation Summary Aggregation', () => {
    it('aggregates total metrics, discrepancy counts, and variance amounts', () => {
      const rec1 = reconcileBankRemittance({
        organizationId: 'org-1',
        buyerPayment: { id: 'p1', amount: 10000, recordedAt: '2026-09-10' },
        bankAdvice: { utrNumber: 'UTR1', clearedAmount: 10000, clearedAt: '2026-09-11' },
      });
      const rec2 = reconcileBankRemittance({
        organizationId: 'org-1',
        buyerPayment: { id: 'p2', amount: 20000, recordedAt: '2026-09-10' },
        bankAdvice: { utrNumber: 'UTR2', clearedAmount: 18000, clearedAt: '2026-09-11' },
      });

      const summary = calculateReconciliationSummary([rec1, rec2]);
      expect(summary.totalRecords).toBe(2);
      expect(summary.matchedCount).toBe(1);
      expect(summary.discrepancyCount).toBe(1);
      expect(summary.totalClearedAmount).toBe(28000);
      expect(summary.totalBuyerAmount).toBe(30000);
      expect(summary.totalDiscrepancyAmount).toBe(2000);
    });
  });
});
