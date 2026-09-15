import { useEffect, useState, type ReactNode } from 'react';
import {
  attributeSchemaFor,
  normalizeEvaluationWeights,
  REQUIREMENT_MODE_LABELS,
  type EvaluationCriterionDef,
  type SourcingMode,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Button, Card, Field, NumberInput, RadioCardGroup } from '@/components/ui';
import { EvaluationCriteriaEditor } from '@/features/evaluation/components/EvaluationCriteriaEditor';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface ReviewAndPublishStepProps {
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
    label: '🛡️ Identity-Protected (Recommended)',
    description:
      'Suppliers quote with sealed identity protection on technical and commercial merit. Identity is only revealed upon final award confirmation.',
  },
  {
    value: 'OPEN_RFQ',
    label: '📢 Open RFQ Tender',
    description: 'Your organization name and requirement are visible upfront to all verified suppliers.',
  },
  {
    value: 'INVITE_SELECTED',
    label: '🎯 Direct Curated Invite',
    description: 'Manually invite specific verified suppliers on the discovery screen.',
  },
  {
    value: 'PREVIOUS_SUPPLIERS',
    label: '🤝 Existing Supplier Network',
    description: 'Limit invitations exclusively to suppliers who have delivered for your organization before.',
  },
];

export function ReviewAndPublishStep({
  draft,
  taxonomy,
  criteria,
  suggestedWeights,
  isBusy,
  error,
  onBack,
  onEditStep,
  onPublish,
}: ReviewAndPublishStepProps) {
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

  const timingText =
    draft.requiredByMode === 'WITHIN_DAYS'
      ? `Within ${draft.requiredByDays ?? 15} days`
      : draft.requiredByMode === 'SPECIFIC_DATE'
        ? `By ${draft.requiredByDate ?? 'specified date'}`
        : draft.requiredByMode === 'IMMEDIATE'
          ? '⚡ Immediately'
          : '🤝 Flexible';

  function handlePublish() {
    if (!minQuotes || minQuotes < 1) {
      setValidationError('Please specify how many quotes you require before deciding.');
      return;
    }
    if (!deadlineDays || deadlineDays < 1) {
      setValidationError('Please set a quote submission deadline in days.');
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
        geographicReach: draft.sourcing.geographicReach ?? 'LOCAL',
      },
    });
  }

  return (
    <div className="space-y-4" data-testid="review-and-publish-step">
      {/* 1. High-Impact 1-Card Requirement Summary */}
      <Card
        title="1-Card Requirement Summary"
        description="Review all requirement parameters before publishing your RFQ."
      >
        <div className="space-y-4 divide-y divide-border/60">
          {/* Section 1: Requirement & Scope */}
          <div className="pt-2 first:pt-0">
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {draft.title || 'Untitled Requirement'}
                </span>
                {draft.requirementMode && (
                  <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {REQUIREMENT_MODE_LABELS[draft.requirementMode]}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditStep(0)}
                className="text-xs min-h-[36px] px-3 mobile-touch-target"
              >
                ✏️ Edit
              </Button>
            </div>
            <p className="text-xs text-muted-foreground italic mb-2">
              &ldquo;{draft.originalText}&rdquo;
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <Item label="Category">{category?.name ?? 'Not set'}</Item>
              <Item label="Vertical">{subcategory?.name ?? 'Not set'}</Item>
              <Item label="Quantity">
                {draft.quantity !== null
                  ? `${draft.quantity} ${draft.unit ?? 'units'}`
                  : 'Turnkey Scope'}
              </Item>
            </div>
          </div>

          {/* Section 2: Location & Fulfilment */}
          <div className="pt-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-foreground">📍 Location &amp; Fulfilment</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditStep(1)}
                className="text-xs min-h-[36px] px-3 mobile-touch-target"
              >
                ✏️ Edit
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <Item label="City / PIN">{`${draft.deliveryCity ?? 'Not set'} ${draft.deliveryPincode ? `(${draft.deliveryPincode})` : ''}`}</Item>
              <Item label="Sourcing Reach">
                {draft.sourcing.geographicReach === 'LOCAL'
                  ? '📍 Local Only'
                  : draft.sourcing.geographicReach === 'STATE'
                    ? '🗺️ State / Regional'
                    : '🌐 PAN-India'}
              </Item>
              <Item label="Fulfilment">{draft.fulfilmentMode ? draft.fulfilmentMode.replace(/_/g, ' ') : 'Supplier Delivery'}</Item>
            </div>
          </div>

          {/* Section 3: Timeline & Commercial Terms */}
          <div className="pt-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-foreground">⏱️ Timeline &amp; Commercial Terms</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditStep(2)}
                className="text-xs min-h-[36px] px-3 mobile-touch-target"
              >
                ✏️ Edit
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <Item label="Delivery TAT">{timingText}</Item>
              <Item label="Budget Ceiling" privacyNotice="Private">
                {draft.commercial.budgetAmount
                  ? `₹${draft.commercial.budgetAmount.toLocaleString('en-IN')}`
                  : 'Not specified'}
              </Item>
              <Item label="Payment Terms">{draft.commercial.paymentTerms || '100% on delivery'}</Item>
              <Item label="Price Inclusions">
                {[
                  draft.commercial.priceIncludesTransport ? 'Transport included' : null,
                  draft.commercial.priceIncludesGst ? 'GST included' : null,
                ]
                  .filter(Boolean)
                  .join(', ') || 'Ex-works'}
              </Item>
            </div>
          </div>

          {/* Section 4: Specifications & Quality */}
          <div className="pt-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-xs font-bold text-foreground">⚙️ Specifications &amp; Quality</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditStep(3)}
                className="text-xs min-h-[36px] px-3 mobile-touch-target"
              >
                ✏️ Edit
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <Item label="Warranty">
                {draft.quality.warrantyMonths
                  ? `${draft.quality.warrantyMonths} Months`
                  : 'Standard'}
              </Item>
              <Item label="Inspection">
                {draft.quality.inspectionRequired ? 'Pre-dispatch Signoff' : 'Standard'}
              </Item>
              <Item label="Sample Required">
                {draft.quality.sampleRequired ? 'Yes' : 'No'}
              </Item>
            </div>

            {Object.keys(draft.attributes).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 pt-1">
                {schema
                  .filter((a) => draft.attributes[a.code] !== undefined)
                  .map((a) => (
                    <span
                      key={a.code}
                      className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground border"
                    >
                      <span className="text-muted-foreground">{a.label}:</span>
                      <strong>{formatAttrVal(draft.attributes[a.code])}</strong>
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 2. Sourcing Protocol & Merit Weights */}
      <Card
        title="Sourcing Protocol & Merit Scoring Formula"
        description="Choose how suppliers are invited and review transparent scoring weights."
      >
        <RadioCardGroup
          legend="Sourcing Mode"
          options={SOURCING_OPTIONS}
          value={sourcingMode}
          onValueChange={setSourcingMode}
        />

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Quorum (Minimum Quotes Needed)"
            help="3 quotes provides optimal competitive pricing."
          >
            {({ id }) => (
              <NumberInput
                id={id}
                min={1}
                value={minQuotes}
                onValueChange={setMinQuotes}
              />
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

        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold text-foreground">Merit Evaluation Weights</h4>
              <p className="text-[11px] text-muted-foreground">
                Quotes are scored transparently against these merit weights.
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowWeightSliders(!showWeightSliders)}
              className="text-xs"
            >
              {showWeightSliders ? 'Hide Sliders ▲' : '⚙️ Customize Weights ▼'}
            </Button>
          </div>

          {/* Quick Merit Formula Badges */}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {Object.entries(normalizedWeights).map(([code, weight]) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground shadow-2xs"
              >
                <span>{criterionName.get(code) ?? code}:</span>
                <strong className="text-primary">{Math.round(weight * 100)}%</strong>
              </span>
            ))}
          </div>

          {showWeightSliders && (
            <div className="mt-3.5 rounded-xl border bg-card p-3.5 space-y-3">
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

      {(validationError || error) && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs text-red-800 font-semibold dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          ⚠️ {validationError || error}
        </div>
      )}

      {/* Action CTA with Double-Submission Protection */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3 border-t border-border/70">
        <Button variant="ghost" onClick={onBack} className="min-h-[44px]">
          ← Back to Attachments
        </Button>
        <Button
          type="button"
          variant="action"
          size="lg"
          onClick={handlePublish}
          disabled={isBusy}
          busy={isBusy}
          busyLabel="Publishing RFQ & Discovering Suppliers…"
          className="min-h-[48px] w-full sm:w-auto font-extrabold text-sm shadow-md"
          data-testid="publish-requirement-btn"
        >
          🚀 Publish RFQ &amp; Discover Suppliers
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
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <span>{label}</span>
        {privacyNotice && (
          <span className="rounded bg-muted px-1 py-0.2 text-[9px] font-semibold text-muted-foreground border">
            🔒 {privacyNotice}
          </span>
        )}
      </dt>
      <dd className="mt-0.5 text-xs font-semibold text-foreground truncate">{children}</dd>
    </div>
  );
}

function formatAttrVal(val: unknown): string {
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
