import { useMemo, useState } from 'react';
import {
  previewWeightPercentages,
  type EvaluationCriterionDef,
} from '@otp/domain';
import { Badge, Button, Card, Select, WeightSlider } from '@/components/ui';

export interface EvaluationCriteriaEditorProps {
  /** Everything the buyer may choose from. */
  catalog: EvaluationCriterionDef[];
  /** Raw buyer weights keyed by criterion code. They need not total anything. */
  weights: Record<string, number>;
  onWeightsChange: (weights: Record<string, number>) => void;
  /** The category's starting set, restored by Reset. */
  suggested: Record<string, number>;
  /** Whether the current set is still the suggestion or the buyer's own. */
  source: 'SUGGESTED' | 'CUSTOM';
  onSourceChange: (source: 'SUGGESTED' | 'CUSTOM') => void;
  disabled?: boolean;
}

/**
 * The buyer decides what winning means.
 *
 * The category offers a starting point and says so plainly; from there any
 * criterion in the catalog can be added or dropped and any number typed. Raw
 * weights are normalised to a hundred as the buyer types, so "price 2, warranty
 * 1" reads back as 67% and 33% without anyone doing arithmetic.
 */
export function EvaluationCriteriaEditor({
  catalog,
  weights,
  onWeightsChange,
  suggested,
  source,
  onSourceChange,
  disabled = false,
}: EvaluationCriteriaEditorProps) {
  const [pendingCode, setPendingCode] = useState('');

  const byCode = useMemo(
    () => new Map(catalog.map((c) => [c.code, c])),
    [catalog],
  );

  const chosen = useMemo(
    () =>
      Object.keys(weights)
        .map((code) => byCode.get(code))
        .filter((c): c is EvaluationCriterionDef => Boolean(c))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [weights, byCode],
  );

  const available = useMemo(
    () => catalog.filter((c) => !(c.code in weights)),
    [catalog, weights],
  );

  const percentages = previewWeightPercentages(weights);
  const isSuggestion =
    source === 'SUGGESTED' && sameWeights(weights, suggested);

  function change(next: Record<string, number>) {
    onWeightsChange(next);
    onSourceChange(sameWeights(next, suggested) ? 'SUGGESTED' : 'CUSTOM');
  }

  function setWeight(code: string, value: number) {
    change({ ...weights, [code]: value });
  }

  function remove(code: string) {
    const { [code]: _removed, ...rest } = weights;
    change(rest);
  }

  function add() {
    if (!pendingCode) return;
    change({ ...weights, [pendingCode]: 1 });
    setPendingCode('');
  }

  return (
    <Card
      title="How quotes will be judged"
      description="Set what matters to you. The percentages update as you type and always add up to 100."
      action={
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          {isSuggestion ? (
            <Badge tone="info">Suggested for this category</Badge>
          ) : (
            <Badge tone="neutral">Your criteria</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || Object.keys(suggested).length === 0}
            onClick={() => {
              onWeightsChange({ ...suggested });
              onSourceChange('SUGGESTED');
            }}
          >
            Reset
          </Button>
        </div>
      }
    >
      {chosen.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No criteria yet. Add at least one, or quotes cannot be scored.
        </p>
      ) : (
        <div className="space-y-3">
          {chosen.map((criterion) => (
            <WeightSlider
              key={criterion.code}
              label={criterion.name}
              description={criterion.description}
              value={weights[criterion.code] ?? 0}
              percent={percentages[criterion.code] ?? 0}
              disabled={disabled}
              onValueChange={(value) => setWeight(criterion.code, value)}
              onRemove={() => remove(criterion.code)}
            />
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="mt-4 flex items-end gap-2">
          <Select
            className="flex-1"
            aria-label="Add a criterion"
            placeholder="Add another criterion"
            disabled={disabled}
            options={available.map((c) => ({ value: c.code, label: c.name }))}
            value={pendingCode}
            onChange={(e) => setPendingCode(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={disabled || !pendingCode}
            onClick={add}
          >
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}

function sameWeights(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, i) => key === bKeys[i] && a[key] === b[key]);
}
