import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

import { supabase } from '@/lib/supabase';
import { createSupabaseQueryMock } from '@/lib/supabase-query-mock';
import {
  computeUndoTargets,
  effectiveSelection,
  isProtectedAdminUser,
  isRowBlocked,
  partitionOrganizationTargets,
  pruneSelectionToFiltered,
  selectAllFiltered,
  validateLifecycleReason,
} from './lib/account-lifecycle';
import { executeBulkDeactivation, executeBulkReactivation } from './lib/bulk-lifecycle-actions';
import * as adminOps from './api/admin-ops';

const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn>; from: ReturnType<typeof vi.fn> };

const rows = [
  { id: 'a' },
  { id: 'b' },
  { id: 'admin', isProtected: true },
  { id: 'c' },
];

describe('account lifecycle selection rules', () => {
  it('select-all selects only the filtered, non-protected rows', () => {
    const filtered = rows.filter((r) => r.id !== 'c');
    expect([...selectAllFiltered(filtered)].sort()).toEqual(['a', 'b']);
  });

  it('effective selection ignores selected rows hidden by the current filter', () => {
    const selected = new Set(['a', 'b', 'c', 'admin']);
    const filtered = rows.filter((r) => r.id === 'a' || r.id === 'admin');
    expect(effectiveSelection(filtered, selected)).toEqual(['a']);
    expect([...pruneSelectionToFiltered(filtered, selected)]).toEqual(['a']);
  });

  it('individual selection is respected', () => {
    expect(effectiveSelection(rows, new Set(['b']))).toEqual(['b']);
  });

  it('protects platform admins and super admins', () => {
    expect(isProtectedAdminUser({ isPlatformAdmin: true, side: 'BUYER', role: 'BUYER' } as any)).toBe(true);
    expect(isProtectedAdminUser({ isPlatformAdmin: false, side: 'ADMIN', role: 'X' } as any)).toBe(true);
    expect(isProtectedAdminUser({ isPlatformAdmin: false, side: 'BUYER', role: 'SUPER_ADMIN' } as any)).toBe(true);
    expect(isProtectedAdminUser({ isPlatformAdmin: false, side: 'BUYER', role: 'BUYER' } as any)).toBe(false);
  });

  it('detects blocked rows', () => {
    expect(isRowBlocked({ status: 'blocked' })).toBe(true);
    expect(isRowBlocked({ status: 'ACTIVE', blockedAt: '2026-01-01' })).toBe(true);
    expect(isRowBlocked({ status: 'ACTIVE' })).toBe(false);
  });
});

describe('validateLifecycleReason', () => {
  it('requires an explicit category', () => {
    expect(validateLifecycleReason('', 'legacy demo org').ok).toBe(false);
  });

  it('requires a written justification of at least 8 characters', () => {
    expect(validateLifecycleReason('Other', '   short ').ok).toBe(false);
    expect(validateLifecycleReason('Other', '').ok).toBe(false);
  });

  it('combines category and normalised details', () => {
    expect(validateLifecycleReason('Legacy / Demo Data Retirement', '  seeded   demo org ')).toEqual({
      ok: true,
      reason: 'Legacy / Demo Data Retirement: seeded demo org',
    });
  });
});

describe('organisation partition and undo targets', () => {
  it('splits suppliers and buyer orgs', () => {
    const orgs = [
      { id: 's1', entity_type: 'SUPPLIER' as const },
      { id: 'o1', entity_type: 'BUYER_ORG' as const },
      { id: 's2', entity_type: 'SUPPLIER' as const },
    ];
    expect(partitionOrganizationTargets(orgs, ['s1', 'o1'])).toEqual({ supplierIds: ['s1'], buyerOrgIds: ['o1'] });
  });

  it('undo only reactivates rows that were active before the action', () => {
    const before = [
      { id: 'a', status: 'ACTIVE' },
      { id: 'b', status: 'BLOCKED' },
      { id: 'c', status: 'ACTIVE' },
    ];
    expect(computeUndoTargets(before, ['a', 'b'], isRowBlocked)).toEqual(['a']);
  });
});

