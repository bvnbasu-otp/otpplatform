import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClarificationWorkbench,
  closeClarificationForEvaluation,
  closeInitialQuoting,
  fetchFinalQuoteCount,
  fetchInvitedLabels,
  fetchRfqStatus,
} from '@/features/clarification';
import { RfqPhasePanel } from '@/features/phase';
import { QuoteAttachmentsPanel } from '@/features/attachments';
import { ProcurementStageNavigator } from '@/features/lifecycle';

export function RfqClarificationPage({ rfqId }: { rfqId: string }) {
  const [rfqStatus, setRfqStatus] = useState<string>('OPEN');
  const [minQuotes, setMinQuotes] = useState(3);
  const [labels, setLabels] = useState<{ invitationId: string; anonymousLabel: string }[]>([]);
  const [finalQuoteCount, setFinalQuoteCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [statusRes, labelsRes, finalCount] = await Promise.all([
      fetchRfqStatus(rfqId),
      fetchInvitedLabels(rfqId),
      fetchFinalQuoteCount(rfqId),
    ]);

    if (statusRes.ok) {
      setRfqStatus(statusRes.status);
      setMinQuotes(statusRes.minQuotesRequired);
    }
    if (labelsRes.ok) {
      setLabels(labelsRes.labels);
    }
    setFinalQuoteCount(finalCount);
    setIsLoading(false);
  }, [rfqId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCloseInitial() {
    setBusy(true);
    setError(null);
    const result = await closeInitialQuoting(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Initial quoting closed — negotiation & Q&A is now open.');
    await load();
  }

  async function handleCloseClarification() {
    setBusy(true);
    setError(null);
    const result = await closeClarificationForEvaluation(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Negotiation closed — proceed to Compare Quotes.');
    await load();
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <div className="inline-block animate-spin text-2xl">⏳</div>
        <p className="mt-2 text-xs font-bold">Loading clarification workspace…</p>
      </div>
    );
  }

  const activeLinearStep = rfqStatus === 'OPEN' || rfqStatus === 'CLARIFICATION' ? 4 : 5;
  const isQuotingOrClarifying = rfqStatus === 'OPEN' || rfqStatus === 'CLARIFICATION';

  return (
    <div
      className="zero-scroll-container p-2.5 sm:p-4 max-w-7xl mx-auto w-full space-y-3"
      data-testid="rfq-clarification-page"
    >
      <ProcurementStageNavigator
        currentLinearStep={activeLinearStep}
        currentStage={isQuotingOrClarifying ? 'QUOTING' : 'EVALUATING'}
        orderTitle="Review Received Quotes, Negotiation & Q&A"
        orderReference={`RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/market-intelligence`}
        backToLabel="Market Intelligence"
      />

      {/* Header Bar */}
      <div className="rounded-2xl border bg-card px-3.5 py-3 shadow-2xs shrink-0 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="rounded-xl bg-blue-100 dark:bg-blue-950/60 px-2.5 py-1 text-[11px] font-black text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
            💬 Clarification &amp; Q&amp;A
          </span>
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-black text-foreground truncate">
              {activeLinearStep === 4
                ? 'Review Quotes & Manage Supplier Clarifications'
                : 'Close Negotiation & Freeze Quotes'}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              RFQ: <strong>{rfqStatus}</strong> · Clarify specifications with anonymous suppliers before freezing quotes.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {rfqStatus === 'OPEN' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCloseInitial()}
                className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-extrabold text-foreground hover:bg-muted disabled:opacity-50 min-h-[44px] mobile-touch-target transition shadow-2xs"
                data-testid="close-initial-quoting-button"
              >
                💬 Open Q&amp;A
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCloseClarification()}
                className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-black text-white shadow-2xs hover:bg-emerald-800 disabled:opacity-50 min-h-[44px] mobile-touch-target transition"
                title="Skip negotiation and evaluate submitted quotes immediately"
              >
                ⚡ Freeze &amp; Compare →
              </button>
            </>
          )}

          {rfqStatus === 'CLARIFICATION' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCloseClarification()}
              className="rounded-xl bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground disabled:opacity-50 shadow-2xs min-h-[44px] mobile-touch-target transition"
              data-testid="close-clarification-button"
            >
              🔒 Close &amp; Compare ({finalQuoteCount}/{minQuotes}) →
            </button>
          )}

          {['EVALUATING', 'AWARDED', 'CLOSED'].includes(rfqStatus) && (
            <Link
              to={`/rfq/${rfqId}/evaluation`}
              className="rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground shadow-2xs hover:bg-primary/90 transition min-h-[44px] mobile-touch-target flex items-center gap-1"
            >
              <span>Compare Quotes →</span>
            </Link>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-xl border border-red-200 dark:border-red-900 shrink-0"
        >
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900 shrink-0"
        >
          ✓ {success}
        </div>
      )}

      <div className="zero-scroll-pane space-y-3 pb-8">
        <RfqPhasePanel rfqId={rfqId} side="BUYER" />

        {/* Collaborative Clarification & Sealed Q&A Workbench */}
        <ClarificationWorkbench
          rfqId={rfqId}
          persona="BUYER"
          readOnly={!isQuotingOrClarifying}
          invitedSuppliers={labels}
          onActionComplete={() => void load()}
        />

        {/* Supplier Attachments (Neutral labels) */}
        <QuoteAttachmentsPanel rfqId={rfqId} revealed={false} />
      </div>
    </div>
  );
}
