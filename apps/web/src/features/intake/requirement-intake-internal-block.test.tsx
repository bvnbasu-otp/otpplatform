import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RoleContext } from '@/features/roles/api/roles';
import { RoleContextContext } from '@/features/roles/hooks/use-role-context';
import { RequirementIntakePage } from './pages/RequirementIntakePage';

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);

vi.mock('@/features/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'person@example.com' },
    isLoading: false,
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

function renderIntake(role: RoleContext): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/intake']}>
      <RoleContextContext.Provider
        value={{
          context: role,
          isLoading: false,
          refresh: async () => {},
          switchTo: async () => ({ ok: true }),
          switchOrg: async () => ({ ok: true }),
        }}
      >
        <RequirementIntakePage />
      </RoleContextContext.Provider>
    </MemoryRouter>,
  );
}

describe('requirement intake internal block', () => {
  it('stops super admin, founder, and internal role codes before the intake form', () => {
    const cases: RoleContext[] = [
      context({ isPlatformAdmin: true, side: 'CONSOLE', buyerType: null, organizationId: null }),
      context({ isFounder: true, side: 'BUYER', buyerType: 'INDIVIDUAL', organizationId: null }),
      context({
        side: 'CONSOLE',
        buyerType: null,
        organizationId: null,
        activeRole: {
          code: 'INTERNAL_OPERATOR',
          side: 'CONSOLE',
          label: 'Operator',
          description: 'Internal operations',
          permissions: ['READ'],
        },
      }),
    ];

    for (const role of cases) {
      const html = renderIntake(role);
      expect(html).toContain('data-testid="intake-internal-blocked"');
      expect(html).toContain('Requirement creation is not available for internal accounts');
      expect(html).toContain('href="/admin"');
      expect(html).toContain('Return to the console');
      expect(html).not.toContain('data-testid="requirement-intake-page"');
    }
  });

  it('leaves the intake page available for Individual, RWA, and MSME buyers', () => {
    for (const buyerType of ['INDIVIDUAL', 'RWA', 'MSME'] as const) {
      const html = renderIntake(context({
        buyerType,
        organizationId: buyerType === 'INDIVIDUAL' ? null : 'org-buyer',
        side: 'BUYER',
        isPlatformAdmin: false,
        isFounder: false,
      }));
      expect(html).toContain('data-testid="requirement-intake-page"');
      expect(html).toContain('Loading requirement intake');
      expect(html).not.toContain('data-testid="intake-internal-blocked"');
    }
  });
});
