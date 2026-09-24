/**
 * Which routes the public can reach, and which need a session.
 *
 * There is no renderer in this test setup, so this reads the route table as text —
 * the same approach the schema tests take with migrations. Narrow, but it guards
 * the two mistakes that would actually be made here, both of them one indentation
 * level away from correct: a marketing page ending up inside RequireAuth, which
 * sends every anonymous arrival to a login screen and quietly kills the funnel,
 * and a workspace route ending up outside it, which is the other direction and
 * much worse.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OTP_ROOT } from '../helpers/migration-manifest';

const SOURCE = readFileSync(join(OTP_ROOT, 'apps', 'web', 'src', 'App.tsx'), 'utf8');

/** The route table, split at the element that begins the authenticated block. */
function sections(): { open: string; guarded: string } {
  const guardStart = SOURCE.indexOf('<RequireAuth>');
  expect(guardStart, 'RequireAuth is no longer in the route table').toBeGreaterThan(0);

  return {
    open: SOURCE.slice(0, guardStart),
    guarded: SOURCE.slice(guardStart, SOURCE.indexOf('<Route path="*"')),
  };
}

function declares(section: string, path: string): boolean {
  return section.includes(`path="${path}"`);
}

describe('routes anyone can reach without an account', () => {
  const PUBLIC = [
    '/',
    '/pricing',
    '/faqs',
    '/about-us',
    '/login',
    '/signup',
    '/buyer',
    '/seller',
  ];

  it.each(PUBLIC)('serves %s to a visitor with no session', (path) => {
    const { open, guarded } = sections();

    expect(declares(open, path), `${path} is not declared before the session gate`).toBe(true);
    expect(declares(guarded, path), `${path} is behind the session gate`).toBe(false);
  });

  it('leaves the magic-link quoting page open, because the token is the credential', () => {
    // A supplier who replied to an SMS has no account at all. Putting this behind
    // a session check would make the entire messaging channel unusable.
    const { open, guarded } = sections();

    expect(declares(open, '/q/:token')).toBe(true);
    expect(declares(guarded, '/q/:token')).toBe(false);
  });

  it('serves marketing at / and keeps the workspace at /dashboard', () => {
    const { open, guarded } = sections();

    expect(open).toMatch(/path="\/"\s+element={<LandingPage/);
    expect(declares(guarded, '/dashboard')).toBe(true);
    expect(declares(open, '/dashboard')).toBe(false);
  });
});

describe('routes that need a session', () => {
  const GUARDED = [
    '/dashboard',
    '/intake',
    '/rfq/:rfqId/identity-protected-comparison',
    '/rfq/:rfqId/clarification',
    '/rfq/:rfqId/committee',
    '/rfq/:rfqId/award',
    '/rfq/:rfqId/reveal',
    '/supplier/capabilities',
    '/purchase-orders',
    '/audit',
    '/performance',
    '/notifications',
    '/demo',
  ];

  it.each(GUARDED)('keeps %s behind the session gate', (path) => {
    const { open, guarded } = sections();

    expect(declares(guarded, path), `${path} is not inside RequireAuth`).toBe(true);
    expect(declares(open, path), `${path} is reachable without a session`).toBe(false);
  });

  it('puts the role gate inside the session check and outside the layout', () => {
    // Inside, because asking an anonymous visitor to pick a job title is
    // nonsense; outside the layout, because the onboarding screen replaces the
    // workspace rather than appearing within it.
    expect(SOURCE).toMatch(
      /<RequireAuth>[\s\S]*?<RequireRole>[\s\S]*?<AppLayout \/>[\s\S]*?<\/RequireRole>[\s\S]*?<\/RequireAuth>/,
    );
  });

  it('gates every enquiry screen, with none left outside by hand', () => {
    const { open } = sections();

    expect(open).not.toMatch(/path="\/rfq\//);
    expect(open).not.toMatch(/path="\/requirements/);
    expect(open).not.toMatch(/path="\/purchase-orders/);
  });
});

describe('what happens to an address that does not exist', () => {
  it('sends an unknown path to the public landing page rather than to a login screen', () => {
    expect(SOURCE).toMatch(/path="\*"\s+element={<Navigate to="\/" replace \/>}/);
  });

  it('sends a route missing its enquiry id back to the dashboard, not to marketing', () => {
    // Someone with a session who followed a broken link belongs in the product.
    const redirects = [...SOURCE.matchAll(/<Navigate to="([^"]+)" replace \/>/g)].map(
      (m) => m[1]!,
    );

    expect(redirects).toContain('/dashboard');
    expect(redirects).not.toContain('/login');
  });
});
