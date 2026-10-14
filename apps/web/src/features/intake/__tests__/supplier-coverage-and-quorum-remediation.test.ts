import { describe, it, expect } from 'vitest';
import { inferIndianState } from '../api/draft';
import { computeSourcingHealth } from '@/features/rfq/api/fetch-active-rfq-monitoring';
import { buildGooglePlacesCategorySearchTerms } from '@otp/domain';

describe('Supplier Coverage & Quorum Remediation Acceptance Suite', () => {
  describe('1. DEF-01: Indian PIN Code and State Resolution', () => {
    it('accurately resolves states from 6-digit Indian PIN code prefixes', () => {
      expect(inferIndianState('560048')).toBe('Karnataka');
      expect(inferIndianState('560001')).toBe('Karnataka');
      expect(inferIndianState('600040')).toBe('Tamil Nadu');
      expect(inferIndianState('641018')).toBe('Tamil Nadu');
      expect(inferIndianState('400001')).toBe('Maharashtra');
      expect(inferIndianState('411001')).toBe('Maharashtra');
      expect(inferIndianState('403001')).toBe('Goa');
      expect(inferIndianState('110001')).toBe('Delhi');
      expect(inferIndianState('122001')).toBe('Haryana');
      expect(inferIndianState('500001')).toBe('Telangana');
      expect(inferIndianState('530001')).toBe('Andhra Pradesh');
      expect(inferIndianState('380001')).toBe('Gujarat');
      expect(inferIndianState('700001')).toBe('West Bengal');
    });

    it('falls back to major Indian city names when PIN is absent or partial', () => {
      expect(inferIndianState(null, 'Bengaluru')).toBe('Karnataka');
      expect(inferIndianState(null, 'Bangalore')).toBe('Karnataka');
      expect(inferIndianState(null, 'Chennai')).toBe('Tamil Nadu');
      expect(inferIndianState(null, 'Mumbai')).toBe('Maharashtra');
      expect(inferIndianState(null, 'New Delhi')).toBe('Delhi');
      expect(inferIndianState(null, 'Hyderabad')).toBe('Telangana');
      expect(inferIndianState(null, 'Ahmedabad')).toBe('Gujarat');
      expect(inferIndianState(null, 'Kolkata')).toBe('West Bengal');
    });

    it('returns null safely for invalid or foreign inputs', () => {
      expect(inferIndianState('123')).toBeNull();
      expect(inferIndianState('ABCDEF')).toBeNull();
      expect(inferIndianState(null, 'Unknown City')).toBeNull();
    });
  });

  describe('2. DEF-04: Canonical 15-Category Google Places Search Terms', () => {
    const canonicalCategories = [
      'Electrical & Power',
      'Construction & Infrastructure',
      'Agriculture & Commodities',
      'Chemicals & Process Materials',
      'General / Other',
      'Industrial Supplies & Hardware',
      'IT, Electronics & Digital',
      'Logistics & Transportation',
      'Machinery & Engineering',
      'Packaging & Printing',
      'Professional & Skilled Services',
      'Property & Facility Management',
      'Safety & Security',
      'Textile & Apparel',
      'Water & Environmental Solutions',
    ];

    it('maps all 15 canonical database categories to specific search terms', () => {
      for (const cat of canonicalCategories) {
        const terms = buildGooglePlacesCategorySearchTerms(cat, 3);
        expect(terms.length).toBeGreaterThanOrEqual(1);
        expect(terms[0]).not.toBe('commercial suppliers');
      }
    });

    it('preserves legacy and subcategory search term aliases', () => {
      const elecTerms = buildGooglePlacesCategorySearchTerms('Electrical & Automation', 3);
      expect(elecTerms).toContain('electrical suppliers');

      const civilTerms = buildGooglePlacesCategorySearchTerms('Construction & Civil Works', 3);
      expect(civilTerms).toContain('building material suppliers');
    });
  });

  describe('3. DEF-06: Truthful Sourcing Health & Quote Quorum Indicator', () => {
    it('flags QUORUM AT RISK when quote window expires with fewer quotes than required', () => {
      const health = computeSourcingHealth({
        invitedCount: 5,
        viewedCount: 3,
        quotesCount: 1,
        declinedCount: 0,
        minQuotesRequired: 3,
        isQuorumMet: false,
        unansweredClarificationsCount: 0,
        isDeadlineApproaching: false,
        isDeadlineExpired: true,
        rfqStatus: 'OPEN',
      });

      expect(health.status).toBe('ATTENTION');
      expect(health.label).toBe('Quorum Unmet (Deadline Expired)');
      expect(health.badgeLabel).toBe('QUORUM AT RISK');
      expect(health.tone).toBe('attention');
      expect(health.description).toContain('Quorum unmet');
      expect(health.description).not.toContain('Quorum reached');
    });

    it('correctly reports READY FOR EVALUATION only when quorum is truly met', () => {
      const health = computeSourcingHealth({
        invitedCount: 5,
        viewedCount: 4,
        quotesCount: 3,
        declinedCount: 0,
        minQuotesRequired: 3,
        isQuorumMet: true,
        unansweredClarificationsCount: 0,
        isDeadlineApproaching: false,
        isDeadlineExpired: true,
        rfqStatus: 'OPEN',
      });

      expect(health.status).toBe('READY FOR EVALUATION');
      expect(health.badgeLabel).toBe('READY FOR EVALUATION');
      expect(health.tone).toBe('ready');
      expect(health.description).toContain('Quorum reached (3/3 quotes received)');
    });
  });
});
