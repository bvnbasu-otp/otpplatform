import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PUBLIC_CONTENT_LAST_REVIEWED } from '@/lib/brand';
import { SiteFooter } from './SiteFooter';
import {
  BOTTOM_NAV_OVERHANG_CLEARANCE_CLASS,
  SCROLL_CONTAINER_ATTR,
  SHELL_SCROLLER_CLASS,
  scrollContainerProps,
  shellScrollerClass,
} from './scroll-model';

function renderFooter(): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <SiteFooter />
    </MemoryRouter>,
  );
}

function classLists(html: string): string[][] {
  return [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]!.split(/\s+/).filter(Boolean));
}

/** Tailwind spacing scale: w-80 = 20rem = 320px. */
function unprefixedWidthPx(token: string): number | null {
  const arbitrary = token.match(/^(?:min-)?w-\[(\d+(?:\.\d+)?)(px|rem)\]$/);
  if (arbitrary) return Number(arbitrary[1]) * (arbitrary[2] === 'rem' ? 16 : 1);
  const scale = token.match(/^(?:min-)?w-(\d+(?:\.\d+)?)$/);
  if (scale) return Number(scale[1]) * 4;
  return null;
}

describe('SiteFooter at 320–375px (static render/class assertions, not device rendering)', () => {
  it('is in normal document flow at the end of the scroll content, never fixed/sticky/absolute', () => {
    const footerTag = renderFooter().match(/<footer\b[^>]*>/)![0];
    const tokens = footerTag.match(/class="([^"]*)"/)![1]!.split(/\s+/);
    expect(tokens.filter((c) => /^(?:[a-z0-9]+:)*(?:fixed|sticky|absolute)$/.test(c))).toEqual([]);
    expect(tokens).toEqual(expect.arrayContaining(['mt-auto', 'w-full', 'min-w-0']));
  });

  it('has no unprefixed width or min-width wider than a 320px viewport', () => {
    const offenders = classLists(renderFooter())
      .flat()
      .filter((c) => (unprefixedWidthPx(c) ?? 0) > 320);
    expect(offenders).toEqual([]);
  });

  it('never clips text with truncate/nowrap, so labels wrap on narrow screens', () => {
    const tokens = classLists(renderFooter()).flat();
    expect(tokens).not.toContain('truncate');
    expect(tokens).not.toContain('whitespace-nowrap');
  });

  it('every flex row either stacks (flex-col) or wraps (flex-wrap) at the base breakpoint', () => {
    const rigidRows = classLists(renderFooter()).filter(
      (t) => t.includes('flex') && !t.includes('flex-col') && !t.includes('flex-wrap'),
    );
    expect(rigidRows).toEqual([]);
  });

  it('carries no competing trust ribbon (trust principles live once, on the homepage)', () => {
    const html = renderFooter();
    for (const phrase of ['Immutable Audit Trail', 'Fair Competition', 'Comparable Quotes', 'Transparent Decision']) {
      expect(html).not.toContain(phrase);
    }
  });

  it('shows the shared public review date, not a hard-coded one', () => {
    const source = readFileSync(join(__dirname, 'SiteFooter.tsx'), 'utf8');
    expect(source).not.toMatch(/Last updated:\s*\d/);
    expect(renderFooter()).toContain(`Last updated: ${PUBLIC_CONTENT_LAST_REVIEWED}`);
  });

  it('does not repeat the "+" primary CTA styling already owned by the header and bottom nav', () => {
    const html = renderFooter();
    expect(html).not.toContain('+ Get Started');
    const signupLink = html.match(/<a\b[^>]*href="\/signup"[^>]*>/)![0];
    expect(signupLink).not.toContain('text-primary');
    expect(signupLink).not.toContain('font-bold');
  });

  it('opens the governance drawer as a viewport overlay independent of <main> positioning', () => {
    const source = readFileSync(join(__dirname, 'SiteFooter.tsx'), 'utf8');
    expect(source).toContain('fixed inset-0 z-50');
    expect(source).not.toContain('sm:absolute inset-0');
  });
});

describe('scroll-model contract', () => {
  it('marks the shell scroller and only adds nav clearance when the nav is visible', () => {
    expect(scrollContainerProps('site')).toEqual({ [SCROLL_CONTAINER_ATTR]: 'site' });
    expect(SHELL_SCROLLER_CLASS.split(' ')).toEqual(expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto']));
    expect(shellScrollerClass(true).split(' ')).toContain(BOTTOM_NAV_OVERHANG_CLEARANCE_CLASS);
    expect(shellScrollerClass(false).split(' ')).not.toContain(BOTTOM_NAV_OVERHANG_CLEARANCE_CLASS);
  });
});

describe('global CSS scroll rules (static stylesheet assertions)', () => {
  const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');

  it('has no hidden fixed-height spacer stacked under every procurement screen', () => {
    expect(css).not.toMatch(/\.zero-scroll-container::after/);
  });

  it('zero-scroll defaults are zero-specificity so page pb-* utilities are not overridden', () => {
    expect(css).toMatch(/:where\(\.zero-scroll-container\)\s*\{/);
    expect(css).not.toMatch(/^\.zero-scroll-container\s*\{/m);
    expect(css).not.toMatch(/^\.zero-scroll-pane,/m);
  });

  it('min-h-screen inside the shell scroller fills the scroller instead of 100vh', () => {
    expect(css).toMatch(/\[data-scroll-container\] \.min-h-screen,\s*\[data-scroll-container\] \.min-h-dvh\s*\{\s*min-height:\s*100%;/);
  });

  it('body min-height uses dynamic viewport units so the document cannot out-grow the h-dvh frame', () => {
    expect(css).toMatch(/min-height:\s*100dvh;/);
  });
});
