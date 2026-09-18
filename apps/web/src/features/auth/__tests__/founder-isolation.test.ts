import { describe, it, expect } from 'vitest';
import { isFounderEmail, isSuperAdminEmail, resolvePortalRole } from '../user-role';
import { evaluateRouteAccess } from '../ProtectedRoute';

describe('Founder vs Operations Red-Team Security & Isolation', () => {
  it('distinguishes Founder accounts from Operations SuperAdmin accounts', () => {
    // Founder accounts
    expect(isFounderEmail('bvnbasu@gmail.com')).toBe(true);
    expect(isFounderEmail('founder@otp.test')).toBe(true);

    // Operations / Support accounts (Admin, NOT Founder)
    expect(isFounderEmail('admin@otp.test')).toBe(false);
    expect(isFounderEmail('ops@otp.test')).toBe(false);

    // Both are recognized under SuperAdmin umbrella for platform ops
    expect(isSuperAdminEmail('bvnbasu@gmail.com')).toBe(true);
    expect(isSuperAdminEmail('admin@otp.test')).toBe(true);
    expect(isSuperAdminEmail('ops@otp.test')).toBe(true);
  });

  it('strictly isolates Founder-only routes from Operations Admin accounts', () => {
    // 1. Operations Admin accessing Founder-only route -> REDIRECT (BLOCKED)
    const opsResult = evaluateRouteAccess({
      session: { user: { id: 'ops-user-1', email: 'admin@otp.test' } },
      user: { id: 'ops-user-1', email: 'admin@otp.test' },
      context: { isPlatformAdmin: true, isFounder: false },
      pathname: '/founder',
      allowedRoles: ['FOUNDER'],
    });

    expect(opsResult.action).toBe('REDIRECT');
    expect(opsResult.target).toBe('/dashboard');

    // 2. Founder accessing Founder route -> ALLOW
    const founderResult = evaluateRouteAccess({
      session: { user: { id: 'founder-user-1', email: 'bvnbasu@gmail.com' } },
      user: { id: 'founder-user-1', email: 'bvnbasu@gmail.com' },
      context: { isPlatformAdmin: true, isFounder: true },
      pathname: '/founder',
      allowedRoles: ['FOUNDER'],
    });

    expect(founderResult.action).toBe('ALLOW');
  });

  it('allows Operations Admin on standard admin routes', () => {
    const adminResult = evaluateRouteAccess({
      session: { user: { id: 'ops-user-1', email: 'admin@otp.test' } },
      user: { id: 'ops-user-1', email: 'admin@otp.test' },
      context: { isPlatformAdmin: true, isFounder: false },
      pathname: '/admin',
      requireAdmin: true,
    });

    expect(adminResult.action).toBe('ALLOW');
  });
});
