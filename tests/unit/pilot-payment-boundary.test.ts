import { describe, expect, it } from 'vitest';
import { pilotWebhookDisposition } from '../../supabase/functions/payment-webhook/pilot-payment-boundary';

describe('pilot payment webhook boundary', () => {
  it('refuses a gateway event that targets a procurement invoice', () => {
    const decision = pilotWebhookDisposition({ paymentType: 'INVOICE' });
    expect(decision.recordSubscription).toBe(false);
    expect(decision.recordProcurementInvoice).toBe(false);
    expect(decision.reason).toMatch(/off-platform/i);
  });

  it('still allows a subscription event that does not settle a procurement invoice', () => {
    const decision = pilotWebhookDisposition({ paymentType: 'SUBSCRIPTION' });
    expect(decision.recordSubscription).toBe(true);
    expect(decision.recordProcurementInvoice).toBe(false);
  });
});
