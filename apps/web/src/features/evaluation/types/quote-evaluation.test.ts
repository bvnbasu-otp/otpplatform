import { describe, expect, it } from 'vitest';
import { parseBreakdown } from './quote-evaluation';

describe('parseBreakdown', () => {
  it('reads the criteria and keeps the weights the score was computed against', () => {
    const { criteria, weights } = parseBreakdown({
      price: { weight: 60, raw: 42000, normalized: 100, contribution: 60, neutral: false },
      warranty: { weight: 40, raw: 12, normalized: 50, contribution: 20, neutral: false },
      _weights: { price: 60, warranty: 40 },
    });

    expect(weights).toEqual({ price: 60, warranty: 40 });
    expect(criteria.map((c) => c.code)).toEqual(['price', 'warranty']);
    expect(criteria[0]).toMatchObject({ raw: 42000, contribution: 60 });
  });

  it('orders criteria by how much of the decision they carry', () => {
    const { criteria } = parseBreakdown({
      delivery_time: { weight: 10, raw: 5, normalized: 80, contribution: 8 },
      price: { weight: 70, raw: 100, normalized: 90, contribution: 63 },
      warranty: { weight: 20, raw: 6, normalized: 40, contribution: 8 },
    });

    expect(criteria.map((c) => c.code)).toEqual(['price', 'warranty', 'delivery_time']);
  });

  it('keeps a criterion nobody answered rather than dropping it', () => {
    const { criteria } = parseBreakdown({
      certification: { weight: 25, raw: null, normalized: 50, contribution: 12.5, neutral: true },
    });

    expect(criteria).toHaveLength(1);
    expect(criteria[0]!.raw).toBeNull();
    expect(criteria[0]!.neutral).toBe(true);
  });

  it('survives a missing or malformed breakdown', () => {
    expect(parseBreakdown(null)).toEqual({ criteria: [], weights: {} });
    expect(parseBreakdown('not an object')).toEqual({ criteria: [], weights: {} });
    expect(parseBreakdown({ price: null }).criteria[0]).toMatchObject({
      code: 'price',
      weight: 0,
      neutral: false,
    });
  });
});
