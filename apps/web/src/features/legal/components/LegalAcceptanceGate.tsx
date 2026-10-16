import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  acceptLegalAgreement,
  fetchLegalAcceptanceStatus,
  type AgreementStatus,
  type LegalAcceptanceStatus,
} from '../api/legal-acceptance';

type GateState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; status: LegalAcceptanceStatus };

// Users already confirmed as current in this tab, so route changes do not re-query.
// A new agreement version is picked up on the next page load or sign-in.
const confirmedCurrent = new Set<string>();

/** Agreements the signed-in user still has to accept, per the server-side status. */
export function pendingAgreements(status: LegalAcceptanceStatus): AgreementStatus[] {
  return status.agreements.filter((agreement) => !agreement.accepted);
}

/** Agreements the database will already reject protected writes for. */
export function blockingAgreements(status: LegalAcceptanceStatus): AgreementStatus[] {
  return status.agreements.filter((agreement) => agreement.status === 'REQUIRED');
}

function bannerText(agreement: AgreementStatus): string {
  if (agreement.status === 'GRACE' && agreement.graceEndsAt) {
    return `Please accept the ${agreement.title} (${agreement.currentVersion}) by ${new Date(agreement.graceEndsAt).toLocaleDateString('en-IN')}. After that date, creating or changing procurement records will be blocked.`;
  }
  if (agreement.status === 'MISCONFIGURED') {
    return `Agreement enforcement is not configured correctly for the ${agreement.title}. Please contact support.`;
  }
  return `Please review and accept the current ${agreement.title} (${agreement.currentVersion}).`;
}

/**
 * Blocks protected workspaces while the database reports an agreement as
 * REQUIRED, and shows a persistent prompt while acceptance is pending but not
 * yet enforced (grace or enforcement not activated). The server decides what is
 * required; a failed status check keeps the gate closed instead of assuming acceptance.
 */
export function LegalAcceptanceGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const alreadyConfirmed = userId !== '' && confirmedCurrent.has(userId);
  const [state, setState] = useState<GateState>(
    alreadyConfirmed
      ? { phase: 'ready', status: { requiresAcceptance: false, enforcementActive: false, agreements: [] } }
      : { phase: 'loading' },
  );
  const [reviewing, setReviewing] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    const result = await fetchLegalAcceptanceStatus();
    if (result.ok && userId && pendingAgreements(result.value).length === 0) {
      confirmedCurrent.add(userId);
    }
    setState(
      result.ok
        ? { phase: 'ready', status: result.value }
        : { phase: 'error', message: result.error },
    );
  }, [userId]);

  useEffect(() => {
    if (!alreadyConfirmed) void load();
  }, [load, alreadyConfirmed]);

  if (state.phase === 'loading') {
    return (
      <div
        className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground"
        data-testid="legal-gate-loading"
      >
        Checking agreement status…
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-4 text-center" role="alert">
        <p className="text-sm text-foreground">We could not confirm your agreement status.</p>
        <p className="text-xs text-muted-foreground">{state.message}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    );
  }

  const pending = pendingAgreements(state.status);
  const target = pending[0];
  if (!target) return <>{children}</>;
  const blocking = blockingAgreements(state.status).length > 0;

  if (!blocking && !reviewing) {
    return (
      <>
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900"
          role="status"
          data-testid="legal-gate-banner"
        >
          <span>{bannerText(target)}</span>
          <button
            type="button"
            onClick={() => setReviewing(true)}
            className="rounded-md bg-amber-600 px-3 py-1 font-semibold text-white"
            data-testid="legal-gate-review"
          >
            Review and accept
          </button>
        </div>
        {children}
      </>
    );
  }

  const accept = async () => {
    setBusy(true);
    setActionError(null);
    const result = await acceptLegalAgreement(target);
    setBusy(false);
    if (!result.ok) {
      setActionError(result.error);
      // A stale version means the agreement changed while this screen was open.
      void load();
      return;
    }
    setChecked(false);
    if (userId && pendingAgreements(result.value).length === 0) confirmedCurrent.add(userId);
    setState({ phase: 'ready', status: result.value });
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4" data-testid="legal-gate">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-bold text-foreground">{target.title}</h2>
        <p className="text-xs text-muted-foreground">
          Version {target.currentVersion}. You must accept the current agreement before continuing.
        </p>
        <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-0.5 h-4 w-4"
            data-testid="legal-gate-checkbox"
          />
          <span>
            I have read and agree to the{' '}
            <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Terms of Use
            </a>
            ,{' '}
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
              Privacy Policy
            </a>{' '}
            and EULA ({target.currentVersion}).
          </span>
        </label>
        {actionError && (
          <p className="text-xs font-semibold text-red-600" role="alert">
            {actionError}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!checked || busy}
            onClick={() => void accept()}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            data-testid="legal-gate-accept"
          >
            {busy ? 'Recording acceptance…' : 'Accept and continue'}
          </button>
          {!blocking && (
            <button
              type="button"
              onClick={() => setReviewing(false)}
              className="rounded-lg border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Not now
            </button>
          )}
          <button
            type="button"
            onClick={() => void supabase.auth.signOut().then(() => { window.location.href = '/login'; })}
            className="rounded-lg border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
