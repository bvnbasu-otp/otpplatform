import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPurchaseOrderByRfq } from '@/features/fulfillment/api/purchase-orders';
import { fetchIdentityProtectedQuotesForVote } from '@/features/governance/api/rfq-governance';
import {
  fetchVotes,
  fetchVoteTally,
  fetchVotingSummary,
} from '@/features/governance/api/committee-votes';
import { WeightedTallyTable } from '@/features/governance/components/WeightedTallyTable';
import type {
  CommitteeVote,
  IdentityProtectedQuoteForVote,
  VoteTallyEntry,
  VotingSummary,
} from '@/features/governance/types/governance';
import { revealSupplier, type RevealedWinner } from '@/features/reveal/api/reveal';
import { approve, fetchApproval, requestApproval } from '../api/approval';
import { fetchAward, lockAward, unlockAwardDecision } from '../api/awards';
import { CancelRfqModal } from '@/features/rfq/components';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import type { AwardSummary } from '../api/awards';
import type { ApprovalSummary } from '../api/approval';

export function AwardPage({ rfqId }: { rfqId: string }) {
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);
  const [quotes, setQuotes] = useState<IdentityProtectedQuoteForVote[]>([]);
  const [votes, setVotes] = useState<CommitteeVote[]>([]);
  const [tally, setTally] = useState<VoteTallyEntry[]>([]);
  const [summary, setSummary] = useState<VotingSummary | null>(null);
  const [selectedQuote, setSelectedQuote] = useState('');
  const [confirmedAward, setConfirmedAward] = useState(true);
  const [existingPoId, setExistingPoId] = useState<string | null>(null);
  const [revealedWinner, setRevealedWinner] = useState<RevealedWinner | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [awardRes, approvalRes, quotesRes, tallyRes, summaryRes, votesRes] = await Promise.all([
      fetchAward(rfqId),
      fetchApproval(rfqId),
      fetchIdentityProtectedQuotesForVote(rfqId),
      fetchVoteTally(rfqId),
      fetchVotingSummary(rfqId),
      fetchVotes(rfqId),
    ]);

    if (awardRes.ok) {
      setAward(awardRes.award);
      if (awardRes.award?.status === 'REVEALED') {
        const poRes = await fetchPurchaseOrderByRfq(rfqId);
        if (poRes.ok) setExistingPoId(poRes.poId);
      }
    }
    if (approvalRes.ok) setApproval(approvalRes.approval);
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

  const winningQuote = quotes.find((q) => q.quoteId === selectedQuote) || quotes[0];

  // Derive justification directly from Step 7/8 consensus & evaluation votes
  const targetVoteComments = votes
    .filter((v) => (selectedQuote ? v.recommendedQuoteId === selectedQuote : true) && v.comment && v.comment.trim())
    .map((v) => v.comment!.trim());

  const consensusRationale = targetVoteComments.length > 0
    ? Array.from(new Set(targetVoteComments)).join('. ')
    : winningQuote
    ? `Recommended on evaluated merit score (${winningQuote.evaluationScore ?? 'Top'}), commercial value (₹${winningQuote.totalCost.toLocaleString('en-IN')}), and turnaround.`
    : 'Evaluated and approved as winning supplier based on consensus merit and commercial terms.';

  async function handleRequestApproval() {
    setBusy(true);
    const result = await requestApproval(rfqId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess('Approval requested.');
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
    setSuccess('Approval granted.');
    await load();
  }

  async function handleLockAward() {
    if (!selectedQuote) return;
    if (!confirmedAward) {
      setError('Please confirm the award selection and consensus rationale before locking.');
      return;
    }
    setBusy(true);
    setError(null);
    const finalJustification = consensusRationale;
    const result = await lockAward(rfqId, selectedQuote, finalJustification);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(
      'Award successfully locked with the vote tally frozen! You can now unmask the winning supplier.',
    );
    await load();
  }

  async function handleDirectReveal() {
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
        ? `Identity unmasked: ${result.winner.aliasBeforeReveal} is ${result.winner.businessName}. Official Purchase Order generated!`
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
    setSuccess('Award decision unlocked. You can now re-evaluate or select another quote (0 score penalty).');
    await load();
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading Award Decision…</p>;

  const pendingReveal = award?.status === 'LOCKED' || award?.status === 'PENDING_REVEAL';
  const activeLinearStep = award ? 10 : 9;

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="award-page">
      <ProcurementStageNavigator
        currentLinearStep={activeLinearStep}
        currentStage="AWARDED"
        orderTitle="Award Justification & Decision Lock"
        orderReference={award ? `AWARD-${award.id.slice(0, 8)}` : `RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        poId={existingPoId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/committee`}
        backToLabel="Step 8: Cast Vote"
      />

      {/* Header Bar */}
      <div className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-yellow-100 dark:bg-yellow-950/60 px-2 py-0.5 text-[10px] font-bold text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800 shrink-0">
            Step {activeLinearStep} / 15
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {activeLinearStep === 9 ? 'Proceed with Award Justification' : 'Lock Award Decision'}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              {activeLinearStep === 9
                ? 'Review winning quote and recorded consensus rationale before freezing decision.'
                : 'Award decision locked with frozen vote tally. Proceed to identity reveal and PO.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsCancelModalOpen(true)}
            className="rounded border border-red-200 bg-red-50/50 dark:bg-red-950/30 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100"
          >
            Cancel Tender
          </button>
        </div>
      </div>

      <CancelRfqModal
        rfqId={rfqId}
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onCancelled={() => {
          setIsCancelModalOpen(false);
          void load();
        }}
      />

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-semibold text-red-700 dark:text-red-300 shrink-0 mt-1">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shrink-0 mt-1" data-testid="award-success">
          {success}
        </div>
      )}

      {/* Main Content Multi-Column Layout */}
      <div className="zero-scroll-pane mt-2 pb-20 sm:pb-12 grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        {/* Left / Main Section (7 cols): Award Form or Locked Card */}
        <div className="lg:col-span-7 space-y-2">
          {award ? (
            <section
              className="rounded-lg border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-3 shadow-2xs space-y-2"
              data-testid="award-locked"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                  {award.status === 'REVEALED' ? '✓ Award Revealed & Supplier Unmasked' : '✓ Award Decision Locked'}
                </h2>
                <span className="rounded bg-emerald-200 dark:bg-emerald-900/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                  {award.status}
                </span>
              </div>
              <div className="rounded border bg-card p-2 text-xs text-foreground">
                <span className="font-semibold text-muted-foreground">Consensus Justification: </span>
                {award.justificationText}
              </div>

              {pendingReveal && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>🔒</span> Winning Quote Locked &amp; Ready for Reveal
                    </span>
                    <span className="text-[10px] bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                      Step 11-12 Fast-Track
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Award is locked with an immutable audit trial. You can unmask the winning supplier now to generate the official Purchase Order and obtain verified contact credentials.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDirectReveal()}
                      className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 disabled:opacity-50 transition flex items-center gap-1.5"
                      data-testid="direct-reveal-button"
                    >
                      <span>🔓</span>
                      <span>{busy ? 'Unmasking Supplier…' : 'Unmask Supplier & Generate PO Now →'}</span>
                    </button>
                    <Link
                      to={`/rfq/${rfqId}/reveal`}
                      className="rounded-lg border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition flex items-center gap-1"
                    >
                      <span>Credentials &amp; Receipt Room →</span>
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleUnlockAward()}
                      className="rounded-lg border px-2.5 py-2 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      {busy ? 'Unlocking…' : '↺ Unlock Decision'}
                    </button>
                  </div>
                </div>
              )}

              {award.status === 'REVEALED' && (
                <div className="rounded-xl border border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                      <span>🏆</span> Winning Supplier Revealed
                    </span>
                    {existingPoId && (
                      <span className="text-[10px] bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold px-2 py-0.5 rounded-full">
                        PO Active
                      </span>
                    )}
                  </div>
                  {revealedWinner && (
                    <div className="rounded-lg border bg-card p-2.5 space-y-1">
                      <div className="text-xs font-bold text-foreground">{revealedWinner.businessName}</div>
                      {revealedWinner.contactPhone && (
                        <div className="text-[11px] text-muted-foreground">Phone: {revealedWinner.contactPhone}</div>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {existingPoId ? (
                      <Link
                        to={`/purchase-orders/${existingPoId}`}
                        className="rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition flex items-center gap-1.5"
                        data-testid="award-po-link"
                      >
                        <span>📄</span>
                        <span>View Purchase Order (Step 13) →</span>
                      </Link>
                    ) : (
                      <Link
                        to={`/rfq/${rfqId}/reveal`}
                        className="rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition flex items-center gap-1.5"
                        data-testid="award-create-po-link"
                      >
                        <span>📄</span>
                        <span>Generate Purchase Order →</span>
                      </Link>
                    )}
                    <Link
                      to={`/rfq/${rfqId}/reveal`}
                      className="rounded-lg border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition"
                    >
                      View Full Credentials &amp; Audit Receipt →
                    </Link>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-lg border bg-card p-3 shadow-2xs space-y-3" data-testid="award-form">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                    1. Review Winning Quote &amp; Recorded Consensus Rationale
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Auto-pulled from Step 7/8 committee consensus — review and confirm to lock the award.
                  </p>
                </div>
              </div>

              {/* Quote Selector / Cards */}
              <div className="space-y-1.5">
                {quotes.map((q, idx) => {
                  const isSelected = selectedQuote === q.quoteId;
                  const isLeader = summary?.leader?.quoteId === q.quoteId;
                  const isTop = idx === 0 || (quotes[0]?.evaluationScore != null && q.evaluationScore === quotes[0]?.evaluationScore);
                  return (
                    <label
                      key={q.quoteId}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border p-2.5 transition text-xs ${
                        isSelected
                          ? 'border-primary ring-1 ring-primary/30 bg-primary/5 font-medium shadow-2xs'
                          : 'hover:bg-muted/40 border-border/70'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="radio"
                          name="award-quote"
                          value={q.quoteId}
                          checked={isSelected}
                          onChange={() => setSelectedQuote(q.quoteId)}
                          className="h-4 w-4 text-primary"
                        />
                        <span className="font-bold text-foreground truncate">{q.anonymousLabel}</span>
                        {isLeader && (
                          <span className="rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 px-1.5 py-0.2 text-[9px] font-bold">
                            🏛️ Committee Choice
                          </span>
                        )}
                        {!isLeader && isTop && (
                          <span className="rounded bg-primary/10 text-primary border border-primary/20 px-1 py-0.2 text-[9px] font-bold">
                            ⭐ Top Score
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">
                          ₹{q.totalCost.toLocaleString('en-IN')}
                        </span>
                        {q.evaluationScore != null && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                            Score: {q.evaluationScore}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* Read-Only Display of Recorded Consensus Justification */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1">
                    <span>📋</span> Recorded Consensus Justification
                  </span>
                  <Link
                    to={`/rfq/${rfqId}/committee`}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                  >
                    <span>↺ Edit / Recast in Voting Room</span>
                  </Link>
                </div>

                <div className="rounded-lg border bg-card p-2.5 shadow-2xs">
                  <p className="font-medium text-foreground text-xs leading-relaxed">
                    &ldquo;{consensusRationale}&rdquo;
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                  <span>✓ Automatically pulled from Step 7/8 committee consensus</span>
                  <span className="italic">No duplicate typing required</span>
                </div>
              </div>

              {/* Reconfirmation UI Checkbox */}
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border bg-card p-3 text-xs transition hover:bg-muted/30 shadow-2xs">
                <input
                  type="checkbox"
                  checked={confirmedAward}
                  onChange={(e) => setConfirmedAward(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded text-primary"
                  data-testid="confirm-award-checkbox"
                />
                <div className="space-y-0.5 min-w-0 flex-1">
                  <span className="font-bold text-foreground block">
                    Confirm award selection and recorded rationale
                  </span>
                  <span className="text-[11px] text-muted-foreground block leading-tight">
                    I confirm that {winningQuote?.anonymousLabel ?? 'the selected supplier'} is recommended on consensus merit and authorize locking the award.
                  </span>
                </div>
              </label>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy || !selectedQuote || !confirmedAward}
                  onClick={() => void handleLockAward()}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-1.5"
                  data-testid="lock-award-button"
                >
                  <span>🔒</span>
                  <span>{busy ? 'Locking Decision…' : 'Lock Award Decision →'}</span>
                </button>

                <Link
                  to={`/rfq/${rfqId}/committee`}
                  className="rounded-lg border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition flex items-center gap-1"
                >
                  <span>↺</span>
                  <span>Edit / Recast Justification</span>
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* Right Section (5 cols): Standings & Governance Approval */}
        <div className="lg:col-span-5 space-y-2">
          {/* Evaluation Vote Summary */}
          <section className="rounded-lg border bg-card p-2.5 shadow-2xs" data-testid="votes-summary">
            <div className="flex items-center justify-between mb-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                2. Consensus &amp; Standings
              </h2>
              <Link
                to={`/rfq/${rfqId}/committee`}
                className="text-[10px] font-semibold text-primary hover:underline"
              >
                Voting Room →
              </Link>
            </div>
            <WeightedTallyTable
              tally={tally}
              summary={summary}
              highlightQuoteId={award?.quoteId ?? selectedQuote}
            />
          </section>

          {/* Approval Status (if policy requires) */}
          {approval && (
            <section className="rounded-lg border bg-card p-2.5 shadow-2xs" data-testid="approval-section">
              <h2 className="font-bold text-xs text-foreground uppercase tracking-wider text-muted-foreground">
                Governance Approval
              </h2>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span>Status: <strong>{approval.status}</strong></span>
                {approval.status === 'PENDING' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleApprove()}
                    className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50"
                  >
                    Grant Approval
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
