import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/supabase';
import { clearDispatchIdempotencyCache } from '@/features/notifications/lib/outbound-dispatch';
import { requestProfileCredentialOtp, verifyAndUpdateProfileCredential } from './api/profile';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || { from: vi.fn(), rpc: vi.fn(), auth: { getUser: vi.fn() } };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

const rpcOk = (otp = '482913') =>
  vi.mocked(supabase.rpc).mockResolvedValueOnce({
    data: { ok: true, otp_code: otp, credential_value: '+919840012345', full_name: 'Asha' },
    error: null,
  } as any);

describe('Profile credential verification never proves ownership on screen', () => {
  beforeEach(() => {
    vi.mocked(supabase.rpc).mockReset();
    clearDispatchIdempotencyCache();
    vi.stubEnv('VITE_DEMO_MODE', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('RPC error is a failure, never a fake 123456 success', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'boom' } } as any);
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res).toEqual({ ok: false, error: 'boom' });
    expect(JSON.stringify(res)).not.toContain('123456');
  });

  it('unauthenticated response is a failure, not a generated code', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { ok: false, error: 'Authentication required' }, error: null } as any);
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res.ok).toBe(false);
  });

  it('accepted WhatsApp dispatch returns no code and does not claim delivery', async () => {
    rpcOk();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'wamid.1' }), { status: 201 })));
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.otpCode).toBeUndefined();
      expect(res.message).toMatch(/not confirmed/i);
      expect(res.message).not.toMatch(/sent successfully|delivered/i);
    }
  });

  it('failed WhatsApp dispatch is reported as a failure and the code is not revealed', async () => {
    rpcOk();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    const res = await requestProfileCredentialOtp('PHONE', '9840012345');
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('482913');
  });

  it('email codes are not claimed as sent when no email sender exists', async () => {
    rpcOk('777111');
    const res = await requestProfileCredentialOtp('EMAIL', 'a@b.in');
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res)).not.toContain('777111');
  });

  it('demo builds may show the code, explicitly labelled', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true');
    rpcOk('555000');
    const res = await requestProfileCredentialOtp('EMAIL', 'a@b.in');
    expect(res).toMatchObject({ ok: true, otpCode: '555000' });
  });

  it('a server-rejected code is never turned into "verified" by entering 123456', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { ok: false, error: 'Invalid code' }, error: null } as any);
    const rejected = await verifyAndUpdateProfileCredential('PHONE', '9840012345', '123456');
    expect(rejected).toEqual({ ok: false, error: 'Invalid code' });

    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'offline' } } as any);
    const offline = await verifyAndUpdateProfileCredential('PHONE', '9840012345', '123456');
    expect(offline.ok).toBe(false);
  });

  it('ProfilePage never renders the raw code outside the explicit demo label', () => {
    const src = readFileSync(resolve(__dirname, 'pages/ProfilePage.tsx'), 'utf8');
    expect(src).not.toMatch(/\(Code: \$\{res\.otpCode\}\)/);
    expect(src).not.toMatch(/sent via WhatsApp!/);
  });
});
