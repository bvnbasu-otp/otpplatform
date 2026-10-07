import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './pages/ProfilePage';

const roleFlags = vi.hoisted(() => ({
  isPlatformAdmin: false,
  isFounder: false,
}));

const baseRoleContext = {
  signedIn: true,
  isPlatformAdmin: false,
  isFounder: false,
  needsOnboarding: false,
  activeRole: null,
  roles: [],
  profileId: 'prof-1',
  email: 'user@example.com',
  fullName: 'Test User',
  side: 'BUYER' as const,
  organizationId: 'org-buyer-personal',
  organizationName: 'Personal',
  orgRole: 'OWNER' as const,
  supplierId: null,
  buyerType: 'INDIVIDUAL' as const,
  committeeRfqCount: 0,
  organizations: [
    {
      id: 'org-buyer-personal',
      orgType: 'INDIVIDUAL',
      isPersonal: true,
      name: 'Personal',
      role: 'OWNER' as const,
    },
  ],
  title: null,
  avatarUrl: null,
  phone: null,
};

vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' } }),
}));

vi.mock('@/features/roles', () => ({
  useRoleContext: () => ({
    context: {
      ...baseRoleContext,
      isPlatformAdmin: roleFlags.isPlatformAdmin,
      isFounder: roleFlags.isFounder,
    },
    refresh: vi.fn(),
    switchOrg: vi.fn(),
    switchTo: vi.fn(),
  }),
}));

vi.mock('@/features/theme', () => ({
  useTheme: () => ({ theme: 'light', resolvedTheme: 'light', colorTheme: 'default' }),
  ThemeBottomSheet: () => null,
}));

vi.mock('@/features/subscription', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/subscription')>();
  return {
    ...actual,
    useWalletEntitlement: () => ({
      walletPersona: 'BUYER' as const,
      isSupplierPersona: false,
      entitledWalletOrgId: null,
      referSide: 'buyer' as const,
      referIdentifier: 'user-1',
      referOrgName: 'Personal',
    }),
    fetchOrganizationSubscription: vi.fn().mockResolvedValue({ ok: false }),
  };
});

vi.mock('./api/profile', () => ({
  fetchMyProfile: vi.fn().mockResolvedValue({ ok: false }),
  updateMyProfile: vi.fn(),
  updateOrganizationName: vi.fn(),
  requestProfileCredentialOtp: vi.fn(),
  verifyAndUpdateProfileCredential: vi.fn(),
}));

vi.mock('@/features/requirement/api/requirements', () => ({
  fetchUserOrganization: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock('@/features/org/api/org-members', () => ({
  listOrgMembers: vi.fn().mockResolvedValue({ ok: true, members: [] }),
  inviteOrgMember: vi.fn(),
  removeOrgMember: vi.fn(),
}));

vi.mock('@/features/roles/components/ChangePasswordModal', () => ({
  ChangePasswordModal: () => null,
}));

const CUSTOMER_WALLET = 'data-testid="otp-wallet-credits-widget"';

function renderProfile(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/profile?tab=profile']}>
      <ProfilePage />
    </MemoryRouter>,
  );
}

describe('ProfilePage customer wallet visibility', () => {
  beforeEach(() => {
    roleFlags.isPlatformAdmin = false;
    roleFlags.isFounder = false;
  });

  it('hides the customer wallet when the viewer is a platform admin', () => {
    roleFlags.isPlatformAdmin = true;
    roleFlags.isFounder = false;

    const html = renderProfile();
    expect(html).toContain('User Profile');
    expect(html).not.toContain(CUSTOMER_WALLET);
    expect(html).not.toContain('OTP Buyer Wallet');
  });

  it('hides the customer wallet when the viewer is a founder', () => {
    roleFlags.isPlatformAdmin = false;
    roleFlags.isFounder = true;

    const html = renderProfile();
    expect(html).toContain('User Profile');
    expect(html).not.toContain(CUSTOMER_WALLET);
    expect(html).not.toContain('OTP Buyer Wallet');
  });

  it('keeps the customer wallet eligible when the viewer is neither platform admin nor founder', () => {
    roleFlags.isPlatformAdmin = false;
    roleFlags.isFounder = false;

    const html = renderProfile();
    expect(html).toContain(CUSTOMER_WALLET);
    expect(html).toContain('data-wallet-persona="BUYER"');
    expect(html).toContain('OTP Buyer Wallet');
  });
});
