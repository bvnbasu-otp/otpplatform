import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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

const RATIONALE_CHIPS = [
  { id: 'optimal_value', label: '⭐ Optimal Value', text: 'Optimal price-to-quality ratio within fair market benchmark' },
  { id: 'superior_warranty', label: '🛡️ Superior Warranty', text: 'Superior warranty terms & post-execution support' },
  { id: 'fastest_delivery', label: '⚡ Fastest Delivery', text: 'Fastest turnaround & guaranteed delivery timeline' },
  { id: 'verified_track_record', label: '✓ Verified Track Record', text: 'Verified track record with consistent execution performance' },
  { id: 'compliant_spec', label: '⚙️ Compliant Spec', text: 'Fully compliant with all technical specifications & quality criteria' },
];

export function CommitteeVotePage({ rfqId }: { rfqId: string }) {
  const navigate = useNavigate();
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
  const [showTallyBreakdown, setShowTallyBreakdown] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);

  const handleSelectQuote = (quoteId: string) => {
    setSelectedQuote(quoteId);
    if (myVote && quoteId !== myVote.recommendedQuoteId) {
      setIsRevising(true);
    }
  };

  const toggleRationaleChip = (chipText: string) => {
    setSelectedReasons((prev) =>
      prev.includes(chipText) ? prev.filter((r) => r !== chipText) : [...prev, chipText],
    );
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
  const isSoloBuyer =
    myVote?.buyerType === 'INDIVIDUAL' ||
    (summary?.assignedMembers != null && summary.assignedMembers <= 1);

  // Quorum Metrics
  const assigned = summary?.assignedMembers ?? (isSoloBuyer ? 1 : 3);
  const votedCount = summary?.membersVoted ?? (myVote ? 1 : 0);
  const quorumRequired = summary?.quorumRequired ?? (isSoloBuyer ? 1 : Math.ceil(assigned / 2));
  const quorumMet = summary?.quorumMet ?? (votedCount >= quorumRequired);
  const quorumPercent = Math.min(100, Math.round((votedCount / (assigned || 1)) * 100));

  const selectedCandidate = quotes.find((q) => q.quoteId === selectedQuote);

  async function handleCastVote() {
    if (!selectedQuote || !profileId) return;
    if (!coiConfirmed) {
      setError('Please confirm that you have no conflict of interest before proceeding.');
      return;
    }

    if (!hasReason) {
      setError('Please select at least 1 rationale chip or provide a justification note.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);

    // Auto-record COI declaration if missing
    if (!myCoi) {
      const coiRes = await declareCoi(rfqId, profileId, 'DECLARED_NONE');
      if (!coiRes.ok) {
        setBusy(false);
        setError(coiRes.error);
        return;
      }
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
        : isSoloBuyer
        ? 'Winning candidate selected & recorded. Proceeding to Award!'
        : 'Evaluation vote successfully recorded!',
    );
    setComment('');
    setSelectedReasons([]);
    setIsRevising(false);
    await load();

    if (isSoloBuyer) {
      // Direct fast-track to award for solo buyers
      navigate(`/rfq/${rfqId}/award`);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center p-6 text-sm text-muted-foreground">
        <div className="text-center space-y-2">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p>Loading Committee Decision Room…</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="zero-scroll-container min-h-screen bg-background text-foreground overflow-x-hidden max-w-full pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] relative"
      data-testid="committee-vote-page"
    >
      <ProcurementStageNavigator
        currentLinearStep={myVote ? 8 : 7}
        currentStage="EVALUATING"
        orderTitle={isSoloBuyer ? 'Buyer Decision Room' : 'Committee Decision Room & Ballot'}
        orderReference={`RFQ-${rfqId.slice(0, 8)}`}
        rfqId={rfqId}
        role="buyer"
        backToUrl={`/rfq/${rfqId}/evaluation`}
        backToLabel="Fair Comparison"
      />

      <div className="px-3.5 sm:px-6 max-w-2xl mx-auto w-full space-y-4 pt-2 pb-32 pb-[calc(8rem+env(safe-area-inset-bottom,0px))]">
        {/* Committee Quorum Status Header Banner */}
        <div className="rounded-2xl bg-cyan-500/10 border border-cyan-500/30 p-3.5 flex items-center justify-between shadow-2xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-800 dark:text-cyan-300 block">
              Committee Quorum Status
            </span>
            <h5 className="text-sm font-black text-foreground">
              {votedCount} of {assigned} Votes Cast ({quorumPercent}%)
            </h5>
          </div>
          <span className="text-2xl">🏛️</span>
        </div>

        {/* Header Bar */}
        <div className="rounded-2xl border bg-card/90 backdrop-blur-xs p-3.5 sm:p-4 shadow-2xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-cyan-100 dark:bg-cyan-950/70 px-2.5 py-0.5 text-[11px] font-bold text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                Committee Voting &amp; Deliberation
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  isSoloBuyer
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                    : 'bg-primary/10 border-primary/30 text-primary'
                }`}
              >
                {isSoloBuyer ? '⚡ Direct Solo Authority' : '🏛️ Multi-Member Governance'}
              </span>
            </div>

            {(summary?.quorumMet || votes.length > 0 || myVote) && (
              <Link
                to={`/rfq/${rfqId}/award`}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 dark:bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800 active:scale-[0.98] transition min-h-[44px]"
                data-testid="proceed-to-award-button"
              >
                <span>Proceed to Award</span>
                <span>→</span>
              </Link>
            )}
          </div>

          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-foreground">
              {isSoloBuyer
                ? 'Select Winning Candidate & Authorize Award'
                : 'Committee Decision Room & Voting Ballot'}
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
              Core Decision: <span className="font-semibold text-foreground">&ldquo;Which offer should I support and why?&rdquo;</span> — Evaluate shortlisted candidates on merit, TAT, warranty, and commercial value.
            </p>
          </div>
        </div>

        {/* Live Quorum Meter (Visual Progress Bar) */}
        {!isSoloBuyer && (
          <section
            aria-label="Quorum Status"
            className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">🗳️</span>
                <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Live Quorum Meter
                </span>
              </div>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  quorumMet
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                }`}
              >
                {quorumMet ? '✓ Quorum Reached' : `${quorumRequired - votedCount} more vote(s) needed`}
              </span>
            </div>

            {/* Visual Bar */}
            <div className="space-y-1">
              <div className="h-3 w-full rounded-full bg-muted/60 overflow-hidden p-0.5 border border-border/40">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    quorumMet ? 'bg-emerald-600 dark:bg-emerald-500' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.max(8, quorumPercent)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium pt-0.5">
                <span>
                  <strong>{votedCount} of {assigned}</strong> votes recorded
                </span>
                <span className="font-bold text-foreground">
                  {quorumPercent}% Quorum reached
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11px]">
              <span className="text-muted-foreground">
                Quorum rule: Minimum <strong>{quorumRequired}</strong> affirmative vote(s) required to unlock Award lock.
              </span>
              <button
                type="button"
                onClick={() => setShowTallyBreakdown(!showTallyBreakdown)}
                className="text-primary font-bold hover:underline py-1"
              >
                {showTallyBreakdown ? 'Hide Standings ▲' : 'View Standings Table ▼'}
              </button>
            </div>
          </section>
        )}

        {/* Alerts & Feedback */}
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
            data-testid="governance-success"
          >
            {success}
          </div>
        )}

        {/* Section 1: Candidate Comparison Cards (4-Pillar Metrics) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <span>1. Shortlisted Candidates</span>
                <span className="rounded-full bg-primary/10 text-primary px-2 py-0.2 text-[10px] font-bold">
                  {quotes.length} Sealed Offers
                </span>
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Ranked by Merit Score · Identity-protected prior to award confirmation
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground italic hidden sm:block">
              Tap card to select candidate
            </span>
          </div>

          <div className="grid gap-3 grid-cols-1">
            {quotes.map((q, idx) => {
              const isSelected = selectedQuote === q.quoteId;
              const isMyVotedQuote = myVote?.recommendedQuoteId === q.quoteId;
              const isTopRanked =
                idx === 0 ||
                (quotes[0]?.evaluationScore != null && q.evaluationScore === quotes[0]?.evaluationScore);
              const scoreValue = q.evaluationScore != null ? (q.evaluationScore / 10).toFixed(1) : null;
              const deliveryDisplay = q.deliveryDays ? `${q.deliveryDays} Days TAT` : 'Standard SLA';
              const warrantyDisplay = q.warrantyMonths ? `${q.warrantyMonths} Months` : '12 Mo Standard';

              return (
                <div
                  key={q.quoteId}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!votingOpen) return;
                    handleSelectQuote(q.quoteId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectQuote(q.quoteId);
                    }
                  }}
                  className={`relative cursor-pointer rounded-2xl border p-4 transition-all duration-200 space-y-3 min-h-[44px] ${
                    isSelected
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/5 shadow-md'
                      : 'bg-card hover:border-slate-400 dark:hover:border-slate-600 shadow-2xs'
                  }`}
                >
                  {/* Card Header & Badges */}
                  <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-muted-foreground/40 bg-card text-muted-foreground'
                        }`}
                      >
                        {isSelected ? '✓' : idx + 1}
                      </div>
                      <span className="font-bold text-foreground truncate text-sm">
                        {q.anonymousLabel}
                      </span>
                      <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        🔒 Sealed
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isMyVotedQuote ? (
                        <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 text-[10px] font-black">
                          ✓ Your Vote
                        </span>
                      ) : isTopRanked ? (
                        <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-bold">
                          ⭐ Top Merit
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* 4-Pillar Metrics Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/20 dark:bg-muted/10 p-2.5 rounded-xl border border-border/50">
                    {/* Pillar 1: Total Price */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wide">
                        1. Total Price
                      </span>
                      <span className="font-mono font-black text-foreground text-sm sm:text-base block">
                        ₹{q.totalCost.toLocaleString('en-IN')}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {q.totalCost === Math.min(...quotes.map((item) => item.totalCost)) ? 'Lowest rate' : 'All-inclusive'}
                      </span>
                    </div>

                    {/* Pillar 2: Delivery TAT */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wide">
                        2. Delivery TAT
                      </span>
                      <span className="font-bold text-foreground text-xs sm:text-sm flex items-center gap-1">
                        <span>⚡</span>
                        <span>{deliveryDisplay}</span>
                      </span>
                      <span className="text-[9px] text-muted-foreground">Turnaround SLA</span>
                    </div>

                    {/* Pillar 3: Warranty */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wide">
                        3. Warranty
                      </span>
                      <span className="font-bold text-foreground text-xs sm:text-sm flex items-center gap-1">
                        <span>🛡️</span>
                        <span>{warrantyDisplay}</span>
                      </span>
                      <span className="text-[9px] text-muted-foreground">Post-work cover</span>
                    </div>

                    {/* Pillar 4: Merit Score */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block tracking-wide">
                        4. Merit Score
                      </span>
                      <span className="font-bold text-foreground text-xs sm:text-sm flex items-center gap-1">
                        <span className="text-amber-500">★</span>
                        <span>{scoreValue ? `${scoreValue}/10` : 'Evaluated'}</span>
                      </span>
                      <span className="text-[9px] text-muted-foreground">Objective weighted</span>
                    </div>
                  </div>

                  {/* Card Bottom Selection Indicator */}
                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {isSelected ? '✓ Candidate highlighted for your ballot' : 'Tap card to choose'}
                    </span>
                    <span
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'border border-primary/40 text-primary'
                      }`}
                    >
                      {isSelected ? '✓ Selected' : 'Select'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Voting Ballot & 1-Tap Rationale Chips */}
        <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-3.5">
          {myVote && !isRevising ? (
            <div className="space-y-3" data-testid="my-vote">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Recorded Evaluation Ballot
                  </span>
                  <h3 className="text-sm font-bold text-foreground">
                    {formatVoteChoice(myVote.choice)} — {myVote.recommendedAlias ?? 'Selected Candidate'}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    Weight: {formatVotingPower(myVote.votingPower)} · Cast: {formatDateTimeIST(myVote.castAt)}
                  </p>
                </div>
                {votingOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRevising(true);
                      setComment('');
                    }}
                    className="rounded-xl border border-primary/40 bg-card px-3 py-2 text-xs font-bold text-primary hover:bg-muted min-h-[44px]"
                  >
                    ↺ Revise Vote
                  </button>
                )}
              </div>

              {myVote.comment && (
                <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <span className="font-bold text-foreground block mb-0.5">Recorded Rationale:</span>
                  &ldquo;{myVote.comment}&rdquo;
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3.5" data-testid="vote-form">
              <div className="flex items-center justify-between border-b border-border/50 pb-2">
                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                    {myVote ? '↺ Revise Your Decision Ballot' : '2. Decision Ballot & Justification'}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Select suggested rationale templates below or enter custom comments to justify your recommendation on record.
                  </p>
                </div>
                {myVote && (
                  <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                    Revision Active
                  </span>
                )}
              </div>

              {/* Active Candidate Confirmation */}
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-3.5 space-y-1.5 shadow-2xs">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                  Your Recommended Candidate:
                </span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-black text-foreground">
                    {selectedCandidate ? selectedCandidate.anonymousLabel : 'No candidate selected yet'}
                    {selectedCandidate && selectedCandidate.totalCost === Math.min(...quotes.map((q) => q.totalCost)) ? ' (L1)' : ''}
                  </span>
                  {selectedCandidate && (
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      ₹{selectedCandidate.totalCost.toLocaleString('en-IN')} · ★ {selectedCandidate.evaluationScore ? (selectedCandidate.evaluationScore / 10).toFixed(1) : '9.4'}
                    </span>
                  )}
                </div>
              </div>

              {/* Rationale Template Chips (Suggestions) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-foreground">
                    Suggested Rationale Templates (Tap to select &amp; review) <span className="text-red-500 font-bold">*</span>
                  </label>
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {selectedReasons.length > 0 ? `${selectedReasons.length} selected` : 'Required'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {RATIONALE_CHIPS.map((chip) => {
                    const isSelected = selectedReasons.includes(chip.text);
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => toggleRationaleChip(chip.text)}
                        className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-all flex items-center gap-1.5 min-h-[44px] ${
                          isSelected
                            ? 'bg-primary text-primary-foreground shadow-xs font-bold ring-2 ring-primary/40'
                            : 'border border-border bg-card text-foreground hover:bg-muted/50'
                        }`}
                      >
                        <span>{chip.label}</span>
                        {isSelected && <span>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Justification Notes */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground block">
                  Review / Edit Justification Commentary (Optional or Custom Rationale):
                </label>
                <textarea
                  className="w-full rounded-xl border border-input bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                  placeholder="Add or customize specific observations regarding delivery TAT, compliance, or benchmark comparison..."
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />
              </div>

              {/* COI Affirmation Checkbox (≥44px Touch Target) */}
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/80 bg-muted/20 p-3 text-xs text-foreground transition hover:bg-muted/40 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={coiConfirmed}
                  onChange={(e) => setCoiConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded text-primary focus:ring-primary"
                />
                <span className="leading-snug text-[11px]">
                  <strong>Conflict of Interest (COI) Affirmation:</strong> I declare and certify that I have no personal, commercial, or relational conflict of interest with any participating supplier in this RFQ.
                </span>
              </label>

              {!hasReason && (
                <div
                  className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-2.5 text-[11px] text-amber-800 dark:text-amber-200"
                  data-testid="reason-required-warning"
                >
                  ⚠️ <strong>Rationale Required:</strong> Please tap at least one rationale chip above or enter notes before submitting your vote.
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 3: Tally & Audit Collapsible Standings */}
        {showTallyBreakdown && (
          <section
            className="rounded-2xl border bg-card p-4 shadow-2xs space-y-2 animate-in fade-in"
            data-testid="tally-section"
          >
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                3. Evaluation Standings &amp; Vote Tally
              </h2>
              <span className="text-[10px] text-muted-foreground">Live Weight Distribution</span>
            </div>
            <WeightedTallyTable tally={tally} summary={summary} highlightQuoteId={selectedQuote} />
          </section>
        )}

        {/* Section 4: Decision & Revision Audit Log */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowAuditLog(!showAuditLog)}
            className="w-full flex items-center justify-between rounded-xl border bg-card p-3 text-xs font-bold text-muted-foreground hover:text-foreground transition min-h-[44px]"
          >
            <span>📜 View Full Decision Audit Trail ({votes.length} votes recorded)</span>
            <span>{showAuditLog ? '▲' : '▼'}</span>
          </button>

          {showAuditLog && (
            <section
              className="mt-2 rounded-2xl border bg-card p-3.5 shadow-2xs space-y-2"
              data-testid="votes-list"
            >
              {votes.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">No evaluation votes recorded yet.</p>
              ) : (
                <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {votes.map((v) => {
                    const superseded = !liveVoteIds.has(v.id);
                    return (
                      <li
                        key={v.id}
                        className={`rounded-xl border p-2.5 text-xs transition ${
                          superseded
                            ? 'border-dashed bg-muted/20 opacity-70'
                            : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-foreground">
                            {v.voterName ?? v.profileId.slice(0, 8)} → {v.anonymousLabel ?? 'Candidate'}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.2 text-[9px] font-black ${
                              superseded
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {superseded ? 'Superseded' : '✓ Live Vote'}
                          </span>
                        </div>
                        {v.comment && (
                          <p className="mt-1 text-[11px] text-muted-foreground italic">
                            &ldquo;{v.comment}&rdquo;
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {/* SINGLE STICKY PRIMARY CTA (Fixed Mobile Action Bar) */}
      <div className="fixed sm:absolute bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-md p-3 sm:px-6 shadow-xl pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          {/* Status Indicator */}
          <div className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 text-xs">
            <span className="text-muted-foreground">
              Candidate: <strong className="text-foreground">{selectedCandidate?.anonymousLabel ?? 'None chosen'}</strong>
            </span>
            {selectedCandidate && (
              <span className="font-mono font-black text-foreground">
                ₹{selectedCandidate.totalCost.toLocaleString('en-IN')}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="w-full sm:w-auto flex items-center gap-2">
            {myVote && !isRevising ? (
              <Link
                to={`/rfq/${rfqId}/award`}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 dark:bg-emerald-600 px-5 py-3 text-xs sm:text-sm font-black text-white shadow-md hover:bg-emerald-800 active:scale-[0.98] transition min-h-[44px]"
                data-testid="proceed-to-award-button"
              >
                <span>🏆 Proceed to Award</span>
                <span>→</span>
              </Link>
            ) : (
              <button
                type="button"
                disabled={busy || !selectedQuote || !coiConfirmed || !hasReason}
                onClick={() => void handleCastVote()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs sm:text-sm font-black text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 transition min-h-[44px]"
                data-testid="submit-vote-button"
              >
                {busy ? (
                  <span>Recording Decision…</span>
                ) : isSoloBuyer ? (
                  <span>🏆 Proceed to Award →</span>
                ) : myVote ? (
                  <span>✓ Confirm &amp; Update Vote</span>
                ) : (
                  <span>🗳️ Confirm &amp; Cast Vote</span>
                )}
              </button>
            )}

            {isRevising && myVote && (
              <button
                type="button"
                onClick={() => {
                  setIsRevising(false);
                  setSelectedQuote(myVote.recommendedQuoteId ?? '');
                }}
                className="rounded-xl border bg-card px-3 py-3 text-xs font-bold text-muted-foreground hover:bg-muted min-h-[44px]"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
