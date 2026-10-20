import { describe, expect, it } from 'vitest';
import { shouldBlockForPasswordPolicy, isPasswordExemptPath } from './components/PasswordExpiryGate';

describe('password policy gate', () => {
  it('allows reset-password while change is required', () => {
    expect(isPasswordExemptPath('/reset-password')).toBe(true);
    expect(
      shouldBlockForPasswordPolicy(
        { enforced: true, exempt: false, mustChangePassword: true, expiresAt: null, daysRemaining: 0, warnLevel: null },
        '/reset-password',
      ),
    ).toBe(false);
  });

  it('blocks protected routes when password change is required', () => {
    expect(
      shouldBlockForPasswordPolicy(
        { enforced: true, exempt: false, mustChangePassword: true, expiresAt: null, daysRemaining: 0, warnLevel: null },
        '/dashboard',
      ),
    ).toBe(true);
  });

  it('does not block when policy is exempt', () => {
    expect(
      shouldBlockForPasswordPolicy(
        { enforced: false, exempt: true, mustChangePassword: false, expiresAt: null, daysRemaining: null, warnLevel: null },
        '/dashboard',
      ),
    ).toBe(false);
  });
});
