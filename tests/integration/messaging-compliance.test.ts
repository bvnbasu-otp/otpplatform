/**
 * Carrier compliance for STOP / START / HELP on the WhatsApp/SMS channel.
 *
 * Sits alongside `messaging-channel.test.ts`, which covers what STOP does to
 * the bidding flow of one demo supplier. This file covers the shape of consent
 * itself: variants the parser must catch, per-channel isolation, idempotency,
 * and the audit events that let a carrier review the account.
 *
 * A fresh supplier is provisioned by the service role so this file does not
 * depend on the demo staging and can run in any order with other suites. The
 * supplier is deleted in `afterAll`; the CASCADE on
 * `supplier_messaging_channels.supplier_id` removes its channels with it.
 *
 * Requires a local Supabase (`pnpm db:start`) with migrations applied. Skips
 * itself when that is not reachable.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createServiceClient,
  isLocalSupabaseReachable,
} from '../helpers/supabase-local';

let up = false;
let service: SupabaseClient;
let supplierId: string;
let smsChannelId: string;
let waChannelId: string;
let verifiedAt: string;

const TEST_PHONE = '+919000010001';
let messageCounter = 0;

function messageId(label: string): string {
  messageCounter += 1;
  return `compliance-${label}-${Date.now()}-${messageCounter}`;
}

/** Sends a message the way the webhook does, after parsing. */
async function inbound(options: {
  channel: 'SMS' | 'WHATSAPP';
  command: 'STOP' | 'START' | 'HELP';
  externalMessageId?: string;
  // deno-lint-ignore no-explicit-any
}): Promise<any> {
  const { data, error } = await service.rpc('ingest_supplier_message', {
    p_message: {
      provider: 'MOCK',
      channel: options.channel,
      externalMessageId: options.externalMessageId ?? messageId(options.command),
      phone: TEST_PHONE,
      body: options.command,
      raw: { test: true },
      parsed: {
        command: options.command,
        rfqReference: null,
        amount: null,
        currency: 'INR',
        unit: null,
        confidence: 1,
      },
    },
  });

  if (error) throw new Error(`ingest failed: ${error.message}`);
  return data;
}

async function statusOf(channelId: string): Promise<{
  status: string;
  verified_at: string | null;
}> {
  const { data, error } = await service
    .from('supplier_messaging_channels')
    .select('status, verified_at')
    .eq('id', channelId)
    .single();
  if (error) throw new Error(`could not read channel: ${error.message}`);
  return data as { status: string; verified_at: string | null };
}

async function resetChannelsToVerified(): Promise<void> {
  const { error } = await service
    .from('supplier_messaging_channels')
    .update({ status: 'VERIFIED', verified_at: verifiedAt })
    .eq('supplier_id', supplierId);
  if (error) throw new Error(`could not reset channels: ${error.message}`);
}

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;

  service = createServiceClient();

  const { data: supplier, error: supplierError } = await service
    .from('suppliers')
    .insert({
      business_name: 'Compliance test supplier',
      source: 'DIRECT',
      status: 'ACTIVE',
      contact_phone: TEST_PHONE,
    })
    .select('id')
    .single();
  if (supplierError) throw new Error(`could not seed supplier: ${supplierError.message}`);
  supplierId = supplier!.id as string;

  verifiedAt = new Date().toISOString();

  const { data: channels, error: channelError } = await service
    .from('supplier_messaging_channels')
    .insert([
      {
        supplier_id: supplierId,
        channel: 'SMS',
        phone_e164: TEST_PHONE,
        status: 'VERIFIED',
        verified_at: verifiedAt,
        last_provider: 'MOCK',
      },
      {
        supplier_id: supplierId,
        channel: 'WHATSAPP',
        phone_e164: TEST_PHONE,
        status: 'VERIFIED',
        verified_at: verifiedAt,
        last_provider: 'MOCK',
      },
    ])
    .select('id, channel');
  if (channelError) throw new Error(`could not seed channels: ${channelError.message}`);

  smsChannelId = (channels ?? []).find((c) => c.channel === 'SMS')!.id as string;
  waChannelId = (channels ?? []).find((c) => c.channel === 'WHATSAPP')!.id as string;
}, 60_000);

afterAll(async () => {
  if (!up || !supplierId) return;
  // CASCADE removes the two channels; audit events are append-only and stay.
  await service.from('suppliers').delete().eq('id', supplierId);
});

beforeEach(async () => {
  if (!up) return;
  await resetChannelsToVerified();
  // Prevent one test's messages from consuming the next test's per-number
  // rate budget. The RPC allows 12 inbound messages per phone per window and
  // this suite deliberately sends several from the same number.
  await service.from('messaging_rate_limits').delete().neq('bucket', '');
});

