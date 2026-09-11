import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SiteLayout } from '../components/SiteLayout';
import {
  BUYER_FAQS,
  GENERAL_FAQS,
  SUPPLIER_FAQS,
  type FaqEntry,
} from '../content/site-content';

type Audience = 'general' | 'buyers' | 'suppliers';

const TABS: [Audience, string][] = [
  ['general', 'About the platform'],
  ['buyers', 'For buyers'],
  ['suppliers', 'For suppliers'],
];

const ENTRIES: Record<Audience, FaqEntry[]> = {
  general: GENERAL_FAQS,
  buyers: BUYER_FAQS,
  suppliers: SUPPLIER_FAQS,
};

/**
 * The same product, answered three ways.
 *
 * Buyers and suppliers ask opposite questions about one mechanism — "how do I
 * know this is fair" from one side, "how do I know I am hidden" from the other —
 * so a single merged list would answer each of them half the time. The first tab
 * is for the reader who has not yet picked a side and wants to know what this is
 * and what it does not do yet.
 *
 * The audience is in the query string, which makes "the supplier FAQ" a link
 * someone can send.
 */
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
      <div className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="text-3xl font-semibold">Frequently Asked Questions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What the platform is, how identity protection, deadlines and scoring work, and which
          parts are not built yet.
        </p>

        <div
          role="tablist"
          aria-label="Audience"
          className="mt-7 inline-flex flex-wrap rounded-lg border bg-card p-1"
        >
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={audience === value}
              onClick={() => select(value)}
              data-testid={`faq-tab-${value}`}
              className={`rounded-md px-4 py-2 text-sm font-medium ${
                audience === value
                  ? 'bg-navy text-navy-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-6 divide-y rounded-lg border bg-card" data-testid="faq-list">
          {entries.map((entry) => (
            <FaqItem key={entry.question} entry={entry} />
          ))}
        </div>

        <p className="mt-8 text-sm text-muted-foreground">
          Something not covered here?{' '}
          <Link to="/about-us" className="font-medium text-action hover:underline">
            Read what we are trying to fix
          </Link>{' '}
          or{' '}
          <Link to="/signup" className="font-medium text-action hover:underline">
            register and try one enquiry
          </Link>
          .
        </p>
      </div>
    </SiteLayout>
  );
}

function FaqItem({ entry }: { entry: FaqEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-start justify-between gap-4 p-5 text-left"
        >
          <span className="text-sm font-medium">{entry.question}</span>
          <span
            aria-hidden="true"
            className={`mt-0.5 shrink-0 text-muted-foreground transition-transform ${
              open ? 'rotate-45' : ''
            }`}
          >
            +
          </span>
        </button>
      </h2>
      {open && (
        <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{entry.answer}</p>
      )}
    </div>
  );
}
