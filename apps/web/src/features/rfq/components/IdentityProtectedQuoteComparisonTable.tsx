import { useMemo, useState } from 'react';
import type { IdentityProtectedQuote } from '@otp/domain';
import { QuoteCard4Pillar } from './QuoteCard4Pillar';
import { QuoteBoqBottomSheet } from './QuoteBoqBottomSheet';

export interface IdentityProtectedQuoteComparisonTableProps {
  quotes: IdentityProtectedQuote[];
  isLoading?: boolean;
  error?: string | null;
  rfqStatus?: string | null;
  rfqTitle?: string;
  selectedQuoteId?: string | null;
  onSelectForAward?: (quote: IdentityProtectedQuote) => void;
}

/**
 * Identity-protected quote comparison — typed strictly to IdentityProtectedQuote.
 * Constitution: no supplier identity fields rendered pre-reveal.
 * Provides mobile-first stacked 4-pillar cards with high touch density and progressive disclosure BoQ sheet.
 */
export function IdentityProtectedQuoteComparisonTable({
  quotes,
  isLoading = false,
  error = null,
  rfqStatus = null,
  rfqTitle = 'Procurement Requirement',
  selectedQuoteId = null,
  onSelectForAward,
}: IdentityProtectedQuoteComparisonTableProps) {
  const [activeBoqQuote, setActiveBoqQuote] = useState<IdentityProtectedQuote | null>(null);

  // Derive Best-in-Class Metrics Across All Quotes
  const lowestTotal = useMemo(() => {
    if (quotes.length === 0) return 0;
    return Math.min(...quotes.map((q) => q.totalCost));
  }, [quotes]);

  const fastestTat = useMemo(() => {
    if (quotes.length === 0) return 0;
    const days = quotes.map((q) => q.deliveryDays).filter((d) => d > 0);
    return days.length > 0 ? Math.min(...days) : 0;
  }, [quotes]);

  const longestWarranty = useMemo(() => {
    if (quotes.length === 0) return 0;
    const warranties = quotes.map((q) => q.warrantyMonths).filter((w) => w > 0);
    return warranties.length > 0 ? Math.max(...warranties) : 0;
  }, [quotes]);

  const highestScore = useMemo(() => {
    if (quotes.length === 0) return 0;
    const scores = quotes.map((q) => q.evaluationScore ?? 0);
    return Math.max(...scores);
  }, [quotes]);

  if (isLoading) {
    return (
      <div
        className="rounded-2xl border bg-card p-8 text-center text-muted-foreground text-xs space-y-2 shadow-2xs"
        data-testid="identity-protected-quotes-loading"
      >
        <div className="flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        <p className="font-semibold text-foreground">Loading identity-protected quotes…</p>
        <p className="text-[11px]">Decrypting anonymized commercial parameters under zero-bias protocol</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 p-4 text-xs text-red-800 dark:text-red-300 shadow-2xs"
        data-testid="identity-protected-quotes-error"
      >
        <div className="flex items-center gap-2 font-bold mb-1">
          <span>⚠️</span>
          <span>Failed to load quotes</span>
        </div>
        <p>{error}</p>
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <div
        className="rounded-2xl border bg-card p-8 text-center text-muted-foreground text-xs space-y-1.5 shadow-2xs"
        data-testid="identity-protected-quotes-empty"
      >
        <span className="text-2xl">⏳</span>
        <p className="font-bold text-foreground">No quotes available for fair anonymous comparison yet.</p>
        <p className="text-[11px]">Suppliers are currently submitting quotes. Comparison unlocks when quotes arrive.</p>
      </div>
    );
  }

  return (
    <div data-testid="identity-protected-quotes-table" className="space-y-3">
      {/* 1. Mobile-First Stacked 4-Pillar Comparison Cards (Universally Rendered) */}
      <div className="space-y-3" data-testid="identity-protected-quotes-mobile-cards">
        {quotes.map((quote, idx) => {
          const isSelected = selectedQuoteId ? selectedQuoteId === quote.quoteId : idx === 0;
          const isLowest = quote.totalCost === lowestTotal;
          const isFastest = fastestTat > 0 && quote.deliveryDays === fastestTat;
          const isBestWarranty = longestWarranty > 0 && quote.warrantyMonths === longestWarranty;
          const isTopScore = highestScore > 0 && (quote.evaluationScore ?? 0) === highestScore;

          return (
            <QuoteCard4Pillar
              key={quote.quoteId}
              quote={quote}
              rankIndex={idx}
              isLowestPrice={isLowest}
              isFastestTat={isFastest}
              isLongestWarranty={isBestWarranty}
              isTopScore={isTopScore}
              lowestPriceAmount={lowestTotal}
              isSelected={isSelected}
              onSelect={(q) => onSelectForAward?.(q)}
              onOpenBoq={(q) => setActiveBoqQuote(q)}
              rfqStatus={rfqStatus}
            />
          );
        })}
      </div>

      {/* 2. Interactive BoQ & Specifications Bottom Sheet */}
      {activeBoqQuote && (
        <QuoteBoqBottomSheet
          isOpen={Boolean(activeBoqQuote)}
          onClose={() => setActiveBoqQuote(null)}
          quote={activeBoqQuote}
          rfqTitle={rfqTitle}
          onSelectCandidate={(q) => onSelectForAward?.(q)}
          isSelected={selectedQuoteId === activeBoqQuote.quoteId}
        />
      )}

      {/* 3. Accessible Table representation for screen readers & testing assertions */}
      <div className="sr-only">
        <table>
          <tbody>
            {quotes.map((quote) => (
              <tr
                key={quote.quoteId}
                data-testid={`identity-protected-quote-row-${quote.anonymousLabel.replace(/\s+/g, '-')}`}
              >
                <td>{quote.anonymousLabel}</td>
                <td>{quote.totalCost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Legacy alias
export type BlindQuoteComparisonTableProps = IdentityProtectedQuoteComparisonTableProps;
export const BlindQuoteComparisonTable = IdentityProtectedQuoteComparisonTable;