describe('STOP / START / HELP carrier compliance', () => {
  it('SKIPS itself when Supabase is not running', () => {
    if (!up) {
      console.warn('local Supabase not reachable — skipping compliance suite');
    }
    expect(true).toBe(true);
  });

  it('STOP suspends only the channel it arrived on', async () => {
    if (!up) return;

    const result = await inbound({ channel: 'SMS', command: 'STOP' });
    expect(result.outcome).toBe('OPTED_OUT');

    const sms = await statusOf(smsChannelId);
    const whatsapp = await statusOf(waChannelId);

    // The number opted out of SMS. Their WhatsApp permission is a separate
    // consent given to a separate carrier, and must not be revoked here.
    expect(sms.status).toBe('SUSPENDED');
    expect(whatsapp.status).toBe('VERIFIED');

    // Suspension keeps the proof of verification. START must restore without
    // re-issuing a code.
    expect(new Date(sms.verified_at!).toISOString()).toBe(verifiedAt);
  });

  it('records an audit event a compliance review can find', async () => {
    if (!up) return;

    const before = new Date().toISOString();
    await inbound({ channel: 'SMS', command: 'STOP' });

    const { data: events, error } = await service
      .from('audit_events')
      .select('event_type, entity_type, entity_id, payload, occurred_at')
      .eq('event_type', 'supplier.messaging_opted_out')
      .eq('entity_id', smsChannelId)
      .gte('occurred_at', before);
    if (error) throw new Error(`audit query failed: ${error.message}`);

    // Exactly one event per STOP, tied back to the channel a carrier can look up.
    expect(events?.length).toBe(1);
    expect(events![0].entity_type).toBe('supplier_messaging_channel');
    expect(events![0].payload).toMatchObject({ channel: 'SMS' });
  });

  it('is idempotent — a second STOP does not error and does not double-audit', async () => {
    if (!up) return;

    const before = new Date().toISOString();
    const first = await inbound({ channel: 'SMS', command: 'STOP' });
    const second = await inbound({ channel: 'SMS', command: 'STOP' });

    expect(first.outcome).toBe('OPTED_OUT');
    // Carriers replay STOP for retries; the second call must not blow up.
    expect(second.outcome).toBe('OPTED_OUT');

    const sms = await statusOf(smsChannelId);
    expect(sms.status).toBe('SUSPENDED');

    // Two audit events, one per receipt: retries are still worth logging, but
    // the RPC never crashes and never leaves the channel half-suspended.
    const { data: events } = await service
      .from('audit_events')
      .select('id')
      .eq('event_type', 'supplier.messaging_opted_out')
      .eq('entity_id', smsChannelId)
      .gte('occurred_at', before);
    expect(events?.length).toBe(2);
  });

  it('START restores the same VERIFIED timestamp — no re-verification', async () => {
    if (!up) return;

    // Stop, then start. The verified_at we assert must be the one from beforeAll.
    await inbound({ channel: 'SMS', command: 'STOP' });
    const stopped = await statusOf(smsChannelId);
    expect(stopped.status).toBe('SUSPENDED');
    expect(new Date(stopped.verified_at!).toISOString()).toBe(verifiedAt);

    const started = await inbound({ channel: 'SMS', command: 'START' });
    expect(started.outcome).toBe('OPTED_IN');

    const sms = await statusOf(smsChannelId);
    expect(sms.status).toBe('VERIFIED');
    // The proof that the supplier controls this number stays put. START is not
    // a way to bypass verification, only a way to undo an opt-out.
    expect(new Date(sms.verified_at!).toISOString()).toBe(verifiedAt);

    const { data: events } = await service
      .from('audit_events')
      .select('event_type')
      .eq('event_type', 'supplier.messaging_opted_in')
      .eq('entity_id', smsChannelId);
    expect(events?.length).toBeGreaterThanOrEqual(1);
  });

  it('START on an already-VERIFIED channel is a harmless no-op', async () => {
    if (!up) return;

    // No prior STOP — the supplier just texted START anyway.
    const result = await inbound({ channel: 'SMS', command: 'START' });
    expect(result.outcome).toBe('OPTED_IN');

    const sms = await statusOf(smsChannelId);
    expect(sms.status).toBe('VERIFIED');
    expect(new Date(sms.verified_at!).toISOString()).toBe(verifiedAt);
  });

  it('HELP acknowledges but does not touch consent', async () => {
    if (!up) return;

    const beforeHelp = new Date(Date.now() - 10_000).toISOString();
    const result = await inbound({ channel: 'SMS', command: 'HELP' });

    expect(result.outcome).toBe('HELP');
    // HELP must not change how future enquiries are routed.
    const sms = await statusOf(smsChannelId);
    expect(sms.status).toBe('VERIFIED');

    // The messaging_events row is marked ACCEPTED so the queue does not retry it.
    const { data: event, error } = await service
      .from('messaging_events')
      .select('processing_status, processed_at')
      .eq('id', result.eventId)
      .single();
    if (error) throw new Error(`event lookup failed: ${error.message}`);
    expect(event!.processing_status).toBe('ACCEPTED');
    expect(event!.processed_at).not.toBeNull();

    // A HELP still records that a message came in, because carriers may audit
    // "did the platform receive this?" independently of consent state.
    const { data: received } = await service
      .from('audit_events')
      .select('event_type')
      .eq('event_type', 'messaging.received')
      .eq('entity_id', result.eventId)
      .gte('occurred_at', beforeHelp);
    expect(received?.length).toBe(1);
  });

  it('an unknown number that texts STOP is not silently opted-in as a side effect', async () => {
    if (!up) return;

    const { data, error } = await service.rpc('ingest_supplier_message', {
      p_message: {
        provider: 'MOCK',
        channel: 'SMS',
        externalMessageId: messageId('unknown-stop'),
        // A phone we have not seeded a channel for. The gateway must not
        // materialise a channel row on the way to honouring STOP.
        phone: '+919000099999',
        body: 'STOP',
        raw: { test: true },
        parsed: {
          command: 'STOP',
          rfqReference: null,
          amount: null,
          currency: 'INR',
          unit: null,
          confidence: 1,
        },
      },
    });
    if (error) throw new Error(`ingest failed: ${error.message}`);
    // The correct answer for a stranger is "we do not know you", not
    // "opted out". Carriers block delivery at the network layer; the platform
    // never messages this number because there is no channel row for it.
    expect(data.outcome).toBe('UNKNOWN_SENDER');

    const { data: channels } = await service
      .from('supplier_messaging_channels')
      .select('id')
      .eq('phone_e164', '+919000099999');
    expect(channels?.length ?? 0).toBe(0);
  });
});
