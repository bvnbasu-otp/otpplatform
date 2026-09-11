import { supabase } from '@/lib/supabase';
import {
  defaultQuoteParser,
  renderOutcomeReply,
  renderQuoteAcknowledgement,
  renderRfqNotification,
  CONFIRMATION_THRESHOLD,
  type IngestOutcome,
  type MessagingChannel,
} from '@otp/messaging';

/**
 * The messaging channel, as the demo drives it.
 *
 * Every call here goes through the same gateway a real WhatsApp message goes
 * through, and the parsing and message copy come from the same module the
 * webhook uses. That is the point: an audience watching this is watching the
 * real thing refuse a late quote or reject an uninvited supplier, not a scripted
 * animation of it.
 *
 * The parse happens in the browser, exactly as it happens in the edge function,
 * and is trusted exactly as little — the database re-checks the sender, the
 * invitation, the enquiry state, the deadline and the amount either way.
 */

/** Where the demo's magic links point. */
function appUrl(): string {
  return window.location.origin;
}

export interface DemoSupplier {
  alias: string;
  channel: MessagingChannel;
  phoneMasked: string;
  /** VERIFIED, or SUSPENDED once this number has texted STOP. */
  channelStatus: string;
  invitationStatus: string;
  notified: boolean;
  quoteStatus: string | null;
}

export interface DemoThreadEntry {
  kind: 'NOTIFICATION' | 'MESSAGE';
  direction: 'INBOUND' | 'OUTBOUND';
  alias: string;
  channel: MessagingChannel;
  body: string | null;
  status: string;
  errorCode?: string | null;
  at: string;
}

/**
 * The reference suppliers quote against.
 *
 * Needed so the simulator can prefill a message that actually works. Read from
 * the RFQ rather than passed in, because a caller that has to supply it will
 * eventually supply the wrong one.
 */
export async function fetchEnquiryReference(rfqId: string): Promise<string | null> {
  const { data } = await supabase
    .from('rfqs')
    .select('public_ref')
    .eq('id', rfqId)
    .maybeSingle();

  return (data?.public_ref as string | null) ?? null;
}

export async function fetchDemoSuppliers(
  rfqId: string,
): Promise<{ ok: true; suppliers: DemoSupplier[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('demo_messaging_recipients', {
    p_rfq_id: rfqId,
  });

  if (error) return { ok: false, error: error.message };

  const list: DemoSupplier[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    alias: String(row.alias),
    channel: row.channel as MessagingChannel,
    phoneMasked: String(row.phoneMasked ?? ''),
    channelStatus: String(row.channelStatus ?? 'VERIFIED'),
    invitationStatus: String(row.invitationStatus ?? ''),
    notified: Boolean(row.notified),
    quoteStatus: (row.quoteStatus as string | null) ?? null,
  }));

  return {
    ok: true,
    suppliers: list,
  };
}

export async function fetchDemoThread(
  rfqId: string,
): Promise<{ ok: true; entries: DemoThreadEntry[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('demo_messaging_thread', {
    p_rfq_id: rfqId,
  });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    entries: ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      kind: row.kind as DemoThreadEntry['kind'],
      direction: row.direction as DemoThreadEntry['direction'],
      alias: String(row.alias),
      channel: row.channel as MessagingChannel,
      body: (row.body as string | null) ?? null,
      status: String(row.status ?? ''),
      errorCode: (row.errorCode as string | null) ?? null,
      at: String(row.at),
    })),
  };
}

/**
 * Sends the enquiry to every messaging-capable supplier who has not had it yet.
 *
 * The body is rendered from the payload the database allow-listed, so what the
 * demo displays is exactly what a supplier would receive — including the fact
 * that it does not name the buyer.
 */
export async function sendDemoEnquiry(
  rfqId: string,
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('demo_messaging_outbox', {
    p_rfq_id: rfqId,
  });

  if (error) return { ok: false, error: error.message };

  const queue = (data ?? []) as Array<{
    alias: string;
    channel: MessagingChannel;
    payload: Record<string, unknown>;
  }>;

  let sent = 0;

  for (const entry of queue) {
    // Throws if the payload ever carries something a supplier may not see, which
    // is the behaviour we want: a policy regression should stop the demo, not
    // quietly appear on screen.
    const message = renderRfqNotification(entry.payload, {
      channel: entry.channel,
      appUrl: appUrl(),
    });

    const { error: sendError } = await supabase.rpc('demo_send_notification', {
      p_rfq_id: rfqId,
      p_alias: entry.alias,
      p_body: message.body,
      p_template_id: message.templateId,
    });

    if (sendError) return { ok: false, error: sendError.message };
    sent += 1;
  }

  return { ok: true, sent };
}

export interface SimulatedReply {
  outcome: IngestOutcome;
  /** The reply the supplier would have received, if any. */
  reply: string | null;
  /** Present when the message produced a quote. */
  magicLinkUrl: string | null;
  /** Why the parser was unsure, for the presenter rather than the supplier. */
  warnings: string[];
  confidence: number;
}

/**
 * Answers an enquiry as one of the suppliers.
 *
 * Identified by alias, so the browser never holds a phone number or a supplier
 * id — the same protection the buying side gets applies to the demo screen.
 */
export async function simulateSupplierReply(
  rfqId: string,
  alias: string,
  body: string,
  options: { messageId?: string } = {},
): Promise<{ ok: true; result: SimulatedReply } | { ok: false; error: string }> {
  const parsed = defaultQuoteParser.parse(body);

  const { data, error } = await supabase.rpc('demo_simulate_supplier_message', {
    p_rfq_id: rfqId,
    p_alias: alias,
    p_body: body,
    p_parsed: {
      command: parsed.command,
      rfqReference: parsed.rfqReference,
      amount: parsed.amount,
      currency: parsed.currency,
      unit: parsed.unit,
      confidence: parsed.confidence,
    },
    p_message_id: options.messageId ?? null,
  });

  if (error) return { ok: false, error: error.message };

  const payload = (data ?? {}) as Record<string, unknown>;
  const outcome = (payload.outcome ?? 'UNAVAILABLE') as IngestOutcome;
  const channel = (payload.channel as MessagingChannel) ?? 'WHATSAPP';
  const ctx = { channel, appUrl: appUrl() };

  const rendered = outcome === 'ACCEPTED'
    ? renderQuoteAcknowledgement({
      publicRef: String(payload.reference),
      amount: Number(payload.amount),
      currency: String(payload.currency ?? 'INR'),
      version: Number(payload.version ?? 1),
      magicLinkToken: (payload.magicLinkToken as string | null) ?? null,
      lowConfidence: parsed.confidence < CONFIRMATION_THRESHOLD,
      isDemo: Boolean(payload.isDemo),
    }, ctx)
    : renderOutcomeReply(outcome, ctx, {
      reference: (payload.reference as string | null) ?? parsed.rfqReference,
    });

  if (rendered) {
    // Logged so the thread reads as a conversation rather than as a list of
    // inbound messages with no answers.
    await supabase.rpc('demo_record_reply', {
      p_rfq_id: rfqId,
      p_alias: alias,
      p_body: rendered.body,
      p_template_id: rendered.templateId,
    });
  }

  const token = payload.magicLinkToken as string | undefined;

  return {
    ok: true,
    result: {
      outcome,
      reply: rendered?.body ?? null,
      magicLinkUrl: token ? `${appUrl()}/q/${token}` : null,
      warnings: parsed.warnings,
      confidence: parsed.confidence,
    },
  };
}
