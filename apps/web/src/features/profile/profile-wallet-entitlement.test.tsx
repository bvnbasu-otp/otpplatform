import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ProfilePage } from './pages/ProfilePage';

const walletEntitlement = vi.hoisted(() => ({
  walletPersona: 'BUYER' as 'BUYER' | 'SUPPLIER',
  isSupplierPersona: false,
  entitledWalletOrgId: null as string | null,
  referSide: 'buyer' as 'buyer' | 'supplier',
  referIdentifier: 'user-1',
  referOrgName: 'Personal',
}));

const baseRoleContext = {
  signedIn: true,
  isPlatformAdmin: false,
  needsOnboarding: false,
  activeRole: null,
  roles: [],
  profileId: 'prof-1',
  email: 'user@example.com',
  fullName: 'Test User',
  side: 'BUYER' as 'BUYER' | 'SUPPLIER',
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
    context: { ...baseRoleContext, side: walletEntitlement.isSupplierPersona ? 'SUPPLIER' : 'BUYER' },
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
      walletPersona: walletEntitlement.walletPersona,
      isSupplierPersona: walletEntitlement.isSupplierPersona,
      entitledWalletOrgId: walletEntitlement.entitledWalletOrgId,
      referSide: walletEntitlement.referSide,
      referIdentifier: walletEntitlement.referIdentifier,
      referOrgName: walletEntitlement.referOrgName,
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

function renderProfile(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/profile?tab=profile']}>
      <ProfilePage />
    </MemoryRouter>,
  );
}

function walletSection(html: string): string {
  const start = html.indexOf('data-testid="otp-wallet-credits-widget"');
  expect(start).toBeGreaterThanOrEqual(0);
  const footnote = html.indexOf('* OTP Wallet balances', start);
  return footnote > start ? html.slice(start, footnote + 160) : html.slice(start, start + 8000);
}

describe('ProfilePage wallet entitlement binding', () => {
  beforeEach(() => {
    walletEntitlement.walletPersona = 'BUYER';
    walletEntitlement.isSupplierPersona = false;
    walletEntitlement.entitledWalletOrgId = null;
    walletEntitlement.referSide = 'buyer';
    walletEntitlement.referIdentifier = 'user-1';
    walletEntitlement.referOrgName = 'Personal';
  });

  it('shows buyer Success Cashback and Referral Bonus for buyer entitlement', () => {
    const section = walletSection(renderProfile());
    expect(section).toContain('data-wallet-persona="BUYER"');
    expect(section).toContain('Success Cashback');
    expect(section).toContain('Referral Bonus');
    expect(section).not.toContain('Success Reward');
    expect(section).not.toContain('Supplier Cashback');
  });

  it('shows supplier Referral Bonus and Success Reward without buyer cashback labels', () => {
    walletEntitlement.walletPersona = 'SUPPLIER';
    walletEntitlement.isSupplierPersona = true;
    walletEntitlement.referSide = 'supplier';
    walletEntitlement.entitledWalletOrgId = null;
    walletEntitlement.referOrgName = 'MSME Co';

    const section = walletSection(renderProfile());
    expect(section).toContain('data-wallet-persona="SUPPLIER"');
    expect(section).toContain('Referral Bonus');
    expect(section).toContain('Success Reward');
    expect(section).toContain('₹100');
    expect(section).not.toContain('Success Cashback');
    expect(section).not.toContain('Supplier Cashback');
  });
});
