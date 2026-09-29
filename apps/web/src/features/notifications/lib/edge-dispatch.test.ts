import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__EDGE_DISPATCH_SUPABASE__ || {
    functions: { invoke: vi.fn() },
  };
  (globalThis as any).__EDGE_DISPATCH_SUPABASE__ = globalMock;
  return { supabase: globalMock };
});

import { supabase } from '@/lib/supabase';
import { invokeEdgeFunction } from './edge-dispatch';

const mockSupabase = supabase as any;

describe('invokeEdgeFunction HTTP error bodies', () => {
  beforeEach(() => {
    mockSupabase.functions.invoke = vi.fn();
  });

  it('maps a structured 503 JSON body to FAILED (not outcome-unknown network loss)', async () => {
    const response = new Response(JSON.stringify({ ok: false, error: 'Messaging is not configured', status: 'FAILED' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
    mockSupabase.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: response },
    });

    const { result, delivery } = await invokeEdgeFunction('onboarding-notify', { requestId: 'r1', kind: 'SUBMITTED' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Messaging is not configured');
    expect(delivery.status).toBe('FAILED');
    expect(delivery.outcomeUnknown).toBe(false);
  });
});
