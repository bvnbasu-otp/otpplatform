import { describe, expect, it } from 'vitest';
import {
  computePasswordPolicyView,
  matchesDemoQaEmailConvention,
  PASSWORD_VALIDITY_DAYS,
  validatePasswordComplexity,
} from './password-policy';

describe('password-policy', () => {
  it('accepts a valid password with all character classes', () => {
    const r = validatePasswordComplexity('Secure1!');
    expect(r.valid).toBe(true);
    expect(r.codes).toEqual([]);
  });

  it('rejects each missing character class and short passwords', () => {
    expect(validatePasswordComplexity('short1!').valid).toBe(false);
    expect(validatePasswordComplexity('alllower1!').codes).toContain('MISSING_UPPER');
    expect(validatePasswordComplexity('ALLUPPER1!').codes).toContain('MISSING_LOWER');
    expect(validatePasswordComplexity('NoDigits!').codes).toContain('MISSING_DIGIT');
    expect(validatePasswordComplexity('NoSpecial1').codes).toContain('MISSING_SPECIAL');
  });

  it('allows eight-character boundary and longer passphrases', () => {
    expect(validatePasswordComplexity('Aa1!aaaa').valid).toBe(true);
    expect(validatePasswordComplexity('Aa1!-' + 'x'.repeat(40)).valid).toBe(true);
  });

  it('does not trim passwords (spaces count toward length and classes)', () => {
    const withSpaces = ' Aa1!ab ';
    expect(withSpaces.length).toBeGreaterThanOrEqual(8);
    expect(validatePasswordComplexity(withSpaces).valid).toBe(true);
  });

  it('matches demo/qa email convention case-insensitively', () => {
    expect(matchesDemoQaEmailConvention('qa-buyer@otp.test')).toBe(true);
    expect(matchesDemoQaEmailConvention('DEMO.user@example.com')).toBe(true);
    expect(matchesDemoQaEmailConvention('buyer@otp.test')).toBe(false);
    expect(matchesDemoQaEmailConvention('mosque@example.com')).toBe(false);
  });

  it('computes expiry, warnings, and rotation requirement', () => {
    const changed = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date(changed.getTime() + (PASSWORD_VALIDITY_DAYS - 10) * 24 * 60 * 60 * 1000);
    const view = computePasswordPolicyView({ passwordChangedAt: changed, exempt: false, now });
    expect(view.mustChangePassword).toBe(false);
    expect(view.warnLevel).toBe('14');

    const expiredNow = new Date(changed.getTime() + (PASSWORD_VALIDITY_DAYS + 1) * 24 * 60 * 60 * 1000);
    const expired = computePasswordPolicyView({ passwordChangedAt: changed, exempt: false, now: expiredNow });
    expect(expired.mustChangePassword).toBe(true);
  });

  it('exempt accounts skip rotation enforcement', () => {
    const view = computePasswordPolicyView({ passwordChangedAt: null, exempt: true });
    expect(view.exempt).toBe(true);
    expect(view.mustChangePassword).toBe(false);
  });
});
