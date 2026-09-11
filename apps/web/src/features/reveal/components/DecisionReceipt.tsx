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
      <section className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Building decision receipt…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </section>
    );
  }

  if (!receipt) return null;

  return (
    <section className="rounded-lg border bg-card p-5" data-testid="decision-receipt">
      <h2 className="text-sm font-semibold">Decision receipt</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        What the names would have suggested, against what the identity-protected criteria chose.
      </p>

      <p className="mt-4 text-base font-medium" data-testid="receipt-headline">
        {receipt.headline}
      </p>

      <div className="mt-4 rounded-md border bg-muted/30 px-4 py-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Awarded on merit</p>
        <p className="mt-1 font-medium">{receipt.winner.businessName}</p>
        <p className="text-sm text-muted-foreground">
          Quoted as {receipt.winner.anonymousLabel} · {inr(receipt.winner.totalCost)}
          {receipt.winner.evaluationScore !== null &&
            ` · score ${receipt.winner.evaluationScore.toFixed(1)}`}
        </p>
      </div>

      <ul className="mt-4 space-y-3">
        {receipt.comparisons.map((c) => (
          <li key={c.kind} className="rounded-md border px-4 py-3" data-testid={`receipt-${c.kind}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {SIGNAL_TITLE[c.kind]}
              </span>
              <span className="text-xs text-muted-foreground">{c.reason}</span>
            </div>
            <p className="mt-1 font-medium">
              {c.supplier.quoteId === receipt.winner.quoteId
                ? c.supplier.businessName
                : `Identity-Protected Supplier (${c.supplier.anonymousLabel})`}
            </p>
            <p className="text-sm text-muted-foreground">{describeComparison(c)}</p>
          </li>
        ))}
      </ul>

      {showTable && (
        <div className="mt-5 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Merit rank</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2">Quoted as</th>
                <th className="px-4 py-2">Total</th>
                <th className="px-4 py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {receipt.meritOrder.map((b, index) => (
                <tr key={b.quoteId} className="border-t">
                  <td className="px-4 py-2 text-muted-foreground">#{index + 1}</td>
                  <td className="px-4 py-2 font-medium">
                    {b.quoteId === receipt.winner.quoteId ? (
                      <>
                        <span className="font-bold text-foreground">{b.businessName}</span>
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                          Awarded
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">
                        🔒 Sealed / Identity-Protected Supplier
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">{b.anonymousLabel}</td>
                  <td className="px-4 py-2">{inr(b.totalCost)}</td>
                  <td className="px-4 py-2">{b.evaluationScore?.toFixed(1) ?? '—'}</td>
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
