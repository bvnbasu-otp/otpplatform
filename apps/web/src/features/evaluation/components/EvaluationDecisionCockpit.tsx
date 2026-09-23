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
import { MarketIntelligencePanel } from '@/features/procurement-os/components/MarketIntelligencePanel';
import { fetchMarketIntelligence } from '@/features/procurement-os/api/fetch-market-intelligence';
import { EvaluationApprovalRouteBanner } from './EvaluationApprovalRouteBanner';
import type { MarketIntelligenceSummary, ApprovalRouteEvaluation } from '@otp/domain';
import { evaluateApprovalRoute } from '@otp/domain';
import {
  closeClarificationForEvaluation,
  fetchRfqStatus,
  waiveMinQuotesAndEvaluate,
  fetchInvitedLabels,
  fetchClarificationMessagesForBuyer,
  type ClarificationMessage,
} from '@/features/clarification/api/clarification';
import { ClarificationThread } from '@/features/clarification/components/ClarificationThread';
import { openRfq, discoverAndInvite } from '@/features/requirement/api/rfq-lifecycle';
import { simulateQuotesForRfq } from '@/features/rfq/api/simulate-quotes';
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

export type CockpitTab = 'quotes' | 'qa' | 'vote' | 'award';

export interface EvaluationDecisionCockpitProps {
  rfqId: string;
  rfqTitle?: string;
  initialTab?: 'quotes' | 'qa' | 'vote' | 'award' | 'matrix' | 'clarification' | 'committee' | 'ballot' | 'decision' | 'reveal';
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

function normalizeTab(raw: string | null | undefined): CockpitTab {
  if (!raw) return 'quotes';
  const clean = raw.toLowerCase().trim();
  if (clean === 'qa' || clean === 'clarification' || clean === 'q&a' || clean === 'questions') return 'qa';
  if (clean === 'vote' || clean === 'ballot' || clean === 'committee') return 'vote';
  if (clean === 'award' || clean === 'decision' || clean === 'reveal') return 'award';
  return 'quotes';
}

export function EvaluationDecisionCockpit({
  rfqId,
  rfqTitle,
  initialTab = 'quotes',
}: EvaluationDecisionCockpitProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuoteId = searchParams.get('quote') || searchParams.get('quoteId');
  const urlTab = searchParams.get('tab');

  // Active Tab State
  const [activeTab, setActiveTab] = useState<CockpitTab>(() => normalizeTab(urlTab || initialTab));

  // Sync tab state when URL changes or tab is switched
  const handleTabChange = useCallback((newTab: CockpitTab) => {
    setActiveTab(newTab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', newTab);
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams]);

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

  // Cockpit Governance & Execution States
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

  // Progressive Disclosure Sheets & Drawers
  const [showBoqQuote, setShowBoqQuote] = useState<IdentityProtectedQuote | null>(null);
  const [showCriterionBreakdown, setShowCriterionBreakdown] = useState(false);
  const [showMarketContext, setShowMarketContext] = useState(false);
  const [marketIntelligence, setMarketIntelligence] = useState<MarketIntelligenceSummary | null>(null);
  const [marketIntelLoading, setMarketIntelLoading] = useState(false);
  const [showDecisionReceiptFull, setShowDecisionReceiptFull] = useState(false);

  // Q&A / Clarification States
  const [qaLabels, setQaLabels] = useState<{ invitationId: string; anonymousLabel: string }[]>([]);
  const [qaMessages, setQaMessages] = useState<ClarificationMessage[]>([]);
  const [selectedInvitationId, setSelectedInvitationId] = useState<string>('');
  const [qaLoading, setQaLoading] = useState(false);

  // Award Modal & Operations
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [awardJustification, setAwardJustification] = useState('');
  const [isAwarding, setIsAwarding] = useState(false);
  const [isSimulatingQuotes, setIsSimulatingQuotes] = useState(false);
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
        // Auto-seed quotes if landed on evaluation while in draft
        if (statusRes.status === 'DRAFT') {
          void discoverAndInvite(rfqId).then(() => {
            void openRfq(rfqId).then(() => {
              void refreshQuotes();
              void recompute();
            });
          });
        }
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
          setQuorumMet(true);
        } else if (summaryRes.summary.membersVoted >= summaryRes.summary.assignedMembers) {
          setQuorumMet(true);
        }
      }
    } catch {
      // Non-critical governance signal
    }
  }, [rfqId, refreshQuotes, recompute]);

  // Load Q&A Messages
  const loadQaMessages = useCallback(async () => {
    setQaLoading(true);
    try {
      const [labelsRes, msgRes] = await Promise.all([
        fetchInvitedLabels(rfqId),
        fetchClarificationMessagesForBuyer(rfqId),
      ]);
      if (labelsRes.ok) {
        setQaLabels(labelsRes.labels);
        if (!selectedInvitationId && labelsRes.labels[0]) {
          setSelectedInvitationId(labelsRes.labels[0].invitationId);
        }
      }
      if (msgRes.ok) {
        setQaMessages(msgRes.messages);
      }
    } catch {
      // Ignore
    } finally {
      setQaLoading(false);
    }
  }, [rfqId, selectedInvitationId]);

  // Load Market Context Benchmarks
  const loadMarketIntelligence = useCallback(async () => {
    setMarketIntelLoading(true);
    try {
      const res = await fetchMarketIntelligence(rfqId);
      if (res.ok) {
        setMarketIntelligence(res.intelligence);
      }
    } catch {
      // Ignore
    } finally {
      setMarketIntelLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    void loadCockpitStatus();
    void loadQaMessages();
  }, [loadCockpitStatus, loadQaMessages]);

  useEffect(() => {
    if (showMarketContext && !marketIntelligence) {
      void loadMarketIntelligence();
    }
  }, [showMarketContext, marketIntelligence, loadMarketIntelligence]);

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
        parts.push(`Merit Score: ${(selectedQuote.evaluationScore / 10).toFixed(1)}/10`);
      }
      setAwardJustification(parts.join(' · '));
    }
  }, [selectedQuote, awardJustification]);

  // Derived Dynamic Spend Approval Route Evaluation
  const approvalRouteEvaluation = useMemo<ApprovalRouteEvaluation | null>(() => {
    const amount = selectedQuote?.totalCost ?? lowestPriceQuote?.totalCost ?? null;
    if (amount == null || amount < 0) return null;
    try {
      return evaluateApprovalRoute({
        rfqId,
        organizationId: 'org-current',
        estimatedOrAwardedAmount: amount,
        creatorProfileId: 'usr-buyer',
      });
    } catch {
      return null;
    }
  }, [rfqId, selectedQuote?.totalCost, lowestPriceQuote?.totalCost]);

  const isAwarded = rfqStatus === 'AWARDED' || Boolean(award && award.status === 'REVEALED');
  const isEvaluating = rfqStatus === 'EVALUATING' || rfqStatus === 'CLOSED';
  const isQuoting = !isAwarded && !isEvaluating;

  // Auto-rescore in background on quote revision hash change
  const hasStaleEvaluations = useMemo(() => evaluations.some((e) => e.status === 'STALE'), [evaluations]);
  useEffect(() => {
    if (hasStaleEvaluations && !isRecomputing && !scoresLoading) {
      void recompute();
    }
  }, [hasStaleEvaluations, isRecomputing, scoresLoading, recompute]);

  // Handler: Fast-Track or Close Quoting
  const handleCloseAndEvaluate = async () => {
    setBusy(true);
    setError(null);

    if (rfqStatus === 'DRAFT' || quotes.length === 0) {
      await discoverAndInvite(rfqId);
      await openRfq(rfqId);
    }

    let res = await closeClarificationForEvaluation(rfqId);
    if (!res.ok && (res.error?.toLowerCase().includes('draft') || res.error?.toLowerCase().includes('open'))) {
      await openRfq(rfqId);
      res = await closeClarificationForEvaluation(rfqId);
    }

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

  const handleSimulateQuotes = async () => {
    setIsSimulatingQuotes(true);
    setError(null);
    setSuccess(null);
    const res = await simulateQuotesForRfq(rfqId, { force: true });
    setIsSimulatingQuotes(false);
    if (res.ok) {
      setSuccess(`⚡ Successfully generated ${res.quotesSubmitted ?? 4} simulated supplier quotes!`);
      await loadCockpitStatus();
      void refreshQuotes();
      void recompute();
      void loadQaMessages();
    } else {
      setError(res.error || 'Failed to simulate quotes');
    }
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
    handleTabChange('award');
  };

  const winningQuoteRevealed = useMemo(() => {
    const targetQuoteId = award?.quoteId || revealedResult?.quoteId || selectedQuote?.quoteId;
    return revealedQuotes.find((q) => q.quoteId === targetQuoteId);
  }, [revealedQuotes, award, revealedResult, selectedQuote]);

  const activeThreadMessages = useMemo(() => {
    return qaMessages.filter((m) => m.invitationId === selectedInvitationId);
  }, [qaMessages, selectedInvitationId]);

  return (
    <div
      className="zero-scroll-container p-2.5 sm:p-4 max-w-7xl mx-auto w-full overflow-x-hidden min-h-full flex flex-col justify-between relative"
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
      <div className="zero-scroll-pane mt-2 pb-36 sm:pb-28 pb-[calc(8rem+env(safe-area-inset-bottom,0px))] space-y-4">
        {/* Requirement Summary & Market Context Header */}
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
                Suppliers have submitted identity-protected offers. You can close quoting to start evaluation and voting.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCloseAndEvaluate()}
                className="rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] mobile-touch-target"
                data-testid="close-quoting-evaluate-button"
              >
                {busy ? 'Opening Evaluation…' : 'Close Quoting & Start Evaluation →'}
              </button>
              {quotes.length > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleWaiveAndEvaluate()}
                  className="rounded-xl border border-amber-400 dark:border-amber-700 bg-card px-3 py-2 text-xs font-extrabold text-amber-950 dark:text-amber-200 hover:bg-amber-100 disabled:opacity-50 transition min-h-[44px] mobile-touch-target"
                >
                  ⚡ Fast-Track
                </button>
              )}
            </div>
          </div>
        )}

        {/* Canonical 4 Cockpit Navigation Tabs (Mobile-Hardened Horizontal Scroll) */}
        <div
          className="flex items-center gap-2 p-1.5 rounded-2xl border border-border bg-muted/30 overflow-x-auto scrollbar-none no-scrollbar min-w-0"
          role="tablist"
          aria-label="Evaluation Cockpit Sections"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'quotes'}
            onClick={() => handleTabChange('quotes')}
            className={`shrink-0 whitespace-nowrap min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-black transition mobile-touch-target ${
              activeTab === 'quotes'
                ? 'bg-primary text-primary-foreground shadow-xs border border-primary'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border/50'
            }`}
            data-testid="cockpit-tab-quotes"
          >
            <span>⚖️</span>
            <span>1. Review Offers ({quotes.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'qa'}
            onClick={() => handleTabChange('qa')}
            className={`shrink-0 whitespace-nowrap min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-black transition mobile-touch-target ${
              activeTab === 'qa'
                ? 'bg-primary text-primary-foreground shadow-xs border border-primary'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border/50'
            }`}
            data-testid="cockpit-tab-qa"
          >
            <span>💬</span>
            <span>2. Questions &amp; Answers</span>
            {qaMessages.length > 0 && (
              <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.2 text-[9px] font-black">
                {qaMessages.length}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'vote'}
            onClick={() => handleTabChange('vote')}
            className={`shrink-0 whitespace-nowrap min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-black transition mobile-touch-target ${
              activeTab === 'vote'
                ? 'bg-primary text-primary-foreground shadow-xs border border-primary'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border/50'
            }`}
            data-testid="cockpit-tab-vote"
          >
            <span>🗳️</span>
            <span>3. Cast Vote {quorumMet ? '✓' : ''}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'award'}
            onClick={() => handleTabChange('award')}
            className={`shrink-0 whitespace-nowrap min-h-[44px] inline-flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-xl text-xs font-black transition mobile-touch-target ${
              activeTab === 'award'
                ? 'bg-primary text-primary-foreground shadow-xs border border-primary'
                : 'bg-card text-muted-foreground hover:text-foreground border border-border/50'
            }`}
            data-testid="cockpit-tab-award"
          >
            <span>🏆</span>
            <span>4. Decision &amp; Award {isAwarded ? '✓' : ''}</span>
          </button>
        </div>

        {/* TAB 1: 4-PILLAR OFFER COMPARISON MATRIX (Review Offers) */}
        {activeTab === 'quotes' && (
          <div className="space-y-4 animate-in fade-in-50" data-testid="cockpit-panel-quotes">
            {/* 4-Pillar Offers Header & Fast Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-black uppercase tracking-wider text-muted-foreground">
                  4-Pillar Offer Comparison Matrix
                </span>
                <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                  🔒 Identity-Protected Sealed Protocol
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowMarketContext((prev) => !prev)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition flex items-center gap-1 min-h-[36px] mobile-touch-target ${
                    showMarketContext
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border bg-card text-foreground hover:bg-muted'
                  }`}
                  data-testid="toggle-market-context-btn"
                >
                  <span>📊</span>
                  <span>{showMarketContext ? 'Market Context: On' : 'Market Context: Off'}</span>
                </button>

                <button
                  type="button"
                  disabled={isSimulatingQuotes}
                  onClick={() => void handleSimulateQuotes()}
                  className="rounded-lg border border-dashed border-amber-500/60 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition flex items-center gap-1 min-h-[36px] mobile-touch-target"
                  data-testid="simulate-quotes-header-btn"
                  title="Demo Utility: Generate simulated quotes for testing"
                >
                  <span>⚡</span>
                  <span>{isSimulatingQuotes ? 'Simulating…' : 'Demo: Simulate Quotes'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void loadCockpitStatus();
                    void refreshQuotes();
                    void recompute();
                    void loadQaMessages();
                  }}
                  className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1 min-h-[36px] mobile-touch-target"
                >
                  <span>🔄</span> Refresh
                </button>
              </div>
            </div>

            {/* Progressive Disclosure: Market Context Benchmark Panel */}
            {showMarketContext && (
              <div className="animate-in fade-in-50 rounded-2xl border border-primary/20 bg-card p-3 shadow-xs">
                <MarketIntelligencePanel
                  intelligence={marketIntelligence}
                  isLoading={marketIntelLoading}
                />
              </div>
            )}

            {/* Matrix Cards (Level 1 & Level 2 Parameters) */}
            <IdentityProtectedQuoteComparisonTable
              quotes={quotes}
              isLoading={quotesLoading}
              error={quotesError}
              rfqStatus={rfqStatus}
              rfqTitle={effectiveTitle}
              selectedQuoteId={selectedQuote?.quoteId ?? null}
              onSelectForAward={(q) => setSelectedQuoteId(q.quoteId)}
              onSimulateQuotes={() => void handleSimulateQuotes()}
              isSimulating={isSimulatingQuotes}
            />

            {/* Progressive Disclosure: Criterion Breakdown */}
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowCriterionBreakdown((prev) => !prev)}
                  className="flex items-center gap-1.5 text-xs font-extrabold text-foreground hover:text-primary transition py-1 min-h-[44px] mobile-touch-target"
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
                  className="text-[11px] font-semibold text-primary hover:underline disabled:opacity-50 min-h-[44px] mobile-touch-target flex items-center"
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

        {/* TAB 2: MASKED CLARIFICATIONS & Q&A INTEGRATION */}
        {activeTab === 'qa' && (
          <div className="space-y-4 animate-in fade-in-50" data-testid="cockpit-panel-qa">
            <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">💬</span>
                    <h3 className="text-sm font-black text-foreground">
                      Masked Questions &amp; Answers
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Clarify specifications and negotiate commercial points with suppliers without leaking identities.
                  </p>
                </div>

                {isQuoting && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleCloseAndEvaluate()}
                    className="rounded-xl bg-primary px-3.5 py-2 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] mobile-touch-target"
                  >
                    <span>🔒 Freeze Quotes &amp; Start Evaluation →</span>
                  </button>
                )}
              </div>

              {qaLabels.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs space-y-2">
                  <span className="text-2xl">⏳</span>
                  <p className="font-bold text-foreground">No supplier Q&amp;A threads yet.</p>
                  <p className="text-[11px]">When suppliers submit quotes or questions, their masked discussion channels will appear here.</p>
                  <button
                    type="button"
                    disabled={isSimulatingQuotes}
                    onClick={() => void handleSimulateQuotes()}
                    className="mt-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition min-h-[44px] mobile-touch-target"
                  >
                    ⚡ Simulate Supplier Questions
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Supplier Channel Selector Chips */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-extrabold tracking-wider text-muted-foreground block">
                      Select Supplier Thread:
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {qaLabels.map((lbl) => {
                        const count = qaMessages.filter((m) => m.invitationId === lbl.invitationId).length;
                        const isSelected = selectedInvitationId === lbl.invitationId;
                        return (
                          <button
                            key={lbl.invitationId}
                            type="button"
                            onClick={() => setSelectedInvitationId(lbl.invitationId)}
                            className={`rounded-xl px-3 py-2 text-xs font-bold border transition flex items-center gap-1.5 min-h-[44px] mobile-touch-target ${
                              isSelected
                                ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                                : 'bg-muted/30 text-muted-foreground hover:text-foreground border-border hover:bg-muted'
                            }`}
                          >
                            <span>🔒 {lbl.anonymousLabel}</span>
                            {count > 0 && (
                              <span
                                className={`rounded-full px-1.5 py-0.2 text-[9px] font-black ${
                                  isSelected ? 'bg-white/20 text-white' : 'bg-primary/20 text-primary'
                                }`}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Clarification Thread Component */}
                  {selectedInvitationId && (
                    <div className="pt-2">
                      <ClarificationThread
                        rfqId={rfqId}
                        invitationId={selectedInvitationId}
                        messages={activeThreadMessages}
                        authorSide="BUYER"
                        readOnly={isAwarded}
                        onPosted={() => void loadQaMessages()}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Explicit Tab 2 Step Progression CTA */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 rounded-2xl border border-border bg-muted/20">
              <div className="text-xs">
                <span className="font-extrabold text-foreground block">Next Workflow Step:</span>
                <span className="text-[11px] text-muted-foreground">
                  With specifications clarified, proceed to submit your evaluation and committee vote.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange('vote')}
                className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground shadow-xs hover:bg-primary/90 transition mobile-touch-target"
                data-testid="continue-from-qa-to-vote-tab-btn"
              >
                Proceed to Cast Vote →
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: GOVERNANCE & COMMITTEE BALLOT (Cast Vote) */}
        {activeTab === 'vote' && (
          <div className="space-y-4 animate-in fade-in-50" data-testid="cockpit-panel-vote">
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

            {/* Explicit Tab 3 Step Progression CTA */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 p-3.5 rounded-2xl border border-border bg-muted/20">
              <div className="text-xs">
                <span className="font-extrabold text-foreground block">Next Workflow Step:</span>
                <span className="text-[11px] text-muted-foreground">
                  Consensus recorded. Advance to dynamic spend approval routing, justification audit, and atomic contract award.
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleTabChange('award')}
                className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-black text-white shadow-xs transition mobile-touch-target"
                data-testid="continue-from-vote-to-award-tab-btn"
              >
                Proceed to Decision &amp; Award →
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: GOVERNED AWARD & REVEAL (Decision & Award) */}
        {activeTab === 'award' && (
          <div className="space-y-4 animate-in fade-in-50" data-testid="cockpit-panel-award">
            {/* If Already Awarded -> Show Unmasked Winner + Decision Record + PO Contract Preview */}
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

                    <div className="flex items-center gap-2 flex-wrap">
                      {(winningQuoteRevealed?.phone || revealedResult?.supplierId) && (
                        <a
                          href={`https://wa.me/91${(winningQuoteRevealed?.phone || '').replace(/\D/g, '')}?text=Hello%20${encodeURIComponent(winningQuoteRevealed?.businessName || 'Supplier')},%20we%20have%20awarded%20you%20our%20order%20on%20OTP!`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700 transition shadow-xs flex items-center gap-1.5 min-h-[44px] mobile-touch-target"
                        >
                          <span>💬</span> WhatsApp
                        </a>
                      )}

                      <Link
                        to={existingPoId ? `/purchase-orders/${existingPoId}` : '/purchase-orders'}
                        className="rounded-xl bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground shadow-xs hover:bg-primary/90 transition flex items-center gap-1.5 min-h-[44px] mobile-touch-target"
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

                {/* 2. Decision Record (Cryptographic Decision Receipt) */}
                <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">📜</span>
                      <h3 className="text-sm font-black text-foreground">Decision Record</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowDecisionReceiptFull((v) => !v)}
                      className="text-xs font-bold text-primary hover:underline min-h-[44px] mobile-touch-target flex items-center"
                    >
                      {showDecisionReceiptFull ? '▲ Hide Full Proof' : '▼ View Verification Proof'}
                    </button>
                  </div>
                  <DecisionReceipt
                    rfqId={rfqId}
                    winningQuoteId={award?.quoteId || revealedResult?.quoteId || selectedQuote?.quoteId || ''}
                    showTable={showDecisionReceiptFull}
                  />
                </div>
              </div>
            ) : (
              /* Pre-Award Execution Workspace */
              <div className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-black text-foreground flex items-center gap-2">
                    <span>🏆</span>
                    <span>Decision &amp; Governed Award</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Atomic 1-step transaction: locks voting consensus, unmasks winning supplier identity, and generates legal Purchase Order.
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
                        <span className="text-[10px] text-muted-foreground block">Merit Score:</span>
                        <strong className="font-bold">
                          {selectedQuote.evaluationScore != null
                            ? `${(selectedQuote.evaluationScore / 10).toFixed(1)}/10`
                            : '—'}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Dynamic Spend Approval Route Banner */}
                <EvaluationApprovalRouteBanner
                  evaluation={approvalRouteEvaluation}
                  procurementAmount={selectedQuote?.totalCost ?? null}
                />

                {/* Governance Quorum Status Indicator */}
                <div className="rounded-2xl border border-border bg-muted/20 p-3 flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-extrabold text-foreground block">Governance Approval Status:</span>
                    <span className="text-[11px] text-muted-foreground">
                      {isSoloBuyer
                        ? 'Solo Buyer Direct Authorization — 100% quorum satisfied'
                        : quorumMet
                        ? `Committee Quorum Met (${summaryVotes?.membersVoted ?? 1}/${summaryVotes?.assignedMembers ?? 1} members voted)`
                        : 'Committee Quorum Pending'}
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 border border-emerald-300 px-2.5 py-1 text-[10px] font-black shrink-0">
                    {quorumMet || isSoloBuyer ? '✓ Approval Satisfied' : '⏳ Quorum Required'}
                  </span>
                </div>

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
        className="sticky bottom-0 left-0 right-0 z-40 mt-auto bg-card/95 backdrop-blur-md border-t border-border shadow-2xl px-3 sm:px-6 py-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
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
                className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 disabled:opacity-50 transition mobile-touch-target"
                data-testid="close-quoting-evaluate-button"
              >
                <span>💬</span>
                <span>{busy ? 'Opening Evaluation…' : 'Close Quoting & Start Evaluation →'}</span>
              </button>
            ) : activeTab === 'quotes' ? (
              <button
                type="button"
                onClick={() => handleTabChange('vote')}
                className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 transition mobile-touch-target"
                data-testid="proceed-to-vote-button"
              >
                <span>🗳️</span>
                <span>Proceed to Cast Vote →</span>
              </button>
            ) : activeTab === 'qa' ? (
              <button
                type="button"
                onClick={() => handleTabChange('vote')}
                className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 transition mobile-touch-target"
                data-testid="proceed-from-qa-to-vote-button"
              >
                <span>🗳️</span>
                <span>Proceed to Cast Vote →</span>
              </button>
            ) : activeTab === 'vote' ? (
              <button
                type="button"
                onClick={() => handleTabChange('award')}
                className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-800 active:scale-98 transition mobile-touch-target"
                data-testid="proceed-to-award-tab-button"
              >
                <span>🏆</span>
                <span>Proceed to Decision &amp; Award →</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowAwardModal(true)}
                disabled={isAwarding || !selectedQuote}
                className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-extrabold text-white shadow-md hover:bg-emerald-700 active:scale-98 disabled:opacity-50 transition mobile-touch-target"
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
                className="rounded-full p-2 text-muted-foreground hover:text-foreground text-xs font-bold min-h-[44px] min-w-[44px] flex items-center justify-center"
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
                className="w-full min-h-[44px] rounded-2xl border border-border bg-muted/40 py-2.5 text-xs font-bold text-foreground hover:bg-muted transition mobile-touch-target"
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
