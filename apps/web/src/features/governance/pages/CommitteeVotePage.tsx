import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTimeIST } from '@/lib/date-utils';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import { ProcurementStageNavigator } from '@/features/lifecycle';
import { declareCoi, fetchCoi } from '../api/coi';
import {
  castVote,
  fetchMyVote,
  fetchVotes,
  fetchVoteTally,
  fetchVotingSummary,
} from '../api/committee-votes';
import {
  fetchIdentityProtectedQuotesForVote,
  fetchRfqGovernanceStatus,
} from '../api/rfq-governance';
import { WeightedTallyTable } from '../components/WeightedTallyTable';
import {
  currentVoteIds,
  formatVoteChoice,
  formatVotingPower,
  type IdentityProtectedQuoteForVote,
  type CoiDeclaration,
  type CommitteeVote,
  type MyVote,
  type RfqGovernanceStatus,
  type VoteTallyEntry,
  type VotingSummary,
} from '../types/governance';

const VOTE_REASON_PRESETS = [
  'Optimal price-to-quality ratio within fair market benchmark',
  'Fastest turnaround & guaranteed delivery timeline',
  'Superior warranty terms & post-execution support',
  'Fully compliant with all technical specifications & quality criteria',
  'Most competitive commercial pricing with high cost efficiency',
];

