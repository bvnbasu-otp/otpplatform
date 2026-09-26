import { formatMoney } from '../types/fulfillment';
import type { InvoiceBalanceRow, InvoiceBalanceTotals } from '../lib/settlement-state';

export interface InvoiceBalancesReviewProps {
  rows: InvoiceBalanceRow[];
  totals: InvoiceBalanceTotals;
  poAmount: number;
  currency?: string;
  role: 'buyer' | 'supplier';
}

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Awaiting approval',
  APPROVED: 'Approved — unpaid',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
};

export function InvoiceBalancesReview({ rows, totals, poAmount, currency = 'INR', role }: InvoiceBalancesReviewProps) {
  const money = (n: number) => formatMoney(n, currency);

  if (rows.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed bg-card p-4 text-xs space-y-1.5" data-testid="invoice-balances-empty">
        <h3 className="font-extrabold uppercase tracking-wider text-foreground">Invoices &amp; Balances</h3>
        <p className="text-muted-foreground">
          {role === 'supplier'
            ? 'You have not submitted an invoice for this purchase order yet. Balances appear here once a GST invoice is submitted.'
            : 'The supplier has not submitted an invoice yet. Balances appear here once a GST invoice is submitted.'}
        </p>
        <p className="text-muted-foreground">
          PO value <strong className="text-foreground font-mono">{money(poAmount)}</strong> · Invoiced <strong className="text-foreground font-mono">{money(0)}</strong> · Paid <strong className="text-foreground font-mono">{money(0)}</strong>
          {totals.unallocatedAdvances > 0 && (
            <> · Unallocated advances <strong className="text-foreground font-mono">{money(totals.unallocatedAdvances)}</strong></>
          )}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-3.5 sm:p-4 shadow-2xs space-y-3" data-testid="invoice-balances-review">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <h3 className="text-xs font-extrabold uppercase tracking-wider text-foreground">Invoices &amp; Balances</h3>
        <span className="text-[11px] text-muted-foreground">
          {rows.length} invoice{rows.length > 1 ? 's' : ''} · PO value <span className="font-mono font-bold text-foreground">{money(poAmount)}</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-left text-[11px]">
          <thead className="bg-muted/50 border-b text-[10px] uppercase font-bold text-muted-foreground">
            <tr>
              <th className="px-2.5 py-2">Invoice #</th>
              <th className="px-2 py-2 text-right">Gross</th>
              <th className="px-2 py-2 text-right">GST</th>
              <th className="px-2 py-2 text-right">TDS</th>
              <th className="px-2 py-2 text-right">Paid</th>
              <th className="px-2 py-2 text-right">Outstanding</th>
              <th className="px-2.5 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => (
              <tr key={r.id} data-testid="invoice-balance-row">
                <td className="px-2.5 py-2 font-mono font-bold">{r.invoiceNumber}</td>
                <td className="px-2 py-2 text-right font-mono">{money(r.gross)}</td>
                <td className="px-2 py-2 text-right font-mono">{r.gstStated ? money(r.gst) : 'Not stated'}</td>
                <td className="px-2 py-2 text-right font-mono">{r.tds > 0 ? `−${money(r.tds)}` : money(0)}</td>
                <td className="px-2 py-2 text-right font-mono text-emerald-700 dark:text-emerald-400">{money(r.paid)}</td>
                <td className="px-2 py-2 text-right font-mono font-bold">{money(r.outstanding)}</td>
                <td className="px-2.5 py-2">{STATUS_LABELS[r.status] ?? r.status}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t bg-muted/30 font-bold">
            <tr>
              <td className="px-2.5 py-2">Total</td>
              <td className="px-2 py-2 text-right font-mono">{money(totals.gross)}</td>
              <td className="px-2 py-2 text-right font-mono">{money(totals.gst)}</td>
              <td className="px-2 py-2 text-right font-mono">{totals.tds > 0 ? `−${money(totals.tds)}` : money(0)}</td>
              <td className="px-2 py-2 text-right font-mono">{money(totals.paid)}</td>
              <td className="px-2 py-2 text-right font-mono">{money(totals.outstanding)}</td>
              <td className="px-2.5 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl border bg-muted/20 p-2.5">
          <dt className="text-[10px] uppercase font-bold text-muted-foreground">Net payable to supplier</dt>
          <dd className="font-mono font-black text-sm" data-testid="balances-net-payable">{money(totals.netPayable)}</dd>
          <dd className="text-[10px] text-muted-foreground">Outstanding less TDS withheld</dd>
        </div>
        <div className="rounded-xl border bg-muted/20 p-2.5">
          <dt className="text-[10px] uppercase font-bold text-muted-foreground">Unallocated advances</dt>
          <dd className="font-mono font-black text-sm" data-testid="balances-advances">{money(totals.unallocatedAdvances)}</dd>
        </div>
        <div className="rounded-xl border bg-muted/20 p-2.5">
          <dt className="text-[10px] uppercase font-bold text-muted-foreground">Settlement</dt>
          <dd className="text-[11px] text-muted-foreground">Paid directly by the buyer to the supplier, off platform. OTP does not hold funds.</dd>
        </div>
      </dl>
    </section>
  );
}
