import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { MobileBottomNav } from '@/components/MobileBottomNav';

const harness = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: harness.user, signOut: vi.fn(), isAuthenticated: Boolean(harness.user), isLoading: false }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      signedIn: Boolean(harness.user),
      profileId: harness.user ? 'profile-1' : null,
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
      buyerType: harness.user ? 'INDIVIDUAL' : null,
      committeeRfqCount: 0,
      supplierId: null,
      fullName: null,
      title: null,
      avatarUrl: null,
      email: harness.user?.email ?? null,
    },
    switchTo: vi.fn(),
    switchOrg: vi.fn(),
  }),
}));

vi.mock('@/features/roles/api/roles', () => ({
  hasMultipleRoles: () => false,
  hasMultipleOrganizations: () => false,
}));

vi.mock('@/features/roles/customer-procurement-access', () => ({
  canOfferCustomerRequirementCreation: () => false,
  isInternalOperatorContext: () => false,
}));

vi.mock('@/features/supplier', () => ({ SupplierCapabilityModal: () => null }));
vi.mock('@/features/portal', () => ({ QuickRegisterModal: () => null }));
vi.mock('@/features/intake', () => ({ VoiceTextRequirementIntakeModal: () => null }));
vi.mock('@/features/profile', () => ({ ProfileEditModal: () => null }));
vi.mock('@/features/roles/components/ChangePasswordModal', () => ({ ChangePasswordModal: () => null }));
vi.mock('@/features/support', () => ({ SupportHelpButtonModal: () => <button type="button">Help</button> }));

const LANGUAGE_MARKERS = ['data-testid="language-switcher', 'Select Language', 'role="listbox"', 'lang-option-', 'lang-btn-'];

function renderPublic(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <SiteHeader />
      <SiteFooter />
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

function expectNoLanguageSelector(html: string) {
  for (const marker of LANGUAGE_MARKERS) expect(html).not.toContain(marker);
}

describe('public language selector is removed (desktop and mobile)', () => {
  it.each(['/', '/pricing', '/about-us', '/faqs', '/contact-us', '/login', '/signup', '/legal/privacy'])(
    'signed-out %s renders no language selector in the shared header, footer or mobile bottom nav',
    (path) => {
      harness.user = null;
      expectNoLanguageSelector(renderPublic(path));
    },
  );

  it('a signed-in visitor on a public page sees no public language selector either', () => {
    harness.user = { id: 'user-1', email: 'asha@example.com' };
    const html = renderPublic('/pricing');
    expectNoLanguageSelector(html);
    harness.user = null;
  });

  it('keeps the public desktop nav, compact mobile nav and sign-in links working', () => {
    harness.user = null;
    const html = renderPublic('/');
    const desktop = html.match(/aria-label="Desktop Navigation"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const bottom = html.match(/aria-label="Mobile Bottom Navigation"[\s\S]*?<\/nav>/)?.[0] ?? '';
    for (const href of ['href="/"', 'href="/pricing"', 'href="/about-us"', 'href="/faqs"']) {
      expect(desktop).toContain(href);
      expect(bottom).toContain(href);
    }
    expect(html).toContain('data-testid="header-log-in"');
    expect(html).toContain('data-testid="header-register"');
    expect(html).not.toContain('>Help<');
  });

  it('keeps the signed-in mobile menu toggle with its expanded state and controlled region', () => {
    harness.user = { id: 'user-1', email: 'asha@example.com' };
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/pricing']}>
        <SiteHeader />
      </MemoryRouter>,
    );
    expect(html).toContain('aria-label="Toggle navigation menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="site-header-mobile-menu"');
    harness.user = null;
  });

  it('the shared header no longer imports the switcher, and leaves no empty slot behind', () => {
    const source = readFileSync(resolve(__dirname, 'components/SiteHeader.tsx'), 'utf8');
    expect(source).not.toContain('LanguageSwitcher');
    expect(source).not.toContain('useLanguage');
  });
});

describe('the authenticated language selectors are preserved', () => {
  const src = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8');

  it('profile keeps the full language selector', () => {
    const profile = src('features/profile/pages/ProfilePage.tsx');
    expect(profile).toContain("import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher'");
    expect(profile).toContain('<LanguageSwitcher variant="full" placement="menu" />');
  });

  it('the signed-in workspace header, its menu and the account sheet keep theirs', () => {
    expect(src('features/navigation/components/WorkspaceHeader.tsx')).toContain('<LanguageSwitcher placement="header" />');
    expect(src('features/navigation/components/WorkspaceHeaderMenu.tsx')).toContain('<LanguageSwitcher variant="full" placement="menu" />');
    expect(src('components/MobileBottomNav.tsx')).toContain('<LanguageSwitcher variant="full" placement="menu" />');
  });

  it('the switcher component and its translation keys still exist', () => {
    const switcher = src('components/ui/LanguageSwitcher.tsx');
    expect(switcher).toContain("t('language.selectLanguage', 'Select Language')");
    expect(switcher).toContain('setLanguage(code)');
  });
});
