import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchPurchaseOrderByRfq } from '@/features/fulfillment/api/purchase-orders';
import { fetchIdentityProtectedQuotesForVote } from '@/features/governance/api/rfq-governance';
import {
  fetchVotes,
  fetchVoteTally,
  fetchVotingSummary,
} from '@/features/governance/api/committee-votes';
import { WeightedTallyTable } from '@/features/governance/components/WeightedTallyTable';
import {
  weightDisagreesWithHeadCount,
  type CommitteeVote,
  type IdentityProtectedQuoteForVote,
  type VoteTallyEntry,
  type VotingSummary,
} from '@/features/governance/types/governance';
import { revealSupplier, type RevealedWinner } from '@/features/reveal/api/reveal';
import { fetchRevealedQuotes, type RevealedQuoteRow } from '@/features/reveal/api/fetch-revealed-quotes';
import { approve, fetchApproval, requestApproval, fetchRfqApprovalStages, fetchUserActiveDelegations, submitTierApprovalAtomic } from '../api/approval';
import { fetchAward, lockAward, unlockAwardDecision } from '../api/awards';
import { CancelRfqModal } from '@/features/rfq/components';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import { triggerPrintDialog } from '@/features/reporting/lib/pdf-generator';
import { MultiTierApprovalGatePanel } from '@/features/governance/components/MultiTierApprovalGatePanel';
import { useAuth } from '@/features/auth';
import { supabase } from '@/lib/supabase';
import {
  type RfqApprovalStage,
  type OrganizationDelegation,
  isAwardLockEligible,
} from '@otp/domain';
import type { AwardSummary } from '../api/awards';
import type { ApprovalSummary } from '../api/approval';

