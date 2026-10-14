import { describe, it, expect } from 'vitest';
import {
  buildGooglePlacesCategorySearchTerms,
  buildGooglePlacesTextQuery,
} from './google-places-category-search-terms';

describe('google-places-category-search-terms', () => {
  it('maps canonical admin categories to bounded deterministic queries', () => {
    const terms = buildGooglePlacesCategorySearchTerms('Electrical & Automation', 3);
    expect(terms.length).toBeLessThanOrEqual(3);
    expect(terms[0]).toContain('electrical');
  });

  it('falls back to category-derived suppliers term for unknown labels', () => {
    const terms = buildGooglePlacesCategorySearchTerms('Custom Hydraulic Valves', 2);
    expect(terms.length).toBe(2);
    expect(terms[0]).toContain('custom hydraulic valves');
  });

  it('maps canonical 15 database categories to bounded deterministic queries', () => {
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

    for (const cat of canonicalCategories) {
      const terms = buildGooglePlacesCategorySearchTerms(cat, 3);
      expect(terms.length).toBeGreaterThanOrEqual(1);
      expect(terms[0]).not.toBe('commercial suppliers');
    }
  });

  it('builds text query with city and PIN', () => {
    expect(buildGooglePlacesTextQuery('electrical suppliers', 'Bengaluru', '560048')).toBe(
      'electrical suppliers in Bengaluru 560048',
    );
  });
});
