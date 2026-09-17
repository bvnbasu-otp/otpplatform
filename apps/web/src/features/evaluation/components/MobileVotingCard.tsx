import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { VoteChoice } from '@otp/domain';
import { declareCoi, fetchCoi } from '@/features/governance/api/coi';
import {
  castVote,
  fetchMyVote,
  fetchVotes,
  fetchVoteTally,
  fetchVotingSummary,
} from '@/features/governance/api/committee-votes';
import { fetchCurrentProfile } from '@/features/auth/user-role';
import {
  formatVoteChoice,
  formatVotingPower,
  weightDisagreesWithHeadCount,
  type CoiDeclaration,
  type CommitteeVote,
  type MyVote,
  type VoteTallyEntry,
  type VotingSummary,
} from '@/features/governance/types/governance';

export const DEFAULT_RATIONALE_CHIPS = [
  { id: 'optimal_value', label: '⭐ Optimal Value', text: 'Optimal price-to-quality ratio within fair market benchmark' },
  { id: 'superior_warranty', label: '🛡️ Superior Warranty', text: 'Superior warranty terms & post-execution support' },
  { id: 'fastest_delivery', label: '⚡ Fastest Delivery', text: 'Fastest turnaround & guaranteed delivery timeline' },
  { id: 'verified_track_record', label: '✓ Verified Track Record', text: 'Verified track record with consistent execution performance' },
  { id: 'compliant_spec', label: '⚙️ Compliant Spec', text: 'Fully compliant with all technical specifications & quality criteria' },
];

export interface CandidateQuoteOption {
  quoteId: string;
  anonymousLabel: string;
  totalCost: number;
  deliveryDays?: number | null;
  warrantyMonths?: number | null;
  evaluationScore?: number | null;
}

export interface MobileVotingCardProps {
  rfqId: string;
  quotes: CandidateQuoteOption[];
  selectedQuoteId?: string | null;
  onSelectQuote?: (quoteId: string) => void;
  onVoteSuccess?: () => void;
  disabled?: boolean;
}

