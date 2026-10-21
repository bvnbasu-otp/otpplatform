import { describe, expect, it } from 'vitest';
import type { RoleContext } from './api/roles';
import {
  canOfferCustomerRequirementCreation,
  isInternalOperatorContext,
} from './customer-procurement-access';

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
    fullName: 'Buyer',
    title: null,
    avatarUrl: null,
    email: 'buyer@example.com',
    phone: null,
    ...overrides,
  };
}

describe('customer requirement creation visibility', () => {
  it('keeps creation for Individual, RWA, and MSME buyers', () => {
    expect(canOfferCustomerRequirementCreation(context({ buyerType: 'INDIVIDUAL' }))).toBe(true);
    expect(canOfferCustomerRequirementCreation(context({ buyerType: 'RWA', organizationId: 'org-rwa' }))).toBe(true);
    expect(canOfferCustomerRequirementCreation(context({ buyerType: 'MSME', organizationId: 'org-msme' }))).toBe(true);
  });

  it('hides creation from super admin, founder, console, and internal role codes', () => {
    expect(canOfferCustomerRequirementCreation(context({ isPlatformAdmin: true, side: 'CONSOLE' }))).toBe(false);
    expect(canOfferCustomerRequirementCreation(context({ isFounder: true, side: 'CONSOLE' }))).toBe(false);
    expect(canOfferCustomerRequirementCreation(context({ side: 'CONSOLE' }))).toBe(false);
    expect(canOfferCustomerRequirementCreation(context({
      side: 'CONSOLE',
      activeRole: {
        code: 'SUPPORT_OPERATOR',
        side: 'CONSOLE',
        label: 'Support',
        description: 'Internal',
        permissions: ['READ'],
      },
    }))).toBe(false);
    expect(isInternalOperatorContext(context({
      activeRole: {
        code: 'LEGAL_AUDITOR',
        side: 'CONSOLE',
        label: 'Legal',
        description: 'Internal',
        permissions: ['READ'],
      },
    }))).toBe(true);
  });

  it('does not offer creation to suppliers or signed-out visitors', () => {
    expect(canOfferCustomerRequirementCreation(context({ side: 'SUPPLIER' }))).toBe(false);
    expect(canOfferCustomerRequirementCreation(context({ signedIn: false, side: null }))).toBe(false);
  });
});
