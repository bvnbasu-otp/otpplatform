import { describe, it, expect, vi } from 'vitest';
import { queueBuyerPinDiscovery } from './location-discovery';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke,
    },
  },
}));

describe('buyer location-discovery queue', () => {
  it('queues non-blocking PIN discovery via edge function', () => {
    queueBuyerPinDiscovery({
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
    });
    expect(invoke).toHaveBeenCalledWith(
      'location-pin-coverage',
      expect.objectContaining({
        body: expect.objectContaining({ asyncMode: true, pincode: '560048' }),
      }),
    );
  });
});
