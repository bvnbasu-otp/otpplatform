/**
 * Inbound supplier messages.
 *
 * This function does three things and deliberately no more: prove the request
 * came from the provider, turn the text into structured fields, and hand those
 * fields to the database. Every decision that matters — who this supplier is,
 * whether they were invited, whether the enquiry is still open, whether this
 * delivery is a duplicate — is made by ingest_supplier_message against the
 * tables. Nothing this function believes is load-bearing.
 *
 * That split is what makes the parser safe to improve later: a smarter parser
 * can propose a better interpretation, but it cannot grant itself authority.
 *
 * Routes:
 *   POST /messaging-inbound            provider webhook, provider-signed
 *   POST /messaging-inbound/simulate   demo only, signed in as a demo user
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/cors.ts';
import { defaultQuoteParser, CONFIRMATION_THRESHOLD } from '../_shared/messaging/parser.ts';
import { normalizePhone } from '../_shared/messaging/phone.ts';
import { resolveProvider, MessagingConfigError } from '../_shared/messaging/providers/resolve.ts';
import {
  renderOutcomeReply,
  renderQuoteAcknowledgement,
  type IngestOutcome,
} from '../_shared/messaging/templates.ts';
import type {
  InboundMessage,
  MessagingProvider,
  WebhookRequest,
} from '../_shared/messaging/types.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Meta verifies a webhook subscription with a GET challenge.
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expected = Deno.env.get('META_VERIFY_TOKEN');

    if (expected && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: corsHeaders });
    }
    return errorResponse('Verification failed', 403);
  }

  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  let provider: MessagingProvider;
  try {
    provider = resolveProvider(messagingEnv());
  } catch (error) {
    // Misconfiguration is ours, not the caller's, and it must be loud: a
    // messaging channel that silently accepts nothing looks like suppliers who
    // simply never reply.
    if (error instanceof MessagingConfigError) {
      console.error(error.message);
      return errorResponse('Messaging is not configured', 500);
    }
    throw error;
  }

  const url = new URL(req.url);
  const isSimulation = url.pathname.endsWith('/simulate');
  const rawBody = await req.text();

  const request: WebhookRequest = {
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(
      [...req.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]),
    ),
    rawBody,
  };

  const db = serviceClient();

  return isSimulation
    ? await handleSimulation(req, request, provider, db)
    : await handleWebhook(request, provider, db);
});

// deno-lint-ignore no-explicit-any
async function handleWebhook(
  request: WebhookRequest,
  provider: MessagingProvider,
  db: any,
): Promise<Response> {
  // Before the body is read for meaning. An unverified webhook is not a
  // malformed request to be helpful about — it is someone trying to bid as
  // somebody else.
  if (!(await provider.verify(request))) {
    console.warn(`Rejected unverified ${provider.id} webhook`);
    return errorResponse('Signature verification failed', 403);
  }

  // Delivery receipts arrive on the same endpoint as messages.
  for (const update of provider.parseStatus(request)) {
    await db.rpc('record_notification_delivery', {
      p_provider: update.provider,
      p_external_message_id: update.externalMessageId,
      p_status: update.status,
      p_failure_reason: update.failureReason ?? null,
    });
  }

  const messages = provider.parse(request);
  const results: string[] = [];

  for (const message of messages) {
    results.push(await processMessage(message, provider, db));
  }

  // 200 even when a message was rejected. A non-2xx tells the provider to
  // retry, and retrying will not make an uninvited supplier invited — it will
  // just deliver the same rejection again.
  return jsonResponse({ received: messages.length, outcomes: results });
}

/**
 * The demo path.
 *
 * Same parser, same gateway, same replies. The only difference is who is
 * trusted to inject the message: here it is a signed-in demo user rather than a
 * provider signature, and the database checks that demo mode is on and the
 * enquiry is a demo enquiry before it will name a handset.
 */
