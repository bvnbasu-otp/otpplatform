import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('subscription payment simulation', () => {
  const modal = readFileSync(resolve(__dirname, 'components/SubscriptionPaymentModal.tsx'), 'utf8');
  const api = readFileSync(resolve(__dirname, 'api/subscription.ts'), 'utf8');

  it('does not treat a client payment reference as an activated expiry', () => {
    expect(api).toContain('entitlementGranted: false');
    expect(api).toContain('newExpiresAt: null');
    expect(api).not.toContain('Payment verified and plan activated');
    expect(modal).toContain('does not change the stored plan');
    expect(modal).not.toContain('paymentResult.newExpiresAt');
    expect(modal).not.toContain('Sourcing Entitlement Successfully Activated');
    expect(modal).toContain('Unchanged');
  });
});
