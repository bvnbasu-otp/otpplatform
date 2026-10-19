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
          <span>My Active Sealed Quotes ({activeQuotes.length})</span>
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
        /* Honest empty state when no active quotes exist */
        <div className="rounded-2xl border border-dashed border-border/80 bg-card p-8 text-center space-y-3">
          <span className="text-3xl block">📋</span>
          <h3 className="text-sm font-bold text-foreground">No Active Submitted Quotes</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            You have not submitted any active quotes yet. Review pending RFQ invitations from buyers and submit sealed quotes to compete.
          </p>
          <div className="pt-2">
            <Link
              to="/supplier/dashboard"
              className="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-xs font-bold hover:bg-primary/90 transition shadow-sm"
            >
              Explore RFQ Opportunities →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
