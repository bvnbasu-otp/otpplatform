import { describe, it, expect, vi } from 'vitest';
import { PIN_ONLY_WARMING_CATEGORY } from '@otp/domain';
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
  it('does not issue warming without a server-issued signup request ID', () => {
    invoke.mockClear();
    queueBuyerPinDiscovery({
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('queues PIN-only discovery without inventing a procurement category', () => {
    invoke.mockClear();
    queueBuyerPinDiscovery({
      requestId: 'signup-request-id',
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
    });
    expect(invoke).toHaveBeenCalledWith(
      'location-pin-coverage',
      expect.objectContaining({
        body: expect.objectContaining({
          asyncMode: true,
          pincode: '560048',
          signupRequestId: 'signup-request-id',
          category: PIN_ONLY_WARMING_CATEGORY,
          discoveryContext: 'BUYER_ONBOARDING',
        }),
      }),
    );
  });
});
