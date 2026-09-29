import { describe, expect, it } from 'vitest';
import {
  REFERRAL_BONUS_INR_BY_REFERRED_PROFILE,
  referralBonusInrForReferredProfile,
  resolveWalletOrganizationId,
  walletPersonaFromPortalSide,
} from './persona-wallet';

describe('persona wallet entitlement', () => {
  it('maps referred profile kinds to golden referral amounts (application layer)', () => {
    expect(referralBonusInrForReferredProfile('INDIVIDUAL')).toBe(10);
    expect(referralBonusInrForReferredProfile('RWA')).toBe(25);
    expect(referralBonusInrForReferredProfile('MSME')).toBe(50);
    expect(referralBonusInrForReferredProfile('SUPPLIER')).toBe(100);
    expect(REFERRAL_BONUS_INR_BY_REFERRED_PROFILE.INDIVIDUAL).toBe(10);
  });

  it('binds wallet persona to reconciled portal side', () => {
    expect(walletPersonaFromPortalSide('SUPPLIER')).toBe('SUPPLIER');
    expect(walletPersonaFromPortalSide('BUYER')).toBe('BUYER');
    expect(walletPersonaFromPortalSide(null)).toBe('BUYER');
  });

  it('supplier wallet query skips personal INDIVIDUAL buyer org when a supplier org exists', () => {
    const walletOrgId = resolveWalletOrganizationId({
      portalSide: 'SUPPLIER',
      organizationId: 'buyer-personal-org',
      supplierId: 'sup-1',
      organizations: [
        { id: 'buyer-personal-org', orgType: 'INDIVIDUAL', isPersonal: true },
        { id: 'supplier-business-org', orgType: 'MSME', isPersonal: false },
      ],
    });
    expect(walletOrgId).toBe('supplier-business-org');
  });

  it('buyer wallet query uses active buyer organization id', () => {
    const walletOrgId = resolveWalletOrganizationId({
      portalSide: 'BUYER',
      organizationId: 'buyer-personal-org',
      organizations: [{ id: 'buyer-personal-org', orgType: 'INDIVIDUAL', isPersonal: true }],
    });
    expect(walletOrgId).toBe('buyer-personal-org');
  });

  it('supplier persona does not resolve personal INDIVIDUAL buyer org when it is the only org', () => {
    const walletOrgId = resolveWalletOrganizationId({
      portalSide: 'SUPPLIER',
      organizationId: 'buyer-personal-org',
      supplierId: 'sup-1',
      organizations: [{ id: 'buyer-personal-org', orgType: 'INDIVIDUAL', isPersonal: true }],
    });
    expect(walletOrgId).toBeNull();
  });

  it('supplier persona does not silently inherit active organizationId when it is INDIVIDUAL buyer', () => {
    const walletOrgId = resolveWalletOrganizationId({
      portalSide: 'SUPPLIER',
      organizationId: 'buyer-personal-org',
      organizations: [
        { id: 'buyer-personal-org', orgType: 'INDIVIDUAL', isPersonal: true },
      ],
    });
    expect(walletOrgId).toBeNull();
  });

  it('dual-org user: buyer persona uses buyer wallet org', () => {
    const orgs = [
      { id: 'buyer-personal-org', orgType: 'INDIVIDUAL', isPersonal: true },
      { id: 'supplier-business-org', orgType: 'MSME', isPersonal: false },
    ];
    expect(
      resolveWalletOrganizationId({
        portalSide: 'BUYER',
        organizationId: 'buyer-personal-org',
        organizations: orgs,
      }),
    ).toBe('buyer-personal-org');
  });

  it('dual-org user: supplier persona uses supplier-capable wallet org', () => {
    const orgs = [
      { id: 'buyer-personal-org', orgType: 'INDIVIDUAL', isPersonal: true },
      { id: 'supplier-business-org', orgType: 'MSME', isPersonal: false },
    ];
    expect(
      resolveWalletOrganizationId({
        portalSide: 'SUPPLIER',
        organizationId: 'buyer-personal-org',
        supplierId: 'sup-1',
        organizations: orgs,
      }),
    ).toBe('supplier-business-org');
  });
});
