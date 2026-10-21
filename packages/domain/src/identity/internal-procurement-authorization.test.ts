import { describe, expect, it } from 'vitest';
import { evaluateAuthorizationChain, type AuthorizationContext } from './authorization-chain';

const internalAdmin: AuthorizationContext = {
  personId: 'person-admin',
  isAuthenticated: true,
  persona: 'PLATFORM_ADMIN',
  isPlatformAdmin: true,
  isFounder: true,
  email: 'operator@otp.example',
};

describe('internal operators cannot create customer procurement', () => {
  it('denies requirement, RFQ, and purchase-order creation while still allowing audit inspection', () => {
    for (const action of ['CREATE_REQUIREMENT', 'CREATE_RFQ', 'ISSUE_PO'] as const) {
      const result = evaluateAuthorizationChain(internalAdmin, { action });
      expect(result.authorized).toBe(false);
      expect(result.failureReason).toContain('Internal operators cannot create');
    }

    const audit = evaluateAuthorizationChain(internalAdmin, { action: 'ADMIN_AUDIT_INSPECT' });
    expect(audit.authorized).toBe(true);
    expect(audit.signatureMode).toBe('ADMIN_OVERRIDE');
  });

  it('still authorizes an individual buyer to create an RFQ', () => {
    const buyer: AuthorizationContext = {
      personId: 'person-buyer',
      isAuthenticated: true,
      persona: 'INDIVIDUAL',
      organizationId: null,
    };
    const result = evaluateAuthorizationChain(buyer, { action: 'CREATE_RFQ' });
    expect(result.authorized).toBe(true);
  });
});
