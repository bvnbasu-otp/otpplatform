import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { SignInForm } from '@/features/auth/components/SignInForm';
import { useMaintenance } from '@/features/maintenance';
import { Icon } from '@/components/ui/Icon';
import { PRODUCT_PLATFORM_SUBTITLE, PRODUCT_TITLE } from '@/lib/brand';

/**
 * X2O Mobile & Web Sign-In Entrypoint.
 *
 * Clean mobile-first design matching the X2O wizard:
 * - Handshake logo badge & X2O title
 * - WhatsApp OTP / Email code / Password authentication
 * - Automatic destination resume following authentication
 * - Fast navigation to registration wizard
 */
export function LoginPage() {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const { isMaintenanceMode } = useMaintenance();
  const [shouldAutoRedirect, setShouldAutoRedirect] = useState(true);

  const searchParams = new URLSearchParams(location.search);
  const isAdminEmergency = searchParams.get('admin') === 'true';

  // If maintenance is active and this is NOT an admin emergency sign-in, redirect to maintenance directly
  if (isMaintenanceMode && !isAdminEmergency) {
    return <Navigate to="/maintenance?returnUrl=%2Flogin" replace />;
  }

  // Strictly redirect to target destination or /dashboard on log in for all roles
  const redirectParam = searchParams.get('redirect');
  const validRedirect =
    redirectParam &&
    redirectParam.startsWith('/') &&
    !redirectParam.startsWith('//') &&
    !redirectParam.startsWith('/login')
      ? redirectParam
      : '/dashboard';

  // Protect against rapid redirect loops (e.g., bounced back within 2 seconds)
  useEffect(() => {
    if (typeof window !== 'undefined' && user) {
      const loopKey = `otp_redirect_loop_${encodeURIComponent(validRedirect)}`;
      const now = Date.now();
      const rawData = sessionStorage.getItem(loopKey);
      let attempts: number[] = [];
      if (rawData) {
        try {
          attempts = JSON.parse(rawData);
        } catch {
          attempts = [];
        }
      }
      // Filter to attempts in last 3 seconds
      attempts = attempts.filter((t) => now - t < 3000);
      if (attempts.length >= 2) {
        setShouldAutoRedirect(false);
        sessionStorage.removeItem(loopKey);
      } else {
        attempts.push(now);
        sessionStorage.setItem(loopKey, JSON.stringify(attempts));
      }
    }
  }, [user, validRedirect]);

  if (!isLoading && user && !isAdminEmergency && shouldAutoRedirect) {
    return <Navigate to={validRedirect} replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      {/* Brand & Canonical copy for accessibility, SEO and contract tests */}
      <div className="sr-only">
        <p data-testid="login-brand-title">{PRODUCT_TITLE}</p>
        <p>{PRODUCT_PLATFORM_SUBTITLE}</p>
      </div>

      {/* Brand Header */}
      <div className="pt-8 sm:pt-12 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary shadow-sm mb-1">
          <Icon name="handshake" size={36} className="text-[#2563EB]" />
        </div>
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">X2O</h1>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {isAdminEmergency && isMaintenanceMode ? 'Admin Sign In' : 'Sign in to your account'}
          </p>
        </div>
      </div>

      {/* Sign In Form Container */}
      <div className="py-6 space-y-4">
        {searchParams.get('reset') === 'success' && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3 text-xs text-emerald-900 dark:text-emerald-300">
            <p className="font-bold flex items-center gap-1.5 text-xs mb-0.5">
              <span>✓</span> Password Updated Successfully!
            </p>
            <p className="text-emerald-800 dark:text-emerald-400">
              Your new password is now active. Please sign in below.
            </p>
          </div>
        )}

        {isAdminEmergency && isMaintenanceMode && (
          <div
            data-testid="admin-emergency-banner"
            className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-left"
          >
            <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400 text-xs">
              <span>🛡️</span> Platform Admin Emergency Sign-In
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Platform is under maintenance. Only authorized platform administrators may sign in.
            </p>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <SignInForm autoFocus />
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pb-6 text-center">
        <p className="text-xs text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-bold text-primary hover:underline">
            Register on X2O
          </Link>
        </p>
      </div>
    </div>
  );
}
