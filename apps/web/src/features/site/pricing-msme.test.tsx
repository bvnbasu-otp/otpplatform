import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PricingPage } from './pages/PricingPage';
import { SUBSCRIPTION_TIERS } from '@otp/domain';

vi.mock('@/lib/supabase', () => {
  const globalMock = (globalThis as { __SHARED_SUPABASE_MOCK__?: Record<string, unknown> }).__SHARED_SUPABASE_MOCK__ || {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: {
      getUser: vi.fn(),
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe() {} } } })),
    },
  };
  (globalThis as { __SHARED_SUPABASE_MOCK__?: Record<string, unknown> }).__SHARED_SUPABASE_MOCK__ = globalMock;
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

function renderPricingPage(): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/pricing']}>
      <PricingPage />
    </MemoryRouter>,
  );
}

function pageText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('PricingPage (Canonical 3 Tiers: Individual, RWA, MSME)', () => {
  it('instantiates PricingPage component cleanly', () => {
    const element = React.createElement(PricingPage, {});
    expect(element).toBeDefined();
    expect(element.type).toBe(PricingPage);
  });

  it('validates canonical frozen pricing constants including persona-specific extra RFQ top-up rates', () => {
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.monthlyPrice).toBe(199);
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.yearlyPrice).toBe(1999);
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.monthlyRfqs).toBe(3);
    expect(SUBSCRIPTION_TIERS.INDIVIDUAL.additionalRfqPrice).toBe(149);

    expect(SUBSCRIPTION_TIERS.RWA.monthlyPrice).toBe(1499);
    expect(SUBSCRIPTION_TIERS.RWA.yearlyPrice).toBe(14999);
    expect(SUBSCRIPTION_TIERS.RWA.monthlyRfqs).toBe(3);
    expect(SUBSCRIPTION_TIERS.RWA.additionalRfqPrice).toBe(999);

    expect(SUBSCRIPTION_TIERS.MSME.monthlyPrice).toBe(1999);
    expect(SUBSCRIPTION_TIERS.MSME.yearlyPrice).toBe(19999);
    expect(SUBSCRIPTION_TIERS.MSME.monthlyRfqs).toBe(3);
    expect(SUBSCRIPTION_TIERS.MSME.additionalRfqPrice).toBe(1499);
  });

  it('validates controlled pilot commercial mode disclosure copy and referral incentives', () => {
    const pilotNotice = 'Pilot Mode — No real payment will be charged during this pilot.';
    expect(pilotNotice).toContain('Pilot Mode');
    expect(pilotNotice).toContain('No real payment');
  });

  it('publishes persona referral amounts and omits legacy supplier wallet claims', () => {
    const text = pageText(renderPricingPage());
    expect(text).toContain('Individual ₹10');
    expect(text).toContain('RWA ₹25');
    expect(text).toContain('MSME ₹50');
    expect(text).toContain('Supplier ₹100');
    expect(text).not.toMatch(/Supplier Cashback/i);
    expect(text).not.toMatch(/Supplier Share in Success/i);
    expect(text).not.toMatch(/withdrawable/i);
    expect(text).not.toMatch(/wallet used for supplier settlement/i);
    expect(text.replace(/not cash withdrawal/gi, '')).not.toMatch(/cash withdrawal/i);
    expect(text).not.toMatch(/Tally|Zoho|double-entry/i);
    expect(text.replace(/does not pay Success Cashback/gi, '')).not.toMatch(/Success Cashback/i);
    expect(text).not.toMatch(/Verified Supplier/i);
    expect(text).not.toMatch(/5 RFQ|>90%/i);
    expect(text).toContain('This pilot does not charge that fee');
    expect(text).not.toMatch(/free forever/i);
    expect(text).toContain('This pilot does not pay Success Cashback or referral cash');
  });
});
