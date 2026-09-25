import { describe, it, expect } from 'vitest';
import {
  DECLARED_PAYMENT_PLANS,
  validateMultimodalIntakeSubmission,
  type MultimodalIntakeSubmissionInput,
} from './requirement-intake';
import { createAddressSnapshot } from './buyer-address';

describe('Stage R2-09: Multimodal Requirement Intake Domain Engine', () => {
  describe('1. Declared Payment Structures', () => {
    it('provides canonical definitions for SINGLE_PAYMENT, THREE_PART_PAYMENT, and MILESTONE_BASED', () => {
      const single = DECLARED_PAYMENT_PLANS.SINGLE_PAYMENT;
      expect(single.structure).toBe('SINGLE_PAYMENT');
      expect(single.splits).toHaveLength(1);
      expect(single.splits[0]?.percentage).toBe(100);

      const threePart = DECLARED_PAYMENT_PLANS.THREE_PART_PAYMENT;
      expect(threePart.structure).toBe('THREE_PART_PAYMENT');
      expect(threePart.splits).toHaveLength(3);
      expect(threePart.splits.reduce((acc, s) => acc + s.percentage, 0)).toBe(100);

      const milestone = DECLARED_PAYMENT_PLANS.MILESTONE_BASED;
      expect(milestone.structure).toBe('MILESTONE_BASED');
      expect(milestone.splits).toHaveLength(4);
      expect(milestone.splits.reduce((acc, s) => acc + s.percentage, 0)).toBe(100);
    });
  });

  describe('2. Multi-Persona Intake Validation', () => {
    it('validates Individual Buyer intake with null organizationId and frozen primary address', () => {
      const input: MultimodalIntakeSubmissionInput = {
        idempotencyKey: 'idem-indiv-101',
        persona: 'INDIVIDUAL',
        profileId: 'usr-indiv-01',
        organizationId: null,
        rawPrompt: 'I need 4 ceiling fans for my apartment in Bengaluru 560001',
        normalizedTitle: '4 Ceiling Fans',
        categoryId: 'cat-appliances',
        subcategoryId: 'sub-ceiling-fans',
        deliveryCity: 'Bengaluru',
        deliveryPincode: '560001',
        deliveryLine1: 'Flat 402, Sunshine Apartments',
        quantity: 4,
        unit: 'UNITS',
        paymentStructure: 'SINGLE_PAYMENT',
      };

      const result = validateMultimodalIntakeSubmission(input);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
      expect(result.resolvedPaymentSummary).toBe('100% on delivery / completion');
      expect(result.frozenDeliveryAddressSnapshot?.city).toBe('Bengaluru');
      expect(result.frozenDeliveryAddressSnapshot?.pincode).toBe('560001');
      expect(result.isIdempotent).toBe(true);
    });

    it('rejects Individual Buyer intake if an organizationId is attached (strict isolation)', () => {
      const input: MultimodalIntakeSubmissionInput = {
        persona: 'INDIVIDUAL',
        profileId: 'usr-indiv-02',
        organizationId: 'org-fake-attached',
        rawPrompt: 'Need painting service in Chennai 600001',
        normalizedTitle: 'Home Painting',
        deliveryCity: 'Chennai',
        deliveryPincode: '600001',
        paymentStructure: 'SINGLE_PAYMENT',
      };

      const result = validateMultimodalIntakeSubmission(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.organizationId).toContain('must have organization_id = null');
    });

    it('validates RWA Buyer intake with active organizationId and 3-split payment structure', () => {
      const input: MultimodalIntakeSubmissionInput = {
        persona: 'RWA',
        profileId: 'usr-rwa-sec-01',
        organizationId: 'org-rwa-orchid-001',
        rawPrompt: 'Annual DG set overhaul and filter replacement in Chennai 600028',
        normalizedTitle: '250 kVA DG Set Overhaul',
        categoryId: 'cat-maintenance',
        subcategoryId: 'sub-dg-maintenance',
        deliveryCity: 'Chennai',
        deliveryPincode: '600028',
        deliveryLine1: 'Clubhouse Plant Room, Orchid Enclave',
        paymentStructure: 'THREE_PART_PAYMENT',
        sourcingMode: 'IDENTITY_PROTECTED',
        minQuotesRequired: 3,
        quoteDeadlineDays: 7,
      };

      const result = validateMultimodalIntakeSubmission(input);
      expect(result.isValid).toBe(true);
      expect(result.resolvedPaymentSummary).toBe('30% Advance · 50% Delivery · 20% Sign-off');
      expect(result.resolvedMinQuotes).toBe(3);
    });

    it('validates MSME Buyer intake with milestone-based payment structure', () => {
      const input: MultimodalIntakeSubmissionInput = {
        persona: 'MSME',
        profileId: 'usr-msme-owner-01',
        organizationId: 'org-msme-apex-001',
        rawPrompt: 'Custom batch CNC turning for 1000 steel bushings in Pune 411018',
        normalizedTitle: 'Batch CNC Turning 1000 Bushings',
        categoryId: 'cat-machining',
        subcategoryId: 'sub-cnc-turning',
        deliveryCity: 'Pune',
        deliveryPincode: '411018',
        deliveryLine1: 'Plot 18, MIDC Bhosari',
        quantity: 1000,
        unit: 'PCS',
        paymentStructure: 'MILESTONE_BASED',
      };

      const result = validateMultimodalIntakeSubmission(input);
      expect(result.isValid).toBe(true);
      expect(result.resolvedPaymentSummary).toBe('4 Milestones (25% / 25% / 25% / 25%)');
      expect(result.frozenDeliveryAddressSnapshot?.line1).toBe('Plot 18, MIDC Bhosari');
    });

    it('supports free-text taxonomy fallback when category is unlisted', () => {
      const input: MultimodalIntakeSubmissionInput = {
        persona: 'INDIVIDUAL',
        profileId: 'usr-indiv-03',
        organizationId: null,
        rawPrompt: 'Custom handcrafted rosewood rocking chair',
        normalizedTitle: 'Rosewood Rocking Chair',
        isCustomTaxonomyFallback: true,
        customTaxonomyFreeText: 'Antique Woodcraft & Joinery',
        deliveryCity: 'Bengaluru',
        deliveryPincode: '560034',
        paymentStructure: 'SINGLE_PAYMENT',
      };

      const result = validateMultimodalIntakeSubmission(input);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual({});
    });

    it('enforces memory leak security guard (PA-05) against supplier contact details in intake', () => {
      const input: MultimodalIntakeSubmissionInput = {
        persona: 'INDIVIDUAL',
        profileId: 'usr-indiv-04',
        rawPrompt: 'Buy materials from Ramesh +919888877777 ramesh@vendor.com directly',
        normalizedTitle: 'Direct Purchase',
        deliveryCity: 'Bengaluru',
        deliveryPincode: '560001',
        paymentStructure: 'SINGLE_PAYMENT',
      };

      const result = validateMultimodalIntakeSubmission(input);
      expect(result.isValid).toBe(false);
      expect(result.errors.security).toBeTruthy();
    });
  });
});
