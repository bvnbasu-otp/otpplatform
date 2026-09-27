import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for this session's checkpoint changes to:
 *  - api/admin-ops.ts            (D-28: reviewSignupRequest is RPC-only, no fallback)
 *  - components/AdminUsersActivityPanel.tsx (B-01/A-29: guaranteed per-item approval notice)
 *  - types/admin.ts              (A-29: activation_required on AdminReviewSignupResponse)
 */

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    functions: { invoke: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

import { supabase } from '@/lib/supabase';
import { reviewSignupRequest } from './api/admin-ops';

const mockSupabase = supabase as unknown as {
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
};

describe('reviewSignupRequest (D-28: RPC-only, no client-side fallback)', () => {
  beforeEach(() => {
    mockSupabase.rpc = vi.fn();
    mockSupabase.from = vi.fn();
  });

  it('calls admin_review_signup_request exactly once with the expected params and returns its payload verbatim, including activation_required', async () => {
    const rpcPayload = {
      ok: true,
      status: 'ONBOARDED',
      side: 'BUYER',
      email: 'new.buyer@example.com',
      activation_required: true,
    };
    mockSupabase.rpc.mockResolvedValueOnce({ data: rpcPayload, error: null });

    const res = await reviewSignupRequest('req-1', 'APPROVE', 'looks good');

    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(mockSupabase.rpc).toHaveBeenCalledWith('admin_review_signup_request', {
      p_request_id: 'req-1',
      p_action: 'APPROVE',
      p_notes: 'looks good',
      p_initial_password: 'Welcome@OTP2026!',
    });
    // Response must flow straight through, unmodified - including the new
    // activation_required flag, which is what callers now key off instead
    // of a returned password.
    expect(res).toEqual(rpcPayload);
    expect(res.activation_required).toBe(true);
    // No direct-table fallback of any kind was attempted.
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('never falls back to a direct table write when the RPC reports an authorization/logic failure', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: { ok: false, error: 'Only the assigned reviewer may approve this request' },
      error: null,
    });

    const res = await reviewSignupRequest('req-2', 'APPROVE');

    expect(res).toEqual({
      ok: false,
      status: 'FAILED',
      error: 'Only the assigned reviewer may approve this request',
    });
    // Before D-28 this exact failure would have triggered an alias RPC call
    // and then a direct signup_requests/profiles/organizations/suppliers
    // write. Neither exists any more: exactly one RPC call, ever.
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('never falls back to a direct table write when the RPC call itself throws (network/transport error)', async () => {
    mockSupabase.rpc.mockRejectedValueOnce(new Error('fetch failed'));

    const res = await reviewSignupRequest('req-3', 'REJECT');

    expect(res).toEqual({
      ok: false,
      status: 'FAILED',
      error: 'fetch failed',
    });
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('surfaces a Postgres-level RPC error message rather than swallowing it into a generic one', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'permission denied for function admin_review_signup_request' },
    });

    const res = await reviewSignupRequest('req-4', 'APPROVE');

    expect(res.ok).toBe(false);
    expect(res.error).toBe('permission denied for function admin_review_signup_request');
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe('AdminUsersActivityPanel approval notices (B-01/A-29 source-level regression checks)', () => {
  // This project's test environment runs vitest with `environment: 'node'`
  // (see apps/web/vitest.config.ts) — there is no jsdom/DOM and no
  // @testing-library/react dependency, so event-driven interaction tests on
  // this ~2300-line stateful component are not possible here. Consistent
  // with the existing convention in this feature area (see
  // account-lifecycle.test.ts's "the admin users panel does not reference
  // delete RPCs" check, and fulfillment/tds-withholding-panel.test.tsx's
  // regex-on-source assertions), this scopes real, specific regression
  // assertions against the actual handler source rather than a vacuous
  // "component can be constructed" smoke test.
  const source = readFileSync(resolve(__dirname, 'components/AdminUsersActivityPanel.tsx'), 'utf8');

  function extractHandler(startMarker: string, endMarker: string): string {
    const start = source.indexOf(startMarker);
    expect(start, `expected to find "${startMarker}" in AdminUsersActivityPanel.tsx`).toBeGreaterThanOrEqual(0);
    const end = source.indexOf(endMarker, start);
    expect(end, `expected to find "${endMarker}" after "${startMarker}"`).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  const handleReview = extractHandler(
    "const handleReview = async (request: AdminSignupRequest, action: 'APPROVE' | 'REJECT') => {",
    'const handleDirectApproveUser',
  );

  const handleApproveAllPending = extractHandler(
    'const handleApproveAllPending = async () => {',
    'const selectedCount =',
  );

  it('single approve dispatches exactly one guaranteed onboarding-notify call, awaited, only on APPROVE', () => {
    expect(handleReview).toMatch(/await invokeEdgeFunction\('onboarding-notify',/);
    expect(handleReview).toMatch(/kind:\s*'APPROVED'/);
    // Gated on the approve branch, not fired for REJECT.
    expect(handleReview).toMatch(/if \(action === 'APPROVE'\)\s*\{[\s\S]*await invokeEdgeFunction/);
  });

  it('single approve reports a failed notice to the admin instead of a blanket success banner', () => {
    expect(handleReview).toMatch(/notifyRes\.ok/);
    expect(handleReview).toMatch(/FAILED to send/);
    expect(handleReview).toMatch(/type: notifSummary\.includes\('FAILED'\) \? 'error' : 'success'/);
  });

  it('single approve no longer uses the removed resetPasswordForEmail / WhatsApp-with-password bypass', () => {
    expect(handleReview).not.toMatch(/resetPasswordForEmail/);
    expect(handleReview).not.toMatch(/sendWhatsAppNotification/);
    expect(handleReview).not.toMatch(/temporary_password/);
  });

  it('bulk approve awaits the onboarding notice per item, sequentially inside the loop (not batched, not fire-and-forget)', () => {
    expect(handleApproveAllPending).toMatch(/for \(const req of pendingReqs\)/);
    // The notify call must appear textually inside the for-loop body, after
    // the RPC's own success check, and be awaited directly (no .then(),
    // no Promise.all/allSettled across items).
    const loopBody = handleApproveAllPending.slice(handleApproveAllPending.indexOf('for (const req of pendingReqs)'));
    expect(loopBody).toMatch(/if \(!res\.ok\) continue;/);
    expect(loopBody).toMatch(/await invokeEdgeFunction\('onboarding-notify',/);
    expect(loopBody.indexOf('await invokeEdgeFunction')).toBeGreaterThan(loopBody.indexOf('successCount++'));
    expect(handleApproveAllPending).not.toMatch(/Promise\.all/);
    expect(handleApproveAllPending).not.toMatch(/\.then\(/);
  });

  it('bulk approve counts per-item notice failures and reflects them in the final banner instead of reporting blanket success', () => {
    expect(handleApproveAllPending).toMatch(/let notifyFailureCount = 0;/);
    expect(handleApproveAllPending).toMatch(/notifyFailureCount\+\+;/);
    // The banner type and copy must depend on notifyFailureCount, not just
    // on successCount - a run where every RPC succeeded but every notice
    // failed must still surface as an error, not a green checkmark.
    expect(handleApproveAllPending).toMatch(/type: notifyFailureCount > 0 \? 'error' : 'success'/);
    expect(handleApproveAllPending).toMatch(/activation notice\(s\) FAILED to send/);
  });

  it('bulk approve never swallows a per-item exception silently out of the loop', () => {
    // A thrown error for one item (RPC or notify) must be caught and logged
    // per-item so the loop continues to the remaining pending requests
    // rather than aborting the whole batch.
    expect(handleApproveAllPending).toMatch(/catch \(e\) \{\s*\n\s*console\.warn\('Bulk approve item failed:', req\.id, e\);/);
  });
});
