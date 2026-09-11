import type { SupplierQuote } from '../types/supplier-quote';

function formatInr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function SupplierQuotePanel({ quote }: { quote: SupplierQuote }) {
  const s = quote.snapshot;

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="supplier-quote-panel">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">Your Quote</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{quote.status}</span>
      </div>
      {s ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Base</dt>
            <dd className="font-medium">{formatInr(s.basePrice)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">GST</dt>
            <dd className="font-medium">{formatInr(s.gstAmount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold">{formatInr(s.totalCost)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Delivery</dt>
            <dd>{s.deliveryDays} days</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Warranty</dt>
            <dd>{s.warrantyMonths} months</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Version</dt>
            <dd>v{quote.currentVersion}</dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No snapshot loaded.</p>
      )}
    </div>
  );
}
