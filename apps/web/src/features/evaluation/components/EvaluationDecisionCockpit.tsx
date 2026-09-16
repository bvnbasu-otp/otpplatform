import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { IdentityProtectedQuote } from '@otp/domain';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import { useIdentityProtectedQuotes } from '@/features/rfq/hooks/use-identity-protected-quotes';
import { useQuoteEvaluations } from '../hooks/use-quote-evaluations';
import { CriterionBreakdownTable } from './CriterionBreakdownTable';
import { MobileVotingCard } from './MobileVotingCard';
import { DecisionReceipt } from '@/features/reveal/components/DecisionReceipt';
import { QuoteComparisonSummaryHeader } from '@/features/rfq/components/QuoteComparisonSummaryHeader';
import { IdentityProtectedQuoteComparisonTable } from '@/features/rfq/components/IdentityProtectedQuoteComparisonTable';
import { QuoteBoqBottomSheet } from '@/features/rfq/components/QuoteBoqBottomSheet';
import {
  closeClarificationForEvaluation,
  fetchRfqStatus,
  waiveMinQuotesAndEvaluate,
} from '@/features/clarification/api/clarification';
import {
  fetchAward,
  lockAndRevealAwardAtomic,
  type AtomicAwardResult,
  type AwardSummary,
} from '@/features/award/api/awards';
import {
  fetchMyVote,
  fetchVotes,
  fetchVoteTally,
  fetchVotingSummary,
} from '@/features/governance/api/committee-votes';
import { fetchPurchaseOrderByRfq } from '@/features/fulfillment/api/purchase-orders';
import { fetchRevealedQuotes, type RevealedQuoteRow } from '@/features/reveal/api/fetch-revealed-quotes';
import { getPilotByRfqId } from '@/lib/pilots';

export interface EvaluationDecisionCockpitProps {
  rfqId: string;
  rfqTitle?: string;
  initialTab?: 'matrix' | 'vote' | 'award';
}

