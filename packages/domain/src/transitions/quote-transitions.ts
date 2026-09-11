import type { QuoteStatus, RfqStatus } from '../enums/procurement';

const ALLOWED: Partial<Record<QuoteStatus, readonly QuoteStatus[]>> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['REVISED', 'FINAL', 'WITHDRAWN'],
  REVISED: ['REVISED', 'FINAL', 'WITHDRAWN'],
  FINAL: ['SELECTED', 'NOT_SELECTED'],
};

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus): boolean {
  if (from === 'REVISED' && to === 'REVISED') return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function canSubmitQuoteRevision(
  rfqStatus: RfqStatus,
  quoteStatus: QuoteStatus,
): boolean {
  return rfqStatus === 'OPEN' && (quoteStatus === 'SUBMITTED' || quoteStatus === 'REVISED');
}

export function canSubmitFinalQuote(
  rfqStatus: RfqStatus,
  quoteStatus: QuoteStatus,
): boolean {
  return (
    rfqStatus === 'CLARIFICATION' &&
    (quoteStatus === 'SUBMITTED' || quoteStatus === 'REVISED')
  );
}

/**
 * A supplier locks their commercial terms while quoting is still live, whether
 * or not the RFQ went through a clarification round. Requiring CLARIFICATION
 * made the lifecycle unreachable: an RFQ cannot close without its minimum of
 * FINAL quotes, and it cannot come back to CLOSED once it has moved on to
 * clarification. See OTP-STATE-MACHINES.md, quote SUBMITTED -> FINAL.
 */
export function canFinalizeQuote(
  rfqStatus: RfqStatus,
  quoteStatus: QuoteStatus,
): boolean {
  return (
    (rfqStatus === 'OPEN' || rfqStatus === 'CLARIFICATION') &&
    (quoteStatus === 'SUBMITTED' || quoteStatus === 'REVISED')
  );
}
