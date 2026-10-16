import { hmacSha256Hex, timingSafeEqual } from '../_shared/messaging/crypto.ts';

export interface WebhookVerificationResult {
  valid: boolean;
  provider: 'RAZORPAY' | 'STRIPE' | 'GENERIC_SECURE' | 'UNKNOWN';
  error?: string;
  eventId?: string;
  extractedPayload?: {
    paymentType: 'SUBSCRIPTION' | 'INVOICE';
    organizationId?: string;
    /** Individual (personal) buyer subscriptions are settled against a profile, not an organization. */
    profileId?: string;
    invoiceId?: string;
    amount: number;
    currency: string;
    tier?: string;
    billingCycle?: string;
    paymentReference?: string;
    raw: Record<string, unknown>;
  };
}

export interface WebhookSecrets {
  razorpaySecret?: string | null;
  stripeSecret?: string | null;
  genericSecret?: string | null;
}

type HeaderSource = { get(name: string): string | null } | Record<string, string | undefined>;

function readHeader(headers: HeaderSource, name: string): string | null {
  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name);
  }
  return (headers as Record<string, string | undefined>)[name] ?? null;
}

function configuredSecret(secret: string | null | undefined): string | null {
  const value = secret?.trim();
  return value ? value : null;
}

/**
 * HMAC verification. A blank or absent secret fails. This module does not
 * read the environment and does not substitute a built-in secret.
 */
