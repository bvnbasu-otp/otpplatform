import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  settlementDisposition,
  verifyAndExtractWebhook as verifyWebhook,
  type WebhookSecrets,
  type WebhookVerificationResult,
} from './verify-webhook.ts';
import { pilotWebhookDisposition } from './pilot-payment-boundary.ts';

export type { WebhookVerificationResult };

function nonempty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function envSecret(name: string): string | undefined {
  return nonempty(Deno.env.get(name));
}

/**
 * Validates cryptographic webhook signatures for Razorpay and Stripe.
 * Missing env secrets fail closed. Callers may pass an explicit secret for tests.
 */
export async function verifyAndExtractWebhook(
  headers: Headers,
  rawBody: string,
  envSecrets?: WebhookSecrets,
): Promise<WebhookVerificationResult> {
  return verifyWebhook(headers, rawBody, {
    razorpaySecret: nonempty(envSecrets?.razorpaySecret) ?? envSecret('RAZORPAY_WEBHOOK_SECRET'),
    stripeSecret: nonempty(envSecrets?.stripeSecret) ?? envSecret('STRIPE_WEBHOOK_SECRET'),
    genericSecret: nonempty(envSecrets?.genericSecret) ?? envSecret('PAYMENT_WEBHOOK_SECRET'),
  });
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

      const pilot = pilotWebhookDisposition({ paymentType: payload.paymentType });
      if (!pilot.recordSubscription) {
        return jsonResponse({
          ok: true,
          verified: true,
          provider: verification.provider,
          eventId: verification.eventId,
          recorded: false,
          message: pilot.reason,
        });
      }

      const disposition = settlementDisposition(verification.provider, payload.raw);
      if (!disposition.settle) {
        // Acknowledge so the provider does not retry; nothing is recorded as paid.
        return jsonResponse({
          ok: true,
          verified: true,
          provider: verification.provider,
          eventId: verification.eventId,
          recorded: false,
          message: disposition.reason,
        });
      }
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

      if (payload.paymentType === 'SUPPLIER_FEE') {
        if (!payload.rfqId) {
          return errorResponse('Supplier fee events must specify an rfq_id', 422);
        }
        const { data: feeResult, error: feeError } = await supabase.rpc(
          'record_verified_supplier_fee_payment',
          {
            p_rfq_id: payload.rfqId,
            p_amount: payload.amount,
            p_currency: payload.currency,
            p_gateway: verification.provider,
            p_gateway_event_id: verification.eventId,
            p_payment_reference: payload.paymentReference,
            p_gateway_payload: payload.raw,
          },
        );
        if (feeError) {
          return errorResponse(`Database transaction failed: ${feeError.message}`, 500);
        }
        return jsonResponse({
          ok: true,
          verified: true,
          provider: verification.provider,
          result: feeResult,
        });
      }

      // The plan and cycle must come from the verified event: there is no default tier or price.
      if (payload.paymentType === 'SUBSCRIPTION' && (!payload.tier || !payload.billingCycle)) {
        return errorResponse('Subscription events must name a tier and billing cycle', 422);
      }
      if (payload.paymentType === 'SUBSCRIPTION' && payload.profileId && payload.organizationId) {
        return errorResponse('Subscription event is ambiguous: both organization and profile were supplied', 422);
      }

      if (payload.paymentType === 'SUBSCRIPTION' && payload.profileId) {
        const { data: personal, error: personalError } = await supabase.rpc(
          'record_verified_personal_subscription_payment',
          {
            p_profile_id: payload.profileId,
            p_amount: payload.amount,
            p_currency: payload.currency,
            p_gateway: verification.provider,
            p_gateway_event_id: verification.eventId,
            p_payment_reference: payload.paymentReference,
            p_tier: payload.tier,
            p_billing_cycle: payload.billingCycle,
            p_gateway_payload: payload.raw,
          },
        );
        if (personalError) {
          return errorResponse(`Database transaction failed: ${personalError.message}`, 500);
        }
        return jsonResponse({ ok: true, verified: true, provider: verification.provider, result: personal });
      }

      // Execute atomic RPC transaction
      const { data, error } = await supabase.rpc('record_verified_payment', {
        p_payment_type: 'SUBSCRIPTION',
        p_organization_id: payload.organizationId ?? null,
        p_invoice_id: null,
        p_amount: payload.amount,
        p_currency: payload.currency,
        p_gateway: verification.provider,
        p_gateway_event_id: verification.eventId,
        p_payment_reference: payload.paymentReference,
        p_tier: payload.tier ?? null,
        p_billing_cycle: payload.billingCycle ?? null,
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
