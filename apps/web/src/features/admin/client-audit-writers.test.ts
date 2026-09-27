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
import { emitAdminTelemetryEvent } from './api/admin-telemetry';
import { clearAuditLogsAndNotifications, purgeTransactionalData } from './api/admin-ops';

const mock = supabase as unknown as {
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  auth: { getUser: ReturnType<typeof vi.fn> };
};

let inserts: string[];

function auditRpcCalls(): Record<string, unknown>[] {
  return mock.rpc.mock.calls.filter((c) => c[0] === 'log_client_audit_event').map((c) => c[1] as Record<string, unknown>);
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
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
  mock.auth.getUser = vi.fn().mockResolvedValue({ data: { user: { id: 'auth-user-1' } }, error: null });
});

describe('admin audit writers use log_client_audit_event, never a direct insert', () => {
  it('emitAdminTelemetryEvent sends the event without an actor', async () => {
    const res = await emitAdminTelemetryEvent({
      eventType: 'admin.tenant_context.switched',
      entityType: 'BUYER',
      entityId: 'org-9',
      action: 'SWITCH',
      reason: 'support',
    });
    expect(res).toEqual({ ok: true });
    const [call] = auditRpcCalls();
    expect(call).toMatchObject({
      p_event_type: 'admin.tenant_context.switched',
      p_entity_type: 'BUYER',
      p_entity_id: 'org-9',
    });
    expect((call?.p_payload as Record<string, unknown>).action).toBe('SWITCH');
    expect((call?.p_payload as Record<string, unknown>).reason).toBe('support');
    expect(JSON.stringify(call)).not.toContain('auth-user-1');
    expect(inserts).toEqual([]);
  });

  it('emitAdminTelemetryEvent reports a server refusal', async () => {
    mock.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'Access denied' }, error: null });
    const res = await emitAdminTelemetryEvent({ eventType: 'admin.x', entityType: 'SYSTEM', entityId: 'e', action: 'A' });
    expect(res).toEqual({ ok: false, error: 'Access denied' });
  });

  it('purgeTransactionalData client fallback records the reset with an entity id', async () => {
    const res = await purgeTransactionalData('TOKEN');
    expect(res.ok).toBe(true);
    const [call] = auditRpcCalls();
    expect(call).toMatchObject({
      p_event_type: 'admin.clean_production_reset',
      p_entity_type: 'DATABASE_RESET',
      p_entity_id: 'all_transactional_data',
    });
    expect((call?.p_payload as Record<string, unknown>).method).toBe('client_cascade_fallback');
    expect(inserts).toEqual([]);
  });

  it('clearAuditLogsAndNotifications client fallback records the purge with its mode', async () => {
    const res = await clearAuditLogsAndNotifications('DEMO');
    expect(res.ok).toBe(true);
    const [call] = auditRpcCalls();
    expect(call).toMatchObject({
      p_event_type: 'admin.audit_logs_purged',
      p_entity_type: 'AUDIT_SYSTEM',
      p_entity_id: 'mode_demo',
      p_is_demo: true,
    });
    expect(inserts).toEqual([]);
  });
});
