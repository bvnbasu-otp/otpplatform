import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { LandingPage } from './pages/LandingPage';
import { AboutPage } from './pages/AboutPage';
import { FaqPage } from './pages/FaqPage';
import { SiteHeader } from './components/SiteHeader';
import { BUYER_FAQS, GENERAL_FAQS, SUPPLIER_FAQS } from './content/site-content';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: false,
      profileId: null,
      side: 'BUYER',
      isFounder: false,
      isPlatformAdmin: false,
      needsOnboarding: false,
      activeRole: null,
      roles: [],
      organizations: [],
      orgRole: null,
      organizationId: null,
      organizationName: null,
      buyerType: null,
      committeeRfqCount: 0,
      supplierId: null,
      fullName: null,
      title: null,
      avatarUrl: null,
      email: null,
    },
    switchRole: vi.fn(),
    switchOrganization: vi.fn(),
  }),
}));

const CANONICAL_TITLE = 'OTP — Identity-Protected Competitive Sourcing';
const CANONICAL_SUBTITLE = 'Compare competing supplier quotes and make better procurement decisions.';

const FORBIDDEN_PHRASES = [
  /Neutral Sourcing (&|&amp;|and) Governance Platform/i,
  /Desktop Procurement Cockpit/i,
  /Mobile Procurement Cockpit/i,
];

const JARGON = [
  /\bRLS\b/,
  /row[- ]level/i,
  /\bdatabase\b/i,
  /cryptograph/i,
  /\bSHA(-?256)?\b/,
  /\bhash(ed|es|ing)?\b/i,
  /\bsalt(s|ed|ing)?\b/i,
  /architecture/i,
  /\bWAHA\b/i,
  /append-only/i,
  /postgres/i,
  /supabase/i,
  /edge function/i,
];

function render(ui: React.ReactElement, path = '/'): string {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
}

function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The page's own content: inside <main>, before the footer (owned elsewhere). */
function pageBody(html: string): string {
  const start = html.indexOf('<main');
  const end = html.indexOf('data-testid="site-footer"');
  expect(start, 'page rendered without <main>').toBeGreaterThanOrEqual(0);
  return html.slice(start, end > start ? end : undefined);
}

const PAGES: [string, () => string][] = [
  ['Landing', () => render(<LandingPage />, '/')],
  ['About', () => render(<AboutPage />, '/about-us')],
  ['FAQ (general)', () => render(<FaqPage />, '/faqs')],
  ['FAQ (buyers)', () => render(<FaqPage />, '/faqs?for=buyers')],
  ['FAQ (suppliers)', () => render(<FaqPage />, '/faqs?for=suppliers')],
];

describe('canonical positioning on public pages', () => {
  it('homepage hero shows the canonical title and subtitle', () => {
    const text = toText(render(<LandingPage />));
    expect(text).toContain(CANONICAL_TITLE);
    expect(text).toContain(CANONICAL_SUBTITLE);
  });

  it('About page shows the canonical title and subtitle', () => {
    const text = toText(render(<AboutPage />, '/about-us'));
    expect(text).toContain(CANONICAL_TITLE);
    expect(text).toContain(CANONICAL_SUBTITLE);
  });

  it.each(PAGES)('%s renders none of the retired positioning phrases', (_name, renderPage) => {
    const html = renderPage();
    for (const phrase of FORBIDDEN_PHRASES) {
      expect(html).not.toMatch(phrase);
      expect(toText(html)).not.toMatch(phrase);
    }
  });

  it.each(PAGES)('%s carries no "Procurement Cockpit" label anywhere in its chrome', (_name, renderPage) => {
    expect(toText(renderPage())).not.toMatch(/Procurement Cockpit/i);
  });

  it.each(PAGES)('%s page content carries no technical jargon', (_name, renderPage) => {
    const text = toText(pageBody(renderPage()));
    for (const term of JARGON) {
      expect(text, `${term} found`).not.toMatch(term);
    }
  });

  it('FAQ answers (collapsed in the markup) carry no technical jargon either', () => {
    for (const entry of [...GENERAL_FAQS, ...BUYER_FAQS, ...SUPPLIER_FAQS]) {
      for (const term of JARGON) {
        expect(`${entry.question} ${entry.answer}`, `${term} in "${entry.question}"`).not.toMatch(term);
      }
    }
  });
});

describe('one public journey, trust presented separately', () => {
  it('homepage renders exactly one journey with the five canonical steps in order', () => {
    const html = pageBody(render(<LandingPage />));
    expect(html.match(/data-testid="public-journey"/g)).toHaveLength(1);

    const steps = [...html.matchAll(/data-testid="public-journey-step"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g)].map(
      (m) => m[1],
    );
    expect(steps).toEqual(['Request', 'Compare', 'Decide', 'Purchase', 'Track']);
  });

  it('homepage has no competing multi-stage lifecycle or trust ribbon in its content', () => {
    const text = toText(pageBody(render(<LandingPage />)));
    expect(text).not.toMatch(/6-Stage|Six governed steps|STAGE 0\d|Stage \d/i);
    expect(text).not.toMatch(/Controlled Award|Transparent Decision|Complete Audit Trail/);
    expect(text).not.toMatch(/Requirement Intake & Scope|Committee Governance & Voting/);
  });

  it('trust principles render in their own section, outside the journey', () => {
    const html = pageBody(render(<LandingPage />));
    expect(html.match(/data-testid="trust-principles"/g)).toHaveLength(1);
    const journeyStart = html.indexOf('data-testid="public-journey"');
    const trustStart = html.indexOf('data-testid="trust-principles"');
    const journeyBlock = html.slice(journeyStart, trustStart > journeyStart ? trustStart : undefined);
    expect(journeyBlock).not.toContain('Identity-protected quotes');
    expect(toText(html)).toMatch(/Identity-protected quotes/);
    expect(toText(html)).toMatch(/You decide/);
  });

  it('the FAQ reuses the same single journey rather than a different one', () => {
    const html = pageBody(render(<FaqPage />, '/faqs'));
    expect(html.match(/data-testid="public-journey"/g)).toHaveLength(1);
    expect(html).toContain('id="workflow"');
    expect(toText(html)).not.toMatch(/6-Stage|Stage \d/i);
  });
});

