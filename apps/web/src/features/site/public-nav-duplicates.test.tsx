import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SiteHeader } from './components/SiteHeader';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { MobileBottomNav } from '@/components/MobileBottomNav';

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: null, signOut: vi.fn(), isAuthenticated: false, isLoading: false }),
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
vi.mock('@/features/support', () => ({ SupportHelpButtonModal: () => null }));
vi.mock('@/lib/i18n', () => ({ useLanguage: () => ({ t: (_key: string, fallback: string) => fallback }) }));
vi.mock('@/components/ui/LanguageSwitcher', () => ({ LanguageSwitcher: () => null }));

function renderPublic(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/']}>
      <SiteHeader />
      <SiteFooter />
      <MobileBottomNav />
    </MemoryRouter>,
  );
}

function countText(html: string, label: string): number {
  return html.split(`>${label}<`).length - 1;
}

describe('public navigation is one landmark per viewport', () => {
  it('gives signed-out visitors one desktop nav and one compact mobile nav, with no authenticated controls', () => {
    const html = renderPublic();
    expect(html.match(/aria-label="Desktop Navigation"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Mobile Bottom Navigation"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Mobile Navigation"/g) ?? []).toHaveLength(0);
    expect(html.match(/aria-label="Footer Navigation"/g) ?? []).toHaveLength(0);
    expect(html).toContain('hidden md:flex');
    expect(html).toContain('md:hidden');
    expect(html).not.toContain('Toggle navigation menu');
    expect(html).not.toContain('>Profile<');
    expect(html).not.toContain('Dashboard');
    expect(html).not.toContain('Notification');
    const desktop = html.match(/aria-label="Desktop Navigation"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const bottom = html.match(/aria-label="Mobile Bottom Navigation"[\s\S]*?<\/nav>/)?.[0] ?? '';
    for (const label of ['Home', 'Pricing', 'About Us', 'FAQs']) {
      expect(countText(desktop, label)).toBe(1);
      expect(countText(bottom, label)).toBe(1);
    }
    expect(countText(desktop, 'Get Started')).toBe(1);
    expect(countText(bottom, 'Get Started')).toBe(1);
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer).not.toContain('href="/signup"');
    expect(footer).not.toContain('>Home<');
  });

  it('keeps the signed-in mobile menu toggle accessible: expanded state, controlled region, and Escape to close', () => {
    const source = readFileSync(resolve(__dirname, 'components/SiteHeader.tsx'), 'utf8');
    expect(source).toContain('aria-expanded={isMenuOpen}');
    expect(source).toContain('aria-controls="site-header-mobile-menu"');
    expect(source).toContain('id="site-header-mobile-menu"');
    expect(source).toMatch(/event\.key !== 'Escape'[\s\S]*setIsMenuOpen\(false\)/);
  });
});
