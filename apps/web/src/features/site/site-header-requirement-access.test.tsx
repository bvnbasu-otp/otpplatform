import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RoleContext } from '@/features/roles/api/roles';
import { RoleContextContext } from '@/features/roles/hooks/use-role-context';
import { SiteHeader } from './components/SiteHeader';

const harness = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
}));

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    user: harness.user,
    isAuthenticated: Boolean(harness.user),
    isLoading: false,
    signOut: vi.fn(),
  }),
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
    organizationId: null,
    organizationName: null,
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

function renderHeader(role: RoleContext, path = '/'): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <RoleContextContext.Provider
        value={{
          context: role,
          isLoading: false,
          refresh: async () => {},
          switchTo: async () => ({ ok: true }),
          switchOrg: async () => ({ ok: true }),
        }}
      >
        <SiteHeader />
      </RoleContextContext.Provider>
    </MemoryRouter>,
  );
}

describe('site header requirement access', () => {
  it('offers Post Need to signed-in Individual, RWA, and MSME buyers and shows the header language switcher', () => {
    harness.user = { id: 'user-1', email: 'asha@example.com' };
    for (const buyerType of ['INDIVIDUAL', 'RWA', 'MSME'] as const) {
      const html = renderHeader(context({
        buyerType,
        organizationId: buyerType === 'INDIVIDUAL' ? null : 'org-1',
      }));
      expect(html).toContain('data-testid="header-buyer-create-requirement-btn"');
      expect(html).toContain('Post Need');
      expect(html).not.toContain('data-testid="header-internal-console"');
      expect(html).toContain('data-testid="language-switcher-trigger"');
    }
  });

  it('replaces Post Need with the internal console for a founder or console operator', () => {
    harness.user = { id: 'user-admin', email: 'ops@example.com' };
    const founder = renderHeader(context({
      isFounder: true,
      side: 'BUYER',
      buyerType: 'INDIVIDUAL',
    }));
    expect(founder).toContain('data-testid="header-internal-console"');
    expect(founder).toContain('href="/admin"');
    expect(founder).not.toContain('Post Need');
    expect(founder).toContain('data-testid="language-switcher-trigger"');

    const support = renderHeader(context({
      side: 'CONSOLE',
      buyerType: null,
      activeRole: {
        code: 'SUPPORT_OPERATOR',
        side: 'CONSOLE',
        label: 'Support',
        description: 'Internal support',
        permissions: ['READ'],
      },
    }));
    expect(support).toContain('data-testid="header-internal-console"');
    expect(support).not.toContain('>Post Need<');
    expect(support).toContain('data-testid="language-switcher-trigger"');
  });

  it('keeps suppliers on capabilities and signed-out visitors on registration', () => {
    harness.user = { id: 'user-supplier', email: 'seller@example.com' };
    const supplier = renderHeader(context({
      side: 'SUPPLIER',
      buyerType: null,
      supplierId: 'supplier-1',
    }), '/supplier/capabilities');
    expect(supplier).toContain('data-testid="header-supplier-capabilities-btn"');
    expect(supplier).toContain('Add Capabilities');
    expect(supplier).not.toContain('Post Need');
    expect(supplier).not.toContain('data-testid="header-internal-console"');
    expect(supplier).toContain('data-testid="language-switcher-trigger"');

    harness.user = null;
    const visitor = renderHeader(context({
      signedIn: false,
      side: null,
      profileId: null,
      activeRole: null,
      email: null,
      fullName: null,
    }));
    expect(visitor).toContain('Get Started');
    expect(visitor).not.toContain('Post Need');
    expect(visitor).not.toContain('data-testid="header-internal-console"');
    expect(visitor).toContain('data-testid="language-switcher-trigger"');
  });
});
