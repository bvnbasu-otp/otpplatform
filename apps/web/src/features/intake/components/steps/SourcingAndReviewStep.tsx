import { useEffect, useState, type ReactNode } from 'react';
import {
  attributeSchemaFor,
  normalizeEvaluationWeights,
  REQUIREMENT_MODE_LABELS,
  type EvaluationCriterionDef,
  type SourcingMode,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button, Card, Field, NumberInput, RadioCardGroup } from '@/components/ui';
import { EvaluationCriteriaEditor } from '@/features/evaluation/components/EvaluationCriteriaEditor';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface SourcingAndReviewStepProps {
  draft: IntakeDraft;
  taxonomy: TaxonomySnapshot;
  criteria: EvaluationCriterionDef[];
  suggestedWeights: Record<string, number>;
  isBusy: boolean;
  error?: string | null;
  onBack: () => void;
  onEditStep: (index: number) => void;
  onPublish: (sourcingPatch: DraftPatch) => void;
}

const SOURCING_OPTIONS = [
  {
    value: 'IDENTITY_PROTECTED',
    label: 'Identity-Protected (Recommended)',
    description:
      'Suppliers quote with identity protection on technical and commercial merit. Neither party unmasks until award confirmation.',
  },
  {
    value: 'OPEN_RFQ',
    label: 'Open Tender',
    description: 'Your organisation name is visible upfront to all invited suppliers.',
  },
  {
    value: 'INVITE_SELECTED',
    label: 'Direct Curated Invite',
    description: 'Manually select specific verified suppliers on the discovery screen.',
  },
  {
    value: 'PREVIOUS_SUPPLIERS',
    label: 'Existing Supplier Network',
    description: 'Limit invitations exclusively to suppliers who have delivered for you before.',
  },
];

