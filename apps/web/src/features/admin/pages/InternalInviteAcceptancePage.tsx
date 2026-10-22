import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { useRoleContext } from '@/features/roles';
import { acceptInternalInvitation } from '@/features/admin/api/internal-ops';

export function InternalInviteAcceptancePage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading, signOut } = useAuth();
  const { refresh } = useRoleContext();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const redirect = encodeURIComponent(`/internal-invite/${token}`);

  async function switchAccount() {
    try { await signOut(); } catch { /* still redirect to sign-in */ }
    navigate(`/login?redirect=${redirect}`);
  }

  async function accept() {
    if (!token || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await acceptInternalInvitation(token);
      if (!result.ok) {
        setMessage({ ok: false, text: result.error || 'The invitation could not be accepted.' });
        return;
      }
      await refresh();
      setMessage({
        ok: true,
        text: result.alreadyAccepted
          ? `This invitation was already accepted for this account (${result.roleCode || 'internal role'}).`
          : `Invitation accepted. Your internal role is ${result.roleCode || 'assigned'}.`,
      });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Unexpected error accepting invitation.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-background px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">OTP · Internal Access</p>
          <h1 className="text-xl font-extrabold text-foreground">Accept Internal Invitation</h1>
          <p className="text-sm text-muted-foreground">
            Acceptance is restricted to the invited email address. The database checks the invitation's expiry and status and records acceptance atomically.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Checking sign-in status…</p>
        ) : !token ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">This invitation link is missing its token.</p>
        ) : !user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Sign in using the exact email address to which this invitation was issued.</p>
            <Link to={`/login?redirect=${redirect}`} className="flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              Sign in to accept
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">Signed in as</p>
              <p data-testid="signed-in-email" className="break-all text-sm font-semibold text-foreground">{user.email || 'Email unavailable'}</p>
              <button type="button" onClick={() => void switchAccount()} className="mt-2 text-xs font-semibold text-primary underline">
                Switch account
              </button>
            </div>
            <button type="button" onClick={() => void accept()} disabled={busy} className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {busy ? 'Verifying and accepting…' : 'Accept internal invitation'}
            </button>
          </div>
        )}

        {message && (
          <div role={message.ok ? 'status' : 'alert'} className={`rounded-lg border p-3 text-sm ${message.ok ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
            {message.text}
          </div>
        )}
        {message?.ok && (
          <Link to="/admin" className="flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold">Continue to Admin Console</Link>
        )}
        <div className="border-t pt-3 text-xs text-muted-foreground">
          Invitation links expire after 48 hours and can be accepted only once. If this link is expired or revoked, ask a platform administrator to issue a new one.
        </div>
      </section>
    </main>
  );
}
