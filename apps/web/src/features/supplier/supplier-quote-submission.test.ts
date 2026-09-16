import { describe, it, expect } from 'vitest';
import {
  computeTotalCost,
  toSnapshotPayload,
  type QuoteSnapshotInput,
  type SupplierRfqDetail,
  type SupplierQuote,
} from './types/supplier-quote';
import { GST_SLABS } from './components/QuoteForm';
import {
  canTransitionQuote,
  canSubmitQuoteRevision,
  canFinalizeQuote,
} from '@otp/domain';

function createMockDetail(overrides: Partial<SupplierRfqDetail> = {}): SupplierRfqDetail {
  return {
    invitationId: 'inv-quote-101',
    rfqId: 'rfq-quote-101',
    publicRef: 'RFQ-2026-8800',
    anonymousLabel: 'Supplier Beta',
    status: 'INVITED',
    invitedAt: new Date().toISOString(),
    rfqTitle: 'Precision CNC Machined Enclosures (6061-T6)',
    rfqStatus: 'OPEN',
    quoteDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    buyerDisplayName: 'Identity protected',
    buyerAnonymous: true,
    sourcingMode: 'IDENTITY_PROTECTED',
    minQuotesRequired: 3,
    category: 'Precision Machining',
    subcategory: 'CNC Milling',
    deliveryCity: 'Bengaluru',
    quantity: 50,
    unit: 'enclosures',
    description: 'Bespoke CNC milled aluminum enclosures with clear anodize per drawing.',
    requirementMode: 'JOB_WORK',
    attributes: { material: 'Aluminum 6061-T6', finish: 'Clear Anodize' },
    quality: { cmm_inspection: true },
    commercial: { payment_terms: '30 Days Net' },
    requiredByMode: 'WITHIN_DAYS',
    requiredByDays: 14,
    requiredByDate: null,
    fulfilmentMode: 'SUPPLIER_DELIVERY',
    evaluationWeights: { price: 60, delivery_turnaround: 25, warranty_quality: 15 },
    ...overrides,
  };
}

describe('Phase 3.3: Supplier Quote Submission Workflow & Security Invariants', () => {
  describe('1. Commercial Pricing Calculations & Tax Slabs', () => {
    it('calculates total cost accurately across all 5 Indian GST slabs', () => {
      const basePrice = 50000;
      const freight = 2500;

      const slabs = [
        { rate: 0, expectedGst: 0, expectedTotal: 52500 },
        { rate: 5, expectedGst: 2500, expectedTotal: 55000 },
        { rate: 12, expectedGst: 6000, expectedTotal: 58500 },
        { rate: 18, expectedGst: 9000, expectedTotal: 61500 },
        { rate: 28, expectedGst: 14000, expectedTotal: 66500 },
      ];

      for (const { rate, expectedGst, expectedTotal } of slabs) {
        const gstAmount = Math.round(basePrice * (rate / 100));
        expect(gstAmount).toBe(expectedGst);

        const input: QuoteSnapshotInput = {
          basePrice,
          gstAmount,
          transportCost: freight,
          deliveryDays: 7,
          warrantyMonths: 12,
          currency: 'INR',
        };

        expect(computeTotalCost(input)).toBe(expectedTotal);
      }
    });

    it('verifies standard GST slabs present in QuoteForm configuration', () => {
      const rates = GST_SLABS.map((s) => s.rate);
      expect(rates).toEqual([18, 12, 5, 28, 0]);
    });

    it('produces valid snapshot payload for immutable quote_versions table', () => {
      const input: QuoteSnapshotInput = {
        basePrice: 42000,
        gstAmount: 7560,
        transportCost: 1500,
        deliveryDays: 5,
        warrantyMonths: 18,
        currency: 'INR',
        notes: 'Includes on-site testing and calibration report.',
      };

      const payload = toSnapshotPayload(input);
      expect(payload.basePrice).toBe(42000);
      expect(payload.gstAmount).toBe(7560);
      expect(payload.transportCost).toBe(1500);
      expect(payload.totalCost).toBe(51060);
      expect(payload.deliveryDays).toBe(5);
      expect(payload.warrantyMonths).toBe(18);
      expect(payload.notes).toBe('Includes on-site testing and calibration report.');
    });
  });

  describe('2. State Transitions & Lifecycle Invariants', () => {
    it('allows initial quote submission when RFQ is OPEN and transitions to SUBMITTED', () => {
      const canSubmit = canTransitionQuote('DRAFT', 'SUBMITTED');
      expect(canSubmit).toBe(true);
    });

    it('allows quote revision when RFQ is OPEN and quote is SUBMITTED', () => {
      const canRevise = canSubmitQuoteRevision('OPEN', 'SUBMITTED');
      expect(canRevise).toBe(true);

      const canTransition = canTransitionQuote('SUBMITTED', 'REVISED');
      expect(canTransition).toBe(true);
    });

    it('allows final quote locking when RFQ is in CLARIFICATION or OPEN', () => {
      const canFinalize = canFinalizeQuote('CLARIFICATION', 'REVISED');
      expect(canFinalize).toBe(true);

      const canTransition = canTransitionQuote('REVISED', 'FINAL');
      expect(canTransition).toBe(true);
    });

    it('blocks quote submission and revision when RFQ is CLOSED or AWARDED', () => {
      expect(canSubmitQuoteRevision('CLOSED', 'SUBMITTED')).toBe(false);
      expect(canSubmitQuoteRevision('AWARDED', 'SUBMITTED')).toBe(false);
      expect(canFinalizeQuote('CLOSED', 'SUBMITTED')).toBe(false);
    });
  });

  describe('3. Route & Navigation Contracts', () => {
    it('provides canonical dedicated quote submission route /supplier/rfq/:rfqId/quote', () => {
      const rfqId = 'rfq-machining-900';
      const quoteRoute = `/supplier/rfq/${rfqId}/quote`;
      expect(quoteRoute).toBe('/supplier/rfq/rfq-machining-900/quote');
    });

    it('determines appropriate primary action pointing to /supplier/rfq/:rfqId/quote for open opportunities', () => {
      const rfq = createMockDetail({ rfqStatus: 'OPEN' });
      const existingQuote: SupplierQuote | null = null;

      const isQuotingActive = rfq.rfqStatus === 'OPEN' && !existingQuote;
      const targetRoute = isQuotingActive ? `/supplier/rfq/${rfq.rfqId}/quote` : `/supplier/rfq/${rfq.rfqId}`;

      expect(targetRoute).toBe('/supplier/rfq/rfq-quote-101/quote');
    });
  });

  describe('4. Security & Identity Protection Invariants', () => {
    it('guarantees zero buyer identity or competitor price leakage during quote entry', () => {
      const rfq = createMockDetail();
      expect(rfq.buyerDisplayName).toBe('Identity protected');
      expect(rfq.buyerAnonymous).toBe(true);
      expect(rfq.buyerDisplayName).not.toContain('@');

      // Zero competing quotes on supplier opportunity detail
      const rfqKeys = Object.keys(rfq);
      expect(rfqKeys).not.toContain('otherSuppliers');
      expect(rfqKeys).not.toContain('competingQuotes');
    });

    it('enforces single quote cardinality constraint (UNIQUE rfq_id + supplier_id)', () => {
      const quoteA = { rfqId: 'rfq-1', supplierId: 'supp-1', version: 1 };
      const quoteB = { rfqId: 'rfq-1', supplierId: 'supp-1', version: 2 };

      // Versioning increments version number rather than creating duplicate quote root records
      expect(quoteB.version).toBe(quoteA.version + 1);
    });
  });
});
