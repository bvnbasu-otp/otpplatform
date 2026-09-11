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
        <p className="text-sm text-muted-foreground">No recommendations yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 font-medium">Supplier</th>
              <th className="py-2 text-right font-medium">Weight</th>
              <th className="py-2 text-right font-medium">Share</th>
              <th className="py-2 text-right font-medium">Members</th>
            </tr>
          </thead>
          <tbody>
            {tally.map((row) => (
              <tr
                key={row.anonymousLabel}
                className={
                  highlightQuoteId && row.quoteId === highlightQuoteId
                    ? 'border-b bg-primary/5'
                    : 'border-b'
                }
              >
                <td className="py-2 font-medium">{row.anonymousLabel}</td>
                <td className="py-2 text-right tabular-nums">{row.recommendWeight}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {totalWeight > 0
                    ? `${Math.round((row.recommendWeight / totalWeight) * 100)}%`
                    : '—'}
                </td>
                <td className="py-2 text-right tabular-nums">{row.recommendCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {split && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          The weighted leader is not the one most members chose. Worth saying out loud
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
