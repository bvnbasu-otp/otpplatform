/**
 * Canonical password complexity and demo/QA convention helpers.
 * Server SQL validators mirror these rules (migration 00303+).
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_VALIDITY_DAYS = 90;
export const PASSWORD_WARN_DAYS_14 = 14;
export const PASSWORD_WARN_DAYS_3 = 3;
export const PASSWORD_HISTORY_COUNT = 3;

/** ASCII punctuation allowed as "special" (aligned with product decision §11). */
export const ASCII_SPECIAL_CHARACTERS = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

const UPPER_RE = /[A-Z]/;
const LOWER_RE = /[a-z]/;
const DIGIT_RE = /[0-9]/;
const SPECIAL_RE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

export type PasswordValidationCode =
  | 'TOO_SHORT'
  | 'MISSING_UPPER'
  | 'MISSING_LOWER'
  | 'MISSING_DIGIT'
  | 'MISSING_SPECIAL';

export interface PasswordValidationResult {
  valid: boolean;
  codes: PasswordValidationCode[];
  /** User-facing messages without echoing the password. */
  messages: string[];
}

export function validatePasswordComplexity(password: string): PasswordValidationResult {
  const codes: PasswordValidationCode[] = [];
  const messages: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    codes.push('TOO_SHORT');
    messages.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (!UPPER_RE.test(password)) {
    codes.push('MISSING_UPPER');
    messages.push('Include at least one uppercase letter (A–Z).');
  }
  if (!LOWER_RE.test(password)) {
    codes.push('MISSING_LOWER');
    messages.push('Include at least one lowercase letter (a–z).');
  }
  if (!DIGIT_RE.test(password)) {
    codes.push('MISSING_DIGIT');
    messages.push('Include at least one digit (0–9).');
  }
  if (!SPECIAL_RE.test(password)) {
    codes.push('MISSING_SPECIAL');
    messages.push(`Include at least one special character (for example: ${ASCII_SPECIAL_CHARACTERS.slice(0, 8)}…).`);
  }

  return { valid: codes.length === 0, codes, messages };
}

/**
 * Demo/QA email convention: local part contains `demo` or `qa` as a token
 * (surrounded by start/end or non-letters), case-insensitive.
 */
export function matchesDemoQaEmailConvention(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = email.split('@')[0]?.toLowerCase() ?? '';
  return /(^|[^a-z])demo([^a-z]|$)/.test(local) || /(^|[^a-z])qa([^a-z]|$)/.test(local);
}

export type PasswordWarnLevel = null | '14' | '3';

export interface PasswordPolicyView {
  enforced: boolean;
  exempt: boolean;
  mustChangePassword: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  warnLevel: PasswordWarnLevel;
}

export function computePasswordPolicyView(input: {
  passwordChangedAt: Date | string | null;
  exempt: boolean;
  now?: Date;
}): PasswordPolicyView {
  if (input.exempt) {
    return {
      enforced: false,
      exempt: true,
      mustChangePassword: false,
      expiresAt: null,
      daysRemaining: null,
      warnLevel: null,
    };
  }

  const now = input.now ?? new Date();
  const changed =
    input.passwordChangedAt instanceof Date
      ? input.passwordChangedAt
      : input.passwordChangedAt
        ? new Date(input.passwordChangedAt)
        : null;

  if (!changed || Number.isNaN(changed.getTime())) {
    return {
      enforced: true,
      exempt: false,
      mustChangePassword: true,
      expiresAt: null,
      daysRemaining: null,
      warnLevel: null,
    };
  }

  const expiresAt = new Date(changed.getTime());
  expiresAt.setUTCDate(expiresAt.getUTCDate() + PASSWORD_VALIDITY_DAYS);

  const msRemaining = expiresAt.getTime() - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  const mustChangePassword = msRemaining <= 0;

  let warnLevel: PasswordWarnLevel = null;
  if (!mustChangePassword) {
    if (daysRemaining <= PASSWORD_WARN_DAYS_3) warnLevel = '3';
    else if (daysRemaining <= PASSWORD_WARN_DAYS_14) warnLevel = '14';
  }

  return {
    enforced: true,
    exempt: false,
    mustChangePassword,
    expiresAt: expiresAt.toISOString(),
    daysRemaining,
    warnLevel,
  };
}
