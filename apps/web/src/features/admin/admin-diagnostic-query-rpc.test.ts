import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { buildDiagnosticRpcPayload, runDiagnosticOperation, runDiagnosticQuery } from './api/admin-ops';

describe('admin diagnostic RPC payload (00262 allowlist)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: { success: true, rowsCount: 0, data: [] }, error: null });
  });

  it('builds bare operation keys and JSON payloads with limit', () => {
    expect(buildDiagnosticRpcPayload('stalled_order_diagnostics')).toBe('stalled_order_diagnostics');
    expect(buildDiagnosticRpcPayload('quote_submission_integrity', { limit: 20 })).toBe(
      JSON.stringify({ operation: 'quote_submission_integrity', params: { limit: 20 } })
    );
  });

  it('calls admin_run_diagnostic_query with operation payload', async () => {
    await runDiagnosticOperation('state_transition_audit_trail', { limit: 30 });
    expect(rpcMock).toHaveBeenCalledWith('admin_run_diagnostic_query', {
      p_sql: JSON.stringify({
        operation: 'state_transition_audit_trail',
        params: { limit: 30 },
      }),
    });
  });

  it('rejects invalid operation keys at the client boundary', () => {
    expect(() => buildDiagnosticRpcPayload('SELECT_bad')).toThrow(/Invalid diagnostic operation key/);
    expect(() => buildDiagnosticRpcPayload('')).toThrow(/Invalid diagnostic operation key/);
    expect(() => buildDiagnosticRpcPayload('not-a-valid-key!')).toThrow(/Invalid diagnostic operation key/);
    expect(() => buildDiagnosticRpcPayload('unknown_operation_xyz')).not.toThrow();
  });

  it('runDiagnosticQuery forwards payload verbatim (server must enforce 00262 allowlist)', async () => {
    await runDiagnosticQuery('SELECT * FROM auth.users');
    expect(rpcMock).toHaveBeenCalledWith('admin_run_diagnostic_query', {
      p_sql: 'SELECT * FROM auth.users',
    });
    await runDiagnosticQuery('{"operation":"bogus_op","params":{"limit":9999}}');
    expect(rpcMock).toHaveBeenLastCalledWith('admin_run_diagnostic_query', {
      p_sql: '{"operation":"bogus_op","params":{"limit":9999}}',
    });
  });
});
