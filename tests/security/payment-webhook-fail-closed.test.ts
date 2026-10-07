import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hmacSha256Hex } from '../../supabase/functions/_shared/messaging/crypto.ts';
import { verifyAndExtractWebhook } from '../../supabase/functions/payment-webhook/verify-webhook.ts';

const FORMER_COMPILED_FALLBACKS = {
  razorpay: 'otp_test_rzp_secret',
  stripe: 'whsec_test_stripe_secret',
  generic: 'otp_generic_payment_secret',
} as const;

const configured = {
  razorpaySecret: 'configured-razorpay-secret',
  stripeSecret: 'configured-stripe-secret',
  genericSecret: 'configured-generic-secret',
};

describe('payment webhook fail-closed secrets', () => {
  it('accepts a body signed with the configured Razorpay secret', async () => {
    const body = JSON.stringify({
      event_id: 'evt_ok',
      payload: { payment: { entity: { id: 'pay_ok', amount: 10000, currency: 'INR', notes: {} } } },
    });
    const sig = await hmacSha256Hex(configured.razorpaySecret, body);
    const result = await verifyAndExtractWebhook(
      { 'x-razorpay-signature': sig },
      body,
      configured,
    );
    expect(result.valid).toBe(true);
    expect(result.provider).toBe('RAZORPAY');
    expect(result.extractedPayload?.paymentReference).toBe('pay_ok');
  });

  it('rejects a missing secret, a wrong secret, a tampered body, and a former compiled fallback', async () => {
    const body = JSON.stringify({ event_id: 'evt_body', amount: 1 });
    const header = { 'x-razorpay-signature': await hmacSha256Hex(configured.razorpaySecret, body) };

    const missing = await verifyAndExtractWebhook(header, body, {});
    expect(missing.valid).toBe(false);
    expect(missing.error).toContain('not configured');

    const wrong = await verifyAndExtractWebhook(
      { 'x-razorpay-signature': await hmacSha256Hex('some-other-secret', body) },
      body,
      configured,
    );
    expect(wrong.valid).toBe(false);
    expect(wrong.error).toContain('Invalid Razorpay');

    const tampered = await verifyAndExtractWebhook(header, `${body} `, configured);
    expect(tampered.valid).toBe(false);
    expect(tampered.error).toContain('Invalid Razorpay');

    const former = await verifyAndExtractWebhook(
      { 'x-razorpay-signature': await hmacSha256Hex(FORMER_COMPILED_FALLBACKS.razorpay, body) },
      body,
      configured,
    );
    expect(former.valid).toBe(false);

    const formerWithoutConfig = await verifyAndExtractWebhook(
      { 'x-razorpay-signature': await hmacSha256Hex(FORMER_COMPILED_FALLBACKS.razorpay, body) },
      body,
      {},
    );
    expect(formerWithoutConfig.valid).toBe(false);
    expect(formerWithoutConfig.error).toContain('not configured');
  });

  it('rejects former Stripe and generic compiled fallbacks when those secrets are absent', async () => {
    const body = '{"id":"evt_stripe"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stripeSig = await hmacSha256Hex(FORMER_COMPILED_FALLBACKS.stripe, `${timestamp}.${body}`);
    const stripe = await verifyAndExtractWebhook(
      { 'stripe-signature': `t=${timestamp},v1=${stripeSig}` },
      body,
      {},
    );
    expect(stripe.valid).toBe(false);
    expect(stripe.provider).toBe('STRIPE');
    expect(stripe.error).toContain('not configured');

    const genericSig = await hmacSha256Hex(FORMER_COMPILED_FALLBACKS.generic, body);
    const generic = await verifyAndExtractWebhook({ 'x-otp-signature': genericSig }, body, {});
    expect(generic.valid).toBe(false);
    expect(generic.provider).toBe('GENERIC_SECURE');
    expect(generic.error).toContain('not configured');
  });

  it('keeps the edge handler on record_verified_payment and does not compile fallback literals', () => {
    const index = readFileSync(
      resolve('supabase/functions/payment-webhook/index.ts'),
      'utf8',
    );
    const verifier = readFileSync(
      resolve('supabase/functions/payment-webhook/verify-webhook.ts'),
      'utf8',
    );
    const guard = index.indexOf('if (!verification.valid || !verification.extractedPayload)');
    const rpc = index.indexOf("rpc('record_verified_payment'");
    expect(guard).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(guard);
    expect(index.slice(0, guard)).not.toContain("rpc('record_verified_payment'");
    expect(index).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(index).toContain("rpc('record_verified_payment'");
    expect(index).toContain('RAZORPAY_WEBHOOK_SECRET');
    expect(index).toContain('STRIPE_WEBHOOK_SECRET');
    expect(index).toContain('PAYMENT_WEBHOOK_SECRET');
    for (const secret of Object.values(FORMER_COMPILED_FALLBACKS)) {
      expect(index).not.toContain(secret);
      expect(verifier).not.toContain(secret);
    }
  });
});
