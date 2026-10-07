import { describe, expect, it } from 'vitest';
import { hmacSha256Hex } from '../../../../../supabase/functions/_shared/messaging/crypto.ts';
import { verifyAndExtractWebhook } from '../../../../../supabase/functions/payment-webhook/verify-webhook.ts';

describe('Payment Webhook Cryptographic Verification (HMAC-SHA256)', () => {
  const razorpaySecret = 'rzp_sec_live_998877665544332211';
  const stripeSecret = 'whsec_test_stripe_secret_key_12345';

  it('verifies valid Razorpay signature and extracts normalized subscription payload', async () => {
    const body = JSON.stringify({
      event_id: 'evt_rzp_sub_001',
      payload: {
        payment: {
          entity: {
            id: 'pay_rzp_987654321',
            amount: 1000000, // 10,000.00 INR (Enterprise Yearly) in paise
            currency: 'INR',
            notes: {
              organization_id: 'a1111111-2222-3333-4444-555555555555',
              tier: 'TIER_2_ENTERPRISE',
              billing_cycle: 'YEARLY',
              payment_type: 'SUBSCRIPTION',
            },
          },
        },
      },
    });

    const sig = await hmacSha256Hex(razorpaySecret, body);
    const result = await verifyAndExtractWebhook({ 'x-razorpay-signature': sig }, body, { razorpaySecret });

    expect(result.valid).toBe(true);
    expect(result.provider).toBe('RAZORPAY');
    expect(result.eventId).toBe('evt_rzp_sub_001');
    expect(result.extractedPayload?.amount).toBe(10000);
    expect(result.extractedPayload?.tier).toBe('TIER_2_ENTERPRISE');
    expect(result.extractedPayload?.billingCycle).toBe('YEARLY');
    expect(result.extractedPayload?.organizationId).toBe('a1111111-2222-3333-4444-555555555555');
  });

  it('rejects tampered or forged Razorpay webhook payloads', async () => {
    const body = JSON.stringify({ event_id: 'evt_tampered' });
    const forgedSig = '0000000000000000000000000000000000000000000000000000000000000000';
    const result = await verifyAndExtractWebhook({ 'x-razorpay-signature': forgedSig }, body, { razorpaySecret });

    expect(result.valid).toBe(false);
    expect(result.provider).toBe('RAZORPAY');
    expect(result.error).toContain('Invalid Razorpay HMAC-SHA256 signature');
  });

  it('verifies valid Stripe signature with timestamp validation', async () => {
    const body = JSON.stringify({
      id: 'evt_stripe_live_555',
      data: {
        object: {
          id: 'pi_3MtwBwLkdIwHu7ix28a3tqPa',
          amount: 10000, // 100.00 INR in cents
          currency: 'inr',
          metadata: {
            organization_id: 'b2222222-3333-4444-5555-666666666666',
            tier: 'TIER_1_MSME',
            billing_cycle: 'MONTHLY',
            payment_type: 'SUBSCRIPTION',
          },
        },
      },
    });

    const nowSec = Math.floor(Date.now() / 1000).toString();
    const sig = await hmacSha256Hex(stripeSecret, `${nowSec}.${body}`);
    const result = await verifyAndExtractWebhook(
      { 'stripe-signature': `t=${nowSec},v1=${sig}` },
      body,
      { stripeSecret },
    );

    expect(result.valid).toBe(true);
    expect(result.provider).toBe('STRIPE');
    expect(result.eventId).toBe('evt_stripe_live_555');
    expect(result.extractedPayload?.amount).toBe(100);
    expect(result.extractedPayload?.tier).toBe('TIER_1_MSME');
    expect(result.extractedPayload?.billingCycle).toBe('MONTHLY');
  });

  it('rejects replayed Stripe requests with timestamps older than 300 seconds', async () => {
    const body = JSON.stringify({ id: 'evt_replay' });
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 mins ago
    const sig = await hmacSha256Hex(stripeSecret, `${oldTimestamp}.${body}`);

    const result = await verifyAndExtractWebhook(
      { 'stripe-signature': `t=${oldTimestamp},v1=${sig}` },
      body,
      { stripeSecret },
    );

    expect(result.valid).toBe(false);
    expect(result.error).toContain('timestamp expired');
  });

  it('rejects unauthenticated requests missing all signature headers', async () => {
    const result = await verifyAndExtractWebhook({}, '{}', {});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Missing webhook signature headers');
  });

  it('rejects a signed body when the webhook secret is not configured', async () => {
    const body = JSON.stringify({ event_id: 'evt_missing_secret' });
    const sig = await hmacSha256Hex(razorpaySecret, body);
    const result = await verifyAndExtractWebhook({ 'x-razorpay-signature': sig }, body, {});
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');
  });
});
