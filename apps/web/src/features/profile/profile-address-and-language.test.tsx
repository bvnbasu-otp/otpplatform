import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RoleContext } from '@/features/roles/api/roles';
import { RoleContextContext } from '@/features/roles/hooks/use-role-context';
import { ProfilePage } from './pages/ProfilePage';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'person@example.com' },
    isAuthenticated: true,
    isLoading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock('@/features/theme', () => ({
  useTheme: () => ({
    theme: 'light',
    resolvedTheme: 'light',
    colorTheme: 'indigo',
    persona: 'buyer',
    setTheme: () => {},
    setColorTheme: () => {},
  }),
  ThemeBottomSheet: () => null,
}));

function context(overrides: Partial<RoleContext> = {}): RoleContext {
  return {
    signedIn: true,
    profileId: 'profile-1',
    side: 'BUYER',
    isPlatformAdmin: false,
    isFounder: false,
    needsOnboarding: false,
    activeRole: {
      code: 'OWNER',
      side: 'BUYER',
      label: 'Buyer',
      description: 'Customer buyer',
      permissions: ['READ', 'WRITE'],
    },
    roles: [],
    organizations: [],
    orgRole: 'OWNER',
    organizationId: 'org-1',
    organizationName: 'Palm Grove',
    buyerType: 'INDIVIDUAL',
    committeeRfqCount: 0,
    supplierId: null,
    fullName: 'Asha Buyer',
    title: null,
    avatarUrl: null,
    email: 'asha@example.com',
    phone: null,
    ...overrides,
  };
}

function renderProfile(role: RoleContext, tab: 'addresses' | 'preferences'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/profile?tab=${tab}`]}>
      <RoleContextContext.Provider
        value={{
          context: role,
          isLoading: false,
          refresh: async () => {},
          switchTo: async () => ({ ok: true }),
          switchOrg: async () => ({ ok: true }),
        }}
      >
        <ProfilePage />
      </RoleContextContext.Provider>
    </MemoryRouter>,
  );
}

describe('profile address book and language preference', () => {
  it('shows the buyer address book to an Individual buyer and the supplier business address to a supplier', () => {
    const buyer = renderProfile(context({ buyerType: 'INDIVIDUAL', organizationId: null }), 'addresses');
    expect(buyer).toContain('Address Book');
    expect(buyer).not.toContain('Business address');
    expect(buyer).toContain('Personal Delivery Addresses');
    expect(buyer).not.toContain('data-testid="supplier-business-address-panel"');

    const supplier = renderProfile(context({
      side: 'SUPPLIER',
      buyerType: null,
      organizationId: null,
      supplierId: 'supplier-1',
      activeRole: {
        code: 'OWNER',
        side: 'SUPPLIER',
        label: 'Supplier',
        description: 'Supplier owner',
        permissions: ['READ', 'WRITE'],
      },
    }), 'addresses');
    expect(supplier).toContain('Business address');
    expect(supplier).not.toContain('>Address Book<');
    expect(supplier).toContain('data-testid="supplier-business-address-panel"');
    expect(supplier).toContain('statutory GST registered address');
    expect(supplier).not.toContain('Personal Delivery Addresses');
  });

  it('hides the address tab from an internal operator', () => {
    const html = renderProfile(context({
      side: 'CONSOLE',
      isPlatformAdmin: true,
      buyerType: null,
      organizationId: null,
    }), 'preferences');
    expect(html).not.toContain('Address Book');
    expect(html).not.toContain('Business address');
    expect(html).not.toContain('data-testid="supplier-business-address-panel"');
  });

  it('uses the same full language switcher as the header menu and keeps legal copy untranslated', () => {
    const html = renderProfile(context({ buyerType: 'RWA' }), 'preferences');
    expect(html).toContain('data-testid="profile-language-preference"');
    expect(html).toContain('data-testid="language-switcher-full"');
    expect(html).toContain('The same preference used in the header and mobile menu.');
    expect(html).toContain('saved for this account only');
    expect(html).toContain('data-testid="legal-agreements-eula-card"');
    expect(html).toContain('data-no-translate="true"');
  });

  it('renders dedicated Help & Support and Activity & Audit Trail sections under preferences tab', () => {
    const html = renderProfile(context({ buyerType: 'RWA' }), 'preferences');
    expect(html).toContain('data-testid="profile-support-section"');
    expect(html).toContain('data-testid="profile-open-support-btn"');
    expect(html).toContain('data-testid="profile-activity-section"');
    expect(html).toContain('data-testid="profile-view-activity-btn"');
  });
});