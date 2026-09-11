import { useEffect, useState, type ReactNode } from 'react';
import {
  attributeSchemaFor,
  normalizeEvaluationWeights,
  REQUIREMENT_MODE_LABELS,
  type EvaluationCriterionDef,
  type MarketIntelligenceSummary,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button, Card } from '@/components/ui';
import { fetchIntakeIntelligence } from '../../api/fetch-intake-intelligence';
import type { IntakeDraft } from '../../types/intake-draft';

export interface ReviewStepProps {
  draft: IntakeDraft;
  taxonomy: TaxonomySnapshot;
  criteria: EvaluationCriterionDef[];
  isBusy: boolean;
  error?: string | null;
  onBack: () => void;
  onEditStep: (index: number) => void;
  onPublish: () => void;
}

/**
 * The last look before anything leaves the building.
 *
 * Each block links back to the step that owns it, and the private fields are
 * marked as private so the buyer knows exactly what a supplier will and will
 * not see.
 */
export function ReviewStep({
  draft,
  taxonomy,
  criteria,
  isBusy,
  error,
  onBack,
  onEditStep,
  onPublish,
}: ReviewStepProps) {
  const subcategory = taxonomy.subcategories.find((s) => s.id === draft.subcategoryId);
  const category = taxonomy.categories.find((c) => c.id === draft.categoryId);
  const schema = attributeSchemaFor(taxonomy, subcategory?.code);
  const criterionName = new Map(criteria.map((c) => [c.code, c.name]));

  const normalized = safeNormalize(draft.sourcing.evaluationWeights);

  const intelligence = useMarketIntelligence({
    subcategoryCode: subcategory?.code ?? null,
    categoryCode: category?.code ?? null,
    city: draft.deliveryCity ?? null,
  });

  const timing =
    draft.requiredByMode === 'WITHIN_DAYS'
      ? `Within ${draft.requiredByDays} days`
      : draft.requiredByMode === 'SPECIFIC_DATE'
        ? `By ${draft.requiredByDate}`
        : draft.requiredByMode === 'IMMEDIATE'
          ? 'Immediately'
          : 'Flexible';

  return (
    <div className="space-y-4">
      <MarketIntelligenceCard intelligence={intelligence} city={draft.deliveryCity} />

      <Card
        title={draft.title}
        description={draft.originalText}
        action={<Button variant="ghost" size="sm" onClick={() => onEditStep(1)}>Edit</Button>}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Category">{category?.name ?? 'Not set'}</Item>
          <Item label="Type of work">{subcategory?.name ?? 'Not set'}</Item>
          <Item label="What you are doing">
            {draft.requirementMode
              ? REQUIREMENT_MODE_LABELS[draft.requirementMode]
              : 'Not set'}
          </Item>
          <Item label="Quantity">
            {draft.quantity === null
              ? 'Not stated'
              : `${draft.quantity} ${draft.unit ?? ''}`.trim()}
          </Item>
        </dl>
      </Card>

      <Card
        title="Specification"
        action={<Button variant="ghost" size="sm" onClick={() => onEditStep(2)}>Edit</Button>}
      >
        {Object.keys(draft.attributes).length === 0 ? (
          <p className="text-sm text-muted-foreground">No detail captured.</p>
        ) : (
          <dl className="grid gap-3 sm:grid-cols-2">
            {schema
              .filter((attribute) => draft.attributes[attribute.code] !== undefined)
              .map((attribute) => (
                <Item key={attribute.code} label={attribute.label}>
                  {formatValue(draft.attributes[attribute.code])}
                  {attribute.unit ? ` ${attribute.unit}` : ''}
                </Item>
              ))}
          </dl>
        )}
      </Card>

      <Card
        title="Where and when"
        action={<Button variant="ghost" size="sm" onClick={() => onEditStep(4)}>Edit</Button>}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="City">{draft.deliveryCity ?? 'Not set'}</Item>
          <Item label="Pin code">{draft.deliveryPincode ?? 'Not given'}</Item>
          <Item label="Needed">{timing}</Item>
          <Item label="Address" tone="private">
            {draft.deliveryLine1 ?? 'Not given'}
          </Item>
          {draft.siteNotes && (
            <Item label="Site notes" tone="private">
              {draft.siteNotes}
            </Item>
          )}
        </dl>
      </Card>

      <Card
        title="Terms"
        action={<Button variant="ghost" size="sm" onClick={() => onEditStep(5)}>Edit</Button>}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Warranty expected">
            {draft.quality.warrantyMonths
              ? `${draft.quality.warrantyMonths} months`
              : 'Not stated'}
          </Item>
          <Item label="Certifications">
            {draft.quality.certifications?.length
              ? draft.quality.certifications.join(', ')
              : 'None'}
          </Item>
          <Item label="Payment terms">
            {draft.commercial.paymentTerms ?? 'Not stated'}
          </Item>
          <Item label="Budget" tone="private">
            {draft.commercial.budgetAmount
              ? `₹${draft.commercial.budgetAmount.toLocaleString('en-IN')}`
              : 'Not set'}
          </Item>
        </dl>
      </Card>

      <Card
        title="Sourcing and scoring"
        action={<Button variant="ghost" size="sm" onClick={() => onEditStep(6)}>Edit</Button>}
      >
        <dl className="grid gap-3 sm:grid-cols-2">
          <Item label="Sourcing">
            {draft.sourcing.sourcingMode === 'IDENTITY_PROTECTED'
              ? 'Identity protected'
              : draft.sourcing.sourcingMode.replace(/_/g, ' ').toLowerCase()}
          </Item>
          <Item label="Quotes wanted">{draft.sourcing.minQuotesRequired}</Item>
          <Item label="Deadline">{draft.sourcing.quoteDeadlineDays} days</Item>
        </dl>

        <ul className="mt-4 space-y-1.5">
          {Object.entries(normalized)
            .sort(([, a], [, b]) => b - a)
            .map(([code, percent]) => (
              <li key={code} className="flex items-center justify-between text-sm">
                <span>{criterionName.get(code) ?? code}</span>
                <span className="font-medium">{percent}%</span>
              </li>
            ))}
        </ul>
      </Card>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-medium">This requirement was not published.</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onPublish} busy={isBusy} busyLabel="Publishing">
          Publish and find suppliers
        </Button>
      </div>
    </div>
  );
}

