/**
 * Vector marks for the four things each portal promises.
 *
 * Drawn rather than imported so they inherit currentColor and never load a
 * font or a sprite on the one page a visitor judges the product by. Each one is
 * a picture of the actual mechanic — a stack of quotes at different heights for
 * comparison, a rising set of milestones for execution — because a generic
 * icon set would say nothing the headline does not already say.
 */

import type { ReactElement } from 'react';

type GlyphProps = { className?: string };

const BASE = 'h-6 w-6 shrink-0';

export function RaiseRequestGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${BASE} ${className ?? ''}`}
    >
      <path d="M5 3.5h9l5 5v12H5z" />
      <path d="M14 3.5v5h5" />
      <path d="M8.5 12.5h7M8.5 16h4.5" />
    </svg>
  );
}

export function VerifiedSuppliersGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${BASE} ${className ?? ''}`}
    >
      <path d="M12 2.5 20 6v6c0 4.2-3.2 7.6-8 9.5-4.8-1.9-8-5.3-8-9.5V6z" />
      <path d="m8.5 12 2.5 2.5L16 9.5" />
    </svg>
  );
}

/** Three quotes at three heights: the L1–L3 comparison, literally. */
export function QuoteComparisonGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${BASE} ${className ?? ''}`}
    >
      <path d="M3.5 20.5h17" />
      <rect x="5" y="12" width="4" height="8.5" rx="1" />
      <rect x="10.5" y="8" width="4" height="12.5" rx="1" />
      <rect x="16" y="4.5" width="4" height="16" rx="1" />
    </svg>
  );
}

export function ExecutionTrackingGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${BASE} ${className ?? ''}`}
    >
      <path d="M4 18.5h16" />
      <path d="m4.5 14 4-4.5 3.5 3 5-6.5" />
      <circle cx="8.5" cy="9.5" r="1.4" />
      <circle cx="12" cy="12.5" r="1.4" />
      <circle cx="17" cy="6" r="1.4" />
    </svg>
  );
}

export function DirectLeadsGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${BASE} ${className ?? ''}`}
    >
      <path d="M3.5 7.5h11v9h-11z" />
      <path d="M14.5 11h3l3 3v2.5h-6z" />
      <circle cx="7" cy="19" r="1.8" />
      <circle cx="17" cy="19" r="1.8" />
      <path d="M7 4v2M11 3.5v2.5" />
    </svg>
  );
}

/** A sealed quote: what you submit, and what nobody can attribute to you yet. */
export function TransparentQuotingGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${BASE} ${className ?? ''}`}
    >
      <rect x="3.5" y="6.5" width="17" height="12" rx="1.5" />
      <path d="m3.5 8 8.5 5.5L20.5 8" />
      <path d="M9 3.5h6" />
    </svg>
  );
}

export const MaskedQuotingGlyph = TransparentQuotingGlyph;

export function OrderTrackingGlyph({ className }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${BASE} ${className ?? ''}`}
    >
      <path d="M6 3.5v17" />
      <path d="M6 4.5h11l-2 3 2 3H6" />
      <path d="M6 13.5h9l-1.6 2.5 1.6 2.5H6" />
    </svg>
  );
}

export const MilestoneGlyph = OrderTrackingGlyph;

export type Glyph = (props: GlyphProps) => ReactElement;

/**
 * Paired with each portal's propositions by position, and typed as non-empty so
 * a list that grows past its glyphs falls back rather than rendering nothing.
 */
export const BUYER_GLYPHS: [Glyph, ...Glyph[]] = [
  RaiseRequestGlyph,
  VerifiedSuppliersGlyph,
  QuoteComparisonGlyph,
  ExecutionTrackingGlyph,
];

export const SUPPLIER_GLYPHS: [Glyph, ...Glyph[]] = [
  DirectLeadsGlyph,
  TransparentQuotingGlyph,
  OrderTrackingGlyph,
];
