import { describe, expect, it, vi, beforeEach } from 'vitest';

const { from, query } = vi.hoisted(() => {
  const q: any = {};
  q.select = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.range = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.then = (resolve: (value: { data: any[]; count: number; error: null }) => void) =>
    resolve({ data: [], count: 0, error: null });
  return {
    from: vi.fn(() => q),
    query: q,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { from },
}));

import { fetchAuditEvents } from './api/fetch-audit-events';

describe('audit event pagination', () => {
  beforeEach(() => {
    from.mockClear();
    query.select.mockClear();
    query.order.mockClear();
    query.range.mockClear();
    query.eq.mockClear();
  });

  it('queries audit_events with exact count, range, and maps totalCount', async () => {
    const mockRows = [
      {
        id: 'evt-1',
        event_type: 'rfq.created',
        actor_id: 'user-1',
        organization_id: 'org-1',
        entity_type: 'rfq',
        entity_id: 'rfq-1',
        payload: { title: 'Test' },
        occurred_at: '2026-10-21T10:00:00Z',
        correlation_id: 'corr-1',
      },
    ];

    query.then = (resolve: any) =>
      resolve({ data: mockRows, count: 42, error: null });

    const result = await fetchAuditEvents({ limit: 10, offset: 20 });

    expect(from).toHaveBeenCalledWith('audit_events');
    expect(query.select).toHaveBeenCalledWith(
      expect.stringContaining('id, event_type'),
      { count: 'exact' },
    );
    expect(query.range).toHaveBeenCalledWith(20, 29);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalCount).toBe(42);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]?.id).toBe('evt-1');
    }
  });

  it('filters by rfqId when provided', async () => {
    query.then = (resolve: any) =>
      resolve({ data: [], count: 0, error: null });

    await fetchAuditEvents({ rfqId: 'rfq-xyz', limit: 50, offset: 0 });

    expect(query.eq).toHaveBeenCalledWith('entity_id', 'rfq-xyz');
  });
});
