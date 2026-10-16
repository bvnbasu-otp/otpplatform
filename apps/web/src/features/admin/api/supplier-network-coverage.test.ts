import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchSupplierNetworkRecoveryJobs,
  prepareLocationNetworkViaCoverageService,
  retrySupplierNetworkRecovery,
} from './supplier-network-coverage';

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

  it('reads durable recovery status through the Admin-authorized Edge endpoint', async () => {
    invoke.mockResolvedValue({ data: { ok: true, jobs: [{ scope_key: 'scope-1', status: 'queued' }] }, error: null });
    const result = await fetchSupplierNetworkRecoveryJobs();
    expect(invoke).toHaveBeenCalledWith('location-pin-coverage', {
      body: { mode: 'list_recovery_jobs', limit: 50 },
    });
    expect(result).toMatchObject({ ok: true, jobs: [{ scope_key: 'scope-1', status: 'queued' }] });
  });

  it('requests a retry by stored scope key without accepting client supplier IDs', async () => {
    invoke.mockResolvedValue({ data: { ok: true, status: 'QUEUED', message: 'Coverage retry queued.' }, error: null });
    const result = await retrySupplierNetworkRecovery('scope-1');
    expect(invoke).toHaveBeenCalledWith('location-pin-coverage', {
      body: { mode: 'retry_recovery_job', scopeKey: 'scope-1' },
    });
    expect(result).toEqual({ ok: true, message: 'Coverage retry queued.' });
  });
});
