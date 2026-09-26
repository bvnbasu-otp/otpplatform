import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PRODUCT_NAME, PUBLIC_CONTENT_LAST_REVIEWED } from '@/lib/brand';
import { SiteLayout } from '../components/SiteLayout';
import { PublicJourney } from '../components/PublicJourney';
import {
  BUYER_FAQS,
  GENERAL_FAQS,
  SUPPLIER_FAQS,
  type FaqEntry,
} from '../content/site-content';

type Audience = 'general' | 'buyers' | 'suppliers';

const TABS: [Audience, string][] = [
  ['general', 'General'],
  ['buyers', 'For buyers'],
  ['suppliers', 'For suppliers'],
];

const ENTRIES: Record<Audience, FaqEntry[]> = {
  general: GENERAL_FAQS,
  buyers: BUYER_FAQS,
  suppliers: SUPPLIER_FAQS,
};

export function FaqPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('for');
  const audience: Audience =
    requested === 'suppliers' ? 'suppliers' : requested === 'buyers' ? 'buyers' : 'general';
  const entries = ENTRIES[audience];

  function select(next: Audience) {
    const updated = new URLSearchParams(params);
    if (next === 'general') updated.delete('for');
    else updated.set('for', next);
    setParams(updated, { replace: true });
  }

  return (
    <SiteLayout>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14 space-y-10">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <p className="text-[10px] text-muted-foreground font-medium">
            Last updated: {PUBLIC_CONTENT_LAST_REVIEWED}
          </p>
          <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
            Frequently asked questions
          </h1>
          <p className="text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed">
            What {PRODUCT_NAME} is, how buying and quoting work, and what happens after you decide.
          </p>
        </div>

        <PublicJourney id="workflow" />

        <div className="pt-6 border-t border-border/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-foreground">Questions &amp; answers</h2>

            <div
              role="tablist"
              aria-label="Audience"
              className="inline-flex rounded-xl border bg-muted/40 p-1 text-xs font-bold shrink-0"
            >
              {TABS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={audience === value}
                  onClick={() => select(value)}
                  data-testid={`faq-tab-${value}`}
                  className={`rounded-lg px-3 py-1.5 transition ${
                    audience === value
                      ? 'bg-card text-foreground shadow-xs font-black'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/60 rounded-2xl border bg-card shadow-xs" data-testid="faq-list">
            {entries.map((entry) => (
              <FaqItem key={entry.question} entry={entry} />
            ))}
          </div>

          <div className="rounded-2xl border bg-gradient-to-r from-primary/10 via-card to-primary/5 p-6 text-center space-y-3">
            <h3 className="text-sm font-bold text-foreground">Still have a question?</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Register and raise your first request — we will help you get it right.
            </p>
            <div className="flex items-center justify-center gap-3 pt-1">
              <Link
                to="/signup"
                className="rounded-xl bg-primary text-primary-foreground font-bold px-4 py-2 text-xs shadow-xs hover:bg-primary/90 transition"
              >
                Register →
              </Link>
              <Link
                to="/about-us"
                className="rounded-xl border bg-card px-4 py-2 text-xs font-semibold hover:bg-muted transition"
              >
                About us
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SiteLayout>
  );
}

function FaqItem({ entry }: { entry: FaqEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start justify-between gap-4 p-4 sm:p-5 text-left hover:bg-muted/20 transition"
        >
          <span className="text-xs sm:text-sm font-bold text-foreground">{entry.question}</span>
          <span
            aria-hidden="true"
            className={`mt-0.5 shrink-0 text-base font-bold text-primary transition-transform ${
              open ? 'rotate-45' : ''
            }`}
          >
            +
          </span>
        </button>
      </h3>
      {open && (
        <div className="px-4 sm:px-5 pb-5 text-xs leading-relaxed text-muted-foreground border-t border-border/40 pt-3 bg-muted/5">
          <p className="whitespace-pre-line">{entry.answer}</p>
        </div>
      )}
    </div>
  );
}
