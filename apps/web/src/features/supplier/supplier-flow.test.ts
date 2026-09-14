import { describe, expect, it } from 'vitest';
import { computeTotalCost, toSnapshotPayload, type QuoteSnapshotInput } from './types/supplier-quote';
import { GST_SLABS } from './components/QuoteForm';
import { toDetail, toInvitation, type IdentityProtectedRfqRow } from './api/fetch-invitations';
import { formatDeadlineCountdown } from '@/lib/date-utils';

describe('Phase 1: Supplier Experience Unit & Logic Suite', () => {
  describe('Screen 5: Supplier Home & Opportunity Calculations', () => {
    it('calculates urgency and format for quote deadlines accurately', () => {
      const urgentDate = new Date(Date.now() + 4 * 3600 * 1000).toISOString();
      const standardDate = new Date(Date.now() + 4 * 24 * 3600 * 1000 + 10000).toISOString();
      const expiredDate = new Date(Date.now() - 1000).toISOString();

      const urgentRes = formatDeadlineCountdown(urgentDate);
      expect(urgentRes.isUrgent).toBe(true);
      expect(urgentRes.isPassed).toBe(false);

      const standardRes = formatDeadlineCountdown(standardDate);
      expect(standardRes.isUrgent).toBe(false);
      expect(standardRes.isPassed).toBe(false);
      expect(standardRes.label).toBe('4 days left');

      const expiredRes = formatDeadlineCountdown(expiredDate);
      expect(expiredRes.isPassed).toBe(true);
      expect(expiredRes.label).toBe('Deadline passed');
    });

    it('maps masked RFQ rows into identity-protected supplier view', () => {
      const mockRow: IdentityProtectedRfqRow = {
        rfq_id: 'rfq-99',
        public_ref: 'ENQ-2026-999',
        title: 'CNC Machined Impellers 316L',
        description: 'High precision impellers according to attached technical drawing.',
        status: 'OPEN',
        sourcing_mode: 'IDENTITY_PROTECTED',
        quote_deadline: new Date(Date.now() + 86400000).toISOString(),
        min_quotes_required: 3,
        invitation_id: 'inv-99',
        my_alias: 'Supplier Delta',
        my_invitation_status: 'INVITED',
        invited_at: '2026-09-10T12:00:00Z',
        category: 'Precision Machining',
        subcategory: 'Impeller Milling',
        requirement_mode: 'JOB_WORK',
        quantity: 50,
        unit: 'units',
        attributes: { material: 'SS 316L', tolerance: '±0.02mm' },
        quality: { inspection_required: true },
        commercial: { payment_terms: '30 days' },
        required_by_mode: 'WITHIN_DAYS',
        required_by_days: 14,
        required_by_date: null,
        fulfilment_mode: 'BUYER_PICKUP',
        delivery_city: 'Pune',
        evaluation_weights: { price: 60, delivery_time: 25, warranty: 15 },
        buyer_display_name: 'Identity protected',
      };

      const invitation = toInvitation(mockRow);
      expect(invitation.rfqId).toBe('rfq-99');
      expect(invitation.publicRef).toBe('ENQ-2026-999');
      expect(invitation.anonymousLabel).toBe('Supplier Delta');
      expect(invitation.buyerAnonymous).toBe(true);

      const detail = toDetail(mockRow);
      expect(detail.quantity).toBe(50);
      expect(detail.evaluationWeights).toEqual({ price: 60, delivery_time: 25, warranty: 15 });
      expect(detail.attributes.material).toBe('SS 316L');
    });
  });

  describe('Screen 6: RFQ Opportunity Review & Identity Shielding', () => {
    it('ensures no sensitive buyer information leaks in detail view', () => {
      const rawRow: IdentityProtectedRfqRow = {
        rfq_id: 'rfq-101',
        public_ref: 'ENQ-2026-101',
        title: 'Industrial Valve Maintenance',
        description: 'Complete overhaul of 12 ball valves',
        status: 'OPEN',
        sourcing_mode: 'IDENTITY_PROTECTED',
        quote_deadline: '2026-09-30T00:00:00Z',
        min_quotes_required: 4,
        invitation_id: 'inv-101',
        my_alias: 'Supplier Zenith',
        my_invitation_status: 'INVITED',
        invited_at: '2026-09-11T10:00:00Z',
        category: 'Valves & Flow',
        subcategory: 'Maintenance',
        requirement_mode: 'SERVICE',
        quantity: 12,
        unit: 'units',
        attributes: {},
        quality: {},
        commercial: {},
        required_by_mode: 'SPECIFIC_DATE',
        required_by_days: null,
        required_by_date: '2026-10-15T00:00:00Z',
        fulfilment_mode: 'SUPPLIER_ONSITE',
        delivery_city: 'Chennai',
        evaluation_weights: { price: 70, delivery_time: 20, warranty: 10 },
        buyer_display_name: 'Identity protected',
      };

      const detail = toDetail(rawRow);
      expect(detail.buyerDisplayName).toBe('Identity protected');
      expect(detail.buyerAnonymous).toBe(true);
      expect(detail.evaluationWeights.price).toBe(70);
    });
  });

  describe('Screen 7: Supplier Quote Submission & Micro-Flow Calculations', () => {
    it('provides standard Indian GST slabs in QuoteForm', () => {
      const rates = GST_SLABS.map((s) => s.rate);
      expect(rates).toContain(18);
      expect(rates).toContain(12);
      expect(rates).toContain(5);
      expect(rates).toContain(28);
      expect(rates).toContain(0);
    });

    it('calculates total quote cost correctly with inclusive pricing split', () => {
      const inclusiveTotal = 118000;
      const rate = 18;
      const base = Math.round(inclusiveTotal / (1 + rate / 100));
      const gst = inclusiveTotal - base;

      expect(base).toBe(100000);
      expect(gst).toBe(18000);

      const input: QuoteSnapshotInput = {
        basePrice: base,
        gstAmount: gst,
        transportCost: 0,
        deliveryDays: 7,
        warrantyMonths: 12,
        currency: 'INR',
      };

      expect(computeTotalCost(input)).toBe(118000);
    });

    it('creates valid snapshot payload for Supabase quote_versions', () => {
      const input: QuoteSnapshotInput = {
        basePrice: 50000,
        gstAmount: 9000,
        transportCost: 2500,
        deliveryDays: 5,
        warrantyMonths: 24,
        currency: 'INR',
        notes: 'Includes on-site testing.',
      };

      const payload = toSnapshotPayload(input);
      expect(payload.basePrice).toBe(50000);
      expect(payload.gstAmount).toBe(9000);
      expect(payload.transportCost).toBe(2500);
      expect(payload.totalCost).toBe(61500);
      expect(payload.deliveryDays).toBe(5);
      expect(payload.warrantyMonths).toBe(24);
      expect(payload.notes).toBe('Includes on-site testing.');
    });
  });
});
