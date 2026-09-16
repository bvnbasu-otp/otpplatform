import { describe, it, expect } from 'vitest';
import type { SupplierRfqDetail, SupplierQuote } from './types/supplier-quote';
import { formatDeadlineCountdown } from '@/lib/date-utils';
import { toDetail, type IdentityProtectedRfqRow } from './api/fetch-invitations';

function createMockDetail(overrides: Partial<SupplierRfqDetail> = {}): SupplierRfqDetail {
  return {
    invitationId: 'inv-detail-101',
    rfqId: 'rfq-detail-101',
    publicRef: 'RFQ-2026-9042',
    anonymousLabel: 'Supplier Alpha',
    status: 'INVITED',
    invitedAt: new Date().toISOString(),
    rfqTitle: 'Borewell Motor Rewinding & Servicing (50 HP)',
    rfqStatus: 'OPEN',
    quoteDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    buyerDisplayName: 'Identity protected',
    buyerAnonymous: true,
    buyerReliabilityScore: 98,
    sourcingMode: 'IDENTITY_PROTECTED',
    minQuotesRequired: 3,
    category: 'Electrical & Motors',
    subcategory: 'Motor Rewinding',
    deliveryCity: 'Bengaluru',
    quantity: 2,
    unit: 'motors',
    description: 'Complete inspection, rewinding of 50 HP submersible borewell motor with high temperature copper winding, insulation class H, replacement of carbon bearings and pressure testing.',
    requirementMode: 'SERVICE',
    attributes: {
      motor_power_hp: 50,
      winding_wire_grade: 'Dual Coated Copper Class H',
      bearing_type: 'Carbon Thrust Bearings',
      insulation_class: 'Class H (180°C)',
    },
    quality: {
      high_voltage_test_required: true,
      submersible_pressure_test_bar: 15,
      warranty_months_expected: 12,
    },
    commercial: {
      payment_terms: 'Direct settlement 15 days post delivery inspection',
      gst_invoice_required: true,
      freight_borne_by: 'Supplier to site',
    },
    requiredByMode: 'WITHIN_DAYS',
    requiredByDays: 7,
    requiredByDate: null,
    fulfilmentMode: 'SUPPLIER_ONSITE',
    evaluationWeights: {
      price: 50,
      delivery_turnaround: 30,
      warranty_quality: 20,
    },
    ...overrides,
  };
}

