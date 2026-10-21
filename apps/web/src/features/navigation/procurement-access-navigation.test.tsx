import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RoleContext } from '@/features/roles/api/roles';
import { RoleContextContext } from '@/features/roles/hooks/use-role-context';
import { WorkspaceHeaderMenu } from './components/WorkspaceHeaderMenu';
import { getCanonicalHeaderMenuSections } from './navigation-config';

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'person@example.com' },
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

function workspaceLabels(role: RoleContext): string[] {
  return getCanonicalHeaderMenuSections(role)[0]!.items.map((item) => item.label);
}

function renderMenu(role: RoleContext): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <RoleContextContext.Provider
        value={{
          context: role,
          isLoading: false,
          refresh: async () => {},
          switchTo: async () => ({ ok: true }),
          switchOrg: async () => ({ ok: true }),
        }}
      >
        <WorkspaceHeaderMenu isOpen onClose={() => {}} onOpenSupplierCapabilities={() => {}} />
      </RoleContextContext.Provider>
    </MemoryRouter>,
  );
}

describe('workspace navigation requirement access', () => {
  it('points Individual, RWA, and MSME buyers at intake and keeps the shared language control', () => {
    for (const buyerType of ['INDIVIDUAL', 'RWA', 'MSME'] as const) {
      const role = context({
        buyerType,
        organizationId: buyerType === 'INDIVIDUAL' ? null : 'org-1',
      });
      const items = getCanonicalHeaderMenuSections(role)[0]!.items;
      expect(items).toContainEqual(expect.objectContaining({ label: 'New Requirement', to: '/intake' }));

      const html = renderMenu(role);
      expect(html).toContain('data-testid="drawer-buyer-create-requirement"');
      expect(html).toContain('href="/intake"');
      expect(html).not.toContain('data-testid="drawer-internal-console"');
      expect(html).toContain('data-testid="language-switcher-full"');
    }
  });

  it('sends a non-admin internal operator to the console instead of requirement creation', () => {
    const role = context({
      side: 'CONSOLE',
      buyerType: null,
      organizationId: null,
      organizationName: null,
      activeRole: {
        code: 'LEGAL_AUDITOR',
        side: 'CONSOLE',
        label: 'Legal',
        description: 'Internal auditor',
        permissions: ['READ'],
      },
    });

    expect(workspaceLabels(role)).toContain('Internal console');
    expect(workspaceLabels(role)).not.toContain('New Requirement');
    expect(getCanonicalHeaderMenuSections(role)[0]!.items).toContainEqual(
      expect.objectContaining({ label: 'Internal console', to: '/admin' }),
    );

    const html = renderMenu(role);
    expect(html).toContain('data-testid="drawer-internal-console"');
    expect(html).toContain('href="/admin"');
    expect(html).not.toContain('data-testid="drawer-buyer-create-requirement"');
    expect(html).toContain('data-testid="language-switcher-full"');
  });

  it('keeps a supplier on catalog actions and does not offer a customer requirement', () => {
    const role = context({
      side: 'SUPPLIER',
      buyerType: null,
      supplierId: 'supplier-1',
      activeRole: {
        code: 'OWNER',
        side: 'SUPPLIER',
        label: 'Supplier',
        description: 'Supplier owner',
        permissions: ['READ', 'WRITE'],
      },
    });

    expect(workspaceLabels(role)).toContain('Capabilities & Catalog');
    expect(workspaceLabels(role)).not.toContain('New Requirement');

    const html = renderMenu(role);
    expect(html).toContain('data-testid="drawer-supplier-capabilities-btn"');
    expect(html).not.toContain('data-testid="drawer-buyer-create-requirement"');
    expect(html).not.toContain('href="/intake"');
  });

  it('does not give an internal operator who is also on the supplier side a requirement or catalog button', () => {
    const role = context({
      side: 'SUPPLIER',
      isFounder: true,
      buyerType: null,
      supplierId: 'supplier-1',
    });

    const html = renderMenu(role);
    expect(html).toContain('data-testid="drawer-internal-console"');
    expect(html).not.toContain('data-testid="drawer-supplier-capabilities-btn"');
    expect(html).not.toContain('data-testid="drawer-buyer-create-requirement"');
    expect(workspaceLabels(role)).toContain('Capabilities & Catalog');
    expect(workspaceLabels(role)).not.toContain('New Requirement');
  });
});
