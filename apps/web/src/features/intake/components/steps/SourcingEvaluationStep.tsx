import { useEffect, useState } from 'react';
import type { EvaluationCriterionDef, SourcingMode } from '@otp/domain';
import { Button, Card, Field, NumberInput, RadioCardGroup } from '@/components/ui';
import { EvaluationCriteriaEditor } from '@/features/evaluation/components/EvaluationCriteriaEditor';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface SourcingEvaluationStepProps {
  draft: IntakeDraft;
  criteria: EvaluationCriterionDef[];
  /** The category's starting weights, empty when it offers no opinion. */
  suggestedWeights: Record<string, number>;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

const SOURCING_OPTIONS = [
  {
    value: 'IDENTITY_PROTECTED',
    label: 'Identity protected',
    description:
      'Suppliers are found for you and quote with identity protection. Neither side sees the other until you award.',
  },
  {
    value: 'OPEN_RFQ',
    label: 'Open enquiry',
    description: 'Your organisation is named to the suppliers who are invited.',
  },
  {
    value: 'INVITE_SELECTED',
    label: 'Invite chosen suppliers',
    description: 'You pick the suppliers yourself on the next screen.',
  },
  {
    value: 'PREVIOUS_SUPPLIERS',
    label: 'Suppliers we have used before',
    description: 'Limit the enquiry to suppliers who have worked with you.',
  },
];

/**
 * How suppliers are found and how their quotes will be scored.
 *
 * The weights set here are the ones the platform actually computes with: they
 * go through the same normalising RPC the server uses, so what the buyer sees
 * on this screen is what decides the ranking.
 */
export function SourcingEvaluationStep({
  draft,
  criteria,
  suggestedWeights,
  isBusy,
  onBack,
  onSubmit,
}: SourcingEvaluationStepProps) {
  const [sourcingMode, setSourcingMode] = useState<string>(
    draft.sourcing.sourcingMode,
  );
  const [minQuotes, setMinQuotes] = useState<number | null>(
    draft.sourcing.minQuotesRequired,
  );
  const [deadlineDays, setDeadlineDays] = useState<number | null>(
    draft.sourcing.quoteDeadlineDays,
  );
  const [weights, setWeights] = useState<Record<string, number>>(
    draft.sourcing.evaluationWeights,
  );
  const [source, setSource] = useState<'SUGGESTED' | 'CUSTOM'>(
    draft.sourcing.evaluationWeightsSource,
  );
  const [error, setError] = useState<string | null>(null);

  // A buyer arriving here for the first time starts from the category's
  // suggestion rather than from an empty table.
  useEffect(() => {
    if (Object.keys(weights).length === 0 && Object.keys(suggestedWeights).length > 0) {
      setWeights({ ...suggestedWeights });
      setSource('SUGGESTED');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedWeights]);

  function handleSubmit() {
    if (!minQuotes || minQuotes < 1) {
      setError('How many quotes do you want before deciding?');
      return;
    }
    if (!deadlineDays || deadlineDays < 1) {
      setError('Give suppliers a deadline, in days.');
      return;
    }

    const positive = Object.values(weights).filter((w) => w > 0);
    if (positive.length === 0) {
      setError('At least one criterion needs a weight above zero.');
      return;
    }

    setError(null);
    onSubmit({
      sourcing: {
        sourcingMode: sourcingMode as SourcingMode,
        minQuotesRequired: minQuotes,
        quoteDeadlineDays: deadlineDays,
        evaluationWeights: weights,
        evaluationWeightsSource: source,
      },
    });
  }

  return (
    <div className="space-y-4">
      <Card title="How should we find suppliers?">
        <RadioCardGroup
          legend="Sourcing"
          hideLegend
          columns={1}
          options={SOURCING_OPTIONS}
          value={sourcingMode}
          onValueChange={setSourcingMode}
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Quotes wanted before deciding"
            help="Three keeps the comparison competitive."
          >
            {({ id }) => (
              <NumberInput id={id} min={1} value={minQuotes} onValueChange={setMinQuotes} />
            )}
          </Field>

          <Field label="Quote deadline" hint="from publishing">
            {({ id }) => (
              <NumberInput
                id={id}
                min={1}
                unit="days"
                value={deadlineDays}
                onValueChange={setDeadlineDays}
              />
            )}
          </Field>
        </div>
      </Card>

      <EvaluationCriteriaEditor
        catalog={criteria}
        weights={weights}
        onWeightsChange={setWeights}
        suggested={suggestedWeights}
        source={source}
        onSourceChange={setSource}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSubmit} busy={isBusy}>
          Continue
        </Button>
      </div>
    </div>
  );
}
