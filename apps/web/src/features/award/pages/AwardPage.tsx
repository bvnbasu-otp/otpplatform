import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPurchaseOrderByRfq } from '@/features/fulfillment/api/purchase-orders';
import { fetchIdentityProtectedQuotesForVote } from '@/features/governance/api/rfq-governance';
import {
  fetchVoteTally,
  fetchVotingSummary,
} from '@/features/governance/api/committee-votes';
import { WeightedTallyTable } from '@/features/governance/components/WeightedTallyTable';
import type {
  IdentityProtectedQuoteForVote,
  VoteTallyEntry,
  VotingSummary,
} from '@/features/governance/types/governance';
import { approve, fetchApproval, requestApproval } from '../api/approval';
import { fetchAward, lockAward, unlockAwardDecision } from '../api/awards';
import { CancelRfqModal } from '@/features/rfq/components';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import type { AwardSummary } from '../api/awards';
import type { ApprovalSummary } from '../api/approval';

const AWARD_JUSTIFICATION_PRESETS = [
  'Best overall evaluated value & optimal cost-benefit ratio',
  'Guaranteed turnaround matching strict project delivery timelines',
  'Total cost advantage within fair market intelligence benchmark',
  'Highest weighted recommendation score from committee voting',
  'Supplier meets all mandatory technical specifications & quality criteria',
];

export function AwardPage({ rfqId }: { rfqId: string }) {
  const [award, setAward] = useState<AwardSummary | null>(null);
  const [approval, setApproval] = useState<ApprovalSummary | null>(null);
  const [quotes, setQuotes] = useState<IdentityProtectedQuoteForVote[]>([]);
  const [tally, setTally] = useState<VoteTallyEntry[]>([]);
  const [summary, setSummary] = useState<VotingSummary | null>(null);
  const [selectedQuote, setSelectedQuote] = useState('');
  const [selectedAwardReasons, setSelectedAwardReasons] = useState<string[]>([]);
  const [awardRating, setAwardRating] = useState<number>(5);
  const [justification, setJustification] = useState('');
  const [existingPoId, setExistingPoId] = useState<string | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const [awardRes, approvalRes, quotesRes, tallyRes, summaryRes] = await Promise.all([
      fetchAward(rfqId),
      fetchApproval(rfqId),
      fetchIdentityProtectedQuotesForVote(rfqId),
      fetchVoteTally(rfqId),
      fetchVotingSummary(rfqId),
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
    if (tallyRes.ok) setTally(tallyRes.tally);
    if (summaryRes.ok) setSummary(summaryRes.summary);
    setIsLoading(false);
  }, [rfqId, selectedQuote]);

  useEffect(() => {
    void load();
  }, [load]);

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
    setBusy(true);
    setError(null);
    const combinedJustification = [...selectedAwardReasons, justification.trim()].filter(Boolean).join('. ');
    const finalJustification = combinedJustification || 'Evaluated and approved as winning supplier based on best commercial and technical terms.';
    const result = await lockAward(rfqId, selectedQuote, finalJustification);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSuccess(
      'Award successfully locked with the vote tally frozen! Click below to reveal the winning supplier.',
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
                ? 'Select winning quote based on consensus, record rationale, and establish runner-up protocol.'
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
          window.location.href = '/';
        }}
      />

      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-semibold text-red-700 dark:text-red-300 shrink-0 mt-1">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 p-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shrink-0 mt-1" data-testid="award-success">
          {success}
        </div>
      )}

      {/* Main Content Multi-Column Layout */}
      <div className="zero-scroll-pane mt-2 grid grid-cols-1 lg:grid-cols-12 gap-2.5">
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
                <span className="font-semibold text-muted-foreground">Justification: </span>
                {award.justificationText}
              </div>

              {pendingReveal && (
                <div className="rounded border border-primary/20 bg-card p-2.5 space-y-1.5">
                  <p className="text-xs font-medium text-foreground">
                    Winning quote is locked. Supplier identity is still masked.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Link
                      to={`/rfq/${rfqId}/reveal`}
                      className="rounded bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 transition"
                    >
                      Step 11: Reveal Winning Supplier →
                    </Link>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleUnlockAward()}
                      className="rounded border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      {busy ? 'Unlocking…' : '🔓 Unlock Decision'}
                    </button>
                  </div>
                </div>
              )}

              {award.status === 'REVEALED' && (
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    to={`/rfq/${rfqId}/reveal`}
                    className="rounded border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    View Supplier Credentials →
                  </Link>
                  {existingPoId ? (
                    <Link
                      to={`/purchase-orders/${existingPoId}`}
                      className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90"
                      data-testid="award-po-link"
                    >
                      View Purchase Order →
                    </Link>
                  ) : (
                    <Link
                      to={`/rfq/${rfqId}/reveal`}
                      className="rounded bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90"
                      data-testid="award-create-po-link"
                    >
                      Generate Purchase Order →
                    </Link>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-lg border bg-card p-3 shadow-2xs space-y-2" data-testid="award-form">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                  1. Select Winning Quote &amp; Record Justification
                </h2>
              </div>

              <div className="space-y-1.5">
                {quotes.map((q, idx) => {
                  const isSelected = selectedQuote === q.quoteId;
                  const isTop = idx === 0 || (quotes[0]?.evaluationScore != null && q.evaluationScore === quotes[0].evaluationScore);
                  return (
                    <label
                      key={q.quoteId}
                      className={`flex cursor-pointer items-center justify-between rounded border p-2 transition text-xs ${
                        isSelected
                          ? 'border-primary ring-1 ring-primary/30 bg-primary/5 font-medium'
                          : 'hover:bg-muted/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="radio"
                          name="award-quote"
                          value={q.quoteId}
                          checked={isSelected}
                          onChange={() => setSelectedQuote(q.quoteId)}
                          className="h-3.5 w-3.5 text-primary"
                        />
                        <span className="font-bold text-foreground truncate">{q.anonymousLabel}</span>
                        {isTop && (
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

              <div className="space-y-2 pt-1 border-t text-xs">
                <div>
                  <span className="block text-[11px] font-semibold text-foreground mb-1">
                    Justification Presets:
                  </span>
                  <div className="grid sm:grid-cols-2 gap-1 mb-1.5">
                    {AWARD_JUSTIFICATION_PRESETS.map((preset) => {
                      const isChecked = selectedAwardReasons.includes(preset);
                      return (
                        <label
                          key={preset}
                          className={`flex items-start gap-1.5 rounded border p-1 text-[10px] cursor-pointer transition ${
                            isChecked
                              ? 'border-primary bg-primary/5 font-medium text-foreground'
                              : 'border-muted bg-card text-muted-foreground hover:bg-muted/30'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedAwardReasons((prev) => [...prev, preset]);
                              } else {
                                setSelectedAwardReasons((prev) => prev.filter((r) => r !== preset));
                              }
                            }}
                            className="mt-0.5 h-3 w-3 rounded text-primary"
                          />
                          <span className="leading-tight">{preset}</span>
                        </label>
                      );
                    })}
                  </div>

                  <textarea
                    id="award-justification"
                    className="w-full rounded border p-1.5 text-xs focus:border-primary focus:outline-none"
                    rows={2}
                    placeholder="Additional audit justification notes (optional)..."
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  disabled={busy || !selectedQuote}
                  onClick={() => void handleLockAward()}
                  className="rounded bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition"
                >
                  {busy ? 'Locking…' : '🔒 Lock Award Decision →'}
                </button>
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
