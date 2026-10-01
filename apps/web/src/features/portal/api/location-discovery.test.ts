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
  it('does not queue discovery without an explicit category (avoids wrong scope key)', () => {
    invoke.mockClear();
    queueBuyerPinDiscovery({
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('queues non-blocking PIN discovery when category is provided', () => {
    invoke.mockClear();
    queueBuyerPinDiscovery({
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
      category: 'Painting & Waterproofing',
    });
    expect(invoke).toHaveBeenCalledWith(
      'location-pin-coverage',
      expect.objectContaining({
        body: expect.objectContaining({
          asyncMode: true,
          pincode: '560048',
          category: 'Painting & Waterproofing',
        }),
      }),
    );
  });
});
