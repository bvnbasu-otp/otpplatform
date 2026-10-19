import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import {
  PRODUCT_NAME,
  PRODUCT_PHILOSOPHY,
  PRODUCT_PLATFORM_NAME,
  PRODUCT_PLATFORM_SUBTITLE,
  PRODUCT_PLATFORM_TITLE,
  PRODUCT_TITLE,
} from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';
import { PublicJourney, TrustPrinciples } from '../components/PublicJourney';
import { DEMO_RFQ } from '../content/site-content';
import { OtpProductDemoModal } from '../components/OtpProductDemoModal';

/**
 * One message, one purpose, one place to act. Pricing, FAQs and About have their
 * own pages in the header; repeating them here only buried the call to action.
 */
export function LandingPage() {
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);

  return (
    <SiteLayout>
      <div className="overflow-x-hidden max-w-full space-y-12 sm:space-y-16 pb-12">
        <HeroSection onOpenDemo={() => setIsDemoModalOpen(true)} />
        <PublicJourney />
        <TrustPrinciples />
      </div>

      <OtpProductDemoModal
        isOpen={isDemoModalOpen}
        onClose={() => setIsDemoModalOpen(false)}
      />
    </SiteLayout>
  );
}

function HeroSection({ onOpenDemo }: { onOpenDemo: () => void }) {
  const { user } = useAuth();

  return (
    <section className="relative pt-6 pb-4 sm:pt-10 sm:pb-8 border-b bg-gradient-to-b from-muted/40 via-background to-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center max-w-3xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-2">
            <p className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-primary shadow-2xs">
              {PRODUCT_NAME} — {PRODUCT_PLATFORM_NAME}
            </p>
            <p className="text-xs sm:text-sm font-semibold tracking-wide text-foreground/80 max-w-2xl mx-auto">
              {PRODUCT_PHILOSOPHY}
            </p>
          </div>

          <h1 className="mt-4 text-2xl sm:text-4xl md:text-5xl font-extrabold leading-[1.15] tracking-tight text-foreground">
            {PRODUCT_PLATFORM_TITLE}
          </h1>

          <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            {PRODUCT_PLATFORM_SUBTITLE}
          </p>

          <div
            className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
            data-testid="primary-cta-area"
          >
            {user ? (
              <Link
                to="/dashboard"
                data-testid="cta-buyer"
                className="min-h-[48px] rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-sm hover:opacity-90 transition flex items-center justify-center gap-2"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <Link
                to="/signup?side=buyer"
                data-testid="cta-buyer"
                className="min-h-[48px] rounded-xl bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-sm hover:opacity-90 transition flex items-center justify-center gap-2"
              >
                I need to buy — Raise a request →
              </Link>
            )}
            <Link
              to="/signup?side=supplier"
              data-testid="cta-supplier"
              className="min-h-[48px] rounded-xl border border-border bg-card px-6 py-3 text-sm font-bold text-foreground hover:bg-muted transition flex items-center justify-center gap-2"
            >
              I’m a supplier — Join to quote →
            </Link>
          </div>

          <div className="mt-4 flex items-center justify-center">
            <button
              type="button"
              onClick={onOpenDemo}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs font-bold text-primary transition shadow-2xs cursor-pointer min-h-[40px]"
              data-testid="interactive-product-walkthrough-button"
            >
              <span>✨</span>
              <span>Interactive Walkthrough: TELL → REVIEW → DECIDE → TRACK</span>
              <span>→</span>
            </button>
          </div>

          <p className="mt-3 text-[11px] sm:text-xs text-muted-foreground">
            Pilot: free to use — ₹0 charged. Payments go directly between you and your supplier.
          </p>
        </div>

        <div className="mt-8 max-w-lg mx-auto">
          <ExampleComparison />
        </div>
      </div>
    </section>
  );
}

/** Illustrative only — uses the labelled demonstration data from site-content. */
function ExampleComparison() {
  return (
    <figure
      className="rounded-2xl border-2 border-primary/20 bg-card p-4 sm:p-5 shadow-lg shadow-primary/5"
      aria-label="Example quote comparison"
    >
      <div className="flex items-start justify-between gap-2 border-b pb-3">
        <div>
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
            Example
          </span>
          <h2 className="mt-1 text-sm sm:text-base font-bold text-foreground">{DEMO_RFQ.title}</h2>
          <p className="text-[11px] text-muted-foreground">{DEMO_RFQ.weights}</p>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold">
          Names hidden
        </span>
      </div>

      <ul className="mt-3 space-y-2">
        {DEMO_RFQ.quotes.map((quote) => (
          <li
            key={quote.alias}
            className="rounded-xl border border-border/60 bg-muted/20 p-3 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <span className="font-mono text-xs font-bold text-foreground">{quote.alias}</span>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {quote.delivery} · {quote.warranty} warranty
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-sm font-extrabold text-foreground tabular-nums">{quote.total}</div>
              <div className="text-[10px] font-semibold text-primary tabular-nums">Score {quote.score}</div>
            </div>
          </li>
        ))}
      </ul>

      <figcaption className="mt-3 pt-3 border-t border-border/50 text-[11px] text-muted-foreground">
        {DEMO_RFQ.lessonHeadline} {DEMO_RFQ.disclaimer}.
      </figcaption>
    </figure>
  );
}
