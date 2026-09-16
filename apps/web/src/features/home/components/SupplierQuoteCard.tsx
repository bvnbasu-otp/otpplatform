import React from 'react';
import { Link } from 'react-router-dom';
import type { SupplierActiveQuoteItem } from '../types';

interface SupplierQuoteCardProps {
  quote: SupplierActiveQuoteItem;
}

export function SupplierQuoteCard({ quote }: SupplierQuoteCardProps) {
  const isEvaluation = quote.rfqStatus === 'EVALUATING';

  return (
    <article
      className="rounded-2xl border border-border/80 bg-card p-3.5 sm:p-4 space-y-3 transition-all hover:border-primary/40 shadow-2xs"
      data-testid={`supplier-quote-card-${quote.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {quote.publicRef && (
              <span className="font-mono text-[10px] text-muted-foreground bg-muted/80 px-1.5 py-0.5 rounded font-bold shrink-0">
                {quote.publicRef}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold border shrink-0 ${
                isEvaluation
                  ? 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800'
                  : 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
              }`}
            >
              <span>{isEvaluation ? '🗳️' : '✓'}</span>
              <span className="ml-1">{quote.statusLabel}</span>
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-extrabold text-foreground leading-snug mt-1.5 line-clamp-2">
            {quote.title}
          </h3>
        </div>

        <span
          title="Sealed quote submitted"
          className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"
        >
          <span>🔒</span>
          <span>Sealed</span>
        </span>
      </div>

      {/* Action Strip */}
      <div className="pt-0.5">
        <Link
          to={quote.actionUrl}
          className="min-h-[48px] w-full flex items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-card hover:bg-muted text-foreground px-4 py-2.5 text-xs font-bold shadow-2xs active:scale-98 transition mobile-touch-target"
        >
          <span>View Submitted Quote</span>
          <span>→</span>
        </Link>
      </div>
    </article>
  );
}
