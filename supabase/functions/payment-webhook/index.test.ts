import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifyAndExtractWebhook } from './index.ts';
import { hmacSha256Hex } from '../_shared/messaging/crypto.ts';

Deno.test('Payment Webhook — Razorpay valid signature', async () => {
  const secret = 'rzp_test_secret_12345';
  const body = JSON.stringify({
    event_id: 'evt_rzp_999',
    payload: {
      payment: {
        entity: {
          id: 'pay_rzp_123456',
          amount: 499900, // 4999.00 INR
          currency: 'INR',
          notes: {
            organization_id: 'a0000000-0000-0000-0000-000000000001',
            tier: 'TIER_1_MSME',
            billing_cycle: 'YEARLY',
            payment_type: 'SUBSCRIPTION',
          },
        },
      },
    },
  });

  const sig = await hmacSha256Hex(secret, body);
  const headers = new Headers({
    'x-razorpay-signature': sig,
  });

  const result = await verifyAndExtractWebhook(headers, body, { razorpaySecret: secret });

  assertEquals(result.valid, true);
  assertEquals(result.provider, 'RAZORPAY');
  assertEquals(result.eventId, 'evt_rzp_999');
  assertEquals(result.extractedPayload?.amount, 4999);
  assertEquals(result.extractedPayload?.tier, 'TIER_1_MSME');
  assertEquals(result.extractedPayload?.billingCycle, 'YEARLY');
  assertEquals(result.extractedPayload?.organizationId, 'a0000000-0000-0000-0000-000000000001');
});

Deno.test('Payment Webhook — Razorpay invalid signature rejected', async () => {
  const secret = 'rzp_test_secret_12345';
  const body = JSON.stringify({ test: 'data' });
  const headers = new Headers({
    'x-razorpay-signature': 'invalid_signature_hex_value_0000000000000000000000000000000000000000000000000000000000000000',
  });

  const result = await verifyAndExtractWebhook(headers, body, { razorpaySecret: secret });

  assertEquals(result.valid, false);
  assertEquals(result.provider, 'RAZORPAY');
  assertEquals(result.error?.includes('Invalid Razorpay HMAC-SHA256 signature'), true);
});

Deno.test('Payment Webhook — Stripe valid signature & timestamp', async () => {
  const secret = 'whsec_stripe_test_abc123';
  const body = JSON.stringify({
    id: 'evt_stripe_777',
    data: {
      object: {
        id: 'pi_stripe_999',
        amount: 299900, // 2999.00 INR in cents
        currency: 'inr',
        metadata: {
          organization_id: 'b0000000-0000-0000-0000-000000000002',
          tier: 'TIER_2_ENTERPRISE',
          billing_cycle: 'MONTHLY',
          payment_type: 'SUBSCRIPTION',
        },
      },
    },
  });

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payloadToSign = `${timestamp}.${body}`;
  const sig = await hmacSha256Hex(secret, payloadToSign);

  const headers = new Headers({
    'stripe-signature': `t=${timestamp},v1=${sig}`,
  });

  const result = await verifyAndExtractWebhook(headers, body, { stripeSecret: secret });

  assertEquals(result.valid, true);
  assertEquals(result.provider, 'STRIPE');
  assertEquals(result.eventId, 'evt_stripe_777');
  assertEquals(result.extractedPayload?.amount, 2999);
  assertEquals(result.extractedPayload?.tier, 'TIER_2_ENTERPRISE');
  assertEquals(result.extractedPayload?.billingCycle, 'MONTHLY');
});

Deno.test('Payment Webhook — Stripe expired timestamp rejected', async () => {
  const secret = 'whsec_stripe_test_abc123';
  const body = JSON.stringify({ test: 'stripe_expired' });
  const expiredTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 minutes ago
  const payloadToSign = `${expiredTimestamp}.${body}`;
  const sig = await hmacSha256Hex(secret, payloadToSign);

  const headers = new Headers({
    'stripe-signature': `t=${expiredTimestamp},v1=${sig}`,
  });

  const result = await verifyAndExtractWebhook(headers, body, { stripeSecret: secret });

  assertEquals(result.valid, false);
  assertEquals(result.provider, 'STRIPE');
  assertEquals(result.error?.includes('expired'), true);
});

Deno.test('Payment Webhook — Missing signature headers rejected', async () => {
  const headers = new Headers({});
  const result = await verifyAndExtractWebhook(headers, '{}');

  assertEquals(result.valid, false);
  assertEquals(result.provider, 'UNKNOWN');
  assertEquals(result.error?.includes('Missing webhook signature headers'), true);
});
