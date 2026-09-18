import { describe, expect, it } from 'vitest';
import {
  calculateDisputeSlaDeadline,
  canEscalateDispute,
  getNextEscalationLevel,
  isSlaBreached,
  validateDisputeAmount,
  validateDisputeTransition,
} from './dispute-escalation';

describe('Dispute Resolution & Exception Escalation Domain Engine', () => {
  it('calculates SLA deadline strictly by severity', () => {
    const openedAt = '2026-09-18T10:00:00.000Z';

    const critical = calculateDisputeSlaDeadline(openedAt, 'CRITICAL');
    expect(critical).toBe('2026-09-19T10:00:00.000Z'); // +24 hours

    const high = calculateDisputeSlaDeadline(openedAt, 'HIGH');
    expect(high).toBe('2026-09-20T10:00:00.000Z'); // +48 hours

    const medium = calculateDisputeSlaDeadline(openedAt, 'MEDIUM');
    expect(medium).toBe('2026-09-21T10:00:00.000Z'); // +72 hours

    const low = calculateDisputeSlaDeadline(openedAt, 'LOW');
    expect(low).toBe('2026-09-23T10:00:00.000Z'); // +120 hours
  });

  it('accurately identifies SLA breaches', () => {
    const deadline = '2026-09-19T10:00:00.000Z';
    expect(isSlaBreached(deadline, '2026-09-19T09:59:59.000Z')).toBe(false);
    expect(isSlaBreached(deadline, '2026-09-19T10:00:01.000Z')).toBe(true);
  });

  it('manages escalation levels with ceiling at level 4', () => {
    expect(getNextEscalationLevel(1)).toBe(2);
    expect(getNextEscalationLevel(2)).toBe(3);
    expect(getNextEscalationLevel(3)).toBe(4);
    expect(getNextEscalationLevel(4)).toBe(4);

    expect(canEscalateDispute('OPEN', 1)).toBe(true);
    expect(canEscalateDispute('ESCALATED', 3)).toBe(true);
    expect(canEscalateDispute('ESCALATED', 4)).toBe(false);
    expect(canEscalateDispute('RESOLVED', 2)).toBe(false);
    expect(canEscalateDispute('CLOSED', 1)).toBe(false);
  });

  it('validates legal dispute status transitions', () => {
    expect(validateDisputeTransition('OPEN', 'UNDER_REVIEW')).toBe(true);
    expect(validateDisputeTransition('UNDER_REVIEW', 'ESCALATED')).toBe(true);
    expect(validateDisputeTransition('ESCALATED', 'RESOLVED')).toBe(true);
    expect(validateDisputeTransition('RESOLVED', 'CLOSED')).toBe(true);
    expect(validateDisputeTransition('CLOSED', 'OPEN')).toBe(false);
    expect(validateDisputeTransition('WITHDRAWN', 'ESCALATED')).toBe(false);
  });

  it('validates dispute monetary values', () => {
    expect(validateDisputeAmount(0)).toBe(true);
    expect(validateDisputeAmount(50000, 100000)).toBe(true);
    expect(validateDisputeAmount(150000, 100000)).toBe(false);
    expect(validateDisputeAmount(-100)).toBe(false);
    expect(validateDisputeAmount(NaN)).toBe(false);
  });
});
