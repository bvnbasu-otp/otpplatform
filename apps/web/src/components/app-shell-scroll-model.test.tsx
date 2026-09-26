import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppLayout } from './AppLayout';
import { MobileBottomNav } from './MobileBottomNav';

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

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: true,
      profileId: 'p1',
      side: 'BUYER',
      isPlatformAdmin: false,
      needsOnboarding: false,
      activeRole: { code: 'BUYER', side: 'BUYER', label: 'Buyer', description: '', permissions: [] },
      roles: [],
      organizations: [],
      orgRole: 'OWNER',
      organizationId: 'org-1',
      organizationName: 'Acme',
      buyerType: 'COMMERCIAL',
      committeeRfqCount: 0,
      supplierId: null,
      fullName: 'Test Buyer',
      title: null,
      avatarUrl: null,
      email: 'buyer@otp.test',
      phone: null,
    },
    switchTo: vi.fn(),
    switchOrg: vi.fn(),
  }),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { email: 'buyer@otp.test' }, signOut: vi.fn() }) }));
vi.mock('@/features/maintenance', () => ({ useMaintenance: () => ({ isMaintenanceMode: false }) }));
vi.mock('@/features/supplier', () => ({ SupplierCapabilityModal: () => null }));
vi.mock('@/features/portal', () => ({ QuickRegisterModal: () => null }));
vi.mock('@/features/intake', () => ({ VoiceTextRequirementIntakeModal: () => null }));
vi.mock('@/features/profile', () => ({ ProfileEditModal: () => null }));
vi.mock('@/features/roles/components/ChangePasswordModal', () => ({ ChangePasswordModal: () => null }));
vi.mock('@/features/notifications', () => ({ NotificationBell: () => null }));
vi.mock('@/features/support', () => ({ SupportHelpButtonModal: () => null }));

const PAGE_MARKER = 'data-testid="page-content"';

function renderAppAt(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="*" element={<div data-testid="page-content">Page body</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function classLists(html: string): string[][] {
  return [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]!.split(/\s+/).filter(Boolean));
}

function tagClasses(tag: string): string[] {
  return (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/).filter(Boolean);
}

const OVERLAY_POSITION = /^(?:[a-z0-9]+:)*(?:fixed|absolute|sticky)$/;

describe('AppLayout single-scroller model (static render/class assertions, not device rendering)', () => {
  it('has exactly one <main>, and it is the only vertical scroll container in the shell', () => {
    const html = renderAppAt('/dashboard');
    const mains = html.match(/<main\b[^>]*>/g) ?? [];
    expect(mains).toHaveLength(1);
    expect(mains[0]).toContain('data-scroll-container="app"');

    const mainTokens = tagClasses(mains[0]!);
    expect(mainTokens).toEqual(expect.arrayContaining(['flex-1', 'min-h-0', 'overflow-y-auto']));

    const scrollers = classLists(html).filter((t) => t.includes('overflow-y-auto') || t.includes('overflow-auto') || t.includes('overflow-y-scroll'));
    expect(scrollers).toHaveLength(1);
  });

  it('only the simulator frame sets a viewport height, and it clips instead of scrolling', () => {
    const html = renderAppAt('/dashboard');
    const viewportBoxes = classLists(html).filter((t) => t.some((c) => /^(?:h|max-h)-(?:screen|dvh)$/.test(c)));
    expect(viewportBoxes).toHaveLength(1);
    expect(viewportBoxes[0]).toContain('overflow-hidden');
    expect(viewportBoxes[0]).not.toContain('overflow-y-auto');
  });

  it('renders the bottom nav in normal flow AFTER <main>, never fixed/absolute over content', () => {
    const html = renderAppAt('/dashboard');
    const navTag = html.match(/<nav\b[^>]*data-testid="mobile-bottom-nav"[^>]*>/)?.[0];
    expect(navTag).toBeDefined();
    const navTokens = tagClasses(navTag!);
    expect(navTokens.filter((c) => OVERLAY_POSITION.test(c))).toEqual([]);
    expect(navTokens).toContain('shrink-0');
    expect(navTokens).not.toContain('bottom-0');

    expect(html.indexOf('</main>')).toBeLessThan(html.indexOf('data-testid="mobile-bottom-nav"'));
    expect(html.indexOf(PAGE_MARKER)).toBeLessThan(html.indexOf('</main>'));
  });

  it('gives <main> clearance for the raised centre "+" button when the nav is shown', () => {
    const mainTag = renderAppAt('/dashboard').match(/<main\b[^>]*>/)![0];
    expect(tagClasses(mainTag)).toContain('pb-4');
  });

  it('suppresses the global nav on transactional dock routes and drops the nav clearance', () => {
    for (const route of ['/rfq/rfq-1/award', '/rfq/rfq-1/committee', '/purchase-orders/po-1', '/intake', '/supplier/rfq/rfq-1/quote']) {
      const html = renderAppAt(route);
      expect(html, route).not.toContain('data-testid="mobile-bottom-nav"');
      expect(html, route).not.toContain('aria-label="Mobile Bottom Navigation"');
      const mainTokens = tagClasses(html.match(/<main\b[^>]*>/)![0]);
      expect(mainTokens.filter((c) => /^pb-/.test(c)), route).toEqual([]);
      expect(html, route).toContain(PAGE_MARKER);
    }
  });

  it('MobileBottomNav renders nothing by itself on a dock route', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/rfq/rfq-1/award']}>
        <MobileBottomNav />
      </MemoryRouter>,
    );
    expect(html).not.toContain('mobile-bottom-nav');
  });

  it('resets the shell scroller on navigation instead of the (non-scrolling) window', () => {
    const source = readFileSync(join(__dirname, 'AppLayout.tsx'), 'utf8');
    const resetRef = source.match(/useScrollContainerReset\((\w+)\)/)?.[1];
    expect(resetRef).toBeDefined();
    expect(source).toMatch(new RegExp(`<main\\b[^>]*ref=\\{${resetRef}\\}`));
    expect(source).not.toMatch(/window\.scrollTo/);
  });
});
