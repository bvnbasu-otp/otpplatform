import { useEffect, useState } from 'react';
import { fetchDecisionReceipt } from '../api/fetch-decision-receipt';
import {
  describeComparison,
  type DecisionReceipt as Receipt,
  type ReceiptComparison,
} from '../types/decision-receipt';

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

const SIGNAL_TITLE: Record<ReceiptComparison['kind'], string> = {
  HIGHEST_RATED: 'Best reputation',
  INCUMBENT: 'Existing relationship',
};

export interface DecisionReceiptProps {
  rfqId: string;
  winningQuoteId: string;
  showTable?: boolean;
}

/**
 * Post-reveal proof that the award followed the numbers rather than the names.
 * Renders nothing when there is no reputation signal to compare against, since
 * an enquiry with only one quote has nothing to demonstrate.
 */
export function DecisionReceipt({ rfqId, winningQuoteId, showTable = false }: DecisionReceiptProps) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await fetchDecisionReceipt(rfqId, winningQuoteId);
      if (!active) return;
      if (result.ok) setReceipt(result.receipt);
      else setError(result.error);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [rfqId, winningQuoteId]);

  if (isLoading) {
    return (
      <section className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Building cryptographic decision receipt…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-red-300 dark:border-red-900 bg-red-50/90 dark:bg-red-950/40 p-4 text-sm text-red-800 dark:text-red-200 shadow-2xs">
        {error}
      </section>
    );
  }

  if (!receipt) return null;

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5 shadow-2xs space-y-4" data-testid="decision-receipt">
      <div>
        <h2 className="text-sm font-bold text-foreground">Cryptographic Decision Receipt</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          What the recognizable names would have suggested, against what the identity-protected criteria objectively chose.
        </p>
      </div>

      <p className="text-sm sm:text-base font-bold text-foreground bg-primary/5 p-3 rounded-xl border border-primary/20" data-testid="receipt-headline">
        {receipt.headline}
      </p>

      <div className="rounded-xl border bg-muted/30 dark:bg-muted/15 p-3.5 space-y-1">
        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Awarded on Merit</span>
        <strong className="font-black text-foreground text-sm block">{receipt.winner.businessName}</strong>
        <p className="text-xs text-muted-foreground">
          Quoted as <strong className="text-foreground">{receipt.winner.anonymousLabel}</strong> · <span className="font-mono font-bold text-foreground">{inr(receipt.winner.totalCost)}</span>
          {receipt.winner.evaluationScore !== null &&
            ` · Merit Score ${receipt.winner.evaluationScore.toFixed(1)}/10`}
        </p>
      </div>

      <ul className="space-y-2.5">
        {receipt.comparisons.map((c) => (
          <li key={c.kind} className="rounded-xl border bg-card p-3.5 space-y-1" data-testid={`receipt-${c.kind}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-[10px] uppercase font-black tracking-wide text-primary">
                {SIGNAL_TITLE[c.kind]}
              </span>
              <span className="text-[11px] text-muted-foreground">{c.reason}</span>
            </div>
            <strong className="font-bold text-foreground text-xs block">
              {c.supplier.quoteId === receipt.winner.quoteId
                ? c.supplier.businessName
                : `Identity-Protected Supplier (${c.supplier.anonymousLabel})`}
            </strong>
            <p className="text-xs text-muted-foreground leading-relaxed">{describeComparison(c)}</p>
          </li>
        ))}
      </ul>

      {showTable && (
        <div className="mt-5 overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Merit rank</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Quoted as</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {receipt.meritOrder.map((cand, index) => (
                <tr key={cand.quoteId} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground">#{index + 1}</td>
                  <td className="px-3 py-2 font-medium">
                    {cand.quoteId === receipt.winner.quoteId ? (
                      <>
                        <span className="font-bold text-foreground">{cand.businessName}</span>
                        <span className="ml-2 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                          Awarded
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">
                        🔒 Sealed / Identity-Protected Supplier
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{cand.anonymousLabel}</td>
                  <td className="px-3 py-2 font-mono">{inr(cand.totalCost)}</td>
                  <td className="px-3 py-2">{cand.evaluationScore?.toFixed(1) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Ratings and past-order history were withheld during neutral evaluation until this award was
        recorded. They appear here only so the decision can be checked after the fact.
      </p>
    </section>
  );
}