function Item({
  label,
  children,
  tone,
}: {
  label: string;
  children: ReactNode;
  tone?: 'private';
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {label}
        {tone === 'private' && <Badge tone="neutral">Private</Badge>}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value ?? '');
}

/** The review screen must render even if the weights are somehow unusable. */
function safeNormalize(weights: Record<string, number>): Record<string, number> {
  try {
    return normalizeEvaluationWeights(weights).weights;
  } catch {
    return {};
  }
}

type IntelligenceState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: MarketIntelligenceSummary | null }
  | { status: 'error'; error: string };

/**
 * Fetch the market intelligence band for the current draft.
 *
 * The whole point of showing this at review time is that the buyer sees the
 * same benchmark that publish_requirement is about to snapshot. If nothing
 * matches, the state is 'ready' with data === null and the card says so —
 * we do not invent a band.
 */
function useMarketIntelligence(params: {
  subcategoryCode: string | null;
  categoryCode: string | null;
  city: string | null;
}): IntelligenceState {
  const { subcategoryCode, categoryCode, city } = params;
  const [state, setState] = useState<IntelligenceState>({ status: 'idle' });

  useEffect(() => {
    if (!subcategoryCode && !categoryCode) {
      setState({ status: 'ready', data: null });
      return;
    }
    let alive = true;
    setState({ status: 'loading' });
    void fetchIntakeIntelligence({ subcategoryCode, categoryCode, city }).then(
      (result) => {
        if (!alive) return;
        if (result.ok) {
          setState({ status: 'ready', data: result.intelligence });
        } else {
          setState({ status: 'error', error: result.error });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [subcategoryCode, categoryCode, city]);

  return state;
}

/**
 * The market-intel card that sits on top of the review screen.
 *
 * Honest blank state is the default: if the ladder found nothing the buyer
 * sees a short note explaining that their quotes will be the first data
 * point. When a band is found, the scope label tells them whether it is
 * their city and subcategory, or a wider fallback.
 */
function MarketIntelligenceCard({
  intelligence,
  city,
}: {
  intelligence: IntelligenceState;
  city: string | null;
}) {
  if (intelligence.status === 'idle' || intelligence.status === 'loading') {
    return (
      <Card title="Market intelligence">
        <p className="text-sm text-muted-foreground">
          Looking up recent benchmarks…
        </p>
      </Card>
    );
  }

  if (intelligence.status === 'error') {
    return (
      <Card title="Market intelligence">
        <p className="text-sm text-muted-foreground">
          Benchmark lookup is unavailable right now. Your quotes will still be
          collected normally.
        </p>
      </Card>
    );
  }

  const data = intelligence.data;
  if (!data) {
    return (
      <Card title="Market intelligence">
        <p className="text-sm">
          No benchmark for this work yet. Your quotes will be the first data
          point for other buyers filing similar requirements.
        </p>
      </Card>
    );
  }

  const priceBand = formatPriceBand(data.historicalPriceMin, data.historicalPriceMax);
  const deliveryBand = formatDayBand(
    data.typicalDeliveryDaysMin,
    data.typicalDeliveryDaysMax,
  );
  const warrantyBand = formatMonthBand(
    data.typicalWarrantyMonthsMin,
    data.typicalWarrantyMonthsMax,
  );
  const scopeLabel = describeScope(data, city);

  return (
    <Card
      title="Market intelligence"
      description={scopeLabel}
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        {priceBand && <Item label="Recent price band">{priceBand}</Item>}
        {deliveryBand && <Item label="Typical delivery">{deliveryBand}</Item>}
        {warrantyBand && <Item label="Typical warranty">{warrantyBand}</Item>}
        {data.supplierPerformanceAvg !== null &&
          data.supplierPerformanceAvg !== undefined && (
            <Item label="Supplier performance">
              {`${data.supplierPerformanceAvg.toFixed(1)} / 100`}
            </Item>
          )}
      </dl>
      {data.notes && (
        <p className="mt-3 text-xs text-muted-foreground">{data.notes}</p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {`Based on ${data.sampleSize.toLocaleString('en-IN')} data points. This benchmark will be stamped onto your requirement and preserved with it.`}
      </p>
    </Card>
  );
}

function formatPriceBand(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  const format = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  if (min !== null && max !== null && min !== max) {
    return `${format(min)} – ${format(max)}`;
  }
  return format((min ?? max) as number);
}

function formatDayBand(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null && min !== max) return `${min}–${max} days`;
  return `${min ?? max} days`;
}

function formatMonthBand(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min === 0 && max === 0) return 'Not typically warranted';
  if (min !== null && max !== null && min !== max) return `${min}–${max} months`;
  return `${min ?? max} months`;
}

function describeScope(
  data: MarketIntelligenceSummary,
  city: string | null,
): string {
  const key = data.matchedKey ?? data.categoryKey;
  switch (data.matchedScope) {
    case 'subcategory_city':
      return `Based on ${key} in ${data.matchedCity ?? city ?? 'this city'}.`;
    case 'subcategory':
      return `Based on ${key} across all cities.`;
    case 'category_city':
      return `Category-wide band for ${key} in ${data.matchedCity ?? city ?? 'this city'}.`;
    case 'category':
      return `Category-wide band for ${key} across all cities.`;
    case 'pilot':
      return `Reference band for ${key}.`;
    default:
      return `Based on ${key}.`;
  }
}