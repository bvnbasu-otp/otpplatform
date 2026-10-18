import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/AuthProvider';
import { useRoleContext } from '@/features/roles';
import {
  acceptLegalAgreement,
  fetchLegalAcceptanceStatus,
  fetchLegalSnapshotText,
  type AgreementStatus,
  type LegalAcceptanceStatus,
  type LegalSnapshotText,
} from '../api/legal-acceptance';
import { LegalSnapshotNotice } from './LegalSnapshotNotice';

type GateState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; status: LegalAcceptanceStatus };

/** Agreements the signed-in user still has to accept, per the server-side status. */
export function pendingAgreements(status: LegalAcceptanceStatus): AgreementStatus[] {
  return status.agreements.filter((agreement) => !agreement.accepted);
}

/** Agreements the database will already reject protected writes for. */
export function blockingAgreements(status: LegalAcceptanceStatus): AgreementStatus[] {
  return status.agreements.filter((agreement) => agreement.status === 'REQUIRED');
}

function bannerText(agreement: AgreementStatus): string {
  const label = agreement.title || agreement.agreementType;
  if (agreement.status === 'GRACE' && agreement.graceEndsAt) {
    return `Please accept the ${label} (${agreement.currentVersion}) by ${new Date(agreement.graceEndsAt).toLocaleDateString('en-IN')}. After that date, creating or changing procurement records will be blocked.`;
  }
  if (agreement.status === 'MISCONFIGURED') {
    return `Agreement enforcement is not configured correctly for the ${label}. Please contact support.`;
  }
  return `Please review and accept the current ${label} (${agreement.currentVersion}).`;
}

const EMPTY_LEGAL_STATUS: LegalAcceptanceStatus = {
  requiresAcceptance: false,
  enforcementActive: false,
  agreements: [],
};

/**
 * Blocks protected workspaces while the database reports an agreement as
 * REQUIRED, and shows a persistent prompt while acceptance is pending but not
 * yet enforced (grace or enforcement not activated). The server decides what is
 * required; a failed status check keeps the gate closed instead of assuming acceptance.
 */
export function LegalAcceptanceGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { context } = useRoleContext();
  const isInternal = Boolean(
    context?.isFounder || context?.isPlatformAdmin || context?.side === 'CONSOLE',
  );

  const userId = user?.id ?? '';
  const [state, setState] = useState<GateState>(
    isInternal ? { phase: 'ready', status: EMPTY_LEGAL_STATUS } : { phase: 'loading' },
  );
  const [reviewing, setReviewing] = useState(false);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<LegalSnapshotText | null>(null);
  const pendingType = state.phase === 'ready'
    ? (pendingAgreements(state.status)[0]?.agreementType ?? null)
    : null;

  const load = useCallback(async () => {
    if (isInternal) {
      setState({ phase: 'ready', status: EMPTY_LEGAL_STATUS });
      return;
    }
    const result = await fetchLegalAcceptanceStatus();
    setState(
      result.ok
        ? { phase: 'ready', status: result.value }
        : { phase: 'error', message: result.error },
    );
  }, [isInternal]);

  useEffect(() => {
    if (isInternal) {
      setState({ phase: 'ready', status: EMPTY_LEGAL_STATUS });
      return;
    }
    void load();
  }, [load, userId, isInternal]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!pendingType) {
      setSnapshot(null);
      return;
    }
    let cancelled = false;
    void fetchLegalSnapshotText(pendingType).then((result) => {
      if (cancelled) return;
      setSnapshot(result.ok ? result.value : {
        published: false,
        agreementType: pendingType,
        version: null,
        documentHash: null,
        bodyText: null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pendingType]);

  if (isInternal) {
    return <>{children}</>;
  }

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
    setState({ phase: 'ready', status: result.value });
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4" data-testid="legal-gate">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-bold text-foreground">{target.title}</h2>
        <p className="text-xs text-muted-foreground">
          Version {target.currentVersion}. You must accept the frozen agreement below before continuing.
        </p>
        <LegalSnapshotNotice
          version={snapshot?.version ?? target.currentVersion}
          documentHash={snapshot?.documentHash ?? target.documentHash}
          bodyText={snapshot?.bodyText ?? null}
          published={snapshot?.published === true}
        />
        <p className="text-[11px] text-muted-foreground">
          Privacy information is separate from this agreement.{' '}
          <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
            Privacy Policy
          </a>
        </p>
        <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            disabled={snapshot?.published !== true}
            className="mt-0.5 h-4 w-4"
            data-testid="legal-gate-checkbox"
          />
          <span>
            I agree to the frozen {target.title || target.agreementType} shown above ({target.currentVersion}).
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
            disabled={!checked || busy || snapshot?.published !== true}
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
