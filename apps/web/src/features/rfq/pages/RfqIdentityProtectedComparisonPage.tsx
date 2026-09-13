import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { fetchMyVote, fetchVotingSummary } from '@/features/governance/api/committee-votes';
import { getPilotByRfqId } from '@/lib/pilots';
import { IdentityProtectedQuoteComparisonTable } from '../components/IdentityProtectedQuoteComparisonTable';
import { QuoteComparisonSummaryHeader } from '../components/QuoteComparisonSummaryHeader';
import { QuoteStickyBottomBar } from '../components/QuoteStickyBottomBar';
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
  rfqTitle,
}: RfqIdentityProtectedComparisonPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlQuoteId = searchParams.get('quote') || searchParams.get('quoteId');

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
  const [minQuotesRequired, setMinQuotesRequired] = useState(3);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealedWinner, setRevealedWinner] = useState<RevealedWinner | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCriterionBreakdown, setShowCriterionBreakdown] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [isSoloBuyer, setIsSoloBuyer] = useState(false);
  const [hasCommitteeVote, setHasCommitteeVote] = useState(false);

  // Pilot & Context Metadata
  const pilot = useMemo(() => getPilotByRfqId(rfqId), [rfqId]);
  const effectiveTitle = rfqTitle || (pilot ? `RFQ: ${pilot.requirementTitle}` : 'RFQ — Identity-Protected Evaluation');
  const location = pilot?.location || 'Bengaluru';

  const loadStatus = async () => {
    const res = await fetchRfqStatus(rfqId);
    if (res.ok) {
      setRfqStatus(res.status);
      if (res.minQuotesRequired) setMinQuotesRequired(res.minQuotesRequired);
    }

    const sig = await fetchLifecycleSignals(rfqId);
    const isRevealed = sig.ok && sig.signals.revealStatus === 'REVEALED';
    if (isRevealed) setRevealed(true);

    if (res.ok && res.status === 'AWARDED' || isRevealed) {
      const winnerRes = await revealSupplier(rfqId);
      if (winnerRes.ok && winnerRes.winner) {
        setRevealedWinner(winnerRes.winner);
        setRevealed(true);
      }
    }

    // Check governance / solo buyer status
    try {
      const [summaryRes, myVoteRes] = await Promise.all([
        fetchVotingSummary(rfqId),
        fetchMyVote(rfqId),
      ]);
      if (myVoteRes.ok && myVoteRes.vote) {
        setHasCommitteeVote(true);
        if (myVoteRes.vote.buyerType === 'INDIVIDUAL') {
          setIsSoloBuyer(true);
        }
      }
      if (summaryRes.ok && summaryRes.summary) {
        if (summaryRes.summary.assignedMembers <= 1) {
          setIsSoloBuyer(true);
        }
      }
    } catch {
      // Non-critical governance signal
    }
  };

  useEffect(() => {
    void loadStatus();
  }, [rfqId]);

  const canCompare = rfqStatus === 'EVALUATING' || rfqStatus === 'AWARDED' || rfqStatus === 'CLOSED';

  // Compute Highlights Across Valid Quotes
  const validQuotes = useMemo(() => quotes.filter((q) => q.totalCost && q.totalCost > 0), [quotes]);

  const lowestPriceQuote = useMemo(() => {
    if (validQuotes.length === 0) return null;
    return [...validQuotes].sort((a, b) => (a.totalCost ?? Infinity) - (b.totalCost ?? Infinity))[0];
  }, [validQuotes]);

  const fastestDeliveryQuote = useMemo(() => {
    if (validQuotes.length === 0) return null;
    return [...validQuotes].sort((a, b) => (a.deliveryDays ?? Infinity) - (b.deliveryDays ?? Infinity))[0];
  }, [validQuotes]);

  const longestWarrantyQuote = useMemo(() => {
    if (validQuotes.length === 0) return null;
    return [...validQuotes].sort((a, b) => (b.warrantyMonths ?? 0) - (a.warrantyMonths ?? 0))[0];
  }, [validQuotes]);

  const topRatedQuote = useMemo(() => {
    if (validQuotes.length === 0) return null;
    return [...validQuotes].sort((a, b) => (b.evaluationScore ?? 0) - (a.evaluationScore ?? 0))[0];
  }, [validQuotes]);

  // Sync selected quote
  useEffect(() => {
    if (quotes.length > 0 && !selectedQuoteId) {
      if (urlQuoteId && quotes.some((q) => q.quoteId === urlQuoteId)) {
        setSelectedQuoteId(urlQuoteId);
      } else {
        setSelectedQuoteId(lowestPriceQuote?.quoteId ?? quotes[0]?.quoteId ?? null);
      }
    }
  }, [quotes, urlQuoteId, selectedQuoteId, lowestPriceQuote]);

  const selectedQuote = useMemo(() => {
    return quotes.find((q) => q.quoteId === selectedQuoteId) ?? lowestPriceQuote ?? quotes[0] ?? null;
  }, [quotes, selectedQuoteId, lowestPriceQuote]);

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

  const handleSelectCandidate = (quote: IdentityProtectedQuote) => {
    setSelectedQuoteId(quote.quoteId);
  };

  return (
    <div
      className="zero-scroll-container p-2.5 sm:p-4 max-w-7xl mx-auto w-full overflow-x-hidden"
      data-testid="rfq-identity-protected-evaluation-page"
    >
      <ProcurementStageNavigator
        currentLinearStep={6}
        currentStage={rfqStatus === 'AWARDED' ? 'AWARDED' : 'EVALUATING'}
        orderTitle={effectiveTitle}
        orderReference={`RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        poId={revealedWinner?.poId ?? null}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/clarification`}
        backToLabel="Step 5: Close Negotiation"
      />

      {/* Main Content Scroll Pane with safe-area padding for mobile sticky bottom CTA */}
      <div className="zero-scroll-pane mt-2 pb-[calc(6rem+env(safe-area-inset-bottom,0px))] space-y-3.5">
        {/* 1. Header & Summary Card */}
        <QuoteComparisonSummaryHeader
          rfqTitle={effectiveTitle}
          location={location}
          budgetTarget={lowestPriceQuote?.totalCost ? Math.round(lowestPriceQuote.totalCost * 1.15) : null}
          quotesCount={quotes.length}
          minQuotesRequired={minQuotesRequired}
          rfqStatus={rfqStatus}
          lowestPrice={lowestPriceQuote?.totalCost}
          fastestTat={fastestDeliveryQuote?.deliveryDays}
          longestWarranty={longestWarrantyQuote?.warrantyMonths}
          highestScore={topRatedQuote?.evaluationScore}
        />

        {/* Action Error Banner if any */}
        {actionError && (
          <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-xs font-bold text-red-700 dark:text-red-300 shadow-2xs">
            ⚠️ {actionError}
          </div>
        )}

        {/* 2. Persistent Awarded Winner Banner if Tender is Awarded */}
        {rfqStatus === 'AWARDED' && (
          <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-2xl shrink-0">🏆</span>
              <div className="min-w-0">
                <span className="rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 border border-emerald-300 px-2 py-0.2 text-[9px] font-black uppercase tracking-wider">
                  Tender Awarded &amp; PO Issued
                </span>
                <h2 className="text-sm font-extrabold text-foreground truncate mt-0.5">
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
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 transition shadow-xs flex items-center gap-1.5 mobile-touch-target"
                >
                  <span>💬</span> WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={() => navigate('/purchase-orders')}
                className="rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 transition flex items-center gap-1.5 mobile-touch-target"
              >
                <span>📄</span> View PO →
              </button>
            </div>
          </div>
        )}

        {/* 3. Quoting Status Banner if not yet evaluating */}
        {!canCompare && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-amber-300 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/40 p-3 text-xs text-amber-950 dark:text-amber-200 shadow-2xs">
            <div className="space-y-0.5">
              <span className="font-extrabold text-xs block">
                💬 Quoting Window Open ({quotes.length} Quotes Received)
              </span>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                You can fast-track to evaluation or wait for more quotes before locking the comparison.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCloseAndEvaluate()}
                className="rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition mobile-touch-target"
                data-testid="close-quoting-evaluate-button"
              >
                {busy ? 'Opening Evaluation…' : 'Close Quoting & Start Evaluation →'}
              </button>
              {quotes.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleWaiveAndEvaluate()}
                  className="rounded-xl border border-amber-400 dark:border-amber-700 bg-card px-3 py-2 text-xs font-extrabold text-amber-950 dark:text-amber-200 hover:bg-amber-100 disabled:opacity-50 transition mobile-touch-target"
                >
                  ⚡ Fast-Track
                </button>
              )}
            </div>
          </div>
        )}

        {/* RFQ Phase & Schedule Panel */}
        <RfqPhasePanel rfqId={rfqId} side="BUYER" />

        {/* 4. STACKED 4-PILLAR COMPARISON CARDS (Flagship Section) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Side-by-Side 4-Pillar Comparison Matrix
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void loadStatus();
                  void refresh();
                  void recompute();
                }}
                className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>🔄</span> Refresh
              </button>
              <span className="text-[11px] font-bold text-muted-foreground">
                {quotes.length} {quotes.length === 1 ? 'Quote' : 'Quotes'}
              </span>
            </div>
          </div>

          <IdentityProtectedQuoteComparisonTable
            quotes={quotes}
            isLoading={isLoading}
            error={error}
            rfqStatus={rfqStatus}
            rfqTitle={effectiveTitle}
            selectedQuoteId={selectedQuote?.quoteId ?? null}
            onSelectForAward={handleSelectCandidate}
          />
        </div>

        {/* 5. Progressive Disclosure: Criterion Breakdown Scoring Table */}
        {canCompare && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setShowCriterionBreakdown((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs font-extrabold text-foreground hover:text-primary transition py-1"
                aria-expanded={showCriterionBreakdown}
              >
                <span>{showCriterionBreakdown ? '▼' : '▶'}</span>
                <span>Criterion-by-Criterion Weight Breakdown</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  ({criteria.length} Weighted Criteria)
                </span>
              </button>

              <button
                type="button"
                onClick={() => void recompute()}
                disabled={isRecomputing}
                className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50"
              >
                {isRecomputing ? 'Rescoring…' : 'Rescore'}
              </button>
            </div>

            {showCriterionBreakdown && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
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
        )}
      </div>

      {/* 6. SINGLE OBVIOUS PRIMARY ACTION (Sticky Bottom Bar) */}
      <QuoteStickyBottomBar
        rfqId={rfqId}
        selectedQuote={selectedQuote}
        rfqStatus={rfqStatus}
        isSoloBuyer={isSoloBuyer}
        hasCommitteeVote={hasCommitteeVote}
        onCloseQuotingAndEvaluate={() => void handleCloseAndEvaluate()}
        busy={busy}
        revealedWinnerPoId={revealedWinner?.poId ?? null}
      />

      {/* 7. Post-Award Confirmation Modal Drawer */}
      {showSuccessModal && revealedWinner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <span className="text-3xl">🏆</span>
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted text-xs font-bold transition mobile-touch-target"
                aria-label="Close modal"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-xl font-black text-foreground">Order Successfully Awarded!</h3>
              <p className="text-xs text-muted-foreground">
                Supplier identities have been unmasked and official Purchase Order generated.
              </p>
            </div>

            <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-950/40 p-4 space-y-2">
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
                  className="w-full rounded-2xl bg-emerald-600 py-3 text-xs font-extrabold text-white text-center shadow-md hover:bg-emerald-700 transition flex items-center justify-center gap-2 mobile-touch-target"
                >
                  <span>💬 Chat on WhatsApp</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => navigate('/purchase-orders')}
                className="w-full rounded-2xl bg-primary py-3 text-xs font-extrabold text-primary-foreground text-center shadow-md hover:bg-primary/90 transition mobile-touch-target"
              >
                📄 View Official Purchase Order &amp; Track Delivery →
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
