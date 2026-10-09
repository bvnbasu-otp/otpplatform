import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
    functions: { invoke: vi.fn() },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock, setRememberDevice: vi.fn() };
});

import { supabase } from '@/lib/supabase';
import { describeNotificationStatus } from '@otp/domain';
import { requestWhatsAppPasswordReset } from './lib/password-reset-dispatch';
import { resolveSupabaseEmailDispatch } from '@/features/notifications/lib/outbound-dispatch';

const mockSupabase = supabase as any;

/**
 * D-21 + A-30: `requestWhatsAppPasswordReset` no longer calls
 * `request_whatsapp_password_reset` directly (service_role-only as of
 * migration 00208) and no longer dispatches WhatsApp itself via a `/waha`
 * gateway fetch. It calls the `otp-dispatch` edge function once and is told
 * success/failure only — no phone, no email, no code ever comes back to
 * this module, per the "no destination detail" response-shape decision.
 */
describe('requestWhatsAppPasswordReset', () => {
  beforeEach(() => {
    mockSupabase.functions = { invoke: vi.fn() };
  });

  it('server dispatch succeeds → ok with SUBMITTED delivery (not delivered)', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({ data: { ok: true, status: 'SUBMITTED' }, error: null });
    const res = await requestWhatsAppPasswordReset('a@b.in');
    expect(res.ok).toBe(true);
    expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('otp-dispatch', {
      body: { purpose: 'PASSWORD_RESET', identifier: 'a@b.in' },
    });
  });

  it('server dispatch fails → ok:false with failure copy, no destination detail', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: { ok: false, error: 'We could not issue a verification code right now. Please try again shortly.' },
      error: null,
    });
    const res = await requestWhatsAppPasswordReset('a@b.in');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.error!.toLowerCase()).not.toMatch(/sent successfully|delivered/);
    expect(res.error).not.toMatch(/@|\+91|\d{6,}/); // no email/phone echoed back
  });

  it('network-level failure reaching the edge function → ok:false, outcome unknown', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({ data: null, error: { message: 'network error' } });
    const res = await requestWhatsAppPasswordReset('a@b.in');
    expect(res.ok).toBe(false);
    expect(res.delivery?.outcomeUnknown).toBe(true);
  });

  it('empty identifier → ok:false without calling the edge function', async () => {
    const res = await requestWhatsAppPasswordReset('   ');
    expect(res.ok).toBe(false);
    expect(mockSupabase.functions.invoke).not.toHaveBeenCalled();
  });

  it('unknown account and "no phone on file" get the identical generic error (no enumeration)', async () => {
    mockSupabase.functions.invoke.mockResolvedValue({
      data: { ok: false, error: 'We could not issue a verification code right now. Please try again shortly.' },
      error: null,
    });
    const unknownAccount = await requestWhatsAppPasswordReset('nobody@nowhere.in');
    const noPhoneAccount = await requestWhatsAppPasswordReset('emailonly@company.in');
    expect(unknownAccount.error).toBe(noPhoneAccount.error);
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

  it('password reset and sign-in OTP copy uses six-digit policy (not eight)', () => {
    const files = [
      resolve(__dirname, 'components/SignInForm.tsx'),
      resolve(__dirname, '../portal/pages/ResetPasswordPage.tsx'),
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).toMatch(/AUTH_OTP_CODE_MAX_LENGTH|authOtpDigitLabel/);
      expect(source, file).not.toMatch(/8-digit|8 digit|Eight-digit|eight-digit|maxLength=\{8\}/i);
    }
  });

  it('password-reset-dispatch.ts never contains a plaintext OTP code or destination detail', () => {
    const source = readFileSync(resolve(__dirname, 'lib/password-reset-dispatch.ts'), 'utf8');
    expect(source).not.toMatch(/otp_code/);
    expect(source).not.toMatch(/res\.phone|res\.email/);
  });
});
