import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ClarificationThread,
  closeClarificationForEvaluation,
  closeInitialQuoting,
  fetchClarificationMessagesForBuyer,
  fetchFinalQuoteCount,
  fetchInvitedLabels,
  fetchRfqStatus,
} from '@/features/clarification';
import type { ClarificationMessage } from '@/features/clarification/api/clarification';
import { MessagingInspector } from '@/features/demo';
import { RfqPhasePanel } from '@/features/phase';
import { QuoteAttachmentsPanel } from '@/features/attachments';
import { ProcurementStageNavigator } from '@/features/lifecycle';

export function RfqClarificationPage({ rfqId }: { rfqId: string }) {
  const [rfqStatus, setRfqStatus] = useState<string>('OPEN');
  const [minQuotes, setMinQuotes] = useState(3);
  const [labels, setLabels] = useState<{ invitationId: string; anonymousLabel: string }[]>([]);
  const [messages, setMessages] = useState<ClarificationMessage[]>([]);
  const [selectedInvitation, setSelectedInvitation] = useState<string>('');
  const [finalQuoteCount, setFinalQuoteCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [statusRes, labelsRes, msgRes, finalCount] = await Promise.all([
      fetchRfqStatus(rfqId),
      fetchInvitedLabels(rfqId),
      fetchClarificationMessagesForBuyer(rfqId),
      fetchFinalQuoteCount(rfqId),
    ]);

    if (statusRes.ok) {
      setRfqStatus(statusRes.status);
      setMinQuotes(statusRes.minQuotesRequired);
    }
    if (labelsRes.ok) {
      setLabels(labelsRes.labels);
      if (!selectedInvitation && labelsRes.labels[0]) {
        setSelectedInvitation(labelsRes.labels[0]!.invitationId);
      }
    }
    if (msgRes.ok) setMessages(msgRes.messages);
    setFinalQuoteCount(finalCount);
    setIsLoading(false);
  }, [rfqId, selectedInvitation]);

  useEffect(() => {
    void load();
  }, [load]);

  const threadMessages = messages.filter((m) => m.invitationId === selectedInvitation);

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
    setSuccess('Negotiation closed — proceed to Step 6: Compare Quotes.');
    await load();
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading…</p>;

  const activeLinearStep = rfqStatus === 'OPEN' || rfqStatus === 'CLARIFICATION' ? 4 : 5;

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="rfq-clarification-page">
      <ProcurementStageNavigator
        currentLinearStep={activeLinearStep}
        currentStage={rfqStatus === 'CLARIFICATION' || rfqStatus === 'OPEN' ? 'QUOTING' : 'EVALUATING'}
        orderTitle="Review Received Quotes, Negotiation & Q&A"
        orderReference={`RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/market-intelligence`}
        backToLabel="Step 3: Market Intelligence"
      />

      {/* Header Bar */}
      <div className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-blue-100 dark:bg-blue-950/60 px-2 py-0.5 text-[10px] font-bold text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
            Step {activeLinearStep} / 15
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {activeLinearStep === 4 ? 'Review Received Quotes & Start Negotiation' : 'Close Negotiation & Freeze Quotes'}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              RFQ: <strong>{rfqStatus}</strong> · Clarify specifications with anonymous suppliers before freezing quotes.
            </p>
          </div>
        </div>

        {rfqStatus === 'OPEN' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCloseInitial()}
              className="rounded border bg-card px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 transition"
              data-testid="close-initial-quoting-button"
            >
              💬 Open Q&amp;A
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCloseClarification()}
              className="rounded bg-emerald-700 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 disabled:opacity-50 transition"
              title="Skip negotiation and evaluate submitted quotes immediately"
            >
              ⚡ Freeze &amp; Compare →
            </button>
          </div>
        )}

        {rfqStatus === 'CLARIFICATION' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCloseClarification()}
              className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground disabled:opacity-50 shadow-2xs"
              data-testid="close-clarification-button"
            >
              🔒 Close &amp; Compare ({finalQuoteCount}/{minQuotes}) →
            </button>
          </div>
        )}

        {['EVALUATING', 'AWARDED', 'CLOSED'].includes(rfqStatus) && (
          <Link
            to={`/rfq/${rfqId}/evaluation`}
            className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition shrink-0"
          >
            Step 6: Compare Quotes →
          </Link>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-1.5 rounded border shrink-0 mt-1">{error}</p>}
      {success && <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-1.5 rounded border shrink-0 mt-1">{success}</p>}

      <div className="zero-scroll-pane mt-2 space-y-2">
        <RfqPhasePanel rfqId={rfqId} side="BUYER" />

        {rfqStatus === 'CLARIFICATION' && (
          <section className="grid gap-2 md:grid-cols-[10rem_1fr] rounded-lg border bg-card p-2.5">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Anonymous Suppliers</h2>
              <ul className="space-y-1">
                {labels.map((l) => (
                  <li key={l.invitationId}>
                    <button
                      type="button"
                      onClick={() => setSelectedInvitation(l.invitationId)}
                      className={`w-full rounded px-2 py-1 text-left text-xs font-medium transition ${
                        selectedInvitation === l.invitationId
                          ? 'bg-primary text-primary-foreground font-bold shadow-2xs'
                          : 'hover:bg-muted text-foreground'
                      }`}
                    >
                      {l.anonymousLabel}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {selectedInvitation && (
              <div className="min-h-[260px]">
                <ClarificationThread
                  rfqId={rfqId}
                  invitationId={selectedInvitation}
                  messages={threadMessages}
                  authorSide="BUYER"
                  onPosted={() => void load()}
                />
              </div>
            )}
          </section>
        )}

        {/* Supplier Attachments (Neutral labels) */}
        <QuoteAttachmentsPanel rfqId={rfqId} revealed={false} />
      </div>
    </div>
  );
}