describe('homepage structure', () => {
  it('has one primary CTA area with a buyer entry and a supplier entry', () => {
    const html = pageBody(render(<LandingPage />));
    expect(html.match(/data-testid="primary-cta-area"/g)).toHaveLength(1);
    const ctaStart = html.indexOf('data-testid="primary-cta-area"');
    const ctaArea = html.slice(ctaStart, html.indexOf('</div>', ctaStart));
    expect(ctaArea).toContain('href="/signup?side=buyer"');
    expect(ctaArea).toContain('href="/signup?side=supplier"');
  });

  it('does not repeat sign-up calls to action elsewhere on the page', () => {
    const html = pageBody(render(<LandingPage />));
    expect(html.match(/href="\/signup/g)).toHaveLength(2);
    expect(toText(html)).not.toMatch(/Start Sourcing|Start Free|Register as Supplier|Start RWA Procurement/);
  });

  it('does not duplicate the Pricing, FAQ or About pages inline', () => {
    const text = toText(pageBody(render(<LandingPage />)));
    expect(text).not.toMatch(/Frequently Asked Questions/i);
    expect(text).not.toMatch(/Simple, Transparent Pricing/i);
    expect(text).not.toMatch(/Learn More About OTP/i);
  });

  it('carries no stale hard-coded demo year', () => {
    const text = toText(render(<LandingPage />));
    expect(text).not.toMatch(/RFQ-20\d\d/);
  });
});

describe('Product Leadership and Provenance are not in public navigation', () => {
  it('header links go nowhere near provenance or product leadership', () => {
    const html = render(<SiteHeader />);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href).not.toMatch(/provenance|leadership/i);
    }
    expect(toText(html)).not.toMatch(/Provenance|Product Leadership/i);
  });

  it.each(PAGES)('%s shows no Provenance or Product Leadership to an anonymous visitor', (_name, renderPage) => {
    const html = renderPage();
    expect(toText(html)).not.toMatch(/Provenance|Product Leadership/i);
    expect(html).not.toMatch(/href="[^"]*(provenance|leadership)[^"]*"/i);
  });
});

describe('FAQ answers the questions customers actually ask', () => {
  const REQUIRED = [
    'What is OTP?',
    'How do I buy something through OTP?',
    'How do suppliers take part?',
    'How are quotes compared?',
    'How is identity protected?',
    'Who makes the decision, and how does approval work?',
    'What happens after the award, and how do I track my order?',
    'What does Pilot Mode mean?',
  ];

  it.each(REQUIRED)('renders "%s" on the default FAQ tab', (question) => {
    expect(toText(render(<FaqPage />, '/faqs'))).toContain(question);
  });

  it('explains identity protection in terms of the award', () => {
    const entry = GENERAL_FAQS.find((f) => f.question === 'How is identity protected?')!;
    expect(entry.answer).toMatch(/award/i);
    expect(entry.answer).toMatch(/suppliers do not see who the buyer is/i);
  });

  it('explains decisions and committee approval plainly', () => {
    const entry = GENERAL_FAQS.find((f) => /decision/.test(f.question))!;
    expect(entry.answer).toMatch(/^You do\./);
    expect(entry.answer).toMatch(/committee/i);
  });

  it('explains Pilot Mode without inventing claims', () => {
    const entry = GENERAL_FAQS.find((f) => /Pilot Mode/.test(f.question))!;
    expect(entry.answer).toMatch(/₹0/);
    expect(entry.answer).toMatch(/no payments are processed/i);
    expect(entry.answer).toMatch(/supplier fee is waived/i);
    expect(entry.answer).not.toMatch(/escrow|guarantee|certified/i);
  });

  it('labels tabs in customer terms, not "architecture"', () => {
    const text = toText(render(<FaqPage />, '/faqs'));
    expect(text).toContain('General');
    expect(text).toContain('For buyers');
    expect(text).toContain('For suppliers');
    expect(text).not.toMatch(/General Architecture|Technical Architecture|Complete Architecture/i);
  });
});

describe('stale public dates', () => {
  const siteDir = fileURLToPath(new URL('.', import.meta.url));

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return sources(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
    });
  }

  it('no public site source hard-codes its own "Last updated" date', () => {
    for (const file of sources(siteDir)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/Last updated:\s*\d/);
    }
  });

  it('no public site source hard-codes a past year', () => {
    for (const file of sources(siteDir)) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/\b20(1\d|2[0-5])\b/);
    }
  });
});