// deno-lint-ignore no-explicit-any
async function handleSimulation(
  req: Request,
  request: WebhookRequest,
  provider: MessagingProvider,
  db: any,
): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return errorResponse('Missing Authorization header', 401);

  let payload: { rfqId?: string; alias?: string; body?: string; messageId?: string };
  try {
    payload = JSON.parse(request.rawBody);
  } catch {
    return errorResponse('Body must be JSON', 400);
  }

  if (!payload.rfqId || !payload.alias || typeof payload.body !== 'string') {
    return errorResponse('rfqId, alias and body are required', 400);
  }

  // Asked with the user's own token, so RLS and demo gating apply to them.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    },
  );

  const { data: allowed, error: gateError } = await asUser.rpc(
    'demo_may_simulate_messaging',
    { p_rfq_id: payload.rfqId },
  );

  if (gateError) return errorResponse(gateError.message, 400);
  if (!allowed) return errorResponse('Not allowed to simulate on this enquiry', 403);

  const { data: sender, error: senderError } = await db.rpc('demo_messaging_sender', {
    p_rfq_id: payload.rfqId,
    p_alias: payload.alias,
  });

  if (senderError) return errorResponse(senderError.message, 400);

  const from = normalizePhone(sender?.phone);
  if (!from) return errorResponse('That supplier has no messaging number', 400);

  const message: InboundMessage = {
    provider: provider.id,
    channel: sender.channel === 'SMS' ? 'SMS' : 'WHATSAPP',
    // Passed through when supplied, so a duplicate delivery can be demonstrated
    // by simulating the same message id twice.
    externalMessageId: payload.messageId ?? `sim-${crypto.randomUUID()}`,
    from,
    body: payload.body,
    raw: { simulated: true, alias: payload.alias },
  };

  const outcome = await processMessage(message, provider, db);
  return jsonResponse({ outcome });
}

/**
 * One message, end to end: parse, hand to the gateway, reply, log the reply.
 * Shared by the real and simulated paths so the demo cannot drift from
 * production behaviour.
 */
// deno-lint-ignore no-explicit-any
async function processMessage(
  message: InboundMessage,
  provider: MessagingProvider,
  db: any,
): Promise<string> {
  const parsed = defaultQuoteParser.parse(message.body);

  const { data, error } = await db.rpc('ingest_supplier_message', {
    p_message: {
      provider: message.provider,
      channel: message.channel,
      externalMessageId: message.externalMessageId,
      phone: message.from,
      body: message.body,
      raw: message.raw,
      parsed: {
        command: parsed.command,
        rfqReference: parsed.rfqReference,
        amount: parsed.amount,
        currency: parsed.currency,
        unit: parsed.unit,
        confidence: parsed.confidence,
      },
    },
  });

  if (error) {
    console.error('ingest_supplier_message failed', error.message);
    return 'ERROR';
  }

  const outcome = (data?.outcome ?? 'ERROR') as IngestOutcome;

  const reply = outcome === 'ACCEPTED'
    ? renderQuoteAcknowledgement({
      publicRef: String(data.reference),
      amount: Number(data.amount),
      currency: String(data.currency ?? 'INR'),
      version: Number(data.version ?? 1),
      magicLinkToken: data.magicLinkToken ?? null,
      lowConfidence: parsed.confidence < CONFIRMATION_THRESHOLD,
      isDemo: Boolean(data.isDemo),
    }, { channel: message.channel, appUrl: APP_URL })
    : renderOutcomeReply(outcome, { channel: message.channel, appUrl: APP_URL }, {
      reference: data?.reference ?? parsed.rfqReference,
    });

  if (parsed.warnings.length > 0) {
    // Warnings are logged, never sent: a supplier does not need to read
    // "interpreted a shorthand multiplier", they need to see the number.
    console.log(`parse warnings for ${message.externalMessageId}: ${parsed.warnings.join('; ')}`);
  }

  if (!reply) return outcome;

  const receipt = await provider.send({
    to: message.from,
    channel: message.channel,
    body: reply.body,
    templateId: reply.templateId,
  });

  await db.rpc('record_outbound_message', {
    p_message: {
      provider: receipt.provider,
      channel: message.channel,
      externalMessageId: receipt.externalMessageId,
      phone: message.from,
      rfqId: data?.rfqId ?? null,
      body: reply.body,
      templateId: reply.templateId,
      status: receipt.status,
      failureReason: receipt.failureReason ?? null,
    },
  });

  return outcome;
}
