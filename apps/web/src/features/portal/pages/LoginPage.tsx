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
      <div className="mx-auto w-full max-w-md px-4 py-14">
        {searchParams.get('reset') === 'success' && (
          <div className="mb-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-4 text-xs text-emerald-900 dark:text-emerald-300">
            <p className="font-bold flex items-center gap-1.5 text-sm mb-1">
              <span>✓</span> Password Updated Successfully!
            </p>
            <p className="text-emerald-800 dark:text-emerald-400">
              Your new password is now active. Please sign in with your updated credentials below.
            </p>
          </div>
        )}

        {isAdminEmergency && isMaintenanceMode && (
          <div
            data-testid="admin-emergency-banner"
            className="mb-6 rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-left"
          >
            <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400 text-sm">
              <span>🛡️</span> Platform Admin Emergency Sign-In
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Platform is currently under scheduled maintenance. Only authorized platform administrators
              (<code>bvnbasu@gmail.com</code>, <code>admin@otp.test</code>) may sign in to access the ops console.
            </p>
          </div>
        )}

        <h1 className="text-2xl font-semibold">
          {isAdminEmergency && isMaintenanceMode ? 'Admin Sign In' : 'Log In'}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isAdminEmergency && isMaintenanceMode
            ? 'Enter your Super Admin credentials to proceed to the management console.'
            : 'Buyers and suppliers use the same door. We will take you to the right workspace.'}
        </p>

        <div className="mt-6 rounded-lg border bg-card p-6">
          <SignInForm autoFocus />
        </div>

        {!isAdminEmergency && (
          <>
            <p className="mt-5 text-sm text-muted-foreground">
              Not registered yet?{' '}
              <Link to="/signup" className="font-medium text-action hover:underline">
                Create an account
              </Link>{' '}
              — or read what the platform does for{' '}
              <Link to="/faqs?for=buyers" className="font-medium text-action hover:underline">
                buyers
              </Link>{' '}
              and{' '}
              <Link to="/faqs?for=suppliers" className="font-medium text-action hover:underline">
                suppliers
              </Link>
              .
            </p>

            <p className="mt-4 text-xs text-muted-foreground">
              Trouble logging in? A one-time code works even if you have forgotten your password. If
              the code does not arrive, check the address is the one your organisation registered.
            </p>
          </>
        )}
      </div>
    </SiteLayout>
  );
}
