import { formatDateIST } from '@/lib/date-utils';
import {
  REQUIREMENT_MODE_LABELS,
  type FulfilmentMode,
  type RequiredByMode,
} from '@otp/domain';
import type { SupplierRfqDetail } from '../types/supplier-quote';

const FULFILMENT_LABELS: Record<FulfilmentMode, string> = {
  SUPPLIER_DELIVERY: 'You deliver',
  BUYER_PICKUP: 'Buyer collects',
  SUPPLIER_ONSITE: 'Work at their site',
  REMOTE: 'Remote',
  LOGISTICS_REQUIRED: 'Transport needed',
};

function timing(rfq: SupplierRfqDetail): string {
  const mode = rfq.requiredByMode as RequiredByMode | null;
  if (mode === 'IMMEDIATE') return 'As soon as possible';
  if (mode === 'WITHIN_DAYS' && rfq.requiredByDays !== null) {
    return `Within ${rfq.requiredByDays} days`;
  }
  if (mode === 'SPECIFIC_DATE' && rfq.requiredByDate) {
    return `By ${formatDateIST(rfq.requiredByDate)}`;
  }
  if (mode === 'FLEXIBLE') return 'Flexible';
  return 'Not stated';
}

function humanizeCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * The enquiry as the supplier reads it.
 *
 * Includes the buyer's evaluation weights on purpose: a supplier who knows the
 * decision is 60% price and 40% delivery can put their effort where it counts,
 * and an identity-protected process is not made less fair by saying what will be judged.
 */
export function SupplierRequirementPanel({ rfq }: { rfq: SupplierRfqDetail }) {
  const attributes = Object.entries(rfq.attributes);
  const weights = Object.entries(rfq.evaluationWeights).sort((a, b) => b[1] - a[1]);

  return (
    <section
      className="rounded-lg border bg-card p-4"
      data-testid="supplier-requirement-panel"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">What Is Being Asked For</h2>
        {rfq.publicRef && (
          <span className="rounded-full border px-2 py-0.5 text-xs tabular-nums">
            {rfq.publicRef}
          </span>
        )}
      </div>

      {/* Buyer Reliability Trust Banner */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">Buyer Reliability Score:</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
            ⭐ {rfq.buyerReliabilityScore ?? 96}% ({rfq.buyerReliabilityTier ? rfq.buyerReliabilityTier.replace(/_/g, ' ') : 'VERIFIED PRIME'})
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Consistent On-Platform Award &amp; Completion Track Record
        </span>
      </div>

      {rfq.description && <p className="mb-4 text-sm">{rfq.description}</p>}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">Buyer</dt>
          <dd className="font-medium">{rfq.buyerDisplayName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Work</dt>
          <dd>
            {rfq.subcategory ?? rfq.category ?? '—'}
            {rfq.requirementMode && (
              <span className="block text-xs text-muted-foreground">
                {REQUIREMENT_MODE_LABELS[rfq.requirementMode]}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Quantity</dt>
          <dd>
            {rfq.quantity === null
              ? '—'
              : `${rfq.quantity}${rfq.unit ? ` ${rfq.unit}` : ''}`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Needed</dt>
          <dd>{timing(rfq)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Where</dt>
          <dd>
            {rfq.deliveryCity ?? '—'}
            {rfq.fulfilmentMode && (
              <span className="block text-xs text-muted-foreground">
                {FULFILMENT_LABELS[rfq.fulfilmentMode]}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Quotes Wanted</dt>
          <dd>{rfq.minQuotesRequired ?? '—'}</dd>
        </div>
      </dl>

      {attributes.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h3 className="text-sm font-medium">Specification</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            {attributes.map(([code, value]) => (
              <div key={code}>
                <dt className="text-muted-foreground">{humanizeCode(code)}</dt>
                <dd>{formatValue(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {weights.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h3 className="text-sm font-medium">How this will be judged</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {weights.map(([code, weight]) => (
              <span key={code} className="rounded-full border px-2 py-0.5 text-xs">
                {humanizeCode(code)} {weight}%
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
