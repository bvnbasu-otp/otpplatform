import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, from, countQuery } = vi.hoisted(() => {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.or = vi.fn(() => query);
  query.then = (resolve: (value: { count: number }) => void) => resolve({ count: 13876 });
  return {
    rpc: vi.fn(),
    from: vi.fn(() => query),
    countQuery: query,
  };
});

vi.mock('@/lib/supabase', () => ({ supabase: { rpc, from } }));
vi.mock('@/features/audit/api/log-client-audit-event', () => ({
  logClientAuditEvent: vi.fn(),
}));

import {
  fetchAdminAuditLogs,
  fetchLiveTransactions,
  fetchSellerOrders,
  fetchSupportTickets,
} from './api/admin-ops';

describe('admin record pagination requests', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockClear();
    countQuery.select.mockClear();
    countQuery.eq.mockClear();
    countQuery.or.mockClear();
  });

  it('requests one look-ahead buyer row and sends the actual offset', async () => {
    const rows = Array.from({ length: 51 }, (_, id) => ({ requirement_id: String(id) }));
    rpc.mockResolvedValueOnce({ data: rows, error: null });

    const result = await fetchLiveTransactions({ limit: 50, offset: 100, mode: 'DEMO' });

    expect(rpc).toHaveBeenCalledWith('admin_get_live_transactions', expect.objectContaining({
      p_limit: 51,
      p_offset: 100,
      p_mode: 'DEMO',
    }));
    expect(result.transactions).toHaveLength(50);
    expect(result.hasMore).toBe(true);
  });

  it('requests one look-ahead seller row and detects a final full page', async () => {
    const rows = Array.from({ length: 50 }, (_, id) => ({ id: String(id) }));
    rpc.mockResolvedValueOnce({ data: rows, error: null });

    const result = await fetchSellerOrders({ limit: 50, offset: 50, mode: 'PROD' });

    expect(rpc).toHaveBeenCalledWith('admin_get_seller_orders', expect.objectContaining({
      p_limit: 51,
      p_offset: 50,
      p_mode: 'PROD',
    }));
    expect(result.orders).toHaveLength(50);
    expect(result.hasMore).toBe(false);
  });

  it('sends audit offsets and returns an exact scoped total', async () => {
    rpc.mockResolvedValueOnce({
      data: { ok: true, logs: [{ id: 'log-51' }], active_mode: 'DEMO' },
      error: null,
    });

    const result = await fetchAdminAuditLogs({
      entityType: 'RFQ',
      limit: 50,
      offset: 50,
      mode: 'DEMO',
    });

    expect(rpc).toHaveBeenCalledWith('admin_get_audit_trail', expect.objectContaining({
      p_entity_type: 'RFQ',
      p_limit: 50,
      p_offset: 50,
      p_mode: 'DEMO',
    }));
    expect(countQuery.eq).toHaveBeenCalledWith('entity_type', 'RFQ');
    expect(countQuery.eq).toHaveBeenCalledWith('is_demo', true);
    expect(result.totalCount).toBe(13876);
  });

  it('sends support-ticket offset and retains the backend total', async () => {
    rpc.mockResolvedValueOnce({
      data: { tickets: [{ id: 'ticket-51' }], count: 101, active_mode: 'DEMO' },
      error: null,
    });

    const result = await fetchSupportTickets({ limit: 50, offset: 50, mode: 'DEMO' });

    expect(rpc).toHaveBeenCalledWith('admin_get_support_tickets', expect.objectContaining({
      p_limit: 50,
      p_offset: 50,
      p_mode: 'DEMO',
    }));
    expect(result.count).toBe(101);
  });
});
