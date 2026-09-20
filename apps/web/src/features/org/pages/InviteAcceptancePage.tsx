import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import { acceptOrgInvitation, type AcceptInvitationResult } from '../api/org-members';
import { PRODUCT_NAME, PLATFORM_DISCLAIMER } from '@/lib/brand';

export function InviteAcceptancePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading, signOut } = useAuth();
  const { refresh } = useRoleContext();

  const [isAccepting, setIsAccepting] = useState(false);
  const [result, setResult] = useState<AcceptInvitationResult | null>(null);

  const cleanToken = token?.trim() ?? '';
  const redirectTarget = encodeURIComponent(`/invite/${cleanToken}`);

  async function handleAccept() {
    if (!cleanToken || isAccepting) return;
    setIsAccepting(true);
    setResult(null);

    try {
      const res = await acceptOrgInvitation(cleanToken);
      setResult(res);
      if (res.ok) {
        // Refresh role context so the new active organization and role take effect immediately
        await refresh();
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : 'An unexpected error occurred while accepting the invitation.',
      });
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleSignOutAndSwitch() {
    try {
      await signOut();
    } catch {
      // Proceed to login even if local sign out fails
    }
    navigate(`/login?redirect=${redirectTarget}`);
  }

  if (authLoading) {
    return (
      <InviteShell>
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3" data-testid="invite-loading">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-xs font-semibold text-muted-foreground">
            Verifying secure invitation token…
          </p>
        </div>
      </InviteShell>
    );
  }

  if (!cleanToken) {
    return (
      <InviteShell>
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-5 text-center dark:border-red-900/60 dark:bg-red-950/30 space-y-3" data-testid="invite-missing-token">
          <span className="text-3xl">⚠️</span>
          <h1 className="text-sm font-extrabold text-red-900 dark:text-red-200">
            Invalid Invitation Link
          </h1>
          <p className="text-xs leading-relaxed text-red-800 dark:text-red-300">
            This invitation link is missing a valid token. Please check the URL received in your email or WhatsApp message.
          </p>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 mobile-touch-target"
            >
              Go to Sign In
            </Link>
          </div>
        </div>
      </InviteShell>
    );
  }

  // State A: Unauthenticated Visitor Flow
  if (!user) {
    return (
      <InviteShell>
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4" data-testid="invite-unauthenticated">
          <div className="text-center space-y-2">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl shadow-inner">
              ✉️
            </div>
            <h1 className="text-base font-extrabold text-foreground">
              Organization Team Invitation
            </h1>
            <p className="text-xs leading-relaxed text-muted-foreground max-w-sm mx-auto">
              You have been invited to join an organization procurement workspace on <strong>{PRODUCT_NAME}</strong> with tokenized governance access.
            </p>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5 space-y-2 text-left">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted-foreground">Security Token:</span>
              <span className="font-mono text-[11px] font-bold text-primary">
                {cleanToken.slice(0, 12)}…{cleanToken.slice(-6)}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-normal">
              🔒 Single-use SHA-256 protected token. Sign in with your registered email to accept your role.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <Link
              to={`/login?redirect=${redirectTarget}`}
              data-testid="invite-signin-btn"
              className="w-full min-h-[48px] rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 transition active:scale-[0.98] flex items-center justify-center gap-2 mobile-touch-target"
            >
              <span>🔑</span>
              <span>Sign In with Invited Email</span>
            </Link>

            <Link
              to={`/signup?side=buyer&redirect=${redirectTarget}`}
              data-testid="invite-signup-btn"
              className="w-full min-h-[48px] rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold text-foreground hover:bg-muted transition flex items-center justify-center gap-2 mobile-touch-target"
            >
              <span>✨</span>
              <span>Create Account &amp; Accept Invitation</span>
            </Link>
          </div>

          <p className="text-[10px] text-center text-muted-foreground">
            Invitations expire automatically after 7 days from issuance.
          </p>
        </div>
      </InviteShell>
    );
  }

  // State B: Authenticated Visitor Flow — Success
  if (result?.ok) {
    return (
      <InviteShell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 sm:p-6 text-center dark:border-emerald-900/60 dark:bg-emerald-950/30 space-y-4" data-testid="invite-success">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-3xl dark:bg-emerald-900/40">
            🎉
          </div>
          <div className="space-y-1">
            <h1 className="text-base font-extrabold text-emerald-950 dark:text-emerald-100">
              Welcome to {result.organizationName || 'the Organization'}!
            </h1>
            <p className="text-xs text-emerald-800 dark:text-emerald-300">
              You have successfully joined as{' '}
              <strong className="underline font-extrabold">
                {result.role?.replace(/_/g, ' ') || 'Team Member'}
              </strong>
              .
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200/60 bg-card p-3 text-left text-xs space-y-1">
            <p className="font-bold text-foreground">✓ Workspace Context Updated</p>
            <p className="text-[11px] text-muted-foreground">
              Your active workspace has been linked to {result.organizationName || 'your organization'}. You can now view requirements, collaborate with team members, and cast committee votes.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <Link
              to="/dashboard"
              data-testid="invite-go-dashboard"
              className="w-full min-h-[48px] rounded-xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 transition active:scale-[0.98] flex items-center justify-center gap-2 mobile-touch-target"
            >
              <span>🚀</span>
              <span>Go to Workspace Dashboard</span>
            </Link>

            <Link
              to="/org/members"
              data-testid="invite-go-team"
              className="w-full min-h-[48px] rounded-xl border border-border bg-card px-4 py-3 text-xs font-bold text-foreground hover:bg-muted transition flex items-center justify-center gap-2 mobile-touch-target"
            >
              <span>👥</span>
              <span>View Team Roster &amp; Delegations</span>
            </Link>
          </div>
        </div>
      </InviteShell>
    );
  }

  // State C: Authenticated Visitor Flow — Initial or Error State
  const isEmailMismatch = Boolean(result && !result.ok && result.error.includes('sent to'));

  return (
    <InviteShell>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-xs space-y-4" data-testid="invite-authenticated">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-2xl shadow-inner">
            🏢
          </div>
          <h1 className="text-base font-extrabold text-foreground">
            Accept Organization Invitation
          </h1>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            You are signed in and ready to join the organization workspace.
          </p>
        </div>

        {/* Current User Identity Context */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-muted-foreground block">Signed In As:</span>
            <p className="text-xs font-bold text-foreground truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOutAndSwitch()}
            className="text-[11px] font-semibold text-primary hover:underline shrink-0 min-h-[44px] flex items-center"
          >
            Switch Account
          </button>
        </div>

        {/* Error Feedback */}
        {result && !result.ok && (
          <div
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300 space-y-2"
            data-testid="invite-error-box"
          >
            <div className="flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <p className="font-semibold leading-relaxed">{result.error}</p>
            </div>

            {isEmailMismatch && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => void handleSignOutAndSwitch()}
                  className="w-full rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white hover:bg-red-800 transition min-h-[44px]"
                >
                  Sign Out &amp; Sign In with Invited Email
                </button>
              </div>
            )}
          </div>
        )}

        {/* Accept Button */}
        <div className="space-y-2 pt-2">
          <button
            type="button"
            disabled={isAccepting}
            onClick={() => void handleAccept()}
            data-testid="invite-accept-btn"
            className="w-full min-h-[50px] rounded-xl bg-primary px-4 py-3 text-sm font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 disabled:opacity-50 transition active:scale-[0.98] flex items-center justify-center gap-2 mobile-touch-target"
          >
            {isAccepting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>Joining Organization…</span>
              </>
            ) : (
              <>
                <span>🤝</span>
                <span>Accept &amp; Join Organization</span>
              </>
            )}
          </button>

          <Link
            to="/dashboard"
            className="w-full min-h-[44px] rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition flex items-center justify-center"
          >
            Cancel &amp; Return to Dashboard
          </Link>
        </div>

        <p className="text-[10px] text-center text-muted-foreground">
          🛡️ By accepting, your profile will be assigned the organization governance role and permissions.
        </p>
      </div>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col justify-between overflow-x-hidden pb-[calc(5rem+env(safe-area-inset-bottom,0px))]">
      <header className="border-b bg-card/90 px-3 py-2.5 sticky top-0 z-10 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Link to="/" className="text-sm font-black tracking-tight text-primary flex items-center gap-1 min-h-[44px]">
            <span>🏢</span>
            <span>{PRODUCT_NAME} Governance</span>
          </Link>
          <span className="rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold">
            Tokenized Invitation
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-3 py-6 sm:px-4 sm:py-8 flex flex-col justify-center">
        {children}
      </main>

      <footer className="border-t bg-muted/30 px-3 py-3">
        <p className="mx-auto max-w-lg text-[10px] leading-relaxed text-muted-foreground text-center">
          {PLATFORM_DISCLAIMER}
        </p>
      </footer>
    </div>
  );
}
