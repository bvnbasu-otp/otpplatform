import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prepareLocationNetworkViaCoverageService } from './supplier-network-coverage';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke,
    },
  },
}));

describe('supplier-network-coverage admin API', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('invokes location-pin-coverage edge function with executeDiscovery flag', async () => {
    invoke.mockResolvedValue({ data: { ok: true, externalCallsExecuted: 0 }, error: null });
    await prepareLocationNetworkViaCoverageService({
      state: 'Karnataka',
      city: 'Bengaluru',
      pincode: '560048',
      category: 'Electrical & Automation',
      forceRefresh: false,
      executeDiscovery: false,
    });
    expect(invoke).toHaveBeenCalledWith('location-pin-coverage', {
      body: expect.objectContaining({ executeDiscovery: false, pincode: '560048' }),
    });
  });
});
