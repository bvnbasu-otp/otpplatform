import { describe, expect, it } from 'vitest';
import { CANONICAL_OPPORTUNITIES } from './pages/OpportunitiesBrowsePage';

describe('X2O Screen 10 Opportunities and Details', () => {
  it('contains standard canonical opportunities with key commercial metrics', () => {
    expect(CANONICAL_OPPORTUNITIES.length).toBeGreaterThanOrEqual(4);

    const furniture = CANONICAL_OPPORTUNITIES.find((o) => o.id === 'opp-office-furniture-01');
    expect(furniture).toBeDefined();
    expect(furniture?.estimatedValue).toContain('₹');
    expect(furniture?.quantity).toBeDefined();
    expect(furniture?.timeline).toBeDefined();

    const plumbing = CANONICAL_OPPORTUNITIES.find((o) => o.id === 'opp-plumbing-01');
    expect(plumbing).toBeDefined();
    expect(plumbing?.title).toBe('Plumbing Services');
    expect(plumbing?.category).toBe('Building');
  });
});