export function AwardPage({ rfqId }: { rfqId: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);
  const [stages, setStages] = useState<RfqApprovalStage[]>([]);
  const [delegations, setDelegations] = useState<OrganizationDelegation[]>([]);
  const [rfqCreatorId, setRfqCreatorId] = useState<string>('');
  const [quotes, setQuotes] = useState<IdentityProtectedQuoteForVote[]>([]);
  const [revealedQuotes, setRevealedQuotes] = useState<RevealedQuoteRow[]>([]);
  const [votes, setVotes] = useState<CommitteeVote[]>([]);
  const [tally, setTally] = useState<VoteTallyEntry[]>([]);
  const [summary, setSummary] = useState<VotingSummary | null>(null);
  const [selectedQuote, setSelectedQuote] = useState('');
  const [justification, setJustification] = useState('');
  const [confirmedAward, setConfirmedAward] = useState(true);
  const [existingPoId, setExistingPoId] = useState<string | null>(null);
  const [revealedWinner, setRevealedWinner] = useState<RevealedWinner | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [showStandings, setShowStandings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [awardRes, approvalRes, quotesRes, tallyRes, summaryRes, votesRes, stagesRes, rfqDataRes] = await Promise.all([
      fetchAward(rfqId),
      fetchApproval(rfqId),
      fetchIdentityProtectedQuotesForVote(rfqId),
      fetchVoteTally(rfqId),
      fetchVotingSummary(rfqId),
      fetchVotes(rfqId),
      fetchRfqApprovalStages(rfqId),
      supabase.from('rfqs').select('id, organization_id, created_by').eq('id', rfqId).maybeSingle(),
    ]);

    if (awardRes.ok) {
      setAward(awardRes.award);
      if (awardRes.award?.status === 'REVEALED') {
        const [poRes, revealedQuotesRes] = await Promise.all([
          fetchPurchaseOrderByRfq(rfqId),
          fetchRevealedQuotes(rfqId),
        ]);
        if (poRes.ok) setExistingPoId(poRes.poId);
        if (revealedQuotesRes.ok) setRevealedQuotes(revealedQuotesRes.quotes);
      }
    }
    if (approvalRes.ok) setApproval(approvalRes.approval);
    if (stagesRes.ok) setStages(stagesRes.stages);
    if (rfqDataRes.data) {
      setRfqCreatorId(rfqDataRes.data.created_by);
      if (rfqDataRes.data.organization_id) {
        const delRes = await fetchUserActiveDelegations(rfqDataRes.data.organization_id);
        if (delRes.ok) setDelegations(delRes.delegations);
      }
    }
    if (quotesRes.ok) {
      setQuotes(quotesRes.quotes);
      if (!selectedQuote && quotesRes.quotes.length > 0) {
        const leaderId = summaryRes.ok ? summaryRes.summary?.leader?.quoteId : null;
        setSelectedQuote(leaderId ?? quotesRes.quotes[0]?.quoteId ?? '');
      }
    }
    if (votesRes.ok) setVotes(votesRes.votes);
    if (tallyRes.ok) setTally(tallyRes.tally);
    if (summaryRes.ok) setSummary(summaryRes.summary);
    setIsLoading(false);
  }, [rfqId, selectedQuote]);

  useEffect(() => {
    void load();
  }, [load]);

  const winningQuote = useMemo(
    () => quotes.find((q) => q.quoteId === (award?.quoteId || selectedQuote)) || quotes[0],
    [quotes, award, selectedQuote],
  );

  const lockEligibility = useMemo(() => {
    return isAwardLockEligible(stages);
  }, [stages]);

  const revealedWinnerQuote = useMemo(
    () => revealedQuotes.find((q) => q.quoteId === award?.quoteId),
    [revealedQuotes, award],
  );

  // Derive recorded consensus justification directly from votes
  const targetVoteComments = votes
    .filter((v) => (selectedQuote ? v.recommendedQuoteId === selectedQuote : true) && v.comment && v.comment.trim())
    .map((v) => v.comment!.trim());

  const consensusRationale = targetVoteComments.length > 0
    ? Array.from(new Set(targetVoteComments)).join('. ')
    : winningQuote
    ? `Recommended on evaluated merit score (${winningQuote.evaluationScore ? (winningQuote.evaluationScore / 10).toFixed(1) : 'Top'}), commercial value (₹${winningQuote.totalCost.toLocaleString('en-IN')}), and delivery turnaround.`
    : 'Evaluated and approved as winning supplier based on consensus merit and commercial terms.';

  async function handleRequestApproval() {
    setBusy(true);
    const result = await requestApproval(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Governance approval requested.');
    await load();
  }

  async function handleApprove() {
    if (!approval) return;
    setBusy(true);
    const result = await approve(approval.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Governance approval granted.');
    await load();
  }

  async function handleApproveStage(stageOrder: number, options?: { delegationId?: string; notes?: string }) {
    const targetStage = stages.find((s) => s.stageOrder === stageOrder);
    if (!targetStage) return;

    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await submitTierApprovalAtomic({
      rfqId,
      tierLevel: targetStage.tierLevel,
      notes: options?.notes,
      delegationId: options?.delegationId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(`Approval stage ${stageOrder} (${targetStage.tierLevel.replace(/_/g, ' ')}) digitally signed!`);
    await load();
  }

  async function handleLockAward() {
    if (!selectedQuote) return;
    if (!confirmedAward) {
      setError('Please confirm the award selection and consensus rationale before locking.');
      return;
    }
    if (!lockEligibility.eligible) {
      setError(lockEligibility.reason);
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    const finalJustification = (justification.trim() || consensusRationale).trim();
    const result = await lockAward(rfqId, selectedQuote, finalJustification);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(
      'Award decision locked with frozen consensus tally! You can now unmask the winning supplier to generate the PO.',
    );
    await load();
  }

  async function handleDirectRevealAndIssuePo() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await revealSupplier(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRevealedWinner(result.winner);
    setSuccess(
      result.winner.aliasBeforeReveal
        ? `Authoritative reveal complete: ${result.winner.aliasBeforeReveal} is ${result.winner.businessName}. Official Purchase Order generated!`
        : `Identity unmasked: The winner is ${result.winner.businessName}.`,
    );
    await load();
  }

  async function handleUnlockAward() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await unlockAwardDecision(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Award decision unlocked. You can now revise your evaluation or select another candidate (0 score penalty).');
    await load();
  }

  const handleShareWhatsApp = () => {
    const businessName = revealedWinner?.businessName || revealedWinnerQuote?.businessName || 'Awarded Supplier';
    const amount = winningQuote ? `₹${winningQuote.totalCost.toLocaleString('en-IN')}` : '';
    const ref = `RFQ-${rfqId.slice(0, 8)}`;
    const poLink = existingPoId ? `${window.location.origin}/purchase-orders/${existingPoId}` : window.location.href;

    const message = encodeURIComponent(
      `*OTP Procurement Award Notice*\n\n` +
      `📋 Reference: ${ref}\n` +
      `🏆 Awarded Supplier: ${businessName}\n` +
      `💰 Agreed Value: ${amount}\n` +
      `📄 Digital PO: ${poLink}\n\n` +
      `*Cryptographically verified & sealed on OTP Platform.*`
    );

    window.open(`https://wa.me/?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Award Confirmation - RFQ-${rfqId.slice(0, 8)}`,
          text: `Award confirmed for ${revealedWinner?.businessName || 'Supplier'} on OTP.`,
          url: window.location.href,
        });
      } catch {
        handleShareWhatsApp();
      }
    } else {
      handleShareWhatsApp();
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6 text-sm text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p>Loading Award Decision &amp; Identity Room…</p>
        </div>
      </div>
    );
  }

  const isRevealed = award?.status === 'REVEALED';
  const isLocked = award?.status === 'LOCKED' || award?.status === 'PENDING_REVEAL';
  const activeLinearStep = isRevealed ? 12 : isLocked ? 10 : 9;

  return (
    <div
      className="zero-scroll-container min-h-screen bg-background text-foreground overflow-x-hidden max-w-full pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] flex flex-col justify-between"
      data-testid="award-page"
    >
      <ProcurementStageNavigator
        currentLinearStep={activeLinearStep}
        currentStage="AWARDED"
        orderTitle={isRevealed ? 'Award Confirmed & Supplier Unmasked' : 'Award Finalization & Identity Gate'}
        orderReference={award ? `AWARD-${award.id.slice(0, 8)}` : `RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        poId={existingPoId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/committee`}
        backToLabel="Committee Voting"
      />

      <div className="px-3.5 sm:px-6 max-w-4xl mx-auto w-full space-y-4 pt-2">
        {/* Header Bar */}
        <div className="rounded-2xl border bg-card/90 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-yellow-100 dark:bg-yellow-950/70 px-2.5 py-0.5 text-[11px] font-bold text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">
                Award Governance &amp; Decision Lock
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  isRevealed
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : isLocked
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                }`}
              >
                {isRevealed
                  ? '✓ Unmasked & PO Generated'
                  : isLocked
                  ? '🔒 Decision Locked'
                  : '⏳ Pending Final Award'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsCancelModalOpen(true)}
              className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/30 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 transition min-h-[44px]"
            >
              Cancel Tender
            </button>
          </div>

          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground">
              {isRevealed
                ? 'Winning Supplier Unmasked & Purchase Order Issued'
                : isLocked
                ? 'Award Decision Locked · Ready for Identity Reveal'
                : 'Award Finalization & Authoritative Selection'}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              Core Job: <span className="font-semibold text-foreground">&ldquo;Confirm procurement decision and authoritative identity reveal.&rdquo;</span>
            </p>
          </div>
        </div>

        {/* Cancel Modal */}
        <CancelRfqModal
          rfqId={rfqId}
          isOpen={isCancelModalOpen}
          onClose={() => setIsCancelModalOpen(false)}
          onCancelled={() => {
            setIsCancelModalOpen(false);
            void load();
          }}
        />

        {/* Feedback Messages */}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50/90 dark:bg-red-950/50 dark:border-red-900 p-3 text-xs font-semibold text-red-800 dark:text-red-200 shadow-2xs"
          >
            {error}
          </div>
        )}
        {success && (
          <div
            role="status"
            className="rounded-xl border border-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/50 dark:border-emerald-900 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200 shadow-2xs"
            data-testid="award-success"
          >
            {success}
          </div>
        )}

        {/* STATE A: REVEALED (Smooth Unmasking Complete) */}
        {isRevealed && (
          <section className="space-y-4" data-testid="award-locked">
            {/* Unmasked Identity Spotlight Card */}
            <div className="rounded-2xl border-2 border-emerald-500/40 bg-card p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
                    🏆
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                      Authoritative Award Winner
                    </span>
                    <h2 className="text-base sm:text-lg font-black text-foreground">
                      {revealedWinner?.businessName || revealedWinnerQuote?.businessName || 'Awarded Supplier'}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 px-2.5 py-0.5 text-[10px] font-bold flex items-center gap-1">
                    <span>✓</span>
                    <span>GST Verified</span>
                  </span>
                  <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-bold">
                    Alias: {revealedWinner?.aliasBeforeReveal || winningQuote?.anonymousLabel || 'Supplier'}
                  </span>
                </div>
              </div>

              {/* Verified Identity Credentials Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-muted/20 dark:bg-muted/10 p-3.5 rounded-xl border border-border/50 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                    Legal Business Name:
                  </span>
                  <strong className="text-foreground text-sm block truncate">
                    {revealedWinner?.businessName || revealedWinnerQuote?.businessName || 'Verified Supplier Pvt Ltd'}
                  </strong>
                  <span className="text-[10px] text-muted-foreground">Registered Entity</span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                    Contact Channel:
                  </span>
                  <span className="font-semibold text-foreground block">
                    {revealedWinner?.contactPhone || revealedWinnerQuote?.phone || 'Contact Verified'}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {revealedWinner?.contactEmail || revealedWinnerQuote?.email || 'email@verified.com'}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">
                    Commercial Contract Total:
                  </span>
                  <strong className="font-mono font-black text-foreground text-base block">
                    ₹{(winningQuote?.totalCost || 0).toLocaleString('en-IN')}
                  </strong>
                  <span className="text-[10px] text-muted-foreground">Turnaround: {winningQuote?.deliveryDays ? `${winningQuote.deliveryDays} Days TAT` : 'Standard SLA'}</span>
                </div>
              </div>

              {/* Secondary Utilities Row */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1">

                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 px-4 py-3 text-xs font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition min-h-[44px]"
                >
                  <span>📲</span>
                  <span>Share via WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerPrintDialog()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-3 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition min-h-[44px]"
                >
                  <span>📥</span>
                  <span>PDF Receipt</span>
                </button>

                <Link
                  to={`/rfq/${rfqId}/reveal`}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border bg-card px-3 py-3 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition min-h-[44px]"
                >
                  <span>Audit Receipt Room →</span>
                </Link>
              </div>
            </div>

            {/* Recorded Consensus Proof */}
            <div className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground block">
                Recorded Consensus Justification
              </span>
              <p className="text-xs text-foreground bg-muted/20 p-3 rounded-xl border border-border/50 italic leading-relaxed">
                &ldquo;{award.justificationText}&rdquo;
              </p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                <span>Award Locked: {award.votesLockedAt ? new Date(award.votesLockedAt).toLocaleString() : 'Recorded'}</span>
                <span>Audit Signature: Cryptographically Sealed</span>
              </div>
            </div>
          </section>
        )}

        {/* STATE B: LOCKED (Pending Identity Unmasking) */}
        {isLocked && (
          <section className="space-y-4" data-testid="award-locked">
            {/* Winning Candidate Summary Card */}
            <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3.5">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary">
                    1. Selected Winning Candidate
                  </span>
                  <h2 className="text-base font-black text-foreground">
                    {winningQuote?.anonymousLabel || 'Selected Supplier'}
                  </h2>
                </div>
                <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 text-[10px] font-bold">
                  🔒 Identity-Protected Sealed Alias
                </span>
              </div>

              {/* 4-Pillar Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/20 p-3 rounded-xl border border-border/50 text-xs">
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Total Value:</span>
                  <strong className="font-mono font-black text-foreground text-sm">
                    ₹{(winningQuote?.totalCost || 0).toLocaleString('en-IN')}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Delivery SLA:</span>
                  <span className="font-bold text-foreground">
                    ⚡ {winningQuote?.deliveryDays ? `${winningQuote.deliveryDays} Days TAT` : 'Standard'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Warranty:</span>
                  <span className="font-bold text-foreground">
                    🛡️ {winningQuote?.warrantyMonths ? `${winningQuote.warrantyMonths} Mo` : 'Standard'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground block">Merit Score:</span>
                  <span className="font-bold text-foreground">
                    ★ {winningQuote?.evaluationScore ? (winningQuote.evaluationScore / 10).toFixed(1) : 'Top'}
                  </span>
                </div>
              </div>

              {/* Consensus Rationale */}
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase text-muted-foreground block">
                  Recorded Committee Consensus:
                </span>
                <p className="text-xs text-foreground bg-muted/20 p-3 rounded-xl border border-border/50 italic">
                  &ldquo;{award.justificationText}&rdquo;
                </p>
              </div>

              {/* Identity Protection Gate & Confirmation Action */}
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                  <span>🔒</span>
                  <span>Strict Identity Protection Seal</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The candidate&rsquo;s legal entity name, GSTIN, and contact details remain cryptographically sealed until you confirm the award and issue the purchase order.
                </p>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleUnlockAward()}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border bg-card px-3 py-3 text-xs font-semibold text-muted-foreground hover:bg-muted transition min-h-[44px]"
                  >
                    {busy ? 'Unlocking…' : '↺ Unlock Decision (0 Penalty)'}
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* STATE C: PRE-LOCK (Review & Authorize Award) */}
        {!award && (
          <section className="space-y-4" data-testid="award-form">
            {/* 1. Candidate Selector & 4-Pillars */}
            <div className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    1. Winning Candidate Review
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Pulled directly from committee voting consensus — verify candidate metrics before locking.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {quotes.map((q, idx) => {
                  const isSelected = selectedQuote === q.quoteId;
                  const isLeader = summary?.leader?.quoteId === q.quoteId;
                  const isTop = idx === 0;

                  return (
                    <label
                      key={q.quoteId}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition text-xs min-h-[44px] ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/40 bg-primary/5 font-semibold shadow-xs'
                          : 'hover:bg-muted/30 border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="radio"
                          name="award-quote-select"
                          value={q.quoteId}
                          checked={isSelected}
                          onChange={() => {
                            setSelectedQuote(q.quoteId);
                            setJustification('');
                          }}
                          className="h-4 w-4 text-primary"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-foreground truncate">{q.anonymousLabel}</span>
                            {isLeader && (
                              <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 px-2 py-0.2 text-[9px] font-bold">
                                🏛️ Consensus Choice
                              </span>
                            )}
                            {!isLeader && isTop && (
                              <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.2 text-[9px] font-bold">
                                ⭐ Top Score
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            TAT: {q.deliveryDays ? `${q.deliveryDays}d` : 'Std'} · Warranty: {q.warrantyMonths ? `${q.warrantyMonths}m` : 'Std'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-black text-foreground block text-sm">
                          ₹{q.totalCost.toLocaleString('en-IN')}
                        </span>
                        {q.evaluationScore != null && (
                          <span className="text-[10px] text-primary font-bold">
                            Score: {(q.evaluationScore / 10).toFixed(1)}/10
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Threshold / Consensus Override Warning Banner */}
              {summary?.leader?.quoteId && selectedQuote && selectedQuote !== summary.leader.quoteId && (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/50 p-3.5 text-xs text-amber-900 dark:text-amber-200 shadow-2xs space-y-1"
                  data-testid="threshold-warning"
                >
                  <div className="flex items-center gap-1.5 font-black text-amber-950 dark:text-amber-100">
                    <span>⚠️</span>
                    <span>Threshold / Consensus Override Advisory</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-300">
                    The committee consensus recommendation is <strong className="font-extrabold text-amber-950 dark:text-amber-100">{summary.leader.anonymousLabel}</strong>. You have selected <strong className="font-extrabold text-amber-950 dark:text-amber-100">{winningQuote?.anonymousLabel || 'a different candidate'}</strong>. Please ensure the recorded justification below clarifies the rationale for this divergence before locking.
                  </p>
                </div>
              )}

              {/* Split Vote Advisory */}
              {weightDisagreesWithHeadCount(tally) && (
                <div
                  className="rounded-xl border border-amber-300/80 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs space-y-1"
                  data-testid="split-vote-advisory"
                >
                  <div className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-amber-100">
                    <span>⚖️</span>
                    <span>Split Committee Vote Notice</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
                    The weighted voting leader differs from the candidate with the highest head count. Verify the recorded tally before final confirmation.
                  </p>
                </div>
              )}

              {/* Consensus Justification & Award Rationale Box (Editable Template) */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="award-justification"
                    className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1"
                  >
                    <span>📋</span> Consensus Rationale &amp; Award Justification (Editable Template)
                  </label>
                  <Link
                    to={`/rfq/${rfqId}/committee`}
                    className="min-h-[44px] inline-flex items-center text-[11px] font-bold text-primary hover:underline mobile-touch-target"
                  >
                    ↺ View Voting Room
                  </Link>
                </div>

                <div className="space-y-1.5">
                  <textarea
                    id="award-justification"
                    rows={3}
                    value={justification !== '' ? justification : consensusRationale}
                    onChange={(e) => setJustification(e.target.value)}
                    className="w-full rounded-lg border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none leading-relaxed"
                    placeholder="Enter or refine formal award justification..."
                    data-testid="award-justification-input"
                  />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                    <span>✓ Pre-filled from committee consensus votes · Review &amp; edit before locking</span>
                    <span className="italic">Editable template</span>
                  </div>
                </div>
              </div>

              {/* Confirmation Affirmation Checkbox */}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3.5 text-xs transition hover:bg-muted/30 shadow-2xs min-h-[44px]">
                <input
                  type="checkbox"
                  checked={confirmedAward}
                  onChange={(e) => setConfirmedAward(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded text-primary"
                  data-testid="confirm-award-checkbox"
                />
                <div className="space-y-0.5 min-w-0 flex-1">
                  <span className="font-bold text-foreground block">
                    Confirm Award Selection &amp; Authorize Purchase Order
                  </span>
                  <span className="text-[11px] text-muted-foreground block leading-tight">
                    I confirm that {winningQuote?.anonymousLabel ?? 'the selected supplier'} is authorized for award on consensus merit and commercial terms.
                  </span>
                </div>
              </label>
            </div>
          </section>
        )}

        {/* Multi-Tier Spend Approval & Delegation Signoff Chain */}
        {stages.length > 0 && (
          <MultiTierApprovalGatePanel
            stages={stages}
            procurementAmount={winningQuote?.totalCost ?? 0}
            currentUserId={user?.id || ''}
            currentUserRole={(user as any)?.org_role || 'BUYER'}
            currentUserRoles={[(user as any)?.org_role || 'BUYER']}
            rfqCreatorId={rfqCreatorId}
            delegations={delegations}
            onApproveStage={handleApproveStage}
            className="mb-4"
          />
        )}

        {/* Standings & Governance Collapsible Section */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowStandings(!showStandings)}
            className="w-full flex items-center justify-between rounded-xl border bg-card p-3 text-xs font-bold text-muted-foreground hover:text-foreground transition min-h-[44px]"
          >
            <span>📊 View Consensus Standings &amp; Vote Breakdown</span>
            <span>{showStandings ? '▲' : '▼'}</span>
          </button>

          {showStandings && (
            <div className="mt-2 space-y-3 animate-in fade-in">
              <section className="rounded-2xl border bg-card p-3.5 shadow-2xs" data-testid="votes-summary">
                <WeightedTallyTable
                  tally={tally}
                  summary={summary}
                  highlightQuoteId={award?.quoteId ?? selectedQuote}
                />
              </section>

              {approval && (
                <section className="rounded-2xl border bg-card p-3.5 shadow-2xs space-y-2" data-testid="approval-section">
                  <h3 className="font-bold text-xs text-foreground uppercase tracking-wider text-muted-foreground">
                    Legacy Governance Approval Gate
                  </h3>
                  <div className="flex items-center justify-between text-xs">
                    <span>Status: <strong>{approval.status}</strong></span>
                    {approval.status === 'PENDING' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleApprove()}
                        className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
                      >
                        Grant Approval
                      </button>
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {/* STICKY BOTTOM ACTION BAR */}
      <div className="sticky bottom-0 z-40 mt-auto border-t bg-background/95 backdrop-blur-md p-3 sm:px-6 shadow-xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 text-xs">
            <span className="text-muted-foreground">
              Candidate: <strong className="text-foreground">{winningQuote?.anonymousLabel ?? 'None chosen'}</strong>
            </span>
            {winningQuote && (
              <span className="font-mono font-black text-foreground">
                ₹{winningQuote.totalCost.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2">
            {isRevealed ? (
              existingPoId ? (
                <Link
                  to={`/purchase-orders/${existingPoId}`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] transition min-h-[48px]"
                  data-testid="award-po-link"
                >
                  <span>📄 View Digital Purchase Order →</span>
                </Link>
              ) : (
                <Link
                  to={`/rfq/${rfqId}/reveal`}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] transition min-h-[48px]"
                  data-testid="award-create-po-link"
                >
                  <span>📄 Generate Purchase Order →</span>
                </Link>
              )
            ) : isLocked ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleDirectRevealAndIssuePo()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 px-6 py-3 text-xs sm:text-sm font-black text-white shadow-md hover:bg-emerald-800 active:scale-[0.98] disabled:opacity-50 transition min-h-[48px]"
                data-testid="direct-reveal-button"
              >
                <span>🏆</span>
                <span>{busy ? 'Unmasking…' : 'Confirm Award & Issue Purchase Order →'}</span>
              </button>
            ) : !lockEligibility.eligible ? (
              <button
                type="button"
                disabled={true}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600/70 text-white px-6 py-3 text-xs sm:text-sm font-black shadow-md cursor-not-allowed opacity-90 min-h-[48px]"
                data-testid="lock-award-button-locked"
                title={lockEligibility.reason}
              >
                <span>🔒</span>
                <span>Award Locked ({lockEligibility.pendingTierLevels.length} Tier(s) Pending)</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busy || !selectedQuote || !confirmedAward}
                onClick={() => void handleLockAward()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition min-h-[48px]"
                data-testid="lock-award-button"
              >
                <span>🔒</span>
                <span>{busy ? 'Locking Decision…' : 'Confirm & Lock Award Decision →'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
