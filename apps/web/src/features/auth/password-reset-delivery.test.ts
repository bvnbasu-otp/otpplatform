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
  return { supabase: globalMock, setRememberDevice: vi.fn() };
});

import { supabase } from '@/lib/supabase';
import { describeNotificationStatus } from '@otp/domain';
import { requestWhatsAppPasswordReset } from './lib/password-reset-dispatch';
import { clearDispatchIdempotencyCache, resolveSupabaseEmailDispatch } from '@/features/notifications/lib/outbound-dispatch';

const mockSupabase = supabase as any;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('requestWhatsAppPasswordReset', () => {
  beforeEach(() => {
    clearDispatchIdempotencyCache();
    mockSupabase.rpc = vi.fn().mockResolvedValue({
      data: { ok: true, phone: '+919876543210', email: 'a@b.in', full_name: 'Asha', otp_code: '482913' },
      error: null,
    });
  });

  it('gateway accepted → ok with ACCEPTED delivery (not delivered)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'wamid-9' }));
    const res = await requestWhatsAppPasswordReset('a@b.in', { origin: 'https://otp.market', fetchImpl });
    expect(res.ok).toBe(true);
    expect(res.delivery?.status).toBe('ACCEPTED');
    expect(res.delivery?.deliveryConfirmed).toBe(false);
    const body = JSON.parse((fetchImpl.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.text).toContain('https://otp.market/reset-password?identifier=%2B919876543210');
  });

  it('gateway rejects → ok:false with failure copy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(500, {}));
    const res = await requestWhatsAppPasswordReset('a@b.in', { origin: 'https://otp.market', fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.delivery?.status).toBe('FAILED');
    expect(res.error).toBeTruthy();
    expect(res.error!.toLowerCase()).not.toMatch(/sent successfully|delivered/);
  });

  it('timeout → ok:false, outcome unknown', async () => {
    const fetchImpl = vi.fn(
      (_u: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_r, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
        ),
    ) as unknown as typeof fetch;
    const res = await requestWhatsAppPasswordReset('a@b.in', { origin: 'https://otp.market', fetchImpl, timeoutMs: 20 });
    expect(res.ok).toBe(false);
    expect(res.delivery?.outcomeUnknown).toBe(true);
  });

  it('no phone or code on the account → ok:false without calling the gateway', async () => {
    mockSupabase.rpc = vi.fn().mockResolvedValue({ data: { ok: true, email: 'a@b.in' }, error: null });
    const fetchImpl = vi.fn();
    const res = await requestWhatsAppPasswordReset('a@b.in', { origin: 'https://otp.market', fetchImpl });
    expect(res.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('RPC error → ok:false', async () => {
    mockSupabase.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'User not found' } });
    const res = await requestWhatsAppPasswordReset('x', { fetchImpl: vi.fn() });
    expect(res).toEqual({ ok: false, error: 'User not found' });
  });
});

describe('password reset and sign-in code copy', () => {
  it('email reset with no Supabase error reads as submitted, delivery unconfirmed', () => {
    const copy = describeNotificationStatus(resolveSupabaseEmailDispatch(null), 'PASSWORD_RESET');
    expect(copy.status).toBe('SUBMITTED');
    expect(copy.message).toBe('We submitted your email password reset message. Delivery is not confirmed yet.');
  });

  it('auth screens no longer claim a message was sent or delivered', () => {
    const files = [
      resolve(__dirname, 'components/SignInForm.tsx'),
      resolve(__dirname, '../portal/pages/ResetPasswordPage.tsx'),
      resolve(__dirname, 'AuthProvider.tsx'),
      resolve(__dirname, 'lib/password-reset-dispatch.ts'),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/sent successfully|Message sent|Sent!|We sent|email sent to|delivered to/i);
    }
  });
});
