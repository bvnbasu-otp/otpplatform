import type { QuoteSnapshotInput } from '../types/supplier-quote';
import { computeTotalCost } from '../types/supplier-quote';
import { formatQuoteInr } from '@/features/rfq/lib/quote-commercial-present';

export interface SupplierQuoteCommercialSummaryProps {
  form: QuoteSnapshotInput;
  pricingMode: 'INCLUSIVE' | 'ITEMIZED';
  gstRate: number;
}

export function SupplierQuoteCommercialSummary({
  form,
  pricingMode,
  gstRate,
}: SupplierQuoteCommercialSummaryProps) {
  const total = computeTotalCost(form);

  return (
    <div
      className="rounded-xl border border-border/70 bg-muted/25 p-3 space-y-2 text-[11px]"
      data-testid="supplier-quote-commercial-summary"
      aria-label="Review commercial totals before submit"
    >
      <p className="font-extrabold text-foreground text-xs">Review before you seal</p>
      <ul className="space-y-1 text-muted-foreground">
        <li className="flex justify-between gap-2">
          <span>Base (ex-GST) · you enter</span>
          <span className="font-mono font-bold text-foreground tabular-nums">{formatQuoteInr(form.basePrice)}</span>
        </li>
        <li className="flex justify-between gap-2">
          <span>GST ({gstRate}%) · you enter</span>
          <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {formatQuoteInr(form.gstAmount)}
          </span>
        </li>
        {form.transportCost > 0 && (
          <li className="flex justify-between gap-2">
            <span>Freight &amp; handling · you enter</span>
            <span className="font-mono font-bold text-foreground tabular-nums">
              {formatQuoteInr(form.transportCost)}
            </span>
          </li>
        )}
        <li className="flex justify-between gap-2 pt-1 border-t border-border/60 font-bold text-foreground">
          <span>Landed total (base + GST + freight)</span>
          <span className="font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">{formatQuoteInr(total)}</span>
        </li>
      </ul>
      {pricingMode === 'INCLUSIVE' && (
        <p className="text-[10px] text-muted-foreground leading-snug">
          All-inclusive mode derives base and GST from your total at the selected slab; freight is folded into base unless you switch to itemized.
        </p>
      )}
      <p className="text-[10px] text-muted-foreground">
        Delivery {form.deliveryDays} day(s) · Warranty {form.warrantyMonths === 0 ? 'none' : `${form.warrantyMonths} mo`}
      </p>
    </div>
  );
}
