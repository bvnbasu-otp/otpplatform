import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SiteLayout } from './components/SiteLayout';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as any).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  };
  (globalThis as any).__SHARED_SUPABASE_MOCK__ = globalMock;
  return { supabase: globalMock };
});

vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: null, isAuthenticated: false, signOut: vi.fn() }) }));
vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: false,
      profileId: null,
      side: 'BUYER',
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
    switchTo: vi.fn(),
    switchOrg: vi.fn(),
  }),
}));
vi.mock('@/features/supplier', () => ({ SupplierCapabilityModal: () => null }));
vi.mock('@/features/portal', () => ({ QuickRegisterModal: () => null }));
vi.mock('@/features/intake', () => ({ VoiceTextRequirementIntakeModal: () => null }));
vi.mock('@/features/profile', () => ({ ProfileEditModal: () => null }));
vi.mock('@/features/roles/components/ChangePasswordModal', () => ({ ChangePasswordModal: () => null }));
vi.mock('@/features/support', () => ({ SupportHelpButtonModal: () => null }));

function renderSite(path = '/pricing'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <SiteLayout>
        <section data-testid="public-page">Public page body</section>
      </SiteLayout>
    </MemoryRouter>,
  );
}

function tagClasses(tag: string): string[] {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean);
}

describe('SiteLayout single-scroller model (static render/class assertions, not device rendering)', () => {
  it('has exactly one <main>, marked as the site scroll container', () => {
    const mains = renderSite().match(/<main\b[^>]*>/g) ?? [];
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContain('data-scroll-container="site"');
    expect(tagClasses(mains[0]!)).toEqual(expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto']));
  });

  it('places the footer inside the scroller after the page content, so it can never float over content', () => {
    const html = renderSite();
    const mainOpen = html.indexOf('<main');
    const mainClose = html.indexOf('</main>');
    const page = html.indexOf('data-testid="public-page"');
    const footer = html.indexOf('data-testid="site-footer"');
    expect(mainOpen).toBeLessThan(page);
    expect(page).toBeLessThan(footer);
    expect(footer).toBeLessThan(mainClose);
  });

  it('renders the public bottom nav in normal flow after <main>, with <main> clearing the raised "+"', () => {
    const html = renderSite();
    const navTag = html.match(/<nav\b[^>]*data-testid="mobile-bottom-nav"[^>]*>/)?.[0];
    expect(navTag).toBeDefined();
    expect(tagClasses(navTag!).filter((c) => /^(?:[a-z0-9]+:)*(?:fixed|absolute|sticky)$/.test(c))).toEqual([]);
    expect(html.indexOf('</main>')).toBeLessThan(html.indexOf('data-testid="mobile-bottom-nav"'));
    expect(tagClasses(html.match(/<main\b[^>]*>/)![0])).toContain('pb-4');
  });

  it('uses the same shell root and scroller classes as AppLayout', () => {
    const site = readFileSync(join(__dirname, 'components/SiteLayout.tsx'), 'utf8');
    const app = readFileSync(join(__dirname, '../../components/AppLayout.tsx'), 'utf8');
    for (const source of [site, app]) {
      expect(source).toContain('className={SHELL_ROOT_CLASS}');
      expect(source).toContain('className={shellScrollerClass(showBottomNav)}');
      const resetRef = source.match(/useScrollContainerReset\((\w+)\)/)?.[1];
      expect(resetRef).toBeDefined();
      expect(source).toMatch(new RegExp(`<main\\b[^>]*ref=\\{${resetRef}\\}`));
      expect(source).not.toMatch(/window\.scrollTo/);
    }
  });
});
