import { hmacSha256Hex, timingSafeEqual } from '../_shared/messaging/crypto.ts';

export interface WebhookVerificationResult {
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
          invoiceId: notes.invoice_id,
          amount: typeof entity.amount === 'number' ? entity.amount / 100 : Number(entity.amount || 0),
          currency: entity.currency ?? 'INR',
          tier: notes.tier ?? 'TIER_1_MSME',
          billingCycle: notes.billing_cycle ?? 'MONTHLY',
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
          invoiceId: meta.invoice_id,
          amount: typeof dataObj.amount === 'number' ? dataObj.amount / 100 : Number(dataObj.amount || 0),
          currency: (dataObj.currency ?? 'INR').toUpperCase(),
          tier: meta.tier ?? 'TIER_1_MSME',
          billingCycle: meta.billing_cycle ?? 'MONTHLY',
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
          invoiceId: parsed.invoice_id,
          amount: Number(parsed.amount || 0),
          currency: parsed.currency ?? 'INR',
          tier: parsed.tier ?? 'TIER_1_MSME',
          billingCycle: parsed.billing_cycle ?? 'MONTHLY',
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
