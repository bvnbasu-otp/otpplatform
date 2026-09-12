import { describe, it, expect, beforeEach } from 'vitest';
import {
  evaluateRouteAccess,
  clearSensitiveClientState,
  type RouteAccessEvaluationInput,
} from './ProtectedRoute';
import { SIGNED_OUT_CONTEXT } from '@/features/roles';

function createMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe('Security & Route Guard Audit — ProtectedRoute & RBAC Enforcement', () => {
  beforeEach(() => {
    const mockSession = createMockStorage();
    const mockLocal = createMockStorage();
    (globalThis as any).sessionStorage = mockSession;
    (globalThis as any).localStorage = mockLocal;
    (globalThis as any).window = {
      sessionStorage: mockSession,
      localStorage: mockLocal,
    };
  });

  it('redirects unauthenticated visitor from /admin to /login?redirect=/admin and requests state clearing', () => {
    const input: RouteAccessEvaluationInput = {
      session: null,
      user: null,
      context: SIGNED_OUT_CONTEXT,
      pathname: '/admin',
      requireAdmin: true,
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('REDIRECT');
    if (verdict.action === 'REDIRECT') {
      expect(verdict.target).toBe('/login?redirect=%2Fadmin');
      expect(verdict.clearState).toBe(true);
    }
  });

  it('redirects unauthenticated visitor from /purchase-orders/po-999 to /login with encoded redirect query', () => {
    const input: RouteAccessEvaluationInput = {
      session: null,
      user: null,
      context: SIGNED_OUT_CONTEXT,
      pathname: '/purchase-orders/po-999',
      search: '?tab=fulfillment',
      allowedRoles: ['BUYER', 'SUPPLIER', 'ADMIN'],
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('REDIRECT');
    if (verdict.action === 'REDIRECT') {
      expect(verdict.target).toBe(
        '/login?redirect=%2Fpurchase-orders%2Fpo-999%3Ftab%3Dfulfillment'
      );
      expect(verdict.clearState).toBe(true);
    }
  });

  it('blocks non-admin authenticated users from accessing /admin and redirects them to /dashboard', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-buyer-1', email: 'buyer@corp.test' } },
      user: { id: 'usr-buyer-1', email: 'buyer@corp.test' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        side: 'BUYER',
        isPlatformAdmin: false,
      },
      pathname: '/admin',
      requireAdmin: true,
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('REDIRECT');
    if (verdict.action === 'REDIRECT') {
      expect(verdict.target).toBe('/dashboard');
      expect(verdict.clearState).toBe(true);
    }
  });

  it('allows verified platform SuperAdmin into /admin without redirection', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-admin-root', email: 'bvnbasu@gmail.com' } },
      user: { id: 'usr-admin-root', email: 'bvnbasu@gmail.com' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        isPlatformAdmin: true,
        email: 'bvnbasu@gmail.com',
      },
      pathname: '/admin',
      requireAdmin: true,
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('ALLOW');
  });

  it('allows authenticated buyer to access /purchase-orders', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-buyer-1', email: 'procurement@apex.test' } },
      user: { id: 'usr-buyer-1', email: 'procurement@apex.test' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        side: 'BUYER',
        isPlatformAdmin: false,
      },
      pathname: '/purchase-orders',
      allowedRoles: ['BUYER', 'SUPPLIER', 'ADMIN'],
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('ALLOW');
  });

  it('allows authenticated supplier to access /supplier/purchase-orders', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-supp-1', email: 'orders@precisionparts.test' } },
      user: { id: 'usr-supp-1', email: 'orders@precisionparts.test' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        side: 'SUPPLIER',
        isPlatformAdmin: false,
      },
      pathname: '/supplier/purchase-orders',
      allowedRoles: ['BUYER', 'SUPPLIER', 'ADMIN'],
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('ALLOW');
  });

  it('returns BLOCKED verdict when user has administrative hold', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-blocked', email: 'fraud@suspicious.test' } },
      user: { id: 'usr-blocked', email: 'fraud@suspicious.test' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        side: 'SUPPLIER',
        isBlocked: true,
        blockedReason: 'Compliance verification pending',
        isPlatformAdmin: false,
      },
      pathname: '/dashboard',
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('BLOCKED');
    if (verdict.action === 'BLOCKED') {
      expect(verdict.reason).toBe('Compliance verification pending');
    }
  });

  it('returns ONBOARDING verdict when new account needs role assignment', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-new', email: 'newbie@otp.test' } },
      user: { id: 'usr-new', email: 'newbie@otp.test' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        needsOnboarding: true,
        isPlatformAdmin: false,
      },
      pathname: '/dashboard',
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('ONBOARDING');
  });

  it('allows authenticated user with unassigned/null side into multi-role routes like /purchase-orders', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-pending-1', email: 'pending@corp.test' } },
      user: { id: 'usr-pending-1', email: 'pending@corp.test' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        side: null,
        isPlatformAdmin: false,
      },
      pathname: '/purchase-orders',
      allowedRoles: ['BUYER', 'SUPPLIER', 'ADMIN'],
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('ALLOW');
  });

  it('redirects authenticated buyer attempting to access supplier-only route to /dashboard instead of /login', () => {
    const input: RouteAccessEvaluationInput = {
      session: { user: { id: 'usr-buyer-1', email: 'buyer@corp.test' } },
      user: { id: 'usr-buyer-1', email: 'buyer@corp.test' },
      context: {
        ...SIGNED_OUT_CONTEXT,
        signedIn: true,
        side: 'BUYER',
        isPlatformAdmin: false,
      },
      pathname: '/supplier/capabilities',
      allowedRoles: ['SUPPLIER'],
    };

    const verdict = evaluateRouteAccess(input);
    expect(verdict.action).toBe('REDIRECT');
    if (verdict.action === 'REDIRECT') {
      expect(verdict.target).toBe('/dashboard');
      expect(verdict.clearState).toBe(true);
    }
  });

  it('clearSensitiveClientState wipes all prefixed sensitive items and retains safe preferences', () => {
    sessionStorage.setItem('admin_secret', '123');
    sessionStorage.setItem('diagnostic_data', '456');
    sessionStorage.setItem('sensitive_info', '789');
    sessionStorage.setItem('user_theme_preference', 'dark');

    clearSensitiveClientState();

    expect(sessionStorage.getItem('admin_secret')).toBeNull();
    expect(sessionStorage.getItem('diagnostic_data')).toBeNull();
    expect(sessionStorage.getItem('sensitive_info')).toBeNull();
    expect(sessionStorage.getItem('user_theme_preference')).toBe('dark');
  });
});