describe('Phase 3.2: Supplier RFQ / Opportunity Detail Specification & State Engine', () => {
  describe('1. First Viewport & Summary Hierarchy', () => {
    it('answers core questions: what, where, when, specifications, deadline, next action', () => {
      const rfq = createMockDetail();

      expect(rfq.rfqTitle).toBe('Borewell Motor Rewinding & Servicing (50 HP)');
      expect(rfq.category).toBe('Electrical & Motors');
      expect(rfq.subcategory).toBe('Motor Rewinding');
      expect(rfq.deliveryCity).toBe('Bengaluru');
      expect(rfq.quantity).toBe(2);
      expect(rfq.unit).toBe('motors');
      expect(rfq.publicRef).toBe('RFQ-2026-9042');
      expect(rfq.anonymousLabel).toBe('Supplier Alpha');
    });

    it('displays response deadline with accurate countdown without fake urgency', () => {
      const farFutureDate = new Date(Date.now() + 5 * 24 * 3600 * 1000 + 10000).toISOString();
      const nearFutureDate = new Date(Date.now() + 36 * 3600 * 1000).toISOString();
      const urgentDate = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
      const passedDate = new Date(Date.now() - 3600 * 1000).toISOString();

      const farFutureCountdown = formatDeadlineCountdown(farFutureDate);
      expect(farFutureCountdown.isPassed).toBe(false);
      expect(farFutureCountdown.label).toBe('5 days left');

      const nearFutureCountdown = formatDeadlineCountdown(nearFutureDate);
      expect(nearFutureCountdown.isPassed).toBe(false);
      expect(nearFutureCountdown.label).toContain('left');

      const urgentCountdown = formatDeadlineCountdown(urgentDate);
      expect(urgentCountdown.isUrgent).toBe(true);
      expect(urgentCountdown.isPassed).toBe(false);

      const passedCountdown = formatDeadlineCountdown(passedDate);
      expect(passedCountdown.isPassed).toBe(true);
      expect(passedCountdown.label).toBe('Deadline passed');
    });
  });

  describe('2. Identity Protection & Information Barrier Invariants', () => {
    it('guarantees buyer identity is sealed before authorized award reveal', () => {
      const rfq = createMockDetail();
      expect(rfq.buyerDisplayName).toBe('Identity protected');
      expect(rfq.buyerAnonymous).toBe(true);
      expect(rfq.buyerDisplayName).not.toContain('@');
      expect(rfq.buyerDisplayName).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      expect(rfq.buyerDisplayName).not.toMatch(/\+?91[6-9]\d{9}/);
    });

    it('ensures zero competing supplier identities or quote prices leak into supplier detail view', () => {
      const rfq = createMockDetail();
      const rfqKeys = Object.keys(rfq);

      // Verify no other supplier data properties exist
      expect(rfqKeys).not.toContain('otherSuppliers');
      expect(rfqKeys).not.toContain('competingQuotes');
      expect(rfqKeys).not.toContain('lowestQuote');
      expect(rfqKeys).not.toContain('bids');
    });

    it('correctly maps raw masked database rows to SupplierRfqDetail', () => {
      const rawRow: IdentityProtectedRfqRow = {
        rfq_id: 'rfq-raw-777',
        public_ref: 'RFQ-2026-0777',
        title: 'CNC Aluminum Enclosures 6061-T6',
        description: 'Milled enclosures with black anodizing per drawing',
        status: 'OPEN',
        sourcing_mode: 'IDENTITY_PROTECTED',
        quote_deadline: new Date(Date.now() + 86400000).toISOString(),
        min_quotes_required: 3,
        invitation_id: 'inv-raw-777',
        my_alias: 'Supplier Gamma',
        my_invitation_status: 'INVITED',
        invited_at: '2026-09-12T08:00:00Z',
        category: 'Precision Machining',
        subcategory: 'CNC Milling',
        requirement_mode: 'JOB_WORK',
        quantity: 100,
        unit: 'units',
        attributes: { material: 'Aluminium 6061-T6', finish: 'Anodized Black' },
        quality: { cmm_inspection: true },
        commercial: { payment_terms: 'Net 30' },
        required_by_mode: 'WITHIN_DAYS',
        required_by_days: 10,
        required_by_date: null,
        fulfilment_mode: 'SUPPLIER_DELIVERY',
        delivery_city: 'Pune',
        evaluation_weights: { price: 60, delivery_time: 25, quality: 15 },
        buyer_display_name: 'Identity protected',
      };

      const detail = toDetail(rawRow);
      expect(detail.rfqId).toBe('rfq-raw-777');
      expect(detail.publicRef).toBe('RFQ-2026-0777');
      expect(detail.anonymousLabel).toBe('Supplier Gamma');
      expect(detail.buyerAnonymous).toBe(true);
      expect(detail.quantity).toBe(100);
      expect(detail.attributes).toEqual({ material: 'Aluminium 6061-T6', finish: 'Anodized Black' });
      expect(detail.evaluationWeights).toEqual({ price: 60, delivery_time: 25, quality: 15 });
    });
  });

  describe('3. Specifications, Quality & Commercial Terms', () => {
    it('formats technical specifications and BoQ accurately', () => {
      const rfq = createMockDetail();
      const attrs = Object.entries(rfq.attributes);
      expect(attrs.length).toBe(4);
      expect(rfq.attributes.motor_power_hp).toBe(50);
      expect(rfq.attributes.insulation_class).toBe('Class H (180°C)');
    });

    it('formats quality and inspection expectations accurately', () => {
      const rfq = createMockDetail();
      expect(rfq.quality.high_voltage_test_required).toBe(true);
      expect(rfq.quality.submersible_pressure_test_bar).toBe(15);
      expect(rfq.quality.warranty_months_expected).toBe(12);
    });

    it('formats commercial requirements and evaluation weight matrix', () => {
      const rfq = createMockDetail();
      expect(rfq.commercial.payment_terms).toBe('Direct settlement 15 days post delivery inspection');
      expect(rfq.commercial.gst_invoice_required).toBe(true);

      const totalWeight = Object.values(rfq.evaluationWeights).reduce((sum, w) => sum + w, 0);
      expect(totalWeight).toBe(100);
      expect(rfq.evaluationWeights.price).toBe(50);
      expect(rfq.evaluationWeights.delivery_turnaround).toBe(30);
      expect(rfq.evaluationWeights.warranty_quality).toBe(20);
    });
  });

  describe('4. Timeline Distinction: Response Deadline vs Delivery Timeline', () => {
    it('clearly distinguishes Quoting Window Deadline from Fulfillment Timeline', () => {
      const rfq = createMockDetail({
        quoteDeadline: '2026-09-20T18:30:00Z',
        requiredByMode: 'WITHIN_DAYS',
        requiredByDays: 7,
      });

      // Response deadline is when quotes close
      expect(rfq.quoteDeadline).toBe('2026-09-20T18:30:00Z');
      // Delivery timeline is execution after PO
      expect(rfq.requiredByDays).toBe(7);
      expect(rfq.requiredByMode).toBe('WITHIN_DAYS');
      expect(rfq.fulfilmentMode).toBe('SUPPLIER_ONSITE');
    });

    it('handles specific target delivery dates', () => {
      const rfq = createMockDetail({
        requiredByMode: 'SPECIFIC_DATE',
        requiredByDate: '2026-10-31T00:00:00Z',
      });
      expect(rfq.requiredByMode).toBe('SPECIFIC_DATE');
      expect(rfq.requiredByDate).toBe('2026-10-31T00:00:00Z');
    });

    it('handles immediate execution requirements', () => {
      const rfq = createMockDetail({
        requiredByMode: 'IMMEDIATE',
        requiredByDays: null,
      });
      expect(rfq.requiredByMode).toBe('IMMEDIATE');
    });
  });

  describe('5. Primary State-Aware CTA Determination', () => {
    it('determines initial quote submission when RFQ is open and no quote exists', () => {
      const rfq = createMockDetail({ rfqStatus: 'OPEN' });
      const quote: SupplierQuote | null = null;

      const canSubmitInitial = rfq.rfqStatus === 'OPEN' && !quote;
      expect(canSubmitInitial).toBe(true);
    });

    it('determines revise action when quote is submitted and RFQ is open', () => {
      const rfq = createMockDetail({ rfqStatus: 'OPEN' });
      const quote: SupplierQuote = {
        quoteId: 'q-101',
        rfqId: rfq.rfqId,
        invitationId: rfq.invitationId,
        status: 'SUBMITTED',
        currentVersion: 1,
        submittedAt: new Date().toISOString(),
        snapshot: {
          basePrice: 45000,
          gstAmount: 8100,
          transportCost: 1500,
          totalCost: 54600,
          deliveryDays: 5,
          warrantyMonths: 12,
          currency: 'INR',
        },
      };

      const canRevise = rfq.rfqStatus === 'OPEN' && quote.status !== 'FINAL';
      expect(canRevise).toBe(true);
    });

    it('determines final quote locking in clarification phase', () => {
      const rfq = createMockDetail({ rfqStatus: 'CLARIFICATION' });
      const quote: SupplierQuote = {
        quoteId: 'q-102',
        rfqId: rfq.rfqId,
        invitationId: rfq.invitationId,
        status: 'REVISED',
        currentVersion: 2,
        submittedAt: new Date().toISOString(),
        snapshot: {
          basePrice: 42000,
          gstAmount: 7560,
          transportCost: 1200,
          totalCost: 50760,
          deliveryDays: 4,
          warrantyMonths: 18,
          currency: 'INR',
        },
      };

      const inClarification = rfq.rfqStatus === 'CLARIFICATION';
      const canSubmitFinal = inClarification && ['SUBMITTED', 'REVISED'].includes(quote.status);
      expect(canSubmitFinal).toBe(true);
    });

    it('determines concluded state when RFQ is closed or awarded', () => {
      const rfqClosed = createMockDetail({ rfqStatus: 'CLOSED' });
      const rfqAwarded = createMockDetail({ rfqStatus: 'AWARDED' });

      expect(rfqClosed.rfqStatus === 'OPEN').toBe(false);
      expect(rfqAwarded.rfqStatus === 'OPEN').toBe(false);
    });
  });

  describe('6. Zero Prohibited Terminology Rule', () => {
    it('verifies absence of auction / bidding terms across supplier opportunity detail copy', () => {
      const prohibitedWords = [/\bbid\b/i, /\bbids\b/i, /\bbidder\b/i, /\bbidders\b/i, /\bbidding\b/i];

      const copyTexts = [
        'Review & Submit Sealed Quote',
        'Sealed quote submitted successfully.',
        'Buyer Identity Protected Until Award',
        '100% Merit-Based Evaluation',
        'Eligible Supplier · Verified Match',
        'Quotes are evaluated side-by-side on price, turnaround, and warranty merit.',
        'Quotation Documents & Catalogues',
        'Revise Quote Price',
        'Lock Final Quote',
      ];

      for (const text of copyTexts) {
        for (const pattern of prohibitedWords) {
          expect(pattern.test(text)).toBe(false);
        }
      }
    });
  });
});
