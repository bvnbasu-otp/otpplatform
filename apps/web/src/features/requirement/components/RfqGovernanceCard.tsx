import type { RfqReviewGovernance } from '../types/rfq-review';

interface RfqGovernanceCardProps {
  governance: RfqReviewGovernance;
}

export function RfqGovernanceCard({ governance }: RfqGovernanceCardProps) {
  const {
    policyType,
    minQuotesRequired,
    minCommitteeVotes,
    committeeVoteRequired,
    evaluationWeights,
    isFastTrack,
  } = governance;

  if (isFastTrack) {
    return (
      <section
        className="rounded-xl border bg-card p-4 shadow-2xs space-y-2 transition-all text-foreground"
        data-testid="rfq-governance-card-fast-track"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            6. Sourcing Protocol
          </span>
          <span className="text-xs font-bold text-foreground">⚡ Fast Track Express Sourcing</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Individual / MSME streamlined protocol. Quotes are collected under anonymous protection with direct buyer award authorization.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-xl border bg-card p-4 shadow-2xs space-y-3.5 transition-all text-foreground"
      data-testid="rfq-governance-card-full-governance"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="rounded-md bg-purple-100 dark:bg-purple-950/60 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            6. Governance &amp; Merit Weights
          </span>
          <h3 className="text-sm sm:text-base font-bold text-foreground mt-1">
            Committee Quorum &amp; Evaluation Protocol
          </h3>
        </div>

        <span className="rounded-full bg-purple-100 dark:bg-purple-950/60 px-2.5 py-0.5 text-[10px] font-bold text-purple-800 dark:text-purple-300 border border-purple-300">
          {policyType.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-muted/20 p-2.5 border space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            👥 Committee Quorum Rules
          </span>
          <p className="text-foreground font-semibold">
            • Minimum {minQuotesRequired} Quotes for Valid Quorum
          </p>
          {committeeVoteRequired && (
            <p className="text-foreground font-semibold">
              • Minimum {minCommitteeVotes} Committee Votes Required
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            ✓ Mandatory Conflict of Interest (COI) clearances before ballot submission.
          </p>
        </div>

        <div className="rounded-lg bg-muted/20 p-2.5 border space-y-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
            ⚖️ Transparent Merit Weights
          </span>
          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground pt-0.5">
            <span>Price: {evaluationWeights.price}%</span>
            <span>Delivery: {evaluationWeights.delivery}%</span>
            <span>Warranty: {evaluationWeights.warranty}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 flex overflow-hidden border mt-1">
            <div className="bg-primary h-full" style={{ width: `${evaluationWeights.price}%` }} />
            <div className="bg-blue-500 h-full" style={{ width: `${evaluationWeights.delivery}%` }} />
            <div className="bg-emerald-500 h-full" style={{ width: `${evaluationWeights.warranty}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
