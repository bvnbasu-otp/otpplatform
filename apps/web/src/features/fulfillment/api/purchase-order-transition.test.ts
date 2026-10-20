import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import { updatePurchaseOrderStatus } from './purchase-orders';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

describe('updatePurchaseOrderStatus client alignment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects illegal transitions before calling the database', async () => {
    const result = await updatePurchaseOrderStatus('po-1', 'COMPLETED', { fromStatus: 'ISSUED' });
    expect(result).toEqual({
      ok: false,
      error: 'Purchase order cannot move from ISSUED to COMPLETED.',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('allows legal transitions via transition_purchase_order RPC', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { ok: true }, error: null } as any);

    const poId = 'b507309c-828b-4a09-9488-bb2b923d6988';
    const result = await updatePurchaseOrderStatus(poId, 'ACCEPTED', { fromStatus: 'ISSUED' });
    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith('transition_purchase_order', {
      p_po_id: poId,
      p_to_status: 'ACCEPTED',
      p_expected_from_status: 'ISSUED',
    });
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
