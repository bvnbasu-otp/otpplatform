import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  fetchRfqStatus,
  closeClarificationForEvaluation,
  waiveMinQuotesAndEvaluate,
} from '@/features/clarification/api/clarification';
import { fetchLifecycleSignals } from '@/features/lifecycle/api/fetch-lifecycle';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import { RfqPhasePanel } from '@/features/phase';
import { CriterionBreakdownTable } from '@/features/evaluation/components/CriterionBreakdownTable';
import { useQuoteEvaluations } from '@/features/evaluation/hooks/use-quote-evaluations';
import { revealSupplier, type RevealedWinner } from '@/features/reveal/api/reveal';
import { IdentityProtectedQuoteComparisonTable } from '../components/IdentityProtectedQuoteComparisonTable';
import { useIdentityProtectedQuotes } from '../hooks/use-identity-protected-quotes';
import type { IdentityProtectedQuote } from '@otp/domain';

export interface RfqIdentityProtectedComparisonPageProps {
  rfqId: string;
  rfqTitle?: string;
}

// Legacy alias
export type RfqBlindComparisonPageProps = RfqIdentityProtectedComparisonPageProps;

export function RfqIdentityProtectedComparisonPage({
  rfqId,
  rfqTitle = 'RFQ — Fair Anonymous Comparison',
}: RfqIdentityProtectedComparisonPageProps) {
  const navigate = useNavigate();
  const { quotes, isLoading, error, refresh } = useIdentityProtectedQuotes(rfqId);
  const {
    evaluations,
    criteria,
    isLoading: scoresLoading,
    isRecomputing,
    error: scoresError,
    recompute,
  } = useQuoteEvaluations(rfqId);
  const [rfqStatus, setRfqStatus] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealedWinner, setRevealedWinner] = useState<RevealedWinner | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const loadStatus = async () => {
    const res = await fetchRfqStatus(rfqId);
    const currentStatus = res.ok ? res.status : null;
    if (currentStatus) setRfqStatus(currentStatus);

    const sig = await fetchLifecycleSignals(rfqId);
    const isRevealed = sig.ok && sig.signals.revealStatus === 'REVEALED';
    if (isRevealed) setRevealed(true);

    if (currentStatus === 'AWARDED' || isRevealed) {
      const winnerRes = await revealSupplier(rfqId);
      if (winnerRes.ok && winnerRes.winner) {
        setRevealedWinner(winnerRes.winner);
        setRevealed(true);
      }
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [rfqId]);

  const canCompare = rfqStatus === 'EVALUATING' || rfqStatus === 'AWARDED' || rfqStatus === 'CLOSED';

  // Compute Highlights
  const validQuotes = useMemo(() => quotes.filter((q) => q.totalCost && q.totalCost > 0), [quotes]);

  const lowestPriceQuote = useMemo(() => {
    if (validQuotes.length === 0) return null;
    return [...validQuotes].sort((a, b) => (a.totalCost ?? Infinity) - (b.totalCost ?? Infinity))[0];
  }, [validQuotes]);

  const fastestDeliveryQuote = useMemo(() => {
    if (validQuotes.length === 0) return null;
    return [...validQuotes].sort((a, b) => (a.deliveryDays ?? Infinity) - (b.deliveryDays ?? Infinity))[0];
  }, [validQuotes]);

  const topRatedQuote = useMemo(() => {
    if (validQuotes.length === 0) return null;
    return [...validQuotes].sort((a, b) => (b.supplierRatingAvg ?? 0) - (a.supplierRatingAvg ?? 0))[0];
  }, [validQuotes]);

  const handleCloseAndEvaluate = async () => {
    setBusy(true);
    setActionError(null);
    const res = await closeClarificationForEvaluation(rfqId);
    setBusy(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    await loadStatus();
    void refresh();
    void recompute();
  };

  const handleWaiveAndEvaluate = async () => {
    setBusy(true);
    setActionError(null);
    const res = await waiveMinQuotesAndEvaluate(rfqId);
    setBusy(false);
    if (!res.ok) {
      setActionError(res.error);
      return;
    }
    await loadStatus();
    void refresh();
    void recompute();
  };

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="rfq-identity-protected-evaluation-page">
      <ProcurementStageNavigator
        currentLinearStep={6}
        currentStage={rfqStatus === 'AWARDED' ? 'AWARDED' : 'EVALUATING'}
        orderTitle={rfqTitle}
        orderReference={`RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        poId={revealedWinner?.poId ?? null}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/clarification`}
        backToLabel="Step 5: Close Negotiation"
      />

      {/* Header */}
      <div className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-teal-100 dark:bg-teal-950/60 px-2 py-0.5 text-[10px] font-bold text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">
            Step 6 / 15
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">Fair Anonymous Comparison</h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              Side-by-side comparison matrix on price, turnaround, warranty, and specs under masked supplier aliases.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              void loadStatus();
              void refresh();
              void recompute();
            }}
            className="rounded border bg-card px-2.5 py-1 text-xs font-semibold hover:bg-muted transition shadow-2xs"
          >
            🔄 Refresh
          </button>
          <Link
            to={`/rfq/${rfqId}/committee`}
            className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90"
            data-testid="proceed-to-evaluation-room-button"
          >
            <span>Step 7: Voting Room</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-bold text-red-700 dark:text-red-300 shrink-0 mt-1">
          ⚠️ {actionError}
        </div>
      )}

      {/* PERSISTENT AWARDED WINNER & OFFICIAL PURCHASE ORDER BANNER */}
      {rfqStatus === 'AWARDED' && (
        <div className="rounded-lg border-2 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/20 p-3 shadow-2xs shrink-0 mt-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">🏆</span>
            <div className="min-w-0">
              <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-300 px-1.5 py-0.2 text-[9px] font-bold">
                TENDER AWARDED &amp; PO ISSUED
              </span>
              <h2 className="text-xs font-bold text-foreground truncate">
                {revealedWinner?.businessName ?? 'Winning Supplier Selected'} · PO #{revealedWinner?.poNumber ?? 'Generated'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {revealedWinner?.contactPhone && (
              <a
                href={`https://wa.me/91${revealedWinner.contactPhone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(revealedWinner.businessName)},%20we%20have%20awarded%20you%20our%20order%20on%20OTP!`}
                target="_blank"
                rel="noreferrer"
                className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-700 transition shadow-2xs flex items-center gap-1"
              >
                <span>💬</span> WhatsApp
              </a>
            )}
            <button
              type="button"
              onClick={() => navigate('/purchase-orders')}
              className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition flex items-center gap-1"
            >
              <span>📄</span> View PO →
            </button>
          </div>
        </div>
      )}

      {/* Quoting Status Action Bar if not evaluating */}
      {!canCompare && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 dark:border-amber-800/60 bg-amber-50/80 dark:bg-amber-950/30 p-2 text-xs text-amber-950 dark:text-amber-200 shadow-2xs shrink-0 mt-1">
          <div>
            <span className="font-bold text-xs">💬 Quoting Window Open ({quotes.length} Quotes Received)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleCloseAndEvaluate()}
              className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50"
              data-testid="close-quoting-evaluate-button"
            >
              {busy ? 'Opening Evaluation…' : 'Close Quoting & Start Evaluation →'}
            </button>
            {quotes.length > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleWaiveAndEvaluate()}
                className="rounded border border-amber-400 dark:border-amber-700 bg-card px-2.5 py-1 text-xs font-bold text-amber-950 dark:text-amber-200 hover:bg-amber-100 disabled:opacity-50"
              >
                ⚡ Fast-Track
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content Scroll Pane */}
      <div className="zero-scroll-pane mt-2 pb-20 sm:pb-12 space-y-2">
        <RfqPhasePanel rfqId={rfqId} side="BUYER" />

        {/* Full Detailed Comparison Table */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">Side-by-Side Comparison Matrix</h2>
            <span className="text-[11px] text-muted-foreground">{quotes.length} Quotes</span>
          </div>
          <IdentityProtectedQuoteComparisonTable
            quotes={quotes}
            isLoading={isLoading}
            error={error}
            rfqStatus={rfqStatus}
          />
        </div>

        {canCompare && (
          <div className="space-y-2">
            <CriterionBreakdownTable
              evaluations={evaluations}
              criteria={criteria}
              isLoading={scoresLoading}
              isRecomputing={isRecomputing}
              error={scoresError}
              onRecompute={() => void recompute()}
            />
          </div>
        )}
      </div>

      {/* Congratulations & Revealed Winner Modal Drawer */}
      {showSuccessModal && revealedWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <span className="text-3xl">🏆</span>
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-bold transition"
                aria-label="Close modal"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-xl font-black text-foreground">Order Successfully Placed!</h3>
              <p className="text-xs text-muted-foreground">
                Your award is locked and official Purchase Order has been generated.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/30 p-4 space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
                Selected Winning Supplier:
              </span>
              <p className="text-base font-extrabold text-foreground">{revealedWinner.businessName}</p>
              {revealedWinner.poNumber && (
                <p className="text-xs font-mono font-bold text-emerald-900 dark:text-emerald-300">
                  PO Number: {revealedWinner.poNumber}
                </p>
              )}
              {revealedWinner.contactPhone && (
                <p className="text-xs font-semibold text-foreground">
                  📞 Phone: <a href={`tel:${revealedWinner.contactPhone}`} className="underline">{revealedWinner.contactPhone}</a>
                </p>
              )}
              {revealedWinner.contactEmail && (
                <p className="text-xs text-muted-foreground">
                  ✉️ Email: {revealedWinner.contactEmail}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {revealedWinner.contactPhone && (
                <a
                  href={`https://wa.me/91${revealedWinner.contactPhone.replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(revealedWinner.businessName)},%20we%20have%20awarded%20you%20our%20order%20on%20OTP!`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-extrabold text-white text-center shadow-md hover:bg-emerald-700 transition flex items-center justify-center gap-2"
                >
                  <span>💬 Chat on WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => navigate('/purchase-orders')}
                className="w-full rounded-xl bg-primary py-3 text-xs font-extrabold text-primary-foreground text-center shadow hover:bg-primary/90 transition"
              >
                📄 View Official Purchase Order ({revealedWinner.poNumber ?? 'Official PO'}) &amp; Track Delivery →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Legacy alias
export const RfqBlindComparisonPage = RfqIdentityProtectedComparisonPage;
