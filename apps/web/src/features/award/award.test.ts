import { describe, expect, it } from 'vitest';

export interface AtomicAwardParams {
  rfqId: string;
  quoteId: string;
  justificationText: string;
  autoReveal?: boolean;
}

export function validateAwardPreconditions(
  rfq: { status: string; revealStatus: string; minQuotesRequired: number; minQuotesWaived?: boolean },
  quotes: Array<{ id: string; status: string }>,
  targetQuoteId: string,
  justificationText: string,
): { valid: boolean; error?: string } {
  if (rfq.status !== 'EVALUATING' && rfq.status !== 'OPEN' && rfq.status !== 'CLARIFICATION') {
    return { valid: false, error: `RFQ must be in evaluation state (currently ${rfq.status})` };
  }

  const targetQuote = quotes.find((q) => q.id === targetQuoteId);
  if (!targetQuote) {
    return { valid: false, error: 'Target quote not found in RFQ quotes' };
  }

  if (targetQuote.status === 'WITHDRAWN' || targetQuote.status === 'DRAFT') {
    return { valid: false, error: `Cannot award quote in ${targetQuote.status} state` };
  }

  if (!justificationText || justificationText.trim() === '') {
    return { valid: false, error: 'A written justification is mandatory for award' };
  }

  const validFinalQuotes = quotes.filter((q) => q.status === 'FINAL' || q.status === 'SUBMITTED' || q.status === 'REVISED');
  if (validFinalQuotes.length < rfq.minQuotesRequired && !rfq.minQuotesWaived) {
    return {
      valid: false,
      error: `RFQ requires ${rfq.minQuotesRequired} valid quotes, but only ${validFinalQuotes.length} exist`,
    };
  }

  return { valid: true };
}

describe('Atomic Award, Reveal & PO Preconditions Validation', () => {
  const sampleQuotes = [
    { id: 'q-1', status: 'SUBMITTED' },
    { id: 'q-2', status: 'SUBMITTED' },
    { id: 'q-3', status: 'SUBMITTED' },
  ];

  it('approves award when all competitive tension and justification conditions are met', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 3 };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', 'Optimal commercial terms and 5-year warranty.');
    expect(res.valid).toBe(true);
  });

  it('rejects award when written justification is empty', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 3 };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', '   ');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('justification is mandatory');
  });

  it('rejects award when minimum quotes required is not met and waiver is absent', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 4, minQuotesWaived: false };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', 'Valid justification.');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('requires 4 valid quotes');
  });

  it('allows award when minimum quotes is waived by committee', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 4, minQuotesWaived: true };
    const res = validateAwardPreconditions(rfq, sampleQuotes, 'q-1', 'Emergency procurement approved by secretary.');
    expect(res.valid).toBe(true);
  });

  it('rejects award on withdrawn or draft quotes', () => {
    const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 2 };
    const quotesWithWithdrawn = [
      { id: 'q-1', status: 'WITHDRAWN' },
      { id: 'q-2', status: 'SUBMITTED' },
    ];
    const res = validateAwardPreconditions(rfq, quotesWithWithdrawn, 'q-1', 'Valid justification.');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('WITHDRAWN');
  });
});
