import { describe, expect, it } from 'vitest';
import { formatEventType } from '../types/audit';

describe('formatEventType', () => {
  it('formats dot-separated event types', () => {
    expect(formatEventType('payment.verified')).toBe('Payment · Verified');
    expect(formatEventType('work_order.completed')).toBe('Work order · Completed');
  });
});
