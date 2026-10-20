import {
  buildCommercialBreakdown,
  formatQuoteInr,
  type CommercialBreakdownLine,
} from '../lib/quote-commercial-present';

export interface QuoteCommercialBreakdownProps {
  basePrice: number;
  gstAmount: number;
  transportCost: number;
  totalCost: number;
  compact?: boolean;
  testId?: string;
}

function sourceHint(source: CommercialBreakdownLine['source']): string {
  return source === 'supplier' ? 'Supplier-entered' : 'Stored total on quote';
}

export function QuoteCommercialBreakdown({
  basePrice,
  gstAmount,
  transportCost,
  totalCost,
  compact = false,
  testId = 'quote-commercial-breakdown',
}: QuoteCommercialBreakdownProps) {
  const { lines, componentsMatchTotal } = buildCommercialBreakdown({
    basePrice,
    gstAmount,
    transportCost,
    totalCost,
  });

  return (
    <div
      className={`rounded-lg border border-border/60 bg-muted/20 ${compact ? 'p-2' : 'p-2.5'} space-y-1`}
      data-testid={testId}
      role="group"
      aria-label="Commercial breakdown"
    >
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        Commercial breakdown
      </p>
      <ul className="space-y-0.5 text-[10px] sm:text-[11px]">
        {lines.map((line) => (
          <li
            key={line.key}
            className={`flex flex-wrap items-center justify-between gap-2 ${
              line.key === 'total' ? 'pt-1 border-t border-border/50 font-bold text-foreground' : 'text-muted-foreground'
            }`}
          >
            <span className="min-w-0">
              {line.label}
              <span className="sr-only"> ({sourceHint(line.source)})</span>
              {line.key !== 'total' && (
                <span className="text-[9px] text-muted-foreground/80 font-normal ml-1 hidden sm:inline">
                  · {sourceHint(line.source)}
                </span>
              )}
            </span>
            <span className="font-mono tabular-nums shrink-0">{formatQuoteInr(line.amount)}</span>
          </li>
        ))}
      </ul>
      {!componentsMatchTotal && (
        <p
          className="text-[9px] text-amber-800 dark:text-amber-200 font-semibold pt-1"
          data-testid="quote-commercial-breakdown-mismatch"
        >
          Component sum differs from stored total — comparison uses the stored landed total.
        </p>
      )}
    </div>
  );
}
