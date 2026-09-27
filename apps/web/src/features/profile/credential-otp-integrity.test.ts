import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { requestProfileCredentialOtp, verifyAndUpdateProfileCredential } from './api/profile';

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

/**
 * D-21 + A-30 + demo-visibility fix (product decision 3): `requestProfileCredentialOtp`
 * no longer calls `request_profile_credential_otp` directly (that RPC is
 * service_role-only as of migration 00208) nor dispatches WhatsApp itself.
 * It calls the `otp-dispatch` edge function and is told success/failure —
 * the plaintext code is never in its response unless the *server* env var
 * `OTP_DEBUG_REVEAL_CODE` put it there as `debugCode`, never a client build
 * flag.
 */
describe('Profile credential verification never proves ownership on screen', () => {
  beforeEach(() => {
    vi.mocked(supabase.functions.invoke).mockReset?.();
    (supabase as any).functions = { invoke: vi.fn() };
    vi.stubEnv('VITE_DEMO_MODE', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('edge function failure is a failure, never a fake 123456 success', async () => {
    (supabase as any).functions.invoke.mockResolvedValueOnce({ data: { ok: false, error: 'boom' }, error: null });
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res).toEqual({ ok: false, error: 'boom' });
    expect(JSON.stringify(res)).not.toContain('123456');
  });

  it('unauthenticated response is a failure, not a generated code', async () => {
    (supabase as any).functions.invoke.mockResolvedValueOnce({
      data: { ok: false, error: 'Authentication required' },
      error: null,
    });
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res.ok).toBe(false);
  });

  it('accepted dispatch returns no code and does not claim delivery', async () => {
    (supabase as any).functions.invoke.mockResolvedValueOnce({ data: { ok: true, status: 'SUBMITTED' }, error: null });
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.otpCode).toBeUndefined();
      expect(res.message).toMatch(/not confirmed/i);
      expect(res.message).not.toMatch(/sent successfully|delivered/i);
    }
  });

  it('failed dispatch is reported as a failure and no code is revealed', async () => {
    (supabase as any).functions.invoke.mockResolvedValueOnce({
      data: { ok: false, error: 'We could not send the verification code. Please try again shortly.' },
      error: null,
    });
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('482913');
  });

  it('email codes are not claimed as sent when no email sender exists (server flag off)', async () => {
    (supabase as any).functions.invoke.mockResolvedValueOnce({
      data: { ok: false, error: 'Email verification codes cannot be sent yet in this pilot. Please verify a phone number instead.' },
      error: null,
    });
    const res = await requestProfileCredentialOtp('EMAIL', 'a@b.in');
    expect(res.ok).toBe(false);
  });

  it('server debug flag (not a client build flag) may echo the code, explicitly labelled', async () => {
    (supabase as any).functions.invoke.mockResolvedValueOnce({ data: { ok: true, debugCode: '555000' }, error: null });
    const res = await requestProfileCredentialOtp('EMAIL', 'a@b.in');
    expect(res).toMatchObject({ ok: true, otpCode: '555000' });
    expect(res.message).toMatch(/debug/i);
  });

  it('a server-rejected code is never turned into "verified" by entering 123456', async () => {
    vi.mocked(supabase.rpc).mockReset();
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { ok: false, error: 'Invalid code' }, error: null } as any);
    const rejected = await verifyAndUpdateProfileCredential('PHONE', '9840012345', '123456');
    expect(rejected).toEqual({ ok: false, error: 'Invalid code' });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as any);
    const offline = await verifyAndUpdateProfileCredential('PHONE', '9840012345', '123456');
    expect(offline.ok).toBe(false);
  });

  it('ProfilePage never renders the raw code outside the explicit demo/debug label', () => {
    const src = readFileSync(resolve(__dirname, 'pages/ProfilePage.tsx'), 'utf8');
    expect(src).not.toMatch(/\(Code: \$\{res\.otpCode\}\)/);
    expect(src).not.toMatch(/sent via WhatsApp!/);
  });

  it('no client-visible build flag controls whether the code is revealed', () => {
    const src = readFileSync(resolve(__dirname, 'api/profile.ts'), 'utf8');
    expect(src).not.toMatch(/VITE_DEMO_MODE/);
    expect(src).not.toMatch(/import\.meta\.env/);
  });
});
