import { describe, expect, it } from 'vitest';
import {
  buildCommercialBreakdown,
  buyerQuoteStatusLabel,
  formatQuoteInr,
} from './quote-commercial-present';

describe('quote-commercial-present', () => {
  it('formats INR for display', () => {
    expect(formatQuoteInr(7800)).toContain('7');
  });

  it('detects when component sum matches stored total', () => {
    const ok = buildCommercialBreakdown({
      basePrice: 6610,
      gstAmount: 1190,
      transportCost: 0,
      totalCost: 7800,
    });
    expect(ok.componentsMatchTotal).toBe(true);
    expect(ok.lines.find((l) => l.key === 'total')?.source).toBe('platform');
  });

  it('flags mismatch without altering totals', () => {
    const bad = buildCommercialBreakdown({
      basePrice: 100,
      gstAmount: 18,
      transportCost: 0,
      totalCost: 200,
    });
    expect(bad.componentsMatchTotal).toBe(false);
  });

  it('labels draft quotes as not comparable', () => {
    expect(buyerQuoteStatusLabel('DRAFT')).toContain('not in comparison');
    expect(buyerQuoteStatusLabel('SUBMITTED')).toContain('submitted');
  });
});
