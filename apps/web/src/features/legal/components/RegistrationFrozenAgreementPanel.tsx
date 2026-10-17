import { Button } from '@/components/ui';
import type { CurrentAgreementState } from '../hooks/use-current-agreement';
import { LegalSnapshotNotice } from './LegalSnapshotNotice';

function acceptanceReady(state: CurrentAgreementState): boolean {
  return state.phase === 'ready' && state.agreement.snapshotPublished;
}

export function RegistrationFrozenAgreementPanel({
  side,
  state,
  agreementVersion,
  agreementAccepted,
  onAgreementAcceptedChange,
  agreementError,
  buyerPersonaLabel,
  onOpenWorksheet,
  checkboxTestId,
  panelTestId,
}: {
  side: 'BUYER' | 'SUPPLIER';
  state: CurrentAgreementState;
  agreementVersion: string;
  agreementAccepted: boolean;
  onAgreementAcceptedChange: (accepted: boolean) => void;
  agreementError?: string;
  buyerPersonaLabel?: string | null;
  onOpenWorksheet?: () => void;
  checkboxTestId: string;
  panelTestId: string;
}) {
  const ready = acceptanceReady(state);
  const loadPhase =
    state.phase === 'loading' ? 'loading' : state.phase === 'error' ? 'error' : 'ready';
  const errorMessage = state.phase === 'error' ? state.message : undefined;

  const title =
    side === 'SUPPLIER'
      ? 'Supplier Terms & EULA'
      : buyerPersonaLabel
        ? `Buyer agreement (${buyerPersonaLabel})`
        : 'Buyer agreement (Individual, RWA, or MSME)';

  return (
    <div
      className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 text-xs"
      data-testid={panelTestId}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-foreground">{title}</span>
        {agreementAccepted && ready ? (
          <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold border border-emerald-300">
            ✓ Accepted
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-extrabold border border-amber-300">
            Required to register
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-[11px] leading-relaxed">
        Signup records acceptance of the frozen agreement below ({agreementVersion || 'loading'}). The public terms
        page and any registration worksheet are not that agreement.
      </p>
      <LegalSnapshotNotice
        version={agreementVersion}
        documentHash={state.phase === 'ready' ? state.agreement.documentHash : ''}
        bodyText={state.phase === 'ready' ? state.agreement.bodyText : null}
        published={state.phase === 'ready' && state.agreement.snapshotPublished}
        loadPhase={loadPhase}
        errorMessage={errorMessage}
      />
      <label className="flex items-start gap-2 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={agreementAccepted}
          onChange={(e) => onAgreementAcceptedChange(e.target.checked)}
          disabled={!ready}
          className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer disabled:opacity-50"
          data-testid={checkboxTestId}
          aria-disabled={!ready}
        />
        <span className="text-[11px] text-foreground font-medium">
          I agree to the frozen {side === 'SUPPLIER' ? 'supplier' : 'buyer'} agreement shown above (
          {agreementVersion || 'loading'}).
        </span>
      </label>
      {onOpenWorksheet && (
        <Button type="button" variant="secondary" className="w-full text-xs font-bold" onClick={onOpenWorksheet}>
          View registration worksheet (preview only)
        </Button>
      )}
      {agreementError && (
        <p className="text-red-600 text-[11px] font-semibold" role="alert">
          {agreementError}
        </p>
      )}
    </div>
  );
}
