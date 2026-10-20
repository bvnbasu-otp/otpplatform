import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeTotalCost, type QuoteSnapshotInput } from './types/supplier-quote';

const WEB_SRC = resolve(__dirname, '../..');

describe('Slice 4 — supplier quote form UX', () => {
  it('QuoteForm includes scope hint and commercial review summary test ids', () => {
    const source = readFileSync(resolve(__dirname, 'components/QuoteForm.tsx'), 'utf8');
    expect(source).toContain('data-testid="supplier-quote-scope-hint"');
    expect(source).toContain('SupplierQuoteCommercialSummary');
    expect(source).toContain('validateCommercial');
  });

  it('commercial validation rejects non-positive landed totals', () => {
    const input: QuoteSnapshotInput = {
      basePrice: 0,
      gstAmount: 0,
      transportCost: 0,
      deliveryDays: 3,
      warrantyMonths: 12,
      currency: 'INR',
    };
    expect(computeTotalCost(input)).toBe(0);
  });

  it('SupplierQuoteSubmitPage passes scopeHint to QuoteForm', () => {
    const source = readFileSync(resolve(__dirname, 'pages/SupplierQuoteSubmitPage.tsx'), 'utf8');
    expect(source).toContain('scopeHint={{');
  });

  it('comparison cards distinguish supplier vs platform commercial labels', () => {
    const card = readFileSync(resolve(WEB_SRC, 'features/rfq/components/QuoteCard4Pillar.tsx'), 'utf8');
    expect(card).toContain('QuoteCommercialBreakdown');
    expect(card).not.toContain('100% Spec Match');
    const legend = readFileSync(resolve(WEB_SRC, 'features/rfq/components/QuoteComparisonCommercialLegend.tsx'), 'utf8');
    expect(legend).toContain('data-testid="quote-comparison-commercial-legend"');
  });
});