export function CommitteeVotePage({ rfqId }: { rfqId: string }) {
  const [searchParams] = useSearchParams();
  const urlQuoteId = searchParams.get('quote') || searchParams.get('quoteId');

  const [profileId, setProfileId] = useState<string | null>(null);
  const [status, setStatus] = useState<RfqGovernanceStatus | null>(null);
  const [coiList, setCoiList] = useState<CoiDeclaration[]>([]);
  const [votes, setVotes] = useState<CommitteeVote[]>([]);
  const [myVote, setMyVote] = useState<MyVote | null>(null);
  const [tally, setTally] = useState<VoteTallyEntry[]>([]);
  const [summary, setSummary] = useState<VotingSummary | null>(null);
  const [quotes, setQuotes] = useState<IdentityProtectedQuoteForVote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState('');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [coiConfirmed, setCoiConfirmed] = useState(true);
  const [isRevising, setIsRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleSelectQuote = (quoteId: string) => {
    setSelectedQuote(quoteId);
    if (myVote && quoteId !== myVote.recommendedQuoteId) {
      setIsRevising(true);
    }
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const profile = await fetchCurrentProfile();
      setProfileId(profile?.profileId ?? null);

      const [statusRes, coiRes, votesRes, quotesRes, mineRes, tallyRes, summaryRes] =
        await Promise.all([
          fetchRfqGovernanceStatus(rfqId),
          fetchCoi(rfqId),
          fetchVotes(rfqId),
          fetchIdentityProtectedQuotesForVote(rfqId),
          fetchMyVote(rfqId),
          fetchVoteTally(rfqId),
          fetchVotingSummary(rfqId),
        ]);

      if (statusRes.ok) setStatus(statusRes.status);
      if (coiRes.ok) setCoiList(coiRes.declarations);
      if (votesRes.ok) setVotes(votesRes.votes);
      const fetchedQuotes = quotesRes.ok ? quotesRes.quotes : [];
      if (quotesRes.ok) setQuotes(fetchedQuotes);
      if (tallyRes.ok) setTally(tallyRes.tally);
      if (summaryRes.ok) setSummary(summaryRes.summary);
      
      if (mineRes.ok && mineRes.vote) {
        setMyVote(mineRes.vote);
        setSelectedQuote(urlQuoteId || mineRes.vote.recommendedQuoteId || '');
      } else {
        const initial = urlQuoteId || (fetchedQuotes.length === 1 ? fetchedQuotes[0]?.quoteId : '') || '';
        setSelectedQuote((prev) => prev || initial);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load evaluation & voting room');
    } finally {
      setIsLoading(false);
    }
  }, [rfqId, urlQuoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const myCoi = coiList.find((c) => c.profileId === profileId);
  const votingOpen = summary?.votingOpen ?? true;
  const liveVoteIds = currentVoteIds(votes);
  const hasReason = selectedReasons.length > 0 || Boolean(comment.trim());
  const isSoloBuyer = myVote?.buyerType === 'INDIVIDUAL' || (summary?.assignedMembers != null && summary.assignedMembers <= 1);

  async function handleCastVote() {
    if (!selectedQuote || !profileId) return;
    if (!coiConfirmed) {
      setError('Please confirm that you have no conflict of interest before voting.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    // Auto-record COI if not already recorded
    if (!myCoi) {
      const coiRes = await declareCoi(rfqId, profileId, 'DECLARED_NONE');
      if (!coiRes.ok) {
        setBusy(false);
        setError(coiRes.error);
        return;
      }
    }

    const hasReason = selectedReasons.length > 0 || Boolean(comment.trim());
    if (!hasReason) {
      setError('Please select at least one reason / recommendation or enter a justification note before submitting your vote.');
      return;
    }

    const combinedJustification = [...selectedReasons, comment.trim()].filter(Boolean).join('. ');
    const finalComment = combinedJustification || 'Evaluated and approved as recommended quote';

    const result = await castVote(rfqId, selectedQuote, 'RECOMMEND', finalComment);
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccess(
      result.revised
        ? 'Your evaluation decision has been updated.'
        : 'Evaluation decision successfully recorded!',
    );
    setComment('');
    setSelectedReasons([]);
    setIsRevising(false);
    await load();
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">Loading Evaluation &amp; Voting Room…</p>;

  return (
    <div className="zero-scroll-container p-3 max-w-7xl mx-auto w-full" data-testid="committee-vote-page">
      <ProcurementStageNavigator
        currentLinearStep={myVote ? 8 : 7}
        currentStage="EVALUATING"
        orderTitle={isSoloBuyer ? "Buyer Evaluation & Decision" : "Committee Voting Room & Cast Your Vote"}
        orderReference={`RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/evaluation`}
        backToLabel="Step 6: Fair Comparison"
      />

      {/* Header & Quick Action Row */}
      <div className="rounded-lg border bg-card px-3 py-2 shadow-2xs shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-cyan-100 dark:bg-cyan-950/60 px-2 py-0.5 text-[10px] font-bold text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 shrink-0">
            {myVote ? 'Step 8 / 15' : 'Step 7 / 15'}
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">
              {isSoloBuyer
                ? (myVote ? 'Confirmed Winning Supplier (Selected)' : 'Direct Decision & Winning Supplier Selection')
                : (myVote ? 'Cast / Recast Your Vote (Ballot Active)' : 'Committee Voting Room & COI Clearance')}
            </h1>
            <p className="text-[11px] text-muted-foreground truncate hidden sm:block">
              {isSoloBuyer
                ? 'Single-approver governance · Select winning quote on evaluated merit and proceed to Award'
                : 'Sealed anonymous evaluation · Committee quorum tracking · Mandatory Conflict of Interest (COI) clearance'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isSoloBuyer ? (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px]">
              <span className="text-emerald-800 dark:text-emerald-300 font-bold">
                {myVote ? '✓ Decision Recorded' : '⚡ Direct Authority'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/40 border text-[11px]">
              <span className="text-muted-foreground font-medium">Quorum:</span>
              <span className={`font-bold ${summary?.quorumMet ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
                {summary?.membersVoted ?? 0}/{summary?.assignedMembers ?? 0} {summary?.quorumMet ? '(Met)' : `(Need ${summary?.quorumRequired ?? 1})`}
              </span>
            </div>
          )}

          {(summary?.quorumMet || votes.length > 0 || myVote) ? (
            <Link
              to={`/rfq/${rfqId}/award`}
              className="inline-flex items-center gap-1 rounded bg-emerald-700 px-3 py-1 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition"
              data-testid="proceed-to-award-button"
            >
              <span>Step 9: Award →</span>
            </Link>
          ) : (
            <span className="text-[10px] text-muted-foreground border rounded px-2 py-1 bg-muted/20">
              🔒 Step 9: Awaiting Decision
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/40 p-2 text-xs font-semibold text-red-700 dark:text-red-300 shrink-0 mt-1">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300 shrink-0 mt-1" data-testid="governance-success">
          {success}
        </div>
      )}

      {/* Main Content Pane */}
      <div className="zero-scroll-pane mt-2 pb-20 sm:pb-12 grid grid-cols-1 lg:grid-cols-12 gap-2.5">
        {/* Left Column (7 cols): Sealed Quotes & Vote Ballot */}
        <div className="lg:col-span-7 space-y-2">
          {/* 1. Sealed Quotes to Evaluate */}
          <section className="rounded-lg border bg-card p-2.5 shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">1. Sealed Quotes (Anonymized)</h2>
              <span className="text-[10px] text-muted-foreground font-semibold">Sorted by Merit Score</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {quotes.map((q, idx) => {
                const isSelected = selectedQuote === q.quoteId;
                const isMyVotedQuote = myVote?.recommendedQuoteId === q.quoteId;
                const isTopRecommended = idx === 0 || (quotes[0]?.evaluationScore != null && q.evaluationScore === quotes[0]?.evaluationScore);
                const scoreDisplay = q.evaluationScore != null ? `${(q.evaluationScore / 10).toFixed(1)}/10` : null;

                return (
                  <div
                    key={q.quoteId}
                    onClick={() => {
                      if (!votingOpen) return;
                      handleSelectQuote(q.quoteId);
                    }}
                    className={`cursor-pointer rounded-lg border p-2 text-xs transition ${
                      isSelected
                        ? 'border-primary ring-1 ring-primary/40 bg-primary/5 shadow-2xs'
                        : 'bg-card hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground pb-1 mb-1 border-b">
                      <span className="flex items-center gap-0.5 text-primary font-semibold">
                        <span>🔒</span> Protected
                      </span>
                      {scoreDisplay && (
                        <span className="font-bold text-foreground bg-muted px-1 rounded">
                          ★ {scoreDisplay}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-foreground truncate text-xs">
                        {q.anonymousLabel}
                      </span>
                      {isMyVotedQuote ? (
                        <span className="rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 px-1 text-[9px] font-bold">
                          Live Vote
                        </span>
                      ) : isTopRecommended ? (
                        <span className="rounded bg-primary/10 text-primary border border-primary/20 px-1 text-[9px] font-bold">
                          ⭐ Top
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 space-y-1 text-[11px] bg-muted/20 p-1.5 rounded border border-border/40">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground text-[10px]">Price:</span>
                        <strong className="font-mono font-bold text-foreground text-xs">
                          ₹{q.totalCost.toLocaleString('en-IN')}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-muted-foreground">Turnaround:</span>
                        <span className="font-semibold text-foreground">{q.deliveryDays ? `🚚 ${q.deliveryDays} days` : 'Standard'}</span>
                      </div>
                    </div>

                    {votingOpen && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectQuote(q.quoteId);
                        }}
                        className={`mt-1.5 w-full rounded py-1 text-[10px] font-bold transition ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-2xs'
                            : 'border border-primary/30 text-primary hover:bg-primary/10'
                        }`}
                      >
                        {isSelected ? '✓ Selected Recommendation' : 'Select'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 2. Your Vote & Ballot Section */}
          <section className="rounded-lg border bg-card p-2.5 shadow-2xs">
            {myVote && !isRevising ? (
              <div className="space-y-2" data-testid="my-vote">
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      Your Current Cast Vote
                    </span>
                    <p className="text-xs font-bold text-foreground">
                      {formatVoteChoice(myVote.choice)} — {myVote.recommendedAlias ?? 'Selected Supplier'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Power: {formatVotingPower(myVote.votingPower)} · Cast: {formatDateTimeIST(myVote.castAt)}
                    </p>
                  </div>
                  {votingOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsRevising(true);
                        setComment('');
                      }}
                      className="rounded border bg-card px-2.5 py-1 text-xs font-semibold text-primary hover:bg-muted"
                    >
                      ↺ Revise Vote
                    </button>
                  ) : (
                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      🔒 Locked
                    </span>
                  )}
                </div>
                {myVote.comment && (
                  <div className="rounded border bg-card p-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">Justification: </span>
                    &ldquo;{myVote.comment}&rdquo;
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2" data-testid="vote-form">
                <div className="flex items-center justify-between gap-2 border-b pb-1.5">
                  <h2 className="text-xs font-bold text-foreground uppercase tracking-wider text-muted-foreground">
                    {myVote ? '↺ Revise Your Vote' : '2. Cast Your Evaluation Vote'}
                  </h2>
                  {myVote && (
                    <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[9px] font-bold">
                      Revision Mode
                    </span>
                  )}
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-foreground mb-1">
                      Recommended Supplier:
                    </label>
                    <select
                      value={selectedQuote}
                      onChange={(e) => {
                        setSelectedQuote(e.target.value);
                        if (myVote && e.target.value !== myVote.recommendedQuoteId) {
                          setIsRevising(true);
                        }
                      }}
                      className="w-full rounded border px-2 py-1 text-xs bg-card font-medium text-foreground focus:border-primary focus:outline-none"
                    >
                      {!selectedQuote && (
                        <option value="" disabled>-- Select Recommended Supplier --</option>
                      )}
                      {quotes.map((q) => (
                        <option key={q.quoteId} value={q.quoteId}>
                          {q.anonymousLabel} — ₹{q.totalCost.toLocaleString('en-IN')} (TAT: {q.deliveryDays ? `${q.deliveryDays}d` : 'Std'}) {myVote?.recommendedQuoteId === q.quoteId ? '★ [Current Vote]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-[11px] font-semibold text-foreground">
                        Reason / Justification <span className="text-red-600 dark:text-red-400 font-bold">*</span>:
                      </label>
                      <span className="text-[10px] text-muted-foreground">
                        {selectedReasons.length > 0 ? `${selectedReasons.length} selected` : 'Selection required'}
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1 mb-1.5">
                      {VOTE_REASON_PRESETS.map((preset) => {
                        const isChecked = selectedReasons.includes(preset);
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
                                  setSelectedReasons((prev) => [...prev, preset]);
                                } else {
                                  setSelectedReasons((prev) => prev.filter((r) => r !== preset));
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
                      className="w-full rounded border p-1.5 text-xs focus:border-primary focus:outline-none"
                      placeholder="Additional custom justification notes (optional)..."
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                    />
                  </div>

                  <label className="flex cursor-pointer items-start gap-1.5 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={coiConfirmed}
                      onChange={(e) => setCoiConfirmed(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded text-primary"
                    />
                    <span>
                      <strong>COI Declaration:</strong> I declare that I have no conflict of interest with any participating supplier.
                    </span>
                  </label>

                  {!hasReason && (
                    <div className="rounded border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-1.5 text-[10px] text-amber-800 dark:text-amber-200" data-testid="reason-required-warning">
                      ⚠️ <strong>Reason Required:</strong> Select at least one preset reason above or enter custom justification.
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={busy || !selectedQuote || !coiConfirmed || !hasReason}
                      onClick={() => void handleCastVote()}
                      className="rounded bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition flex items-center gap-1.5"
                      data-testid="submit-vote-button"
                    >
                      {busy
                        ? 'Recording…'
                        : isSoloBuyer
                        ? (myVote ? '✓ Update Selected Supplier' : '✓ Confirm & Approve Winning Supplier →')
                        : (myVote ? '✓ Confirm Revised Vote' : '🗳️ Submit Vote')}
                    </button>
                    {myVote && (
                      <Link
                        to={`/rfq/${rfqId}/award`}
                        className="rounded bg-emerald-700 px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition flex items-center gap-1"
                      >
                        <span>Proceed to Award (Step 9) →</span>
                      </Link>
                    )}
                    {myVote && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsRevising(false);
                          setSelectedQuote(myVote.recommendedQuoteId ?? '');
                        }}
                        className="rounded border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Right Column (5 cols): Standings & Audit Log */}
        <div className="lg:col-span-5 space-y-2">
          {/* Evaluation Standings Tally */}
          <section className="rounded-lg border bg-card p-2.5 shadow-2xs" data-testid="tally-section">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              3. Evaluation Standings &amp; Tally
            </h2>
            <WeightedTallyTable tally={tally} summary={summary} />
          </section>

          {/* Decision Audit Log */}
          <section className="rounded-lg border bg-card p-2.5 shadow-2xs" data-testid="votes-list">
            <div className="flex items-center justify-between border-b pb-1.5">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                4. Decision &amp; Revision Log
              </h2>
              <span className="rounded bg-muted px-1.5 py-0.2 text-[9px] font-semibold text-muted-foreground">
                {votes.length} Recorded
              </span>
            </div>

            {votes.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No evaluation votes recorded yet.</p>
            ) : (
              <ul className="mt-1.5 space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                {votes.map((v) => {
                  const superseded = !liveVoteIds.has(v.id);
                  return (
                    <li
                      key={v.id}
                      className={`rounded border p-2 text-[11px] transition ${
                        superseded
                          ? 'border-dashed bg-muted/20 opacity-75'
                          : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 truncate">
                          <span className="font-bold text-foreground">
                            {v.voterName ?? v.profileId.slice(0, 8)}
                          </span>
                          <span className="text-muted-foreground">→</span>
                          <span className="rounded bg-primary/10 px-1 py-0.2 font-bold text-primary">
                            {v.anonymousLabel ?? 'Supplier'}
                          </span>
                        </div>

                        <span
                          className={`rounded px-1.5 py-0.2 text-[8px] font-bold shrink-0 ${
                            superseded
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {superseded ? '↺ Superseded' : '✓ Live'}
                        </span>
                      </div>

                      {v.comment && (
                        <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2 italic">
                          &ldquo;{v.comment}&rdquo;
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Navigation Action Card */}
          <section className="rounded-lg border bg-card p-2.5 shadow-2xs" data-testid="award-navigation-section">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Next Step (9 / 15)
                </span>
                <span className="text-xs font-bold text-foreground">Award Justification</span>
              </div>

              {(summary?.quorumMet || votes.length > 0) ? (
                <Link
                  to={`/rfq/${rfqId}/award`}
                  className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 transition shrink-0"
                >
                  🏆 Step 9: Award →
                </Link>
              ) : (
                <span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground opacity-60">
                  🔒 Awaiting Votes
                </span>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
