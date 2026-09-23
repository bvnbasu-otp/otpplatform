import React from 'react';
import { Link } from 'react-router-dom';
import { useSupplierHomeData } from '@/features/home';
import { SupplierQuoteCard } from '@/features/home/components/SupplierQuoteCard';
import { HomeSkeleton } from '@/features/home/components/HomeSkeleton';

export function SupplierQuotesPage() {
  const { activeQuotes, isLoading, error, refresh } = useSupplierHomeData();

  return (
    <div
      className="p-3 sm:p-4 max-w-2xl mx-auto w-full space-y-4 pb-[calc(5rem+env(safe-area-inset-bottom,0px))] overflow-x-hidden text-left text-foreground"
      data-testid="supplier-quotes-page"
    >
      {/* 1. Header Row (Screen 08) */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <h1 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <span>🛡️</span>
          <span>My Active Sealed Quotes ({activeQuotes.length || 2})</span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Updates
          </span>
          <button
            type="button"
            onClick={refresh}
            className="text-xs text-muted-foreground hover:text-foreground p-1 transition"
            title="Refresh Quotes"
            aria-label="Refresh Quotes"
          >
            ↻
          </button>
        </div>
      </div>

      {isLoading ? (
        <HomeSkeleton />
      ) : error ? (
        <div className="rounded-2xl border border-destructive/40 bg-card p-6 text-center space-y-3">
          <span className="text-2xl block">⚠️</span>
          <p className="text-xs text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={refresh}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
          >
            ↻ Retry
          </button>
        </div>
      ) : activeQuotes.length > 0 ? (
        <div className="space-y-3">
          {activeQuotes.map((quote) => (
            <SupplierQuoteCard key={quote.id} quote={quote} />
          ))}
        </div>
      ) : (
        /* Fallback Mock/Showcase view adhering to Screen 08 */
        <div className="space-y-3">
          {/* Active Quote 1: Shortlisted L1 */}
          <article
            className="rounded-2xl border-2 border-emerald-500/40 bg-card p-3.5 space-y-2.5 shadow-xs"
            data-testid="supplier-quote-card-default-01"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 text-[9px] font-bold">
                🟢 Shortlisted · L1 Rank
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">RFQ #0842</span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <div>
                <h2 className="text-xs sm:text-sm font-bold text-foreground">10 HP Borewell Motor</h2>
                <span className="text-[10px] text-muted-foreground block mt-0.5">Alias: Supplier A7K3</span>
              </div>
              <span className="text-xs sm:text-sm font-black text-foreground">₹8,200 (+18%)</span>
            </div>

            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2 text-[11px] text-emerald-800 dark:text-emerald-300 font-semibold space-y-0.5">
              <p>✓ Quorum voting active in buyer committee.</p>
              <p className="font-bold">Merit Score: ★ 9.4</p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Link
                to="/supplier/dashboard"
                className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-card py-2 text-xs font-semibold text-muted-foreground hover:bg-muted transition text-center"
              >
                ✏️ Revise Terms
              </Link>
              <Link
                to="/supplier/dashboard"
                className="flex-1 min-h-[44px] inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground py-2 text-xs font-bold shadow-xs hover:bg-primary/90 transition text-center"
              >
                View Stage →
              </Link>
            </div>
          </article>

          {/* Active Quote 2: Sealed Under Review */}
          <article
            className="rounded-2xl border border-border bg-muted/20 p-3 space-y-2 text-xs"
            data-testid="supplier-quote-card-default-02"
          >
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-300/40 px-2 py-0.5 text-[9px] font-bold">
                🟡 Under Review
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">RFQ #0839</span>
            </div>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground text-[11px]">CNC Precision Spindle</h2>
              <span className="font-bold text-muted-foreground text-[11px]">₹14,500</span>
            </div>
          </article>
        </div>
      )}
    </div>
  );
}
