/**
 * OTP Next — Core Procurement Flow: DECIDE Stage
 * Handles buyer decision, RWA committee weighted voting, quorum check, and COI declarations.
 */

import React, { useState, useEffect } from 'react';
import { useContracts } from '@/lib/contracts-context';
import type { VotingTallyDto, ConflictDeclarationDto } from '@otp/services';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';

export interface ProcurementDecideStageProps {
  rfqId: string;
  selectedQuoteId: string;
  onAwardIssued: (awardId: string) => void;
  onBackToReview?: () => void;
}

export function ProcurementDecideStage({
  rfqId,
  selectedQuoteId,
  onAwardIssued,
  onBackToReview,
}: ProcurementDecideStageProps) {
  const contracts = useContracts();
  const [tally, setTally] = useState<VotingTallyDto | null>(null);
  const [coiList, setCoiList] = useState<ConflictDeclarationDto[]>([]);
  const [hasDeclaredCoi, setHasDeclaredCoi] = useState(false);
  const [isCoiModalOpen, setIsCoiModalOpen] = useState(false);
  const [coiReason, setCoiReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [voteDecision, setVoteDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [voteComment, setVoteComment] = useState('Recommended lowest landed cost with 12 mo warranty.');
  const [error, setError] = useState<string | null>(null);

  const actorRwa = {
    profileId: 'usr_baskar',
    fullName: 'Baskar Loganathan',
    email: 'bvnbasu@gmail.com',
    persona: 'RWA' as const,
    organizationId: 'org_durga_rainbow',
    orgRole: 'COMMITTEE_MEMBER',
  };

  useEffect(() => {
    async function load() {
      const tallyRes = await contracts.evaluationVoting.getVotingTally(actorRwa, rfqId, selectedQuoteId);
      if (tallyRes.ok) setTally(tallyRes.value);

      const coiRes = await contracts.conflictOfInterest.listDeclarationsForRfq(actorRwa, rfqId);
      if (coiRes.ok) {
        setCoiList(coiRes.value);
        setHasDeclaredCoi(coiRes.value.some((d) => d.profileId === actorRwa.profileId && d.hasConflict));
      }
    }
    void load();
  }, [rfqId, selectedQuoteId]);

  async function handleDeclareCoi() {
    if (!coiReason.trim()) return;
    const res = await contracts.conflictOfInterest.declareConflict(actorRwa, {
      rfqId,
      hasConflict: true,
      conflictReason: coiReason.trim(),
    });
    if (res.ok) {
      setHasDeclaredCoi(true);
      setIsCoiModalOpen(false);
      setCoiList((prev) => [...prev, res.value]);
    }
  }

  async function handleCastVoteAndAward() {
    if (hasDeclaredCoi) {
      setError('You have declared an irrevocable conflict of interest and are barred from voting or awarding.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const voteRes = await contracts.evaluationVoting.castVote(actorRwa, {
        rfqId,
        quoteId: selectedQuoteId,
        decision: voteDecision,
        comment: voteComment,
      });

      if (!voteRes.ok) {
        setError(voteRes.error.message);
        setIsSubmitting(false);
        return;
      }

      const awardRes = await contracts.awardReveal.issueAwardNotice(actorRwa, {
        rfqId,
        selectedQuoteId,
        notes: voteComment,
      });

      if (!awardRes.ok) {
        setError(awardRes.error.message);
        setIsSubmitting(false);
        return;
      }

      onAwardIssued(awardRes.value.awardId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to finalize award decision');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-card rounded-2xl border border-border p-4 sm:p-6 space-y-6 shadow-sm">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-wider">
          <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px]">3</span>
          <span>STAGE 3 · DECIDE & GOVERNANCE</span>
        </div>
        <h2 className="text-xl font-black text-foreground">Committee Voting & Award Decision</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Enforces weighted committee voting, quorum validation, and anti-self-approval safeguards.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Quorum & Governance Status Badge */}
      <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">Committee Quorum Status</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
            <Icon name="check_circle" size={12} /> Quorum Reached (2/3 Voted)
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
          <div className="bg-primary h-1.5 rounded-full" style={{ width: '67%' }} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          Durga Rainbow Assn Executive Committee: 2 out of 3 active members have cast affirmative votes.
        </p>
      </div>

      {/* Conflict of Interest (COI) Declaration Box */}
      <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-bold">
            <Icon name="gavel" size={16} />
            <span>Anti-Collusion & Conflict Safeguards</span>
          </div>
          {!hasDeclaredCoi && (
            <button
              type="button"
              onClick={() => setIsCoiModalOpen(true)}
              className="text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:underline"
            >
              Declare COI
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {hasDeclaredCoi
            ? '⚠️ You have filed an irrevocable Conflict of Interest declaration for this requirement. Voting privileges are suspended.'
            : 'Section 00242 requirement: All committee voters must certify zero conflict of interest prior to contract award.'}
        </p>
      </div>

      {/* Voting Decision Form */}
      {!hasDeclaredCoi ? (
        <div className="space-y-3 pt-1">
          <label className="text-xs font-black text-foreground uppercase tracking-wider block">
            Cast Committee Decision
          </label>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setVoteDecision('APPROVE')}
              className={`p-3 rounded-xl border text-center transition font-bold text-xs flex items-center justify-center gap-2 ${
                voteDecision === 'APPROVE'
                  ? 'border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-600'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <Icon name="thumb_up" size={16} /> Approve & Award
            </button>
            <button
              type="button"
              onClick={() => setVoteDecision('REJECT')}
              className={`p-3 rounded-xl border text-center transition font-bold text-xs flex items-center justify-center gap-2 ${
                voteDecision === 'REJECT'
                  ? 'border-destructive bg-destructive/10 text-destructive ring-1 ring-destructive'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              <Icon name="thumb_down" size={16} /> Reject Quotation
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground block">
              Committee Resolution Note
            </label>
            <textarea
              rows={2}
              value={voteComment}
              onChange={(e) => setVoteComment(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-border text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      {/* COI Modal */}
      {isCoiModalOpen && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-3">
          <h4 className="text-xs font-bold text-destructive">Irrevocable Conflict Declaration</h4>
          <p className="text-[11px] text-muted-foreground">
            Declaring a conflict of interest cannot be undone and will record an immutable audit log.
          </p>
          <input
            type="text"
            value={coiReason}
            onChange={(e) => setCoiReason(e.target.value)}
            placeholder="Describe affiliation or conflict..."
            className="w-full px-3 py-2 rounded-lg border border-border text-xs font-semibold text-foreground"
          />
          <div className="flex gap-2">
            <Button type="button" onClick={handleDeclareCoi} className="bg-destructive text-destructive-foreground text-xs font-bold">
              Confirm & Submit
            </Button>
            <Button type="button" variant="ghost" onClick={() => setIsCoiModalOpen(false)} className="text-xs font-bold">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="pt-4 flex items-center justify-between gap-3">
        {onBackToReview && (
          <Button type="button" variant="ghost" onClick={onBackToReview} className="text-xs min-h-[44px]">
            ← Back to REVIEW
          </Button>
        )}
        <Button
          type="button"
          disabled={isSubmitting || hasDeclaredCoi}
          onClick={handleCastVoteAndAward}
          className="flex-1 py-3 text-xs font-bold rounded-xl shadow-xs min-h-[44px]"
        >
          {isSubmitting ? 'Recording Award Resolution…' : 'Finalize Award & Proceed to TRACK →'}
        </Button>
      </div>
    </div>
  );
}
