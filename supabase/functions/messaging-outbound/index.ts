/**
 * Real outbound supplier notifications: WhatsApp/SMS, for real.
 *
 * Everything up to this function already existed — the payload allow-list,
 * the templates, the provider abstraction, the outbound log — but nothing
 * called it. A buyer inviting a supplier produced an `rfq_invitations` row and
 * nothing else; the phone never rang. This is the missing call: one enquiry,
 * one supplier, one message, sent through whichever provider MESSAGING_PROVIDER
 * names and logged exactly once.
 *
 * Invoked server-to-server only, by the `rfq_invitations` insert trigger via
 * pg_net — not a public webhook. There is nothing here for an outside caller to
 * usefully post to: the body is just IDs, and every fact in the message comes
 * from `supplier_rfq_message_payload`, which applies the same allow-list a
 * buyer's own dashboard is held to.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { resolveProvider, MessagingConfigError } from '../_shared/messaging/providers/resolve.ts';
import { renderRfqNotification } from '../_shared/messaging/templates.ts';
import type { MessagingChannel, MessagingProvider } from '../_shared/messaging/types.ts';

const APP_URL = Deno.env.get('APP_URL') ?? 'http://opentradeprocurement.ai:3000';

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

function messagingEnv() {
  return {
    MESSAGING_PROVIDER: Deno.env.get('MESSAGING_PROVIDER') ?? undefined,
    TWILIO_ACCOUNT_SID: Deno.env.get('TWILIO_ACCOUNT_SID') ?? undefined,
    TWILIO_AUTH_TOKEN: Deno.env.get('TWILIO_AUTH_TOKEN') ?? undefined,
    TWILIO_SMS_FROM: Deno.env.get('TWILIO_SMS_FROM') ?? undefined,
    TWILIO_WHATSAPP_FROM: Deno.env.get('TWILIO_WHATSAPP_FROM') ?? undefined,
    TWILIO_WEBHOOK_URL: Deno.env.get('TWILIO_WEBHOOK_URL') ?? undefined,
    META_PHONE_NUMBER_ID: Deno.env.get('META_PHONE_NUMBER_ID') ?? undefined,
    META_ACCESS_TOKEN: Deno.env.get('META_ACCESS_TOKEN') ?? undefined,
    META_APP_SECRET: Deno.env.get('META_APP_SECRET') ?? undefined,
    MESSAGING_MOCK_SECRET: Deno.env.get('MESSAGING_MOCK_SECRET') ?? undefined,
  };
}

interface DispatchRequest {
  rfqId?: string;
  supplierId?: string;
  invitationId?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let payload: DispatchRequest;
  try {
    payload = await req.json();
  } catch {
    return errorResponse('Body must be JSON', 400);
  }

  const { rfqId, supplierId, invitationId } = payload;
  if (!rfqId || !supplierId || !invitationId) {
    return errorResponse('rfqId, supplierId and invitationId are required', 400);
  }

  const db = serviceClient();

  // Idempotent: a retried trigger delivery or a manual re-dispatch must not
  // double-text a supplier.
  const { data: already } = await db
    .from('supplier_notifications')
    .select('id')
    .eq('invitation_id', invitationId)
    .limit(1)
    .maybeSingle();

  if (already) {
    return jsonResponse({ skipped: true, reason: 'Already notified for this invitation' });
  }

  const { data: rfq, error: rfqError } = await db
    .from('rfqs')
    .select('id, is_demo')
    .eq('id', rfqId)
    .maybeSingle();

  if (rfqError) return errorResponse(rfqError.message, 400);
  if (!rfq) return errorResponse('RFQ not found', 404);
  // Demo enquiries run through the in-app simulator, never a real provider.
  if (rfq.is_demo) return jsonResponse({ skipped: true, reason: 'Demo RFQ' });

  const { data: channels, error: channelError } = await db
    .from('supplier_messaging_channels')
    .select('channel, phone_e164')
    .eq('supplier_id', supplierId)
    .eq('status', 'VERIFIED');

  if (channelError) return errorResponse(channelError.message, 400);

  // WhatsApp first when both are verified: richer message, same price.
  const chosen = (channels ?? []).find((c) => c.channel === 'WHATSAPP')
    ?? (channels ?? []).find((c) => c.channel === 'SMS');

  if (!chosen) {
    return jsonResponse({ skipped: true, reason: 'No verified messaging channel for this supplier' });
  }

  const { data: rawPayload, error: payloadError } = await db.rpc('supplier_rfq_message_payload', {
    p_rfq_id: rfqId,
    p_supplier_id: supplierId,
  });

  if (payloadError) return errorResponse(payloadError.message, 400);

  const channel = chosen.channel as MessagingChannel;
  let provider: MessagingProvider;
  try {
    provider = resolveProvider(messagingEnv());
  } catch (error) {
    if (error instanceof MessagingConfigError) {
      console.error(error.message);
      return errorResponse('Messaging is not configured', 500);
    }
    throw error;
  }

  let rendered;
  try {
    rendered = renderRfqNotification(rawPayload as Record<string, unknown>, {
      channel,
      appUrl: APP_URL,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Could not render message', 500);
  }

  const receipt = await provider.send({
    to: chosen.phone_e164,
    channel,
    body: rendered.body,
    templateId: rendered.templateId,
  });

  const { error: logError } = await db.rpc('record_supplier_notification', {
    p_notification: {
      rfqId,
      supplierId,
      channel,
      provider: receipt.provider,
      templateId: rendered.templateId,
      externalMessageId: receipt.externalMessageId,
      status: receipt.status,
      body: rendered.body,
      failureReason: receipt.failureReason ?? null,
    },
  });

  if (logError) return errorResponse(logError.message, 500);

  return jsonResponse({ sent: receipt.status !== 'FAILED', status: receipt.status });
});