describe('executeBulkDeactivation / executeBulkReactivation', () => {
  beforeEach(() => {
    mockSupabase.rpc = vi.fn().mockResolvedValue({ data: { ok: true, count: 2 }, error: null });
    mockSupabase.from = vi.fn(() => createSupabaseQueryMock([]));
  });

  it('does not call any RPC when the reason is missing', async () => {
    const out = await executeBulkDeactivation({ type: 'USERS', ids: ['a'], reasonCategory: '', reasonDetails: 'long enough' });
    expect(out.ok).toBe(false);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();

    const short = await executeBulkDeactivation({ type: 'USERS', ids: ['a'], reasonCategory: 'Other', reasonDetails: 'x' });
    expect(short.ok).toBe(false);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  it('calls the audited block RPC with the reason and reports the server count', async () => {
    mockSupabase.rpc = vi.fn().mockResolvedValue({ data: { ok: true, count: 1 }, error: null });
    const out = await executeBulkDeactivation({
      type: 'USERS',
      ids: ['a', 'b'],
      reasonCategory: 'Legacy / Demo Data Retirement',
      reasonDetails: 'pre-pilot seeded account',
    });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_bulk_block_users', {
      p_user_ids: ['a', 'b'],
      p_reason: 'Legacy / Demo Data Retirement: pre-pilot seeded account',
    });
    expect(out).toEqual({ ok: true, count: 1, requested: 2 });
  });

  it('sends suppliers and buyer orgs in separate RPC calls', async () => {
    const organizations = [
      { id: 's1', entity_type: 'SUPPLIER' as const },
      { id: 'o1', entity_type: 'BUYER_ORG' as const },
    ];
    await executeBulkDeactivation({
      type: 'ORGANIZATIONS',
      ids: ['s1', 'o1'],
      organizations,
      reasonCategory: 'Other',
      reasonDetails: 'duplicate legacy record',
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_bulk_block_organizations', {
      p_org_ids: ['s1'],
      p_is_supplier: true,
      p_reason: 'Other: duplicate legacy record',
    });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_bulk_block_organizations', {
      p_org_ids: ['o1'],
      p_is_supplier: false,
      p_reason: 'Other: duplicate legacy record',
    });
  });

  it('surfaces RPC errors instead of falling back to direct table writes', async () => {
    mockSupabase.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Unauthorized' } });
    const out = await executeBulkDeactivation({
      type: 'USERS',
      ids: ['a'],
      reasonCategory: 'Other',
      reasonDetails: 'legacy demo account',
    });
    expect(out.ok).toBe(false);
    expect(out.error).toContain('Unauthorized');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('reactivation uses the unblock RPCs', async () => {
    await executeBulkReactivation({ type: 'USERS', ids: ['a'] });
    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_bulk_unblock_users', { p_user_ids: ['a'] });
  });

  it('never calls a delete RPC or a table delete', async () => {
    await executeBulkDeactivation({ type: 'USERS', ids: ['a'], reasonCategory: 'Other', reasonDetails: 'legacy demo account' });
    await executeBulkReactivation({ type: 'USERS', ids: ['a'] });
    for (const call of mockSupabase.rpc.mock.calls) {
      expect(String(call[0])).not.toMatch(/delete/i);
    }
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe('admin lifecycle surface has no hard delete', () => {
  it('admin-ops no longer exports bulk delete helpers', () => {
    expect((adminOps as Record<string, unknown>).bulkDeleteUsers).toBeUndefined();
    expect((adminOps as Record<string, unknown>).bulkDeleteOrganizations).toBeUndefined();
  });

  it('the admin users panel does not reference delete RPCs or helpers', () => {
    const source = readFileSync(resolve(__dirname, 'components/AdminUsersActivityPanel.tsx'), 'utf8');
    expect(source).not.toMatch(/admin_bulk_delete|bulkDelete|openDeleteModal/);
  });
});
