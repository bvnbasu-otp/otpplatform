import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { prepareLocationNetworkViaCoverageService } from './api/supplier-network-coverage';

vi.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) } },
}));

describe('Admin dashboard supplier network wiring', () => {
  it('uses shared coverage edge client (same as console onPrepareLocation)', () => {
    expect(typeof prepareLocationNetworkViaCoverageService).toBe('function');
  });

  it('declares internal console operational modules', () => {
    const navSource = readFileSync(resolve(__dirname, 'types/admin-navigation.ts'), 'utf8');
    expect(navSource).toContain('INTERNAL_USERS');
    expect(navSource).toContain('INTERNAL_RBAC');
    expect(navSource).toContain('STAFF_REFERRALS');
  });
});
