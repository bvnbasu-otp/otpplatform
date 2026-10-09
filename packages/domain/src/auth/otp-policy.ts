/**
 * Canonical OTP lengths for client copy and input validation.
 *
 * WhatsApp / custom RPC: `private.generate_numeric_otp(6)` (migration 00208).
 * Email (GoTrue): `GOTRUE_MAILER_OTP_LENGTH` in docker-compose.prod.yml — not a custom RPC.
 */
export const WHATSAPP_OTP_DIGITS = 6 as const;

/** Mirrors hosted GoTrue mailer OTP length (see docker-compose.prod.yml). */
export const GOTRUE_MAILER_OTP_LENGTH = 6 as const;

/** Max length for one-time codes entered in auth UI (email + WhatsApp). */
export const AUTH_OTP_CODE_MAX_LENGTH = GOTRUE_MAILER_OTP_LENGTH;

export function authOtpDigitLabel(): string {
  return `${AUTH_OTP_CODE_MAX_LENGTH}-digit`;
}

export function authOtpDigitLabelTitleCase(): string {
  return `${AUTH_OTP_CODE_MAX_LENGTH}-Digit`;
}

/** Short numeric codes from URL params; PKCE / magic-link tokens are longer. */
export function isLikelyShortOtpToken(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.length > 0 && trimmed.length <= AUTH_OTP_CODE_MAX_LENGTH;
}

export function isLikelyPkceOrLongRecoveryToken(raw: string): boolean {
  return raw.trim().length > AUTH_OTP_CODE_MAX_LENGTH;
}
