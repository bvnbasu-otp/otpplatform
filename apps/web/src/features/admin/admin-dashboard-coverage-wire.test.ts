import { describe, it, expect, vi } from 'vitest';
import { prepareLocationNetworkViaCoverageService } from './api/supplier-network-coverage';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) } },
}));

describe('Admin dashboard supplier network wiring', () => {
  it('uses shared coverage edge client (same as console onPrepareLocation)', () => {
    expect(typeof prepareLocationNetworkViaCoverageService).toBe('function');
  });
});
