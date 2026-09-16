import {
  weightDisagreesWithHeadCount,
  type VoteTallyEntry,
  type VotingSummary,
} from '../types/governance';

export interface WeightedTallyTableProps {
  tally: VoteTallyEntry[];
  summary: VotingSummary | null;
  /** Highlights the supplier the chair is about to award. */
  highlightQuoteId?: string | null;
}

/**
 * Where the committee stands, by alias.
 *
 * Weight and head count are shown side by side rather than blended into a
 * single number, because a chair signing off an award needs to know when the
 * two disagree.
 */
export function WeightedTallyTable({
  tally,
  summary,
  highlightQuoteId,
}: WeightedTallyTableProps) {
  const split = weightDisagreesWithHeadCount(tally);
  const totalWeight = tally.reduce((sum, row) => sum + row.recommendWeight, 0);

  return (
    <div data-testid="weighted-tally">
      {summary && (
        <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Members Voted</dt>
            <dd className="font-medium">
              {summary.membersVoted} of {summary.assignedMembers}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Weight cast</dt>
            <dd className="font-medium">{summary.weightCast}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Abstained</dt>
            <dd className="font-medium">{summary.abstained}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Opposed</dt>
            <dd className="font-medium">{summary.opposed}</dd>
          </div>
        </dl>
      )}

      {tally.length === 0 ? (
        <p className="text-xs text-muted-foreground p-2">No recommendations yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-bold">Candidate</th>
                <th className="px-3 py-2 text-right font-bold">Weight</th>
                <th className="px-3 py-2 text-right font-bold">Share</th>
                <th className="px-3 py-2 text-right font-bold">Members</th>
              </tr>
            </thead>
            <tbody>
              {tally.map((row) => (
                <tr
                  key={row.anonymousLabel}
                  className={
                    highlightQuoteId && row.quoteId === highlightQuoteId
                      ? 'border-b bg-primary/10 font-bold'
                      : 'border-b'
                  }
                >
                  <td className="px-3 py-2 font-medium">{row.anonymousLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.recommendWeight}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {totalWeight > 0
                      ? `${Math.round((row.recommendWeight / totalWeight) * 100)}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.recommendCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {split && (
        <p className="mt-3 rounded-xl border border-amber-300 dark:border-amber-800/70 bg-amber-50/90 dark:bg-amber-950/40 p-3 text-xs text-amber-900 dark:text-amber-200">
          ⚠️ The weighted leader is not the one most members chose. Worth saying out loud
          in the justification.
        </p>
      )}

      {summary && !summary.votingOpen && (
        <p className="mt-3 text-xs text-muted-foreground">
          Voting closed when the award was locked
          {summary.votesLockedAt &&
            ` on ${new Date(summary.votesLockedAt).toLocaleString()}`}
          .
        </p>
      )}
    </div>
  );
}
