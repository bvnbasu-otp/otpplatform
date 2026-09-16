import type { SupplierQuote } from '../types/supplier-quote';

export interface SupplierQuotePanelProps {
  quote: SupplierQuote;
}

function formatInr(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  }
}

export function SupplierQuotePanel({ quote }: SupplierQuotePanelProps) {
  const s = quote.snapshot;

  return (
    <div className="rounded-2xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 p-4 shadow-2xs space-y-3" data-testid="supplier-quote-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <div>
            <h3 className="font-black text-sm text-foreground">Your Submitted Quote</h3>
            <span className="text-[10px] text-muted-foreground font-semibold">
              Anonymous comparison active
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 px-2.5 py-0.5 text-xs font-black">
            v{quote.currentVersion} {quote.status}
          </span>
        </div>
      </div>

      {s ? (
        <div className="space-y-3">
          {/* Main 3 Key Fields Highlight */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-card p-3 border shadow-2xs text-center">
            <div className="border-r pr-1">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                💰 Total (Inc. GST)
              </span>
              <span className="font-mono text-sm sm:text-base font-black text-foreground block truncate">
                {formatInr(s.totalCost)}
              </span>
            </div>
            <div className="border-r pr-1">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                ⚡ Turnaround
              </span>
              <span className="font-mono text-sm sm:text-base font-black text-primary block">
                {s.deliveryDays} Days
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                🛡️ Warranty
              </span>
              <span className="font-mono text-sm sm:text-base font-black text-foreground block">
                {s.warrantyMonths} Mo
              </span>
            </div>
          </div>

          {/* Breakdown Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground">
            <span>Base: <strong className="text-foreground">{formatInr(s.basePrice)}</strong></span>
            <span>+ GST: <strong className="text-emerald-700 dark:text-emerald-400">{formatInr(s.gstAmount)}</strong></span>
            {s.transportCost != null && s.transportCost > 0 && (
              <span>+ Freight: <strong className="text-foreground">{formatInr(s.transportCost)}</strong></span>
            )}
          </div>

          {s.notes && (
            <div className="rounded-xl bg-background p-2.5 text-xs border text-muted-foreground">
              <span className="font-bold text-foreground block text-[11px] mb-0.5">Notes / Terms:</span>
              <p className="leading-relaxed">{s.notes}</p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No snapshot loaded.</p>
      )}
    </div>
  );
}
