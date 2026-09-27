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
import { logClientAuditEvent } from './api/log-client-audit-event';

const mock = supabase as unknown as { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn> };

function auditRpcCalls(): Record<string, unknown>[] {
  return mock.rpc.mock.calls.filter((c) => c[0] === 'log_client_audit_event').map((c) => c[1] as Record<string, unknown>);
}

beforeEach(() => {
  mock.from.mockReset();
  mock.rpc.mockReset();
  mock.rpc.mockResolvedValue({ data: { ok: true, id: 'audit-1' }, error: null });
});

describe('logClientAuditEvent', () => {
  it('calls the RPC with the event fields and no actor', async () => {
    const res = await logClientAuditEvent({
      eventType: 'admin.x',
      entityType: 'SYSTEM',
      entityId: 'e1',
      payload: { a: 1 },
      organizationId: 'org-1',
      isDemo: true,
    });
    expect(res).toEqual({ ok: true, id: 'audit-1' });
    expect(auditRpcCalls()).toEqual([
      {
        p_event_type: 'admin.x',
        p_entity_type: 'SYSTEM',
        p_entity_id: 'e1',
        p_payload: { a: 1 },
        p_organization_id: 'org-1',
        p_is_demo: true,
      },
    ]);
    expect(JSON.stringify(auditRpcCalls())).not.toContain('actor');
    expect(mock.from).not.toHaveBeenCalled();
  });

  it('defaults optional fields to null / empty payload', async () => {
    await logClientAuditEvent({ eventType: 'admin.y', entityType: 'SYSTEM', entityId: 'e2' });
    expect(auditRpcCalls()[0]).toMatchObject({ p_payload: {}, p_organization_id: null, p_is_demo: null });
  });

  it('surfaces transport errors and server refusals', async () => {
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });
    expect(await logClientAuditEvent({ eventType: 'admin.x', entityType: 'SYSTEM', entityId: 'e' })).toEqual({
      ok: false,
      error: 'network down',
    });
    mock.rpc.mockResolvedValueOnce({ data: { ok: false, error: 'Access denied' }, error: null });
    expect(await logClientAuditEvent({ eventType: 'admin.x', entityType: 'SYSTEM', entityId: 'e' })).toEqual({
      ok: false,
      error: 'Access denied',
    });
    mock.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await logClientAuditEvent({ eventType: 'admin.x', entityType: 'SYSTEM', entityId: 'e' })).toEqual({
      ok: false,
      error: 'Audit event was not recorded',
    });
  });
});
