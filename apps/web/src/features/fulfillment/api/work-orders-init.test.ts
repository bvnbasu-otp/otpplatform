import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { createWorkOrder } from './work-orders';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

describe('createWorkOrder initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns work_order_id from initialize_work_order RPC only', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { work_order_id: 'wo-rpc-1', status: 'NOT_STARTED' },
      error: null,
    } as any);

    const result = await createWorkOrder('po-1', 'sup-1', 'ignored title');
    expect(result).toEqual({ ok: true, workOrderId: 'wo-rpc-1' });
    expect(supabase.rpc).toHaveBeenCalledWith('initialize_work_order', { p_po_id: 'po-1' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('does not fall back to direct work_orders insert when RPC fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'Access denied' },
    } as any);

    const result = await createWorkOrder('po-1', 'sup-1', 'title');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Access denied/i);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reports failure when RPC succeeds without work_order_id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { status: 'NOT_STARTED' }, error: null } as any);

    const result = await createWorkOrder('po-1', 'sup-1', 'title');
    expect(result).toEqual({
      ok: false,
      error: 'Work order initialization did not return a work order id.',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
