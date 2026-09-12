import type { ReactNode } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { useRoleContext } from '@/features/roles/hooks/use-role-context';
import { isSuperAdminEmail } from './user-role';
import { RoleOnboardingPage } from '@/features/roles/pages/RoleOnboardingPage';
import { supabase } from '@/lib/supabase';

import type { RoleContext } from '@/features/roles/api/roles';

export type AllowedRole = 'ADMIN' | 'BUYER' | 'SUPPLIER';

export interface ProtectedRouteProps {
  children?: ReactNode;
  /** Allowed roles for this route. If not specified, any authenticated role is allowed. */
  allowedRoles?: AllowedRole[];
  /** Shortcut to enforce platform admin / SuperAdmin role only. */
  requireAdmin?: boolean;
  /** Whether onboarding completion is required (default true). */
  requireOnboardingComplete?: boolean;
  /** Custom fallback redirect for unauthorized authenticated users. */
  unauthorizedRedirect?: string;
}

export interface RouteAccessEvaluationInput {
  session: { user?: { id?: string; email?: string } } | null;
  user: { id?: string; email?: string } | null;
  context: Partial<RoleContext>;
  pathname: string;
  search?: string;
  allowedRoles?: AllowedRole[];
  requireAdmin?: boolean;
  requireOnboardingComplete?: boolean;
  unauthorizedRedirect?: string;
}

export type RouteAccessVerdict =
  | { action: 'ALLOW' }
  | { action: 'REDIRECT'; target: string; clearState?: boolean }
  | { action: 'BLOCKED'; reason?: string | null }
  | { action: 'ONBOARDING' };

/**
 * Pure access control evaluator for authentication and RBAC invariants.
 */
export function evaluateRouteAccess(input: RouteAccessEvaluationInput): RouteAccessVerdict {
  const fullPath = input.pathname + (input.search || '');
  const encodedRedirect = encodeURIComponent(fullPath);

  // 1. Session check: unauthenticated users redirect to login with return target
  if (!input.session || !input.user) {
    return {
      action: 'REDIRECT',
      target: `/login?redirect=${encodedRedirect}`,
      clearState: true,
    };
  }

  const userEmail = input.user?.email || input.context?.email;
  const isPlatformAdmin = Boolean(
    input.context?.isPlatformAdmin || isSuperAdminEmail(userEmail)
  );

  // 2. Blocked account hold check
  if (input.context?.isBlocked && !isPlatformAdmin) {
    return {
      action: 'BLOCKED',
      reason: input.context.blockedReason ?? null,
    };
  }

  // 3. Onboarding gate check
  if (
    input.context?.needsOnboarding &&
    !isPlatformAdmin &&
    input.requireOnboardingComplete !== false
  ) {
    return { action: 'ONBOARDING' };
  }

  // 4. Admin RBAC check
  if (input.requireAdmin && !isPlatformAdmin) {
    const target = input.unauthorizedRedirect || '/dashboard';
    return {
      action: 'REDIRECT',
      target,
      clearState: true,
    };
  }

  // 5. Specific Allowed Roles RBAC check
  if (input.allowedRoles && input.allowedRoles.length > 0) {
    const userSide = (
      input.context?.side || input.context?.activeRole?.side
    )?.toUpperCase() as 'BUYER' | 'SUPPLIER' | undefined;

    const allowsAdmin = input.allowedRoles.includes('ADMIN');
    const allowsBuyer = input.allowedRoles.includes('BUYER');
    const allowsSupplier = input.allowedRoles.includes('SUPPLIER');

    const hasAllowedRole =
      (allowsAdmin && isPlatformAdmin) ||
      (allowsBuyer && (userSide === 'BUYER' || isPlatformAdmin)) ||
      (allowsSupplier && (userSide === 'SUPPLIER' || isPlatformAdmin)) ||
      // If route allows both buyers and suppliers (e.g. general PO, ledger, tracking routes)
      (allowsBuyer && allowsSupplier) ||
      // If side is not explicitly set yet but user is authenticated and route is not admin-only
      (!userSide && (allowsBuyer || allowsSupplier));

    if (!hasAllowedRole) {
      const target =
        input.unauthorizedRedirect ||
        (userSide === 'SUPPLIER' ? '/supplier/purchase-orders' : '/dashboard');
      return {
        action: 'REDIRECT',
        target,
        clearState: true,
      };
    }
  }

  return { action: 'ALLOW' };
}

/**
 * Clears sensitive client state, cached diagnostics, and volatile session tokens
 * when an unauthorized navigation or role violation occurs.
 */
export function clearSensitiveClientState(customKeys?: string[]) {
  try {
    if (typeof window !== 'undefined') {
      if (customKeys && customKeys.length > 0) {
        for (const key of customKeys) {
          sessionStorage.removeItem(key);
          localStorage.removeItem(key);
        }
      } else {
        const sensitivePrefixes = [
          'admin_',
          'diagnostic_',
          'sensitive_',
          'cached_rfq_',
          'otp_admin_',
          'otp_sec_',
        ];
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const key = sessionStorage.key(i);
          if (key && sensitivePrefixes.some((p) => key.startsWith(p))) {
            sessionStorage.removeItem(key);
          }
        }
      }
    }
  } catch {
    // Ignore storage quota or access errors in restrictive environments
  }
}

/**
 * Centralized Route Guard & RBAC Enforcer
 *
 * Validates:
 * 1. Authentication: Active session existence.
 * 2. Account Health: Blocked / administrative hold status.
 * 3. Onboarding: Mandatory role selection for new accounts.
 * 4. RBAC: Role and SuperAdmin authorization requirements.
 *
 * Automatically preserves the requested destination in `?redirect=` URL parameter.
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  requireAdmin = false,
  requireOnboardingComplete = true,
  unauthorizedRedirect,
}: ProtectedRouteProps) {
  const { session, user, isLoading: authLoading } = useAuth();
  const { context, isLoading: roleLoading } = useRoleContext();
  const location = useLocation();

  const isLoading = authLoading || roleLoading;

  // 1. Loading State
  if (isLoading) {
    return (
      <div
        className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
        data-testid="route-guard-loading"
      >
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span>Verifying security credentials & workspace access…</span>
      </div>
    );
  }

  const verdict = evaluateRouteAccess({
    session,
    user,
    context,
    pathname: location.pathname,
    search: location.search,
    allowedRoles,
    requireAdmin,
    requireOnboardingComplete,
    unauthorizedRedirect,
  });

  if (verdict.action === 'REDIRECT') {
    if (verdict.clearState) {
      if (requireAdmin) {
        clearSensitiveClientState(['admin_diagnostics', 'admin_cached_queries', 'otp_admin_state']);
      } else {
        clearSensitiveClientState();
      }
    }
    return <Navigate to={verdict.target} replace />;
  }

  if (verdict.action === 'BLOCKED') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-lg animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive text-2xl font-bold">
            🚫
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">Account Restricted / Blocked</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            This account has been placed on administrative hold and cannot access procurement workspaces.
          </p>
          {verdict.reason && (
            <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-left text-xs text-destructive">
              <span className="font-semibold block mb-1">Administrative Note:</span>
              <span>{verdict.reason}</span>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <a
              href="mailto:bvnbasu@gmail.com?subject=Account%20Restriction%20Inquiry"
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition text-center"
            >
              Contact Platform Super Admin
            </a>
            <button
              type="button"
              onClick={() => void supabase.auth.signOut().then(() => { window.location.href = '/login'; })}
              className="rounded-lg border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (verdict.action === 'ONBOARDING') {
    return <RoleOnboardingPage />;
  }

  return children ? <>{children}</> : <Outlet />;
}
