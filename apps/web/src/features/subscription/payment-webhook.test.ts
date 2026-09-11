import { describe, expect, it } from 'vitest';

const encoder = new TextEncoder();

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

interface WebhookVerificationResult {
  valid: boolean;
  provider: 'RAZORPAY' | 'STRIPE' | 'GENERIC_SECURE' | 'UNKNOWN';
  error?: string;
  eventId?: string;
  extractedPayload?: {
    paymentType: 'SUBSCRIPTION' | 'INVOICE';
    organizationId?: string;
    invoiceId?: string;
    amount: number;
    currency: string;
    tier?: string;
    billingCycle?: string;
    paymentReference?: string;
  };
}

async function verifyAndExtractWebhook(
  headers: Record<string, string>,
  rawBody: string,
  secrets: { razorpaySecret?: string; stripeSecret?: string; genericSecret?: string },
): Promise<WebhookVerificationResult> {
  const razorpaySig = headers['x-razorpay-signature'];
  const stripeSig = headers['stripe-signature'];
  const genericSig = headers['x-otp-signature'];

  if (razorpaySig) {
    const expectedSig = await hmacSha256Hex(secrets.razorpaySecret ?? 'test_rzp_secret', rawBody);
    if (!timingSafeEqual(expectedSig.toLowerCase(), razorpaySig.trim().toLowerCase())) {
      return { valid: false, provider: 'RAZORPAY', error: 'Invalid Razorpay HMAC-SHA256 signature' };
    }
    const parsed = JSON.parse(rawBody);
    const entity = parsed.payload?.payment?.entity ?? parsed;
    const notes = entity.notes ?? {};
    return {
      valid: true,
      provider: 'RAZORPAY',
      eventId: parsed.event_id ?? entity.id,
      extractedPayload: {
        paymentType: notes.payment_type === 'INVOICE' ? 'INVOICE' : 'SUBSCRIPTION',
        organizationId: notes.organization_id,
        invoiceId: notes.invoice_id,
        amount: typeof entity.amount === 'number' ? entity.amount / 100 : Number(entity.amount || 0),
        currency: entity.currency ?? 'INR',
        tier: notes.tier ?? 'TIER_1_MSME',
        billingCycle: notes.billing_cycle ?? 'MONTHLY',
        paymentReference: entity.id,
      },
    };
  }

  if (stripeSig) {
    const parts = Object.fromEntries(
      stripeSig.split(',').map((p) => {
        const [k, v] = p.trim().split('=');
        return [k, v];
      }),
    );
    const timestamp = parts['t'];
    const v1 = parts['v1'];
    if (!timestamp || !v1) {
      return { valid: false, provider: 'STRIPE', error: 'Missing timestamp or v1 in Stripe signature' };
    }
    const nowSec = Math.floor(Date.now() / 1000);
    const tsSec = parseInt(timestamp, 10);
    if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > 300) {
      return { valid: false, provider: 'STRIPE', error: 'Stripe webhook signature timestamp expired (>300s)' };
    }
    const expectedSig = await hmacSha256Hex(secrets.stripeSecret ?? 'test_stripe_secret', `${timestamp}.${rawBody}`);
    if (!timingSafeEqual(expectedSig.toLowerCase(), v1.trim().toLowerCase())) {
      return { valid: false, provider: 'STRIPE', error: 'Invalid Stripe HMAC-SHA256 signature' };
    }
    const parsed = JSON.parse(rawBody);
    const dataObj = parsed.data?.object ?? parsed;
    const meta = dataObj.metadata ?? {};
    return {
      valid: true,
      provider: 'STRIPE',
      eventId: parsed.id,
      extractedPayload: {
        paymentType: meta.payment_type === 'INVOICE' ? 'INVOICE' : 'SUBSCRIPTION',
        organizationId: meta.organization_id,
        invoiceId: meta.invoice_id,
        amount: typeof dataObj.amount === 'number' ? dataObj.amount / 100 : Number(dataObj.amount || 0),
        currency: (dataObj.currency ?? 'INR').toUpperCase(),
        tier: meta.tier ?? 'TIER_1_MSME',
        billingCycle: meta.billing_cycle ?? 'MONTHLY',
        paymentReference: dataObj.id,
      },
    };
  }

  if (genericSig) {
    const expectedSig = await hmacSha256Hex(secrets.genericSecret ?? 'test_generic_secret', rawBody);
    if (!timingSafeEqual(expectedSig.toLowerCase(), genericSig.trim().toLowerCase())) {
      return { valid: false, provider: 'GENERIC_SECURE', error: 'Invalid Generic HMAC-SHA256 signature' };
    }
    const parsed = JSON.parse(rawBody);
    return {
      valid: true,
      provider: 'GENERIC_SECURE',
      eventId: parsed.gateway_event_id ?? `gen_${Date.now()}`,
      extractedPayload: {
        paymentType: parsed.payment_type === 'INVOICE' ? 'INVOICE' : 'SUBSCRIPTION',
        organizationId: parsed.organization_id,
        invoiceId: parsed.invoice_id,
        amount: Number(parsed.amount || 0),
        currency: parsed.currency ?? 'INR',
        tier: parsed.tier ?? 'TIER_1_MSME',
        billingCycle: parsed.billing_cycle ?? 'MONTHLY',
        paymentReference: parsed.payment_reference,
      },
    };
  }

  return { valid: false, provider: 'UNKNOWN', error: 'Missing webhook signature headers' };
}

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
});
