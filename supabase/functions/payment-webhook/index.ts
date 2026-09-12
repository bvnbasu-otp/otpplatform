import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { hmacSha256Hex, timingSafeEqual } from '../_shared/messaging/crypto.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

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

/**
 * Validates cryptographic webhook signatures for Razorpay and Stripe.
 */
export async function verifyAndExtractWebhook(
  headers: Headers,
  rawBody: string,
  envSecrets?: { razorpaySecret?: string; stripeSecret?: string; genericSecret?: string },
): Promise<WebhookVerificationResult> {
  const razorpaySig = headers.get('x-razorpay-signature');
  const stripeSig = headers.get('stripe-signature');
  const genericSig = headers.get('x-otp-signature');

  const razorpaySecret = envSecrets?.razorpaySecret ?? Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? 'otp_test_rzp_secret';
  const stripeSecret = envSecrets?.stripeSecret ?? Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? 'whsec_test_stripe_secret';
  const genericSecret = envSecrets?.genericSecret ?? Deno.env.get('PAYMENT_WEBHOOK_SECRET') ?? 'otp_generic_payment_secret';

  // 1. Razorpay Signature Verification
  if (razorpaySig) {
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
          amount: typeof entity.amount === 'number' ? entity.amount / 100 : Number(entity.amount || 0), // Razorpay sends in paise
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

  // 2. Stripe Signature Verification
  if (stripeSig) {
    // Stripe header format: t=timestamp,v1=signature
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

    // Tolerance check (5 minutes)
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
          amount: typeof dataObj.amount === 'number' ? dataObj.amount / 100 : Number(dataObj.amount || 0), // Stripe in cents
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

  // 3. Generic Secure Signed Webhook
  if (genericSig) {
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

  return { valid: false, provider: 'UNKNOWN', error: 'Missing webhook signature headers (x-razorpay-signature, stripe-signature, or x-otp-signature)' };
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
      return errorResponse('Method not allowed — Webhook expects POST', 405);
    }

    try {
      const rawBody = await req.text();
      const verification = await verifyAndExtractWebhook(req.headers, rawBody);

      if (!verification.valid || !verification.extractedPayload) {
        return errorResponse(verification.error ?? 'Webhook verification failed', 401);
      }

      const payload = verification.extractedPayload;

      // Create Supabase Service Role client to execute database settlement
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      if (!supabaseUrl || !supabaseServiceKey) {
        // In local unit tests / mock environment, return verified payload acknowledgment
        return jsonResponse({
          ok: true,
          verified: true,
          provider: verification.provider,
          eventId: verification.eventId,
          payload,
          message: 'Signature verified successfully (local test mode)',
        });
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false },
      });

      // Execute atomic RPC transaction
      const { data, error } = await supabase.rpc('record_verified_payment', {
        p_payment_type: payload.paymentType,
        p_organization_id: payload.organizationId ?? null,
        p_invoice_id: payload.invoiceId ?? null,
        p_amount: payload.amount,
        p_currency: payload.currency,
        p_gateway: verification.provider,
        p_gateway_event_id: verification.eventId,
        p_payment_reference: payload.paymentReference,
        p_tier: payload.tier ?? 'TIER_1_MSME',
        p_billing_cycle: payload.billingCycle ?? 'MONTHLY',
        p_gateway_payload: payload.raw,
      });

      if (error) {
        return errorResponse(`Database transaction failed: ${error.message}`, 500);
      }

      return jsonResponse({
        ok: true,
        verified: true,
        provider: verification.provider,
        result: data,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return errorResponse(`Internal error processing webhook: ${message}`, 500);
    }
  });
}
