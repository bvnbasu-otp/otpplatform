import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock('@/features/audit/api/log-client-audit-event', () => ({
  logClientAuditEvent: vi.fn(),
}));

import { collectAdminPages } from './api/admin-ops';

describe('admin fallback pagination', () => {
  it('collects every bounded page in order and removes boundary duplicates', async () => {
    const rows = Array.from({ length: 295 }, (_, index) => ({ id: `profile-${index}` }));
    const calls: Array<[number, number]> = [];

    const result = await collectAdminPages(async (from, to) => {
      calls.push([from, to]);
      const page = rows.slice(from, to + 1);
      return from === 200 ? [rows[199]!, ...page] : page;
    }, 200);

    expect(calls).toEqual([[0, 199], [200, 399]]);
    expect(result).toHaveLength(295);
    expect(result[0]?.id).toBe('profile-0');
    expect(result.at(-1)?.id).toBe('profile-294');
    expect(new Set(result.map((row) => row.id))).toHaveLength(295);
  });
});
