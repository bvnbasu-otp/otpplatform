import { useState, useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { SignInForm } from '@/features/auth/components/SignInForm';
import { SiteLayout } from '@/features/site';
import { useMaintenance } from '@/features/maintenance';

/**
 * The canonical sign-in page.
 *
 * One page for both sides of the market, because signing in is the same act and
 * which workspace someone lands in is resolved from their profile rather than
 * from the door they used. It is also the only sign-in page: the per-side portals
 * that used to carry their own copy of this form are now redirects to /signup.
 *
 * Honouring the recorded destination is the job that made this the survivor.
 * Anyone stopped by RequireAuth arrives here with where they were going, search
 * string included, and leaves for it.
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
        // Redirect loop detected! Break the loop immediately and stay on login / show switcher
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
    <SiteLayout>
      <div className="mx-auto w-full max-w-md px-3.5 py-3 sm:py-6 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden">
        {searchParams.get('reset') === 'success' && (
          <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3 text-xs text-emerald-900 dark:text-emerald-300">
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
            className="mb-4 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-left"
          >
            <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400 text-xs">
              <span>🛡️</span> Platform Admin Emergency Sign-In
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Platform is under maintenance. Only authorized platform administrators may sign in.
            </p>
          </div>
        )}

        <div className="mb-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {isAdminEmergency && isMaintenanceMode ? 'Admin Sign In' : 'Sign In'}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isAdminEmergency && isMaintenanceMode
              ? 'Enter Super Admin credentials to proceed to the management console.'
              : 'Welcome back! Enter your details to access your workspace.'}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5 shadow-2xs">
          <SignInForm autoFocus />
        </div>
      </div>
    </SiteLayout>
  );
}
