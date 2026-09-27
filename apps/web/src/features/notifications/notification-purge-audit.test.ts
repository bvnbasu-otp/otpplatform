import { beforeEach, describe, expect, it, vi } from 'vitest';

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
import { notificationService } from './services/notificationService';

const mock = supabase as unknown as { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };

let inserts: string[];

function auditRpcCalls(): Record<string, unknown>[] {
  return mock.rpc.mock.calls.filter((c) => c[0] === 'log_client_audit_event').map((c) => c[1] as Record<string, unknown>);
}

beforeEach(() => {
  inserts = [];
  mock.from.mockReset();
  mock.rpc.mockReset();
  mock.from.mockImplementation((table: string) => {
    const chain = createSupabaseQueryMock({ data: [], error: null });
    chain.is = vi.fn(() => chain);
    chain.insert = vi.fn(() => {
      inserts.push(table);
      return chain;
    });
    return chain;
  });
  mock.rpc.mockImplementation(async (name: string) =>
    name === 'log_client_audit_event'
      ? { data: { ok: true, id: 'audit-1' }, error: null }
      : { data: null, error: { message: `${name} unavailable` } },
  );
});

describe('notificationService.clearAllNotifications fleet fallback', () => {
  it('records the purge through log_client_audit_event, never a direct insert', async () => {
    const res = await notificationService.clearAllNotifications(null, true, 'PROD');
    expect(res.ok).toBe(true);
    const [call] = auditRpcCalls();
    expect(call).toMatchObject({
      p_event_type: 'admin.notifications_purged',
      p_entity_type: 'NOTIFICATION_SYSTEM',
      p_entity_id: 'mode_prod',
      p_is_demo: false,
    });
    expect((call?.p_payload as Record<string, unknown>).method).toBe('client_fallback');
    expect(inserts).toEqual([]);
  });

  it('still clears when the audit RPC refuses', async () => {
    mock.rpc.mockImplementation(async (name: string) =>
      name === 'log_client_audit_event'
        ? { data: { ok: false, error: 'Access denied' }, error: null }
        : { data: null, error: { message: `${name} unavailable` } },
    );
    const res = await notificationService.clearAllNotifications(null, true, 'DEMO');
    expect(res.ok).toBe(true);
    expect(auditRpcCalls()[0]).toMatchObject({ p_entity_id: 'mode_demo', p_is_demo: true });
    expect(inserts).toEqual([]);
  });
});
