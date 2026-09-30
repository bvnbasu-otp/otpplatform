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

  it('builds text query with city and PIN', () => {
    expect(buildGooglePlacesTextQuery('electrical suppliers', 'Bengaluru', '560048')).toBe(
      'electrical suppliers in Bengaluru 560048',
    );
  });
});
