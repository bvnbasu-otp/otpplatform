import { describe, expect, it } from 'vitest';
import { walletEntitlementFromContext } from './use-wallet-entitlement';
import type { RoleContext } from '@/features/roles';

const baseContext: RoleContext = {
  signedIn: true,
  isPlatformAdmin: false,
  needsOnboarding: false,
  activeRole: null,
  roles: [],
  profileId: 'prof-1',
  email: 'user@example.com',
  fullName: 'Test User',
  side: 'BUYER',
  organizationId: 'org-buyer-personal',
  organizationName: 'Personal',
  orgRole: 'OWNER',
  supplierId: null,
  buyerType: 'INDIVIDUAL',
  committeeRfqCount: 0,
  organizations: [
    {
      id: 'org-buyer-personal',
      orgType: 'INDIVIDUAL',
      isPersonal: true,
      name: 'Personal',
      role: 'OWNER',
    },
    { id: 'org-msme', orgType: 'MSME', isPersonal: false, name: 'MSME Co', role: 'OWNER' },
  ],
  title: null,
  avatarUrl: null,
  phone: null,
};

describe('walletEntitlementFromContext', () => {
  it('binds buyer persona to buyer refer side and active org wallet', () => {
    const ent = walletEntitlementFromContext(baseContext);
    expect(ent.walletPersona).toBe('BUYER');
    expect(ent.referSide).toBe('buyer');
    expect(ent.entitledWalletOrgId).toBe('org-buyer-personal');
  });

  it('binds supplier persona to non-individual wallet org and supplier refer side', () => {
    const ent = walletEntitlementFromContext({
      ...baseContext,
      side: 'SUPPLIER',
      organizationId: 'org-buyer-personal',
      supplierId: 'sup-1',
    });
    expect(ent.walletPersona).toBe('SUPPLIER');
    expect(ent.referSide).toBe('supplier');
    expect(ent.entitledWalletOrgId).toBe('org-msme');
  });

  it('dual persona: buyer active uses buyer wallet org', () => {
    const ent = walletEntitlementFromContext({ ...baseContext, side: 'BUYER' });
    expect(ent.entitledWalletOrgId).toBe('org-buyer-personal');
    expect(ent.referSide).toBe('buyer');
  });

  it('dual persona: supplier active uses supplier wallet org not buyer personal', () => {
    const ent = walletEntitlementFromContext({
      ...baseContext,
      side: 'SUPPLIER',
      organizationId: 'org-buyer-personal',
      supplierId: 'sup-1',
    });
    expect(ent.entitledWalletOrgId).toBe('org-msme');
    expect(ent.entitledWalletOrgId).not.toBe('org-buyer-personal');
    expect(ent.referSide).toBe('supplier');
  });

  it('supplier with no valid supplier org leaves wallet unresolved and does not use buyer org id', () => {
    const ent = walletEntitlementFromContext({
      ...baseContext,
      side: 'SUPPLIER',
      organizationId: 'org-buyer-personal',
      supplierId: 'sup-1',
      organizations: [
        {
          id: 'org-buyer-personal',
          orgType: 'INDIVIDUAL',
          isPersonal: true,
          name: 'Personal',
          role: 'OWNER',
        },
      ],
    });
    expect(ent.entitledWalletOrgId).toBeNull();
    expect(ent.referIdentifier).toBe('sup-1');
    expect(ent.referIdentifier).not.toBe('org-buyer-personal');
  });

  it('does not give a platform role the customer procurement wallet', () => {
    const ent = walletEntitlementFromContext({
      ...baseContext,
      isPlatformAdmin: true,
      isFounder: true,
      organizationId: 'org-buyer-personal',
    });
    expect(ent.customerWalletAllowed).toBe(false);
    expect(ent.entitledWalletOrgId).toBeNull();
    expect(ent.referIdentifier).toBe('user@example.com');
  });
});
