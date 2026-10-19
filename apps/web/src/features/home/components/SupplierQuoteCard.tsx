import React from 'react';
import { Link } from 'react-router-dom';
import type { SupplierActiveQuoteItem } from '../types';

interface SupplierQuoteCardProps {
  quote: SupplierActiveQuoteItem;
}

export function SupplierQuoteCard({ quote }: SupplierQuoteCardProps) {
  const isEvaluation = quote.rfqStatus === 'EVALUATING';
  const rfqCode = quote.publicRef || `RFQ #${quote.id.slice(-4)}`;
  const isL1 = quote.rank === 1;

  const aliasText =
    quote.supplierAlias ||
    (quote.invitation?.anonymousLabel ? `Alias: ${quote.invitation.anonymousLabel}` : 'Anonymized Supplier');

  const priceText =
    quote.quoteAmount != null
      ? `₹${quote.quoteAmount.toLocaleString('en-IN')}${quote.gstPercent ? ` (+${quote.gstPercent}%)` : ''}`
      : 'Sealed Quote Submitted';

  return (
    <article
      className="rounded-2xl border border-emerald-500/30 bg-card p-3.5 sm:p-4 space-y-2.5 shadow-xs transition hover:border-emerald-500/50"
      data-testid={`supplier-quote-card-${quote.id}`}
    >
      {/* Top Header Row (Screen 08) */}
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
            isL1
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-300'
              : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-300'
          }`}
        >
          {isL1 ? '🟢 Shortlisted · L1 Rank' : quote.statusLabel || '🟡 Under Review'}
        </span>
        <span className="text-[11px] text-muted-foreground font-mono">{rfqCode}</span>
      </div>

      {/* Title & Price Row */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-foreground">{quote.title}</h4>
          <span className="text-[10px] text-muted-foreground block mt-0.5">{aliasText}</span>
        </div>
        <div className="text-right shrink-0">
          <span className="text-xs sm:text-sm font-black text-foreground block">{priceText}</span>
        </div>
      </div>

      {/* Committee Quorum Status Alert */}
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2 text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold space-y-0.5">
        <p>✓ Quorum voting active in buyer committee.</p>
        {quote.meritScore != null && (
          <p className="font-bold">Merit Score: ★ {quote.meritScore}</p>
        )}
      </div>

      {/* Single Primary Action */}
      <div className="pt-0.5">
        <Link
          to={quote.actionUrl || '/supplier/dashboard'}
          className="min-h-[48px] w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 text-xs font-extrabold shadow-sm active:scale-98 transition shadow-primary/20 mobile-touch-target"
        >
          <span>View Stage &amp; Status →</span>
        </Link>
      </div>
    </article>
  );
}