function formatInr(amount: number): string {
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

export function MobileVotingCard({
  rfqId,
  quotes,
  selectedQuoteId,
  onSelectQuote,
  onVoteSuccess,
  disabled = false,
}: MobileVotingCardProps) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [myVote, setMyVote] = useState<MyVote | null>(null);
  const [votes, setVotes] = useState<CommitteeVote[]>([]);
  const [tally, setTally] = useState<VoteTallyEntry[]>([]);
  const [summary, setSummary] = useState<VotingSummary | null>(null);
  const [activeChoice, setActiveChoice] = useState<VoteChoice>('RECOMMEND');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [coiConfirmed, setCoiConfirmed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showTallyDetail, setShowTallyDetail] = useState(false);

  // Derive target candidate quote
  const activeQuoteId = selectedQuoteId || myVote?.recommendedQuoteId || quotes[0]?.quoteId || '';
  const activeCandidate = useMemo(
    () => quotes.find((q) => q.quoteId === activeQuoteId) ?? quotes[0],
    [quotes, activeQuoteId],
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const profile = await fetchCurrentProfile();
      setProfileId(profile?.profileId ?? null);

      const [mineRes, votesRes, tallyRes, summaryRes, coiRes] = await Promise.all([
        fetchMyVote(rfqId),
        fetchVotes(rfqId),
        fetchVoteTally(rfqId),
        fetchVotingSummary(rfqId),
        fetchCoi(rfqId),
      ]);

      if (mineRes.ok && mineRes.vote) {
        setMyVote(mineRes.vote);
        setActiveChoice(mineRes.vote.choice);
        if (mineRes.vote.comment) {
          setComment(mineRes.vote.comment);
        }
      }
      if (votesRes.ok) setVotes(votesRes.votes);
      if (tallyRes.ok) setTally(tallyRes.tally);
      if (summaryRes.ok) setSummary(summaryRes.summary);
      if (coiRes.ok && coiRes.declarations.length > 0) {
        const myCoi = coiRes.declarations.find((d) => d.profileId === profile?.profileId);
        if (myCoi) {
          setCoiConfirmed(myCoi.status === 'DECLARED_NONE');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load committee governance state');
    } finally {
      setIsLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const toggleChip = (text: string) => {
    setSelectedReasons((prev) => {
      const exists = prev.includes(text);
      const next = exists ? prev.filter((t) => t !== text) : [...prev, text];
      // Update comment text with selected chips
      if (next.length > 0) {
        setComment(next.join('. '));
      } else {
        setComment('');
      }
      return next;
    });
  };

  const handleCastVote = async () => {
    if (!coiConfirmed) {
      setError('Please clear the Conflict of Interest (COI) certification before voting.');
      return;
    }

    if (activeChoice === 'RECOMMEND' && !activeQuoteId) {
      setError('Please select a candidate supplier to recommend.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // 1. Declare COI if profile is loaded
      if (profileId) {
        await declareCoi(rfqId, profileId, 'DECLARED_NONE', 'Certified via OTP 30-Second Quick Ballot');
      }

      // 2. Cast Vote
      const finalComment = comment.trim() || selectedReasons.join('. ') || undefined;
      const targetQuote = activeChoice === 'RECOMMEND' ? activeQuoteId : null;

      const res = await castVote(rfqId, targetQuote, activeChoice, finalComment);
      if (!res.ok) {
        setError(res.error);
        setIsSubmitting(false);
        return;
      }

      setSuccess(`Your vote (${formatVoteChoice(activeChoice)}) has been recorded immutably.`);
      await loadData();
      if (onVoteSuccess) onVoteSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to submit vote');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSoloBuyer = summary?.assignedMembers === 1 || myVote?.buyerType === 'INDIVIDUAL';
  const hasDisagreement = weightDisagreesWithHeadCount(tally);
  const quorumMet = summary ? summary.membersVoted >= summary.assignedMembers : false;

  return (
    <div
      className="rounded-3xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4"
      data-testid="mobile-voting-card"
    >
      {/* 1. Header with Quorum & Voting Power */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/60">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <h3 className="text-sm font-black text-foreground">
              30-Second Mobile Ballot &amp; Quorum
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Fast committee voting with weighted voting power and instant quorum tally.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {myVote && (
            <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 text-[10px] font-black">
              {formatVotingPower(myVote.votingPower)}
            </span>
          )}
          {quorumMet ? (
            <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-300 border border-emerald-300 px-2.5 py-1 text-[10px] font-black">
              ✓ Quorum Reached ({summary?.membersVoted}/{summary?.assignedMembers})
            </span>
          ) : summary ? (
            <span className="rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 px-2.5 py-1 text-[10px] font-black">
              ⏳ Quorum: {summary.membersVoted}/{summary.assignedMembers} Voted
            </span>
          ) : null}
        </div>
      </div>

      {/* Quorum Progress Meter Bar with Real-Time Smooth Transition (DEF-006) */}
      {summary && summary.assignedMembers > 0 && (
        <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden" data-testid="quorum-meter-container">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-in-out ${
              quorumMet ? 'bg-emerald-500' : 'bg-primary'
            }`}
            style={{
              width: `${Math.min(100, Math.round((summary.membersVoted / summary.assignedMembers) * 100))}%`,
            }}
            data-testid="quorum-progress-meter"
          />
        </div>
      )}

      {/* Quorum Progress Meter Bar with Real-Time Smooth Transition (DEF-006) */}
      {summary && summary.assignedMembers > 0 && (
        <div className="w-full bg-muted/60 rounded-full h-2 overflow-hidden" data-testid="quorum-meter-container">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-in-out ${
              quorumMet ? 'bg-emerald-500' : 'bg-primary'
            }`}
            style={{
              width: `${Math.min(100, Math.round((summary.membersVoted / summary.assignedMembers) * 100))}%`,
            }}
            data-testid="quorum-progress-meter"
          />
        </div>
      )}

      {/* 2. Conflict of Interest (COI) Clearance */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1.5">
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={coiConfirmed}
            onChange={(e) => setCoiConfirmed(e.target.checked)}
            disabled={disabled || isSubmitting}
            className="mt-0.5 h-4 w-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
          />
          <div className="text-xs text-emerald-950 dark:text-emerald-200">
            <strong className="font-extrabold block">Conflict of Interest (COI) Certification:</strong>
            <span className="text-[11px] text-emerald-800 dark:text-emerald-300">
              I certify that I have no personal, financial, or familial relationship with any participating supplier.
            </span>
          </div>
        </label>
      </div>

      {/* 3. Candidate Target Details */}
      {activeCandidate && (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.02] dark:bg-primary/[0.06] p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
              Candidate for Recommendation:
            </span>
            <span className="font-mono text-xs font-bold text-foreground">
              {formatInr(activeCandidate.totalCost)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-sm text-foreground">
                🔒 {activeCandidate.anonymousLabel}
              </span>
              {activeCandidate.evaluationScore != null && (
                <span className="rounded bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 text-[10px] font-black">
                  ★ {(activeCandidate.evaluationScore / 10).toFixed(1)}/10
                </span>
              )}
            </div>

            {quotes.length > 1 && onSelectQuote && (
              <select
                value={activeQuoteId}
                onChange={(e) => onSelectQuote(e.target.value)}
                disabled={disabled || isSubmitting}
                aria-label="Select candidate supplier"
                className="rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary min-h-[36px]"
              >
                {quotes.map((q) => (
                  <option key={q.quoteId} value={q.quoteId}>
                    {q.anonymousLabel} — {formatInr(q.totalCost)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* 4. 1-Tap Ballot Buttons (RECOMMEND / ABSTAIN / OPPOSE) */}
      <div className="space-y-1.5">
        <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block">
          Your 1-Tap Ballot:
        </label>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveChoice('RECOMMEND')}
            disabled={disabled || isSubmitting}
            className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition min-h-[56px] mobile-touch-target ${
              activeChoice === 'RECOMMEND'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md font-black ring-2 ring-emerald-400/40'
                : 'bg-card text-foreground border-border hover:border-emerald-500/50 hover:bg-emerald-50/20'
            }`}
            data-testid="ballot-choice-recommend"
          >
            <span className="text-lg">⭐</span>
            <span className="text-xs font-bold mt-0.5">Recommend</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChoice('ABSTAIN')}
            disabled={disabled || isSubmitting}
            className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition min-h-[56px] mobile-touch-target ${
              activeChoice === 'ABSTAIN'
                ? 'bg-slate-700 text-white border-slate-700 shadow-md font-black ring-2 ring-slate-400/40'
                : 'bg-card text-foreground border-border hover:border-slate-400 hover:bg-slate-50/20'
            }`}
            data-testid="ballot-choice-abstain"
          >
            <span className="text-lg">⏸️</span>
            <span className="text-xs font-bold mt-0.5">Abstain</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveChoice('OPPOSE')}
            disabled={disabled || isSubmitting}
            className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition min-h-[56px] mobile-touch-target ${
              activeChoice === 'OPPOSE'
                ? 'bg-red-600 text-white border-red-600 shadow-md font-black ring-2 ring-red-400/40'
                : 'bg-card text-foreground border-border hover:border-red-500/50 hover:bg-red-50/20'
            }`}
            data-testid="ballot-choice-oppose"
          >
            <span className="text-lg">❌</span>
            <span className="text-xs font-bold mt-0.5">Oppose</span>
          </button>
        </div>
      </div>

      {/* 5. Candidate Rationale Metric Chips */}
      <div className="space-y-2">
        <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground block">
          Decision Rationale Chips (Select to Append):
        </label>

        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_RATIONALE_CHIPS.map((chip) => {
            const isSelected = selectedReasons.includes(chip.text);
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => toggleChip(chip.text)}
                disabled={disabled || isSubmitting}
                className={`rounded-xl px-2.5 py-1 text-xs font-bold border transition min-h-[36px] mobile-touch-target ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                    : 'bg-muted/40 text-muted-foreground hover:text-foreground border-border hover:bg-muted'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add optional consensus justification or notes for the audit trail…"
          rows={2}
          disabled={disabled || isSubmitting}
          className="w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Error & Success Feedback */}
      {error && (
        <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-200">
          ⚠️ {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-xs text-emerald-800 dark:text-emerald-200 font-bold">
          ✓ {success}
        </div>
      )}

      {/* 6. Disagreement Alert if Weight diverges from Headcount */}
      {hasDisagreement && (
        <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
          ⚠️ <strong>Split Consensus Advisory:</strong> Weighted voting results diverge from raw headcount. Please review the tally breakdown below before final lock.
        </div>
      )}

      {/* 7. Action Button: Cast / Revise Vote */}
      <div className="pt-1 flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => void handleCastVote()}
          disabled={disabled || isSubmitting || !coiConfirmed}
          className="w-full flex-1 min-h-[48px] rounded-2xl bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-98 disabled:opacity-50 transition flex items-center justify-center gap-2 mobile-touch-target"
          data-testid="submit-30-second-vote-button"
        >
          <span>{isSubmitting ? '⏳' : myVote ? '✓' : '⚡'}</span>
          <span>
            {isSubmitting
              ? 'Recording Ballot…'
              : myVote
              ? `Update Ballot (${formatVoteChoice(activeChoice)})`
              : `Submit 30-Sec Vote (${formatVoteChoice(activeChoice)})`}
          </span>
        </button>

        {tally.length > 0 && (
          <button
            type="button"
            onClick={() => setShowTallyDetail((v) => !v)}
            className="rounded-2xl border border-border bg-muted/40 px-3.5 py-3 text-xs font-bold text-foreground hover:bg-muted transition min-h-[48px] mobile-touch-target"
          >
            {showTallyDetail ? '▲ Hide Tally' : '📊 View Live Tally'}
          </button>
        )}
      </div>

      {/* 8. Live Tally Table Breakdown */}
      {showTallyDetail && tally.length > 0 && (
        <div className="pt-2 border-t border-border/60 space-y-2 animate-in fade-in-50">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground block">
            Current Committee Tally Standings:
          </span>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-[10px] uppercase font-bold text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-2">Candidate</th>
                  <th className="p-2 text-center">Headcount</th>
                  <th className="p-2 text-right">Weighted Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tally.map((entry) => (
                  <tr key={entry.anonymousLabel} className="hover:bg-muted/20">
                    <td className="p-2 font-mono font-bold text-foreground">
                      {entry.anonymousLabel}
                    </td>
                    <td className="p-2 text-center font-bold text-foreground">
                      {entry.recommendCount} ({entry.voteCount} total)
                    </td>
                    <td className="p-2 text-right font-black text-primary">
                      {entry.recommendWeight.toFixed(1)} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
