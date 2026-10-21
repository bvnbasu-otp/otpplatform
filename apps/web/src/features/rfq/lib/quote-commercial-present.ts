/** Shared INR formatting for quote comparison (display only — does not recalculate totals). */

export function formatQuoteInr(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

export type CommercialValueSource = 'supplier' | 'platform';

export interface CommercialBreakdownLine {
  key: 'base' | 'gst' | 'freight' | 'total';
  label: string;
  amount: number;
  source: CommercialValueSource;
}

export interface CommercialBreakdown {
  lines: CommercialBreakdownLine[];
  /** True when base + GST + freight equals the authoritative total on the quote row. */
  componentsMatchTotal: boolean;
}

export function buildCommercialBreakdown(quote: {
  basePrice: number;
  gstAmount: number;
  transportCost: number;
  totalCost: number;
}): CommercialBreakdown {
  const sum = quote.basePrice + quote.gstAmount + quote.transportCost;
  const lines: CommercialBreakdownLine[] = [
    { key: 'base', label: 'Base (ex-GST)', amount: quote.basePrice, source: 'supplier' },
    { key: 'gst', label: 'GST', amount: quote.gstAmount, source: 'supplier' },
  ];
  if (quote.transportCost > 0) {
    lines.push({
      key: 'freight',
      label: 'Freight & handling',
      amount: quote.transportCost,
      source: 'supplier',
    });
  }
  lines.push({
    key: 'total',
    label: 'Landed total',
    amount: quote.totalCost,
    source: 'platform',
  });
  return { lines, componentsMatchTotal: sum === quote.totalCost };
}

export function buyerQuoteStatusLabel(status: string): string {
  const upper = status.toUpperCase();
  switch (upper) {
    case 'SUBMITTED':
      return 'Quote submitted';
    case 'REVISED':
      return 'Revised quote';
    case 'FINAL':
      return 'Final quote locked';
    case 'DRAFT':
      return 'Draft — not in comparison';
    case 'SELECTED':
      return 'Selected candidate';
    default:
      return status.replace(/_/g, ' ');
  }
}
