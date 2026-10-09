import { describe, expect, it } from 'vitest';
import {
  AUTH_OTP_CODE_MAX_LENGTH,
  GOTRUE_MAILER_OTP_LENGTH,
  WHATSAPP_OTP_DIGITS,
  authOtpDigitLabel,
  isCompleteAuthOtpCode,
  isLikelyPkceOrLongRecoveryToken,
  isLikelyShortOtpToken,
  normalizeAuthOtpCodeInput,
} from './otp-policy';

describe('otp-policy', () => {
  it('WhatsApp and GoTrue email OTP lengths are both eight digits', () => {
    expect(WHATSAPP_OTP_DIGITS).toBe(8);
    expect(GOTRUE_MAILER_OTP_LENGTH).toBe(8);
    expect(AUTH_OTP_CODE_MAX_LENGTH).toBe(8);
  });

  it('labels and token heuristics match eight-digit policy', () => {
    expect(authOtpDigitLabel()).toBe('8-digit');
    expect(isLikelyShortOtpToken('12345678')).toBe(true);
    expect(isLikelyShortOtpToken('123456789')).toBe(false);
    expect(isLikelyPkceOrLongRecoveryToken('abcdefgh')).toBe(false);
    expect(isLikelyPkceOrLongRecoveryToken('abcdefghI')).toBe(true);
  });

  it('preserves leading zeros in normalized auth OTP input', () => {
    expect(normalizeAuthOtpCodeInput('00000000')).toBe('00000000');
    expect(normalizeAuthOtpCodeInput(' 00-00-00-00 ')).toBe('00000000');
    expect(isCompleteAuthOtpCode('00000000')).toBe(true);
    expect(isCompleteAuthOtpCode('1234567')).toBe(false);
  });

  it('caps input at eight digits but rejects nine-digit raw input on verify', () => {
    const nine = '123456789';
    expect(normalizeAuthOtpCodeInput(nine)).toBe('12345678');
    expect(isCompleteAuthOtpCode(nine)).toBe(false);
  });
});
