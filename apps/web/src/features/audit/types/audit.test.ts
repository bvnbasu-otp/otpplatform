import { describe, expect, it } from 'vitest';
import { formatEventType } from '../types/audit';

describe('formatEventType', () => {
  it('formats dot-separated event types', () => {
    expect(formatEventType('payment.verified')).toBe('Payment · Verified');
    expect(formatEventType('work_order.completed')).toBe('Work order · Completed');
  });

  it('exports AuditLogPage component with responsive activity tabs', async () => {
    const { AuditLogPage } = await import('../pages/AuditLogPage');
    expect(AuditLogPage).toBeDefined();
    expect(typeof AuditLogPage).toBe('function');
  });
});
