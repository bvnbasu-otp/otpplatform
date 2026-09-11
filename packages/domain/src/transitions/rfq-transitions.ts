import type { RfqRevealStatus, RfqStatus } from '../enums/procurement';

const ALLOWED: Partial<Record<RfqStatus, readonly RfqStatus[]>> = {
  DRAFT: ['OPEN', 'CANCELLED'],
  OPEN: ['CLARIFICATION', 'CLOSED', 'CANCELLED'],
  CLARIFICATION: ['EVALUATING', 'CANCELLED'],
  CLOSED: ['EVALUATING', 'CANCELLED'],
  EVALUATING: ['AWARDED', 'CANCELLED'],
};

export function canTransitionRfq(from: RfqStatus, to: RfqStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}

export function canTransitionRfqReveal(
  from: RfqRevealStatus,
  to: RfqRevealStatus,
): boolean {
  return (from === 'PROTECTED' || from === 'BLIND') && to === 'REVEALED';
}
