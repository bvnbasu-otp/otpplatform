import type { EvaluationCriterionDef } from '@otp/domain';
import { Badge, Button, Card } from '@/components/ui';
import type { QuoteEvaluation } from '../types/quote-evaluation';

export interface CriterionBreakdownTableProps {
  evaluations: QuoteEvaluation[];
  criteria: EvaluationCriterionDef[];
  isLoading?: boolean;
  isRecomputing?: boolean;
  error?: string | null;
  onRecompute?: () => void;
}

/**
 * Why each quote scored what it did, criterion by criterion.
 *
 * A single number invites an argument about whether the platform is right. The
 * breakdown moves the conversation to the criteria the buyer themselves chose:
 * every cell shows what the quote scored on that criterion and how much of the
 * total it contributed, and the columns are anonymous labels throughout.
 */
export function CriterionBreakdownTable({
  evaluations,
  criteria,
  isLoading = false,
  isRecomputing = false,
  error = null,
  onRecompute,
}: CriterionBreakdownTableProps) {
  const nameFor = new Map(criteria.map((c) => [c.code, c.name]));

  const action = onRecompute && (
    <Button
      variant="secondary"
      size="sm"
      busy={isRecomputing}
      busyLabel="Scoring"
      onClick={onRecompute}
    >
      Rescore quotes
    </Button>
  );

  if (isLoading) {
    return (
      <Card title="Score breakdown" action={action}>
        <p className="text-sm text-muted-foreground" data-testid="breakdown-loading">
          Loading scores…
        </p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Score breakdown" action={action}>
        <p
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          data-testid="breakdown-error"
        >
          {error}
        </p>
      </Card>
    );
  }

  if (evaluations.length === 0) {
    return (
      <Card
        title="Score breakdown"
        description="Quotes are scored against the weights you set on this requirement."
        action={action}
      >
        <p className="text-sm text-muted-foreground" data-testid="breakdown-empty">
          No quotes have been scored yet.
        </p>
      </Card>
    );
  }

  // Every evaluation on an RFQ is computed against the same weights, so the
  // first row's criteria decide the columns.
  const columns = evaluations[0]?.criteria ?? [];
  const codes = columns.map((c) => c.code);
  const weightFor = new Map(columns.map((c) => [c.code, c.weight]));
  const isStale = evaluations.some((e) => e.status === 'STALE');

  return (
    <Card
      title="Score breakdown"
      description="Each cell shows the quote's score on that criterion, and what it contributed to the total."
      action={action}
      padded={false}
    >
      {isStale && (
        <p className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-800">
          A quote has been revised since these scores were computed. Rescore before
          deciding.
        </p>
      )}

      <div className="overflow-x-auto" data-testid="criterion-breakdown-table">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Supplier</th>
              {codes.map((code) => (
                <th key={code} className="px-4 py-3 text-right font-medium">
                  {nameFor.get(code) ?? code}
                  <span className="ml-1 font-normal normal-case">
                    ({weightFor.get(code) ?? 0}%)
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((evaluation, index) => (
              <tr
                key={evaluation.evaluationId}
                className={`border-b last:border-0 ${index === 0 ? 'bg-accent/60' : ''}`}
                data-testid={`breakdown-row-${evaluation.anonymousLabel.replace(/\s+/g, '-')}`}
              >
                <td className="px-4 py-3 font-medium">
                  {evaluation.anonymousLabel}
                  {evaluation.status === 'STALE' && (
                    <Badge tone="warning" className="ml-2">
                      Stale
                    </Badge>
                  )}
                </td>

                {codes.map((code) => {
                  const score = evaluation.criteria.find((c) => c.code === code);
                  if (!score) {
                    return (
                      <td key={code} className="px-4 py-3 text-right text-muted-foreground">
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={code} className="px-4 py-3 text-right tabular-nums">
                      <span className={score.neutral ? 'text-muted-foreground' : ''}>
                        {score.normalized.toFixed(0)}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">
                        (+{score.contribution.toFixed(1)})
                      </span>
                      {score.neutral && (
                        <span
                          className="block text-[10px] text-muted-foreground"
                          title="Nothing comparable to score, so it scored neutrally"
                        >
                          not stated
                        </span>
                      )}
                    </td>
                  );
                })}

                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {evaluation.evaluationScore === null
                    ? '—'
                    : evaluation.evaluationScore.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        Scores are relative: 100 is the best offer received on that criterion and 0 the
        worst. A criterion nobody answered scores everyone neutrally rather than
        quietly dropping its weight.
      </p>
    </Card>
  );
}