export function SourcingAndReviewStep({
  draft,
  taxonomy,
  criteria,
  suggestedWeights,
  isBusy,
  error,
  onBack,
  onEditStep,
  onPublish,
}: SourcingAndReviewStepProps) {
  const [sourcingMode, setSourcingMode] = useState<string>(
    draft.sourcing.sourcingMode || 'IDENTITY_PROTECTED',
  );
  const [minQuotes, setMinQuotes] = useState<number | null>(
    draft.sourcing.minQuotesRequired || 3,
  );
  const [deadlineDays, setDeadlineDays] = useState<number | null>(
    draft.sourcing.quoteDeadlineDays || 7,
  );
  const [weights, setWeights] = useState<Record<string, number>>(
    draft.sourcing.evaluationWeights,
  );
  const [source, setSource] = useState<'SUGGESTED' | 'CUSTOM'>(
    draft.sourcing.evaluationWeightsSource || 'SUGGESTED',
  );
  const [showWeightSliders, setShowWeightSliders] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (Object.keys(weights).length === 0 && Object.keys(suggestedWeights).length > 0) {
      setWeights({ ...suggestedWeights });
      setSource('SUGGESTED');
    }
  }, [suggestedWeights, weights]);

  const subcategory = taxonomy.subcategories.find((s) => s.id === draft.subcategoryId);
  const category = taxonomy.categories.find((c) => c.id === draft.categoryId);
  const schema = attributeSchemaFor(taxonomy, subcategory?.code);
  const criterionName = new Map(criteria.map((c) => [c.code, c.name]));

  const normalizedWeights = safeNormalize(weights);

  const timing =
    draft.requiredByMode === 'WITHIN_DAYS'
      ? `Within ${draft.requiredByDays} days`
      : draft.requiredByMode === 'SPECIFIC_DATE'
        ? `By ${draft.requiredByDate}`
        : draft.requiredByMode === 'IMMEDIATE'
          ? 'Immediately'
          : 'Flexible';

  function handlePublish() {
    if (!minQuotes || minQuotes < 1) {
      setValidationError('Please specify how many quotes you require before deciding.');
      return;
    }
    if (!deadlineDays || deadlineDays < 1) {
      setValidationError('Please set a quoting deadline in days.');
      return;
    }
    const positive = Object.values(weights).filter((w) => w > 0);
    if (positive.length === 0) {
      setValidationError('At least one scoring criterion must have a weight above zero.');
      return;
    }

    setValidationError(null);
    onPublish({
      sourcing: {
        sourcingMode: sourcingMode as SourcingMode,
        minQuotesRequired: minQuotes,
        quoteDeadlineDays: deadlineDays,
        evaluationWeights: weights,
        evaluationWeightsSource: source,
        geographicReach: draft.sourcing.geographicReach ?? 'PAN_INDIA',
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. Sourcing Rules & Scoring Weights */}
      <Card
        title="Sourcing Protocol & Merit Scoring Weights"
        description="Define how suppliers are invited and the weighting formula for automated scoring."
      >
        <RadioCardGroup
          legend="Sourcing Mode"
          options={SOURCING_OPTIONS}
          value={sourcingMode}
          onValueChange={setSourcingMode}
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Quorum (Quotes Wanted Before Evaluation)"
            help="3 quotes provides optimal competitive pricing."
          >
            {({ id }) => (
              <NumberInput id={id} min={1} value={minQuotes} onValueChange={setMinQuotes} />
            )}
          </Field>

          <Field label="Quote Submission Window" hint="days from publishing">
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

        <div className="mt-5 border-t pt-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Evaluation &amp; Scoring Criteria</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quotes are scored transparently on merit against these weights.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowWeightSliders(!showWeightSliders)}
            >
              {showWeightSliders ? 'Hide Sliders ▲' : '⚙️ Customize Weights ▼'}
            </Button>
          </div>

          {/* Quick summary badges */}
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(normalizedWeights).map(([code, weight]) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-3 py-1 text-xs font-semibold text-foreground shadow-2xs"
              >
                <span>{criterionName.get(code) ?? code}:</span>
                <strong className="text-primary">{Math.round(weight * 100)}%</strong>
              </span>
            ))}
          </div>

          {showWeightSliders && (
            <div className="mt-4 rounded-lg border bg-card p-4 space-y-3">
              <EvaluationCriteriaEditor
                catalog={criteria}
                weights={weights}
                onWeightsChange={setWeights}
                suggested={suggestedWeights}
                source={source}
                onSourceChange={setSource}
              />
            </div>
          )}
        </div>
      </Card>

      {/* 2. Consolidated Review Summary */}
      <div className="space-y-4">
        <h2 className="text-base font-bold text-foreground">Final Tender Review</h2>

        {/* Scope Review Card */}
        <Card
          title={draft.title || 'Untitled Requirement'}
          description={draft.originalText}
          action={<Button variant="ghost" size="sm" onClick={() => onEditStep(0)}>Edit Scope</Button>}
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <Item label="Category">{category?.name ?? 'Not set'}</Item>
            <Item label="Type of work">{subcategory?.name ?? 'Not set'}</Item>
            <Item label="Procurement Mode">
              {draft.requirementMode
                ? REQUIREMENT_MODE_LABELS[draft.requirementMode]
                : 'Not set'}
            </Item>
            <Item label="Quantity & Unit">
              {draft.quantity === null
                ? 'Not stated'
                : `${draft.quantity} ${draft.unit ?? ''}`.trim()}
            </Item>
          </dl>
        </Card>

        {/* Specifications Review Card */}
        <Card
          title="Technical Specifications & Attachments"
          action={<Button variant="ghost" size="sm" onClick={() => onEditStep(1)}>Edit Specs</Button>}
        >
          {Object.keys(draft.attributes).length === 0 ? (
            <p className="text-sm text-muted-foreground">Standard category defaults.</p>
          ) : (
            <dl className="grid gap-3 sm:grid-cols-2">
              {schema
                .filter((attribute) => draft.attributes[attribute.code] !== undefined)
                .map((attribute) => (
                  <Item key={attribute.code} label={attribute.label}>
                    {formatAttributeValue(draft.attributes[attribute.code])}
                  </Item>
                ))}
            </dl>
          )}
        </Card>

        {/* Logistics & Commercial Review Card */}
        <Card
          title="Logistics, Commercial & Quality Terms"
          action={<Button variant="ghost" size="sm" onClick={() => onEditStep(2)}>Edit Terms</Button>}
        >
          <dl className="grid gap-3 sm:grid-cols-2">
            <Item label="Delivery Destination">{`${draft.deliveryCity ?? 'Not set'} ${draft.deliveryPincode ? `(${draft.deliveryPincode})` : ''}`.trim()}</Item>
            <Item label="Sourcing Reach">
              {draft.sourcing.geographicReach === 'LOCAL'
                ? '📍 Local City / District Only'
                : draft.sourcing.geographicReach === 'STATE'
                  ? '🗺️ State & Regional Reach'
                  : '🌐 PAN-India (Nationwide Quoting Permitted)'}
            </Item>
            <Item label="Timeline">{timing}</Item>
            <Item label="Fulfilment Mode">{draft.fulfilmentMode ?? 'Supplier Delivery'}</Item>
            <Item label="Warranty">{draft.quality.warrantyMonths ? `${draft.quality.warrantyMonths} months` : 'Standard'}</Item>
            <Item label="Inspection Required">{draft.quality.inspectionRequired ? 'Yes (Pre-acceptance)' : 'Standard'}</Item>
            <Item label="Price Inclusions">
              {[
                draft.commercial.priceIncludesTransport ? 'Transport included' : null,
                draft.commercial.priceIncludesGst ? 'GST included' : null,
              ].filter(Boolean).join(', ') || 'Ex-works'}
            </Item>
            {draft.commercial.budgetAmount && (
              <Item label="Internal Budget Ceiling" privacyNotice="Private to buyer">
                {`₹${draft.commercial.budgetAmount.toLocaleString('en-IN')}`}
              </Item>
            )}
            {draft.commercial.paymentTerms && (
              <Item label="Payment Terms">{draft.commercial.paymentTerms}</Item>
            )}
          </dl>
        </Card>
      </div>

      {(validationError || error) && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 font-medium">
          {validationError || error}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t">
        <Button variant="ghost" onClick={onBack}>
          ← Back to Logistics & Terms
        </Button>
        <Button
          variant="action"
          size="lg"
          onClick={handlePublish}
          busy={isBusy}
          busyLabel="Publishing & Discovering Suppliers…"
        >
          🚀 Publish Requirement & Discover Suppliers →
        </Button>
      </div>
    </div>
  );
}

function Item({
  label,
  children,
  privacyNotice,
}: {
  label: string;
  children: ReactNode;
  privacyNotice?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{label}</span>
        {privacyNotice && (
          <span className="rounded bg-muted px-1 py-0.2 text-[10px] font-semibold text-muted-foreground">
            🔒 {privacyNotice}
          </span>
        )}
      </dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function formatAttributeValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function safeNormalize(weights: Record<string, number>): Record<string, number> {
  try {
    return normalizeEvaluationWeights(weights).weights;
  } catch {
    return {};
  }
}