export async function verifyAndExtractWebhook(
  headers: HeaderSource,
  rawBody: string,
  secrets: WebhookSecrets = {},
): Promise<WebhookVerificationResult> {
  const razorpaySig = readHeader(headers, 'x-razorpay-signature');
  const stripeSig = readHeader(headers, 'stripe-signature');
  const genericSig = readHeader(headers, 'x-otp-signature');

  const razorpaySecret = configuredSecret(secrets.razorpaySecret);
  const stripeSecret = configuredSecret(secrets.stripeSecret);
  const genericSecret = configuredSecret(secrets.genericSecret);

  if (razorpaySig) {
    if (!razorpaySecret) {
      return { valid: false, provider: 'RAZORPAY', error: 'Webhook secret is not configured' };
    }
    const expectedSig = await hmacSha256Hex(razorpaySecret, rawBody);
    if (!timingSafeEqual(expectedSig.toLowerCase(), razorpaySig.trim().toLowerCase())) {
      return { valid: false, provider: 'RAZORPAY', error: 'Invalid Razorpay HMAC-SHA256 signature' };
    }

    try {
      const parsed = JSON.parse(rawBody);
      const entity = parsed.payload?.payment?.entity ?? parsed.payload?.order?.entity ?? parsed;
      const notes = entity.notes ?? parsed.notes ?? {};

      return {
        valid: true,
        provider: 'RAZORPAY',
        eventId: parsed.event_id ?? entity.id ?? `rzp_${Date.now()}`,
        extractedPayload: {
          paymentType: notes.payment_type?.toUpperCase() === 'INVOICE' ? 'INVOICE' : 'SUBSCRIPTION',
          organizationId: notes.organization_id ?? notes.org_id,
          profileId: notes.profile_id,
          invoiceId: notes.invoice_id,
          amount: typeof entity.amount === 'number' ? entity.amount / 100 : Number(entity.amount || 0),
          currency: entity.currency ?? 'INR',
          tier: notes.tier,
          billingCycle: notes.billing_cycle,
          paymentReference: entity.id ?? notes.payment_reference,
          raw: parsed,
        },
      };
    } catch {
      return { valid: false, provider: 'RAZORPAY', error: 'Malformed Razorpay JSON payload' };
    }
  }

  if (stripeSig) {
    if (!stripeSecret) {
      return { valid: false, provider: 'STRIPE', error: 'Webhook secret is not configured' };
    }
    const parts = Object.fromEntries(
      stripeSig.split(',').map((p) => {
        const [k, v] = p.trim().split('=');
        return [k, v];
      }),
    );

    const timestamp = parts['t'];
    const v1 = parts['v1'];

    if (!timestamp || !v1) {
      return { valid: false, provider: 'STRIPE', error: 'Missing timestamp or v1 in Stripe signature header' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const tsSec = parseInt(timestamp, 10);
    if (isNaN(tsSec) || Math.abs(nowSec - tsSec) > 300) {
      return { valid: false, provider: 'STRIPE', error: 'Stripe webhook signature timestamp expired (>300s)' };
    }

    const payloadToSign = `${timestamp}.${rawBody}`;
    const expectedSig = await hmacSha256Hex(stripeSecret, payloadToSign);
    if (!timingSafeEqual(expectedSig.toLowerCase(), v1.trim().toLowerCase())) {
      return { valid: false, provider: 'STRIPE', error: 'Invalid Stripe HMAC-SHA256 signature' };
    }

    try {
      const parsed = JSON.parse(rawBody);
      const dataObj = parsed.data?.object ?? parsed;
      const meta = dataObj.metadata ?? parsed.metadata ?? {};

      return {
        valid: true,
        provider: 'STRIPE',
        eventId: parsed.id ?? `evt_${Date.now()}`,
        extractedPayload: {
          paymentType: meta.payment_type?.toUpperCase() === 'INVOICE' ? 'INVOICE' : 'SUBSCRIPTION',
          organizationId: meta.organization_id ?? meta.org_id,
          profileId: meta.profile_id,
          invoiceId: meta.invoice_id,
          amount: typeof dataObj.amount === 'number' ? dataObj.amount / 100 : Number(dataObj.amount || 0),
          currency: (dataObj.currency ?? 'INR').toUpperCase(),
          tier: meta.tier,
          billingCycle: meta.billing_cycle,
          paymentReference: dataObj.id ?? meta.payment_reference,
          raw: parsed,
        },
      };
    } catch {
      return { valid: false, provider: 'STRIPE', error: 'Malformed Stripe JSON payload' };
    }
  }

  if (genericSig) {
    if (!genericSecret) {
      return { valid: false, provider: 'GENERIC_SECURE', error: 'Webhook secret is not configured' };
    }
    const expectedSig = await hmacSha256Hex(genericSecret, rawBody);
    if (!timingSafeEqual(expectedSig.toLowerCase(), genericSig.trim().toLowerCase())) {
      return { valid: false, provider: 'GENERIC_SECURE', error: 'Invalid Generic HMAC-SHA256 signature' };
    }

    try {
      const parsed = JSON.parse(rawBody);
      return {
        valid: true,
        provider: 'GENERIC_SECURE',
        eventId: parsed.gateway_event_id ?? parsed.event_id ?? `gen_${Date.now()}`,
        extractedPayload: {
          paymentType: parsed.payment_type?.toUpperCase() === 'INVOICE' ? 'INVOICE' : 'SUBSCRIPTION',
          organizationId: parsed.organization_id,
          profileId: parsed.profile_id,
          invoiceId: parsed.invoice_id,
          amount: Number(parsed.amount || 0),
          currency: parsed.currency ?? 'INR',
          tier: parsed.tier,
          billingCycle: parsed.billing_cycle,
          paymentReference: parsed.payment_reference ?? parsed.gateway_event_id,
          raw: parsed,
        },
      };
    } catch {
      return { valid: false, provider: 'GENERIC_SECURE', error: 'Malformed JSON payload' };
    }
  }

  return {
    valid: false,
    provider: 'UNKNOWN',
    error: 'Missing webhook signature headers (x-razorpay-signature, stripe-signature, or x-otp-signature)',
  };
}

export type SettlementDisposition = { settle: true } | { settle: false; reason: string };

const RAZORPAY_SETTLING_EVENTS = new Set(['payment.captured', 'order.paid']);
const STRIPE_SETTLING_EVENTS = new Set([
  'payment_intent.succeeded',
  'checkout.session.completed',
  'charge.succeeded',
]);
const SETTLED_STATUSES = new Set(['captured', 'paid', 'succeeded', 'success', 'settled']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * A valid signature proves who sent the event, not that money was collected.
 * Failed, authorized-only, refunded and disputed events are acknowledged by the
 * handler without recording a verified payment.
 */
export function settlementDisposition(
  provider: WebhookVerificationResult['provider'],
  raw: Record<string, unknown>,
): SettlementDisposition {
  if (provider === 'RAZORPAY') {
    const event = typeof raw.event === 'string' ? raw.event : '';
    if (!RAZORPAY_SETTLING_EVENTS.has(event)) {
      return { settle: false, reason: `Razorpay event "${event || 'unknown'}" does not settle a payment` };
    }
    const payload = asRecord(raw.payload);
    const entity = asRecord(asRecord(payload.payment).entity);
    const status = typeof entity.status === 'string' ? entity.status.toLowerCase() : '';
    if (status && !SETTLED_STATUSES.has(status)) {
      return { settle: false, reason: `Razorpay payment status "${status}" is not captured` };
    }
    return { settle: true };
  }

  if (provider === 'STRIPE') {
    const type = typeof raw.type === 'string' ? raw.type : '';
    if (!STRIPE_SETTLING_EVENTS.has(type)) {
      return { settle: false, reason: `Stripe event "${type || 'unknown'}" does not settle a payment` };
    }
    const object = asRecord(asRecord(raw.data).object);
    if (type === 'checkout.session.completed' && object.payment_status !== 'paid') {
      return { settle: false, reason: 'Stripe checkout session is not paid' };
    }
    const status = typeof object.status === 'string' ? object.status.toLowerCase() : '';
    if (status && type !== 'checkout.session.completed' && !SETTLED_STATUSES.has(status)) {
      return { settle: false, reason: `Stripe status "${status}" is not succeeded` };
    }
    return { settle: true };
  }

  if (provider === 'GENERIC_SECURE') {
    const status = typeof raw.status === 'string' ? raw.status.toLowerCase() : '';
    if (status && !SETTLED_STATUSES.has(status)) {
      return { settle: false, reason: `Payment status "${status}" is not settled` };
    }
    return { settle: true };
  }

  return { settle: false, reason: 'Unknown provider' };
}