function formatInr(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

export function EvaluationDecisionCockpit({
  rfqId,
  rfqTitle,
  initialTab = 'matrix',
}: EvaluationDecisionCockpitProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlQuoteId = searchParams.get('quote') || searchParams.get('quoteId');

  // Quotes and Evaluations
  const { quotes, isLoading: quotesLoading, error: quotesError, refresh: refreshQuotes } =
    useIdentityProtectedQuotes(rfqId);
  const {
    evaluations,
    criteria,
    isLoading: scoresLoading,
    isRecomputing,
    error: scoresError,
    recompute,
    refresh: refreshScores,
  } = useQuoteEvaluations(rfqId);

  // Cockpit States
  const [activeTab, setActiveTab] = useState<'matrix' | 'vote' | 'award'>(initialTab);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [rfqStatus, setRfqStatus] = useState<string | null>(null);
  const [minQuotesRequired, setMinQuotesRequired] = useState(3);
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [revealedResult, setRevealedResult] = useState<AtomicAwardResult | null>(null);
  const [revealedQuotes, setRevealedQuotes] = useState<RevealedQuoteRow[]>([]);
  const [existingPoId, setExistingPoId] = useState<string | null>(null);
  const [hasMyVote, setHasMyVote] = useState(false);
  const [isSoloBuyer, setIsSoloBuyer] = useState(false);
  const [quorumMet, setQuorumMet] = useState(false);
  const [summaryVotes, setSummaryVotes] = useState<any>(null);
  const [showBoqQuote, setShowBoqQuote] = useState<IdentityProtectedQuote | null>(null);
  const [showCriterionBreakdown, setShowCriterionBreakdown] = useState(false);
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [awardJustification, setAwardJustification] = useState('');
  const [isAwarding, setIsAwarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Pilot / Context Metadata
  const pilot = useMemo(() => getPilotByRfqId(rfqId), [rfqId]);
  const effectiveTitle =
    rfqTitle || (pilot ? `RFQ: ${pilot.requirementTitle}` : 'RFQ — Unified Evaluation & Decision Cockpit');
  const location = pilot?.location || 'Bengaluru';

  // Load Status and Governance Signals
  const loadCockpitStatus = useCallback(async () => {
    try {
      const [statusRes, awardRes, poRes, myVoteRes, summaryRes] = await Promise.all([
        fetchRfqStatus(rfqId),
        fetchAward(rfqId),
        fetchPurchaseOrderByRfq(rfqId),
        fetchMyVote(rfqId),
        fetchVotingSummary(rfqId),
      ]);

      if (statusRes.ok) {
        setRfqStatus(statusRes.status);
        if (statusRes.minQuotesRequired) setMinQuotesRequired(statusRes.minQuotesRequired);
      }

      if (awardRes.ok && awardRes.award) {
        setAward(awardRes.award);
        if (awardRes.award.status === 'REVEALED') {
          const revQuotesRes = await fetchRevealedQuotes(rfqId);
          if (revQuotesRes.ok) setRevealedQuotes(revQuotesRes.quotes);
        }
      }

      if (poRes.ok && poRes.poId) {
        setExistingPoId(poRes.poId);
      }

      if (myVoteRes.ok && myVoteRes.vote) {
        setHasMyVote(true);
        if (myVoteRes.vote.buyerType === 'INDIVIDUAL') {
          setIsSoloBuyer(true);
        }
      }

      if (summaryRes.ok && summaryRes.summary) {
        setSummaryVotes(summaryRes.summary);
        if (summaryRes.summary.assignedMembers <= 1) {
          setIsSoloBuyer(true);
        }
        if (summaryRes.summary.membersVoted >= summaryRes.summary.assignedMembers) {
          setQuorumMet(true);
        }
      }
    } catch {
      // Non-critical governance signal
    }
  }, [rfqId]);

  useEffect(() => {
    void loadCockpitStatus();
  }, [loadCockpitStatus]);

  // Derived Best-in-Class Metrics
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

  // Auto-generate award justification based on candidate performance
  useEffect(() => {
    if (selectedQuote && !awardJustification) {
      const parts = [
        `Recommended based on commercial value (${formatInr(selectedQuote.totalCost)} landed with GST)`,
        `TAT: ${selectedQuote.deliveryDays} days`,
        `Warranty: ${selectedQuote.warrantyMonths} months`,
      ];
      if (selectedQuote.evaluationScore != null) {
        parts.push(`Merit Smart Score: ${(selectedQuote.evaluationScore / 10).toFixed(1)}/10`);
      }
      setAwardJustification(parts.join(' · '));
    }
  }, [selectedQuote, awardJustification]);

  const isAwarded = rfqStatus === 'AWARDED' || Boolean(award && award.status === 'REVEALED');
  const isEvaluating = rfqStatus === 'EVALUATING' || rfqStatus === 'CLOSED';
  const isQuoting = !isAwarded && !isEvaluating;

  // Handler: Fast-Track or Close Quoting
  const handleCloseAndEvaluate = async () => {
    setBusy(true);
    setError(null);
    const res = await closeClarificationForEvaluation(rfqId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await loadCockpitStatus();
    void refreshQuotes();
    void recompute();
  };

  const handleWaiveAndEvaluate = async () => {
    setBusy(true);
    setError(null);
    const res = await waiveMinQuotesAndEvaluate(rfqId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await loadCockpitStatus();
    void refreshQuotes();
    void recompute();
  };

  // Handler: Atomic Award & Bilateral Reveal Execution
  const handleExecuteAtomicAward = async () => {
    if (!selectedQuote) {
      setError('Please select a winning candidate quote to award.');
      return;
    }

    setIsAwarding(true);
    setError(null);
    setSuccess(null);

    const justification =
      awardJustification.trim() ||
      `Awarded to ${selectedQuote.anonymousLabel} on evaluated merit (${formatInr(selectedQuote.totalCost)}).`;

    const res = await lockAndRevealAwardAtomic(rfqId, selectedQuote.quoteId, justification, true);
    setIsAwarding(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setRevealedResult(res.result);
    setShowAwardModal(false);
    setSuccess(
      res.result.businessName
        ? `Tender awarded successfully! Winning supplier is unmasked: ${res.result.businessName}. Official Purchase Order generated.`
        : 'Tender awarded successfully and Purchase Order created.',
    );

    await loadCockpitStatus();
    void refreshQuotes();
    setActiveTab('award');
  };

  const winningQuoteRevealed = useMemo(() => {
    const targetQuoteId = award?.quoteId || revealedResult?.quoteId || selectedQuote?.quoteId;
    return revealedQuotes.find((q) => q.quoteId === targetQuoteId);
  }, [revealedQuotes, award, revealedResult, selectedQuote]);

  return (
    <div
      className="zero-scroll-container p-2.5 sm:p-4 max-w-7xl mx-auto w-full overflow-x-hidden"
      data-testid="evaluation-decision-cockpit"
    >
      {/* 1. 7-State Golden Path Stepper Header */}
      <ProcurementStageNavigator
        currentStage={isAwarded ? 'AWARDED' : isEvaluating ? 'EVALUATING' : 'QUOTING'}
        orderTitle={effectiveTitle}
        orderReference={`RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        poId={existingPoId || revealedResult?.poId || null}
        role="buyer"
        backToUrl="/dashboard"
        backToLabel="Procurement Pipeline"
      />

      {/* Main Content Area */}
      <div className="zero-scroll-pane mt-2 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] space-y-4">
        {/* Requirement Summary & Market Intelligence Header */}
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

        {/* Action Error / Success Feedback */}
        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-200 font-bold shadow-2xs"
          >
            ⚠️ {error}
          </div>
        )}

        {success && (
          <div
            role="status"
            className="rounded-2xl border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-200 font-bold shadow-2xs"
          >
            ✓ {success}
          </div>
        )}

        {/* Quoting Window Open Banner */}
        {isQuoting && (
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-amber-300 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/40 p-3 text-xs text-amber-950 dark:text-amber-200 shadow-2xs">
            <div className="space-y-0.5">
              <span className="font-extrabold text-xs block">
                💬 Sourcing &amp; Quoting Window Open ({quotes.length} Quotes Received)
              </span>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Suppliers have submitted identity-protected offers. You can close quoting to start consensus evaluation.
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

        {/* Cockpit Navigation Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-2xl border border-border bg-muted/30">
          <button
            type="button"
            onClick={() => setActiveTab('matrix')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-extrabold transition mobile-touch-target ${
              activeTab === 'matrix'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="cockpit-tab-matrix"
          >
            <span>⚖️</span>
            <span>1. Offer Comparison ({quotes.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('vote')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-extrabold transition mobile-touch-target ${
              activeTab === 'vote'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="cockpit-tab-vote"
          >
            <span>🗳️</span>
            <span>2. 30-Sec Vote &amp; Quorum {quorumMet ? '✓' : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('award')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-extrabold transition mobile-touch-target ${
              activeTab === 'award'
                ? 'bg-card text-foreground shadow-xs border border-border'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            data-testid="cockpit-tab-award"
          >
            <span>🏆</span>
            <span>3. Award &amp; PO Contract {isAwarded ? '✓' : ''}</span>
          </button>
        </div>

        {/* TAB 1: 4-PILLAR OFFER COMPARISON MATRIX */}
        {activeTab === 'matrix' && (
          <div className="space-y-4 animate-in fade-in-50">
            {/* 4-Pillar Offers Header & Refresh */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black uppercase tracking-wider text-muted-foreground">
                  4-Pillar Offer Comparison Matrix
                </span>
                <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                  🔒 Zero-Bias Sealed Protocol
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadCockpitStatus();
                  void refreshQuotes();
                  void recompute();
                }}
                className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>🔄</span> Refresh
              </button>
            </div>

            {/* Matrix Cards */}
            <IdentityProtectedQuoteComparisonTable
              quotes={quotes}
              isLoading={quotesLoading}
              error={quotesError}
              rfqStatus={rfqStatus}
              rfqTitle={effectiveTitle}
              selectedQuoteId={selectedQuote?.quoteId ?? null}
              onSelectForAward={(q) => setSelectedQuoteId(q.quoteId)}
            />

            {/* Progressive Disclosure: Criterion Breakdown */}
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowCriterionBreakdown((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-foreground hover:text-primary transition py-1"
                >
                  <span>{showCriterionBreakdown ? '▼' : '▶'}</span>
                  <span>View Criterion-by-Criterion Weight Breakdown</span>
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
                  {isRecomputing ? 'Rescoring…' : 'Rescore Quotes'}
                </button>
              </div>

              {showCriterionBreakdown && (
                <div className="pt-2 animate-in fade-in-50">
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
          </div>
        )}

        {/* TAB 2: 30-SECOND MOBILE VOTING CARD */}
        {activeTab === 'vote' && (
          <div className="space-y-4 animate-in fade-in-50">
            <MobileVotingCard
              rfqId={rfqId}
              quotes={quotes.map((q) => ({
                quoteId: q.quoteId,
                anonymousLabel: q.anonymousLabel,
                totalCost: q.totalCost,
                deliveryDays: q.deliveryDays,
                warrantyMonths: q.warrantyMonths,
                evaluationScore: q.evaluationScore,
              }))}
              selectedQuoteId={selectedQuote?.quoteId ?? null}
              onSelectQuote={(quoteId) => setSelectedQuoteId(quoteId)}
              onVoteSuccess={() => {
                void loadCockpitStatus();
                setHasMyVote(true);
              }}
            />
          </div>
        )}

        {/* TAB 3: AWARD & BILATERAL REVEAL EXECUTION */}
        {activeTab === 'award' && (
          <div className="space-y-4 animate-in fade-in-50">
            {/* If Already Awarded -> Show Unmasked Winner + Decision Receipt + PO Contract Preview */}
            {isAwarded ? (
              <div className="space-y-4">
                {/* 1. Winner Banner */}
                <div className="rounded-3xl border-2 border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40 p-4 sm:p-5 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">🏆</span>
                      <div>
                        <span className="rounded-full bg-emerald-200 dark:bg-emerald-900 text-emerald-950 dark:text-emerald-200 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
                          Award Confirmed &amp; Identity Unmasked
                        </span>
                        <h2 className="text-base sm:text-lg font-black text-foreground mt-0.5">
                          {winningQuoteRevealed?.businessName ||
                            revealedResult?.businessName ||
                            'Verified Winning Supplier'}
                        </h2>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {(winningQuoteRevealed?.phone || revealedResult?.supplierId) && (
                        <a
                          href={`https://wa.me/91${(winningQuoteRevealed?.phone || '').replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(winningQuoteRevealed?.businessName || 'Supplier')},%20we%20have%20awarded%20you%20our%20order%20on%20OTP!`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700 transition shadow-xs flex items-center gap-1.5 mobile-touch-target"
                        >
                          <span>💬</span> WhatsApp
                        </a>
                      )}

                      <Link
                        to={existingPoId ? `/purchase-orders/${existingPoId}` : '/purchase-orders'}
                        className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 transition flex items-center gap-1.5 mobile-touch-target"
                      >
                        <span>📄</span> View Purchase Order →
                      </Link>
                    </div>
                  </div>

                  {/* Supplier Details Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs border-t border-emerald-300 dark:border-emerald-800/60">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                        Landed Commercial Value:
                      </span>
                      <span className="font-mono font-black text-foreground text-sm">
                        {formatInr(winningQuoteRevealed?.totalCost || selectedQuote?.totalCost)}
                      </span>
                    </div>

                    {revealedResult?.poNumber && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                          Official PO Number:
                        </span>
                        <span className="font-mono font-bold text-foreground">
                          {revealedResult.poNumber}
                        </span>
                      </div>
                    )}

                    {winningQuoteRevealed?.phone && (
                      <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                          Contact Phone:
                        </span>
                        <span className="font-bold text-foreground">
                          {winningQuoteRevealed.phone}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Cryptographic Decision Receipt */}
                <DecisionReceipt
                  rfqId={rfqId}
                  winningQuoteId={award?.quoteId || revealedResult?.quoteId || selectedQuote?.quoteId || ''}
                />
              </div>
            ) : (
              /* Pre-Award Execution Workspace */
              <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-foreground flex items-center gap-2">
                    <span>🏆</span>
                    <span>Lock Award &amp; Bilateral Reveal</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Atomic 1-step transaction: locks voting results, unmasks winning supplier identity, and generates legal Purchase Order.
                  </p>
                </div>

                {/* Selected Candidate Summary */}
                {selectedQuote && (
                  <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground">
                          Target Candidate for Award:
                        </span>
                        <h4 className="font-mono font-black text-base text-foreground">
                          🔒 {selectedQuote.anonymousLabel}
                        </h4>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground block">
                          Total Landed Cost:
                        </span>
                        <span className="font-mono font-black text-lg text-primary">
                          {formatInr(selectedQuote.totalCost)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2 border-t border-primary/20">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">TAT:</span>
                        <strong className="font-bold">{selectedQuote.deliveryDays} Days</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Warranty:</span>
                        <strong className="font-bold">{selectedQuote.warrantyMonths} Months</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Smart Score:</span>
                        <strong className="font-bold">
                          {selectedQuote.evaluationScore != null
                            ? `${(selectedQuote.evaluationScore / 10).toFixed(1)}/10`
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Award Justification Rationale Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block">
                    Recorded Award Justification (Immutable Audit Trail):
                  </label>
                  <textarea
                    value={awardJustification}
                    onChange={(e) => setAwardJustification(e.target.value)}
                    rows={3}
                    placeholder="Enter objective justification for the award selection…"
                    className="w-full rounded-2xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {/* Execution Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAwardModal(true)}
                    disabled={isAwarding || !selectedQuote}
                    className="w-full min-h-[50px] rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white shadow-lg hover:bg-emerald-700 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-2 mobile-touch-target"
                    data-testid="lock-award-button"
                  >
                    <span>🔒</span>
                    <span>Confirm Award &amp; Reveal Winner (Atomic PO Creation)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. SINGLE OBVIOUS PRIMARY ACTION (Sticky Bottom Action Dock) */}
      <aside
        className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-md border-t border-border shadow-2xl px-3 sm:px-6 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
        data-testid="cockpit-sticky-bottom-bar"
        aria-label="Evaluation Cockpit Primary Action Dock"
      >
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          {/* Left: Selected Candidate Info */}
          <div className="flex items-center justify-between sm:justify-start gap-3 min-w-0">
            {selectedQuote ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-black">
                  ✓
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                      Selected Candidate:
                    </span>
                    <span className="font-mono font-bold text-xs text-foreground truncate">
                      {selectedQuote.anonymousLabel}
                    </span>
                    <span className="font-mono font-black text-xs text-primary tabular-nums">
                      {formatInr(selectedQuote.totalCost)}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    ⚡ {selectedQuote.deliveryDays}d TAT · 🛡️ {selectedQuote.warrantyMonths}m Warranty · ★{' '}
                    {selectedQuote.evaluationScore != null
                      ? `${(selectedQuote.evaluationScore / 10).toFixed(1)}/10`
                      : '—'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>👆 Select a candidate offer above</span>
              </div>
            )}
          </div>

          {/* Right: Dynamic Primary Action Button */}
          <div className="flex items-center gap-2 shrink-0">
            {isAwarded ? (
              <Link
                to={existingPoId ? `/purchase-orders/${existingPoId}` : '/purchase-orders'}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-98 transition mobile-touch-target"
                data-testid="primary-action-view-po"
              >
                <span>📋</span>
                <span>View Digital Purchase Order →</span>
              </Link>
            ) : isQuoting ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCloseAndEvaluate()}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 disabled:opacity-50 transition mobile-touch-target"
                data-testid="close-quoting-evaluate-button"
              >
                <span>💬</span>
                <span>{busy ? 'Opening Evaluation…' : 'Close Quoting & Start Evaluation →'}</span>
              </button>
            ) : activeTab === 'matrix' ? (
              <button
                type="button"
                onClick={() => setActiveTab('vote')}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 transition mobile-touch-target"
                data-testid="proceed-to-vote-button"
              >
                <span>🗳️</span>
                <span>Proceed to 30-Sec Vote →</span>
              </button>
            ) : activeTab === 'vote' ? (
              <button
                type="button"
                onClick={() => setActiveTab('award')}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-800 active:scale-98 transition mobile-touch-target"
                data-testid="proceed-to-award-tab-button"
              >
                <span>🏆</span>
                <span>Proceed to Award &amp; PO →</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAwardModal(true)}
                disabled={isAwarding || !selectedQuote}
                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-98 disabled:opacity-50 transition mobile-touch-target"
                data-testid="execute-award-primary-button"
              >
                <span>🔒</span>
                <span>Confirm Award &amp; Reveal Winner →</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* 3. Award Confirmation Modal Drawer */}
      {showAwardModal && selectedQuote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="w-full max-w-md rounded-3xl border bg-card p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl">🏆</span>
              <button
                type="button"
                onClick={() => setShowAwardModal(false)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground text-xs font-bold"
              >
                ✕ Close
              </button>
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-lg font-black text-foreground">Confirm Tender Award</h3>
              <p className="text-xs text-muted-foreground">
                Locking the decision will atomically unmask the winning supplier and generate the legal Purchase Order.
              </p>
            </div>

            <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Winner Candidate:</span>
                <strong className="font-mono">{selectedQuote.anonymousLabel}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Landed Commercial Cost:</span>
                <strong className="font-mono text-primary">{formatInr(selectedQuote.totalCost)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Turnaround Time:</span>
                <strong>{selectedQuote.deliveryDays} Days</strong>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={isAwarding}
                onClick={() => void handleExecuteAtomicAward()}
                className="w-full min-h-[48px] rounded-2xl bg-emerald-600 py-3 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-2 mobile-touch-target"
                data-testid="modal-confirm-atomic-award"
              >
                <span>{isAwarding ? '⏳' : '🔒'}</span>
                <span>{isAwarding ? 'Executing Atomic Award…' : 'Execute Award & Generate PO'}</span>
              </button>

              <button
                type="button"
                disabled={isAwarding}
                onClick={() => setShowAwardModal(false)}
                className="w-full min-h-[44px] rounded-2xl border border-border bg-muted/40 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. BoQ Line Items Sheet */}
      <QuoteBoqBottomSheet
        isOpen={Boolean(showBoqQuote)}
        quote={showBoqQuote}
        rfqTitle={effectiveTitle}
        onClose={() => setShowBoqQuote(null)}
      />
    </div>
  );
}
