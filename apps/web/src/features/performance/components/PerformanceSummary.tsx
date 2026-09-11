import { formatMoney } from '@/features/fulfillment/types/fulfillment';
import type { PerformanceRecord } from '../types/performance';
import { formatDeliveryDelta } from '../types/performance';

interface PerformanceSummaryProps {
  records: PerformanceRecord[];
  isLoading?: boolean;
  error?: string | null;
}

export function PerformanceSummary({ records, isLoading, error }: PerformanceSummaryProps) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading Performance Records…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (records.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No performance records yet — recorded when a requirement completes.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="performance-summary">
      {records.map((record) => {
        const costDelta =
          record.actualTotal != null ? record.actualTotal - record.quotedTotal : null;

        return (
          <article key={record.id} className="rounded-lg border bg-card p-4">
            <h3 className="font-medium">RFQ {record.rfqId.slice(0, 8)}…</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Quoted Total</dt>
                <dd className="font-medium">{formatMoney(record.quotedTotal, 'INR')}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Actual Total</dt>
                <dd className="font-medium">
                  {record.actualTotal != null
                    ? formatMoney(record.actualTotal, 'INR')
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Delivery (quoted → actual)</dt>
                <dd>
                  {record.quotedDeliveryDays}d →{' '}
                  {record.actualDeliveryDays != null ? `${record.actualDeliveryDays}d` : '—'}
                  <span className="ml-1 text-muted-foreground">
                    ({formatDeliveryDelta(record.quotedDeliveryDays, record.actualDeliveryDays)})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Quality rating</dt>
                <dd>{record.qualityRating != null ? `${record.qualityRating} / 5` : '—'}</dd>
              </div>
              {costDelta !== null && (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Cost variance</dt>
                  <dd className={costDelta === 0 ? 'text-green-700' : 'text-amber-700'}>
                    {costDelta === 0
                      ? 'On budget'
                      : `${costDelta > 0 ? '+' : ''}${formatMoney(costDelta, 'INR')}`}
                  </dd>
                </div>
              )}
            </dl>
          </article>
        );
      })}
    </div>
  );
}
