import { useState, useEffect, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useRoleContext } from './hooks/use-role-context';
import { RoleOnboardingPage } from './pages/RoleOnboardingPage';

/**
 * Stands between a signed-in account and the product until it has a role.
 *
 * Placed inside RequireAuth and outside the layout, so the gate replaces the
 * whole application rather than appearing as a banner on top of screens the
 * person is not yet configured to use. It intercepts by state, not by route, so
 * a deep link into a bookmarked enquiry lands here too.
 */
export function RequireRole({ children }: { children: ReactNode }) {
  const { context, isLoading, refresh } = useRoleContext();
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setDelayed(false);
      return;
    }
    const timer = setTimeout(() => setDelayed(true), 4000);
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-background">
        <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Loading your workspace…</span>
          {delayed && (
            <div className="mt-4 flex flex-col items-center gap-2 max-w-sm text-center animate-in fade-in duration-300">
              <p className="text-xs text-muted-foreground">
                Connecting to the workspace is taking longer than expected.
              </p>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => { void refresh(); }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
                >
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => void supabase.auth.signOut().then(() => { window.location.href = '/login'; })}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted transition"
                >
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (context.isBlocked && !context.isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-card p-6 text-center shadow-lg animate-in fade-in zoom-in-95 duration-200">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive text-2xl font-bold">
            🚫
          </div>
          <h2 className="mt-4 text-lg font-bold text-foreground">Account Restricted / Blocked</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            This account has been placed on administrative hold and cannot access procurement workspaces or place/respond to RFQs.
          </p>
          {context.blockedReason && (
            <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-left text-xs text-destructive">
              <span className="font-semibold block mb-1">Administrative Note:</span>
              <span>{context.blockedReason}</span>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            <a
              href="mailto:bvnbasu+otp.demo.otp.support@gmail.com?subject=Account%20Restriction%20Inquiry"
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

  if (context.needsOnboarding && !context.isPlatformAdmin) {
    return <RoleOnboardingPage />;
  }

  return <>{children}</>;
}
