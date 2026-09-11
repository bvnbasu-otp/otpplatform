/**
 * The demonstration, shown once and only here.
 *
 * Rendered as markup rather than shipped as an image, so it stays legible at any
 * width and reads correctly to a screen reader. The aliases use the same shape
 * the platform really produces — "Supplier" plus a four-character code from the
 * per-enquiry salt.
 */

import { DEMO_RFQ } from '../content/site-content';

export function IdentityProtectedComparisonPreview() {
  return (
    <figure
      className="rounded-xl border bg-card p-5 shadow-xl shadow-navy/5"
      data-testid="identity-protected-comparison-preview"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground">
            {DEMO_RFQ.reference}
          </p>
          <p className="mt-1 text-sm font-medium">{DEMO_RFQ.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{DEMO_RFQ.summary}</p>
        </div>
        <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-center text-[0.65rem] font-medium leading-tight text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
          Identity-Protected Competitive Sourcing
        </span>
      </div>

      <p className="mt-4 border-t pt-3 text-[0.7rem] text-muted-foreground">
        {DEMO_RFQ.weights} · set before quoting opened
      </p>

      <ul className="mt-2.5 space-y-2">
        {DEMO_RFQ.quotes.map((quote) => (
          <li
            key={quote.alias}
            className={`rounded-lg border p-3 ${
              quote.rank === 'L1' ? 'border-action/40 bg-action-soft' : 'bg-muted/30'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-[0.6rem] font-semibold text-navy-foreground"
                >
                  {quote.rank}
                </span>
                <span className="truncate font-mono text-sm font-medium">{quote.alias}</span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{quote.score}</span>
            </div>

            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              <span className="font-medium text-foreground">{quote.total}</span> ·{' '}
              {quote.delivery} · {quote.warranty} warranty
            </p>
          </li>
        ))}
      </ul>

      <figcaption className="mt-3 border-t pt-3 text-xs leading-snug">
        <span className="font-medium">{DEMO_RFQ.lessonHeadline}</span>{' '}
        <span className="text-muted-foreground">{DEMO_RFQ.lesson}</span>
        <span className="mt-1 block text-[0.65rem] text-navy-faint">{DEMO_RFQ.disclaimer}</span>
      </figcaption>
    </figure>
  );
}

// Legacy alias
export const BlindComparisonPreview = IdentityProtectedComparisonPreview;
