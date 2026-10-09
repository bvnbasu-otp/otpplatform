import { describe, expect, it } from 'vitest';
import {
  AUTH_OTP_CODE_MAX_LENGTH,
  GOTRUE_MAILER_OTP_LENGTH,
  WHATSAPP_OTP_DIGITS,
  authOtpDigitLabel,
  isLikelyPkceOrLongRecoveryToken,
  isLikelyShortOtpToken,
} from './otp-policy';

describe('otp-policy', () => {
  it('WhatsApp and GoTrue email OTP lengths are both six digits', () => {
    expect(WHATSAPP_OTP_DIGITS).toBe(6);
    expect(GOTRUE_MAILER_OTP_LENGTH).toBe(6);
    expect(AUTH_OTP_CODE_MAX_LENGTH).toBe(6);
  });

  it('labels and token heuristics match six-digit policy', () => {
    expect(authOtpDigitLabel()).toBe('6-digit');
    expect(isLikelyShortOtpToken('123456')).toBe(true);
    expect(isLikelyShortOtpToken('1234567')).toBe(false);
    expect(isLikelyPkceOrLongRecoveryToken('abcdefgh')).toBe(true);
  });
});
