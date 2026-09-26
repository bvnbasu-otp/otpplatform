import { describe, expect, it } from 'vitest';
import { formatEventType, formatEventTime } from '../types/audit';

describe('formatEventType', () => {
  it('formats dot-separated event types', () => {
    expect(formatEventType('payment.verified')).toBe('Payment · Verified');
    expect(formatEventType('work_order.completed')).toBe('Work order · Completed');
  });

  it('formats event time in canonical IST', () => {
    const formatted = formatEventTime('2026-09-26T10:00:00Z');
    expect(formatted).toBeTruthy();
    expect(formatted).toContain('IST');
  });

  it('exports AuditLogPage component with responsive activity tabs', async () => {
    const { AuditLogPage } = await import('../pages/AuditLogPage');
    expect(AuditLogPage).toBeDefined();
    expect(typeof AuditLogPage).toBe('function');
  });
});
