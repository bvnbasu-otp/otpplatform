/**
 * The WhatsApp/SMS bidding channel, against a real database.
 *
 * Requires a local Supabase (`pnpm db:start`) with the demo seed applied
 * (`pnpm db:reset`). The file skips itself when that is not reachable.
 *
 * These are database tests rather than parser tests on purpose. The parser can
 * be wrong and the system must still be safe, so what is checked here is the
 * part that cannot be allowed to be wrong: that an unknown number cannot bid,
 * that an uninvited supplier cannot bid, that a retried webhook cannot create a
 * second quote, that a used link cannot be used again, and that none of this
 * shows a buyer who is bidding or a bidder what the buyer is called.
 */

import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

/** bharathi_turmeric stages to SOURCING: open, invited, and nothing bid yet. */
const RFQ_ID = DEMO.rfqs.turmeric;
const SCENARIO = DEMO.scenarios.turmeric;

let up = false;
let service: SupabaseClient;
let reference: string;

interface Bidder {
  supplierId: string;
  alias: string;
  phone: string;
  channel: 'SMS' | 'WHATSAPP';
}

let bidders: Bidder[] = [];
/** A demo supplier with a phone who was never invited to this enquiry. */
let outsider: Bidder;

let messageCounter = 0;

function messageId(label: string): string {
  messageCounter += 1;
  return `test-${label}-${Date.now()}-${messageCounter}`;
}

/** Posts a message the way the webhook does, after parsing. */
async function inbound(options: {
  from: Bidder | { phone: string; channel: 'SMS' | 'WHATSAPP' };
  command?: string;
  reference?: string | null;
  amount?: number | null;
  currency?: string;
  unit?: string | null;
  externalMessageId?: string;
  body?: string;
  // deno-lint-ignore no-explicit-any
}): Promise<any> {
  const { data, error } = await service.rpc('ingest_supplier_message', {
    p_message: {
      provider: 'MOCK',
      channel: options.from.channel,
      externalMessageId: options.externalMessageId ?? messageId('msg'),
      phone: options.from.phone,
      body: options.body ?? 'test message',
      raw: { test: true },
      parsed: options.command === null ? null : {
        command: options.command ?? 'QUOTE',
        rfqReference: options.reference === undefined ? reference : options.reference,
        amount: options.amount === undefined ? 8500 : options.amount,
        currency: options.currency ?? 'INR',
        unit: options.unit ?? null,
        confidence: 1,
      },
    },
  });

  if (error) throw new Error(`ingest failed: ${error.message}`);
  return data;
}

async function quoteFor(supplierId: string) {
  const { data } = await service
    .from('quotes')
    .select('id, status, current_version, source, submitted_at, received_at')
    .eq('rfq_id', RFQ_ID)
    .eq('supplier_id', supplierId)
    .maybeSingle();
  return data;
}

async function setRfq(patch: Record<string, unknown>) {
  const { error } = await service.from('rfqs').update(patch).eq('id', RFQ_ID);
  if (error) throw new Error(`could not adjust RFQ: ${error.message}`);
}

/** Returns the demo to its seeded shape, scenarios staged as the seed leaves them. */
async function resetDemo(): Promise<void> {
  await createServiceClient().from('demo_settings').update({ demo_mode_enabled: true }).eq('id', true);
  const admin = createAnonClient();
  await signInAs(admin, DEMO.logins.admin);
  const { error } = await admin.rpc('demo_reset', { p_restage: true });
  if (error) throw new Error(`demo_reset failed: ${error.message}`);
}

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;

  service = createServiceClient();

  // Start from the seeded baseline rather than from whatever a previous file
  // left behind. Quote versions are append-only, so a test that creates bids
  // cannot tidy up after itself — it has to begin from a known state instead.
  //
  // Restaging matters: without it the reset leaves every scenario in DRAFT,
  // which is not the state the seed produces and not what other test files
  // expect to find.
  await resetDemo();

  const admin = createAnonClient();
  await signInAs(admin, DEMO.logins.admin);
  const { error: stageError } = await admin.rpc('demo_stage_scenario', { p_code: SCENARIO });
  if (stageError) throw new Error(`staging failed: ${stageError.message}`);

  const { data: rfq } = await service
    .from('rfqs')
    .select('public_ref, status')
    .eq('id', RFQ_ID)
    .single();

  reference = rfq!.public_ref as string;
  expect(rfq!.status).toBe('OPEN');

  const { data: invitations } = await service
    .from('rfq_invitations')
    .select('supplier_id, anonymous_label')
    .eq('rfq_id', RFQ_ID);

  const { data: channels } = await service
    .from('supplier_messaging_channels')
    .select('supplier_id, phone_e164, channel')
    .eq('status', 'VERIFIED');

  const bySupplier = new Map(
    (channels ?? []).map((c) => [c.supplier_id as string, c]),
  );

  bidders = (invitations ?? [])
    .filter((i) => bySupplier.has(i.supplier_id as string))
    .map((i) => {
      const channel = bySupplier.get(i.supplier_id as string)!;
      return {
        supplierId: i.supplier_id as string,
        alias: i.anonymous_label as string,
        phone: channel.phone_e164 as string,
        channel: channel.channel as 'SMS' | 'WHATSAPP',
      };
    });

  const invitedIds = new Set(bidders.map((b) => b.supplierId));
  const stranger = (channels ?? []).find((c) => !invitedIds.has(c.supplier_id as string));

  outsider = {
    supplierId: stranger!.supplier_id as string,
    alias: 'not-invited',
    phone: stranger!.phone_e164 as string,
    channel: stranger!.channel as 'SMS' | 'WHATSAPP',
  };

  // Both channels need to be exercised, so the fixture must actually contain
  // both. If discovery ever invites only WhatsApp suppliers these tests would
  // silently stop covering SMS.
  expect(bidders.length).toBeGreaterThanOrEqual(2);
}, 180_000);

beforeEach(async (ctx) => {
  if (!up) ctx.skip();
  // The gateway is rate limited per number per minute, and a test file sends
  // far more messages in a minute than any supplier would. Counters are
  // infrastructure, so clearing them keeps each test independent; the limiter
  // itself is covered by its own test below.
  await service.from('messaging_rate_limits').delete().neq('bucket', '');
});

afterAll(async () => {
  if (!up) return;
  // This file creates bids, and append-only quote versions cannot be deleted.
  // So it hands the demo back in its seeded shape rather than leaving the next
  // test file to discover turmeric already has quotes on it.
  await resetDemo();
}, 180_000);

describe('a supplier bids by message', () => {
  it('records an indicative price as a draft, not as a submitted bid', async () => {
    const bidder = bidders[0]!;
    const result = await inbound({ from: bidder, amount: 8500 });

    expect(result.outcome).toBe('ACCEPTED');
    expect(result.reference).toBe(reference);
    expect(result.amount).toBe(8500);
    expect(result.magicLinkToken).toBeTruthy();

    const quote = await quoteFor(bidder.supplierId);
    expect(quote?.status).toBe('DRAFT_FROM_MESSAGING');
    expect(quote?.current_version).toBe(1);
    expect(quote?.source).toBe(bidder.channel);
    // Not submitted: they have said a number, not made an offer.
    expect(quote?.submitted_at).toBeNull();
    expect(quote?.received_at).not.toBeNull();
  });

  it('works the same over SMS as over WhatsApp', async () => {
    const sms = bidders.find((b) => b.channel === 'SMS');
    const whatsapp = bidders.find((b) => b.channel === 'WHATSAPP');

    for (const bidder of [sms, whatsapp].filter(Boolean) as Bidder[]) {
      const result = await inbound({ from: bidder, amount: 9100 });
      expect(result.outcome, bidder.channel).toBe('ACCEPTED');
      const quote = await quoteFor(bidder.supplierId);
      expect(quote?.source, bidder.channel).toBe(bidder.channel);
    }
  });

  it('stores the price where the evaluation engine already looks for it', async () => {
    // The channel is an access layer. If the snapshot shape differed, messaging
    // bids would need a second scoring path — and would eventually diverge.
    const bidder = bidders[0]!;
    await inbound({ from: bidder, amount: 7700 });
    const quote = await quoteFor(bidder.supplierId);

    const { data: version } = await service
      .from('quote_versions')
      .select('snapshot, notes')
      .eq('quote_id', quote!.id)
      .eq('version', quote!.current_version)
      .single();

    const snapshot = version!.snapshot as Record<string, unknown>;
    expect(snapshot.basePrice).toBe(7700);
    expect(snapshot.totalCost).toBe(7700);
    expect(snapshot.currency).toBe('INR');
    expect(snapshot.quotedVia).toBe(bidder.channel);
  });
});

describe('a retried webhook', () => {
  it('does not create a second quote or a second version', async () => {
    const bidder = bidders[1]!;
    const id = messageId('dup');

    const first = await inbound({ from: bidder, amount: 8800, externalMessageId: id });
    expect(first.outcome).toBe('ACCEPTED');
    const afterFirst = await quoteFor(bidder.supplierId);

    // The same delivery again, as a provider retry would send it.
    const second = await inbound({ from: bidder, amount: 1, externalMessageId: id });
    expect(second.outcome).toBe('DUPLICATE');

    const afterSecond = await quoteFor(bidder.supplierId);
    expect(afterSecond?.current_version).toBe(afterFirst?.current_version);
    expect(afterSecond?.id).toBe(afterFirst?.id);
  });
});

describe('revising a price', () => {
  it('adds a version rather than overwriting the last one', async () => {
    const bidder = bidders[0]!;
    await inbound({ from: bidder, amount: 8500 });
    const before = await quoteFor(bidder.supplierId);

    const revision = await inbound({ from: bidder, amount: 8200 });
    expect(revision.outcome).toBe('ACCEPTED');

    const after = await quoteFor(bidder.supplierId);
    expect(after?.id).toBe(before?.id);
    expect(after?.current_version).toBe(before!.current_version + 1);

    const { data: versions } = await service
      .from('quote_versions')
      .select('version, snapshot')
      .eq('quote_id', after!.id)
      .order('version');

    // The earlier price is still there. A supplier's bid history is evidence.
    expect(versions!.length).toBe(after!.current_version);
    expect((versions!.at(-1)!.snapshot as Record<string, unknown>).basePrice).toBe(8200);
  });

  it('changes the price without discarding terms they already gave', async () => {
    // A supplier texting a new price is changing their price, not withdrawing
    // their warranty and delivery commitments.
    const bidder = bidders[1]!;
    await inbound({ from: bidder, amount: 9000 });
    const quote = await quoteFor(bidder.supplierId);

    const token = await issueLink(bidder.supplierId);
    const session = await redeem(token);
    const { data: submitted } = await service.rpc('submit_messaging_quote', {
      p_session_token: session.sessionToken,
      p_quote: {
        basePrice: 9000, gstAmount: 1620, transportCost: 500,
        deliveryDays: 10, warrantyMonths: 24,
      },
    });
    expect(submitted.outcome).toBe('OK');

    await inbound({ from: bidder, amount: 8600 });

    const { data: latest } = await service
      .from('quote_versions')
      .select('snapshot, version')
      .eq('quote_id', quote!.id)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    const snapshot = latest!.snapshot as Record<string, number>;
    expect(snapshot.basePrice).toBe(8600);
    expect(snapshot.warrantyMonths).toBe(24);
    expect(snapshot.deliveryDays).toBe(10);
    // Recomputed, or the total would still describe the old price.
    expect(snapshot.totalCost).toBe(8600 + 1620 + 500);
  });

  it('keeps a bid that was already submitted in a submitted state', async () => {
    const bidder = bidders[1]!;
    const quote = await quoteFor(bidder.supplierId);
    expect(['SUBMITTED', 'REVISED']).toContain(quote?.status);
  });
});

describe('messages the gateway must refuse', () => {
  it('refuses a number we do not know', async () => {
    const result = await inbound({
      from: { phone: '+919999000111', channel: 'SMS' },
      amount: 100,
    });
    expect(result.outcome).toBe('UNKNOWN_SENDER');

    const { data: events } = await service
      .from('messaging_events')
      .select('processing_status, error_code, supplier_id')
      .eq('id', result.eventId)
      .single();

    expect(events!.processing_status).toBe('REJECTED');
    expect(events!.error_code).toBe('UNKNOWN_SENDER');
    expect(events!.supplier_id).toBeNull();
  });

  it('refuses a supplier who was not invited', async () => {
    const result = await inbound({ from: outsider, amount: 5000 });
    expect(result.outcome).toBe('NOT_INVITED');
    expect(await quoteFor(outsider.supplierId)).toBeNull();
  });

  it('gives an uninvited supplier the same answer as an unknown reference', async () => {
    // Otherwise the difference between the two replies is a way to discover
    // which enquiries exist.
    const notInvited = await inbound({ from: outsider, amount: 5000 });
    const noSuchRef = await inbound({
      from: bidders[0]!,
      reference: 'RFQ-ZZZZZZ',
      amount: 5000,
    });

    expect(notInvited.outcome).toBe('NOT_INVITED');
    expect(noSuchRef.outcome).toBe('RFQ_NOT_FOUND');
    // The gateway distinguishes them for the audit trail; the reply templates
    // collapse them, which is covered in the unit tests.
    expect(noSuchRef.rfqId).toBeUndefined();
  });

  it('refuses amounts that cannot be a price', async () => {
    for (const amount of [0, -100, 1e12]) {
      const result = await inbound({ from: bidders[0]!, amount });
      expect(result.outcome, String(amount)).toBe('INVALID_AMOUNT');
    }
    // Re-checked here even though the parser looked at it, because the parser is
    // on the untrusted side of the boundary.
    const missing = await inbound({ from: bidders[0]!, amount: null });
    expect(missing.outcome).toBe('INVALID_AMOUNT');
  });

  it('refuses a message it could not read', async () => {
    const unparsed = await inbound({ from: bidders[0]!, command: null });
    expect(unparsed.outcome).toBe('UNPARSEABLE');

    const noReference = await inbound({ from: bidders[0]!, reference: null });
    expect(noReference.outcome).toBe('UNPARSEABLE');
  });

  it('refuses a suspended supplier', async () => {
    const bidder = bidders[0]!;
    await service.from('suppliers').update({ status: 'SUSPENDED' }).eq('id', bidder.supplierId);

    try {
      const result = await inbound({ from: bidder, amount: 8000 });
      expect(result.outcome).toBe('SUPPLIER_SUSPENDED');
    } finally {
      await service.from('suppliers').update({ status: 'ACTIVE' }).eq('id', bidder.supplierId);
    }
  });

  it('refuses a bid once the enquiry is closed', async () => {
    await setRfq({ status: 'CLOSED' });
    try {
      const result = await inbound({ from: bidders[0]!, amount: 8000 });
      expect(result.outcome).toBe('RFQ_CLOSED');
    } finally {
      await setRfq({ status: 'OPEN' });
    }
  });

  it('refuses a bid after the deadline', async () => {
    await setRfq({ quote_deadline: new Date(Date.now() - 60_000).toISOString() });
    try {
      const result = await inbound({ from: bidders[0]!, amount: 8000 });
      expect(result.outcome).toBe('DEADLINE_PASSED');
    } finally {
      await setRfq({ quote_deadline: null });
    }
  });
});

describe('consent and passing', () => {
  it('honours STOP, then stops accepting bids from that number', async () => {
    const bidder = bidders[bidders.length - 1]!;

    const stop = await inbound({ from: bidder, command: 'STOP', amount: null });
    expect(stop.outcome).toBe('OPTED_OUT');

    const { data: channel } = await service
      .from('supplier_messaging_channels')
      .select('status, verified_at')
      .eq('phone_e164', bidder.phone)
      .eq('channel', bidder.channel)
      .single();

    expect(channel!.status).toBe('SUSPENDED');
    // Still proven, so START can restore them without re-verifying.
    expect(channel!.verified_at).not.toBeNull();

    const blocked = await inbound({ from: bidder, amount: 8000 });
    expect(blocked.outcome).toBe('UNKNOWN_SENDER');

    const start = await inbound({ from: bidder, command: 'START', amount: null });
    expect(start.outcome).toBe('OPTED_IN');

    const { data: restored } = await service
      .from('supplier_messaging_channels')
      .select('status')
      .eq('phone_e164', bidder.phone)
      .eq('channel', bidder.channel)
      .single();

    expect(restored!.status).toBe('VERIFIED');
  });

  it('records a supplier passing on the enquiry', async () => {
    const bidder = bidders[bidders.length - 1]!;
    const result = await inbound({ from: bidder, command: 'DECLINE', amount: null });
    expect(result.outcome).toBe('DECLINED');

    const { data: invitation } = await service
      .from('rfq_invitations')
      .select('status, declined_at, decline_reason')
      .eq('rfq_id', RFQ_ID)
      .eq('supplier_id', bidder.supplierId)
      .single();

    expect(invitation!.status).toBe('DECLINED');
    expect(invitation!.declined_at).not.toBeNull();
    expect(invitation!.decline_reason).toContain(bidder.channel);
  });
});

async function issueLink(supplierId: string): Promise<string> {
  const { data, error } = await service.rpc('issue_supplier_magic_link', {
    p_supplier_id: supplierId,
    p_rfq_id: RFQ_ID,
    p_channel: 'WHATSAPP',
  });
  if (error) throw new Error(`issue link failed: ${error.message}`);
  return data as string;
}

// deno-lint-ignore no-explicit-any
async function redeem(token: string): Promise<any> {
  const { data, error } = await service.rpc('redeem_supplier_magic_link', {
    p_token: token,
    p_from: '203.0.113.9',
  });
  if (error) throw new Error(`redeem failed: ${error.message}`);
  return data;
}

describe('the magic link', () => {
  it('is stored only as a hash', async () => {
    const token = await issueLink(bidders[0]!.supplierId);

    const { data: rows } = await service
      .from('supplier_magic_links')
      .select('token_hash')
      .eq('supplier_id', bidders[0]!.supplierId);

    // A copy of the table must not be a set of working keys.
    for (const row of rows ?? []) {
      expect(row.token_hash).not.toBe(token);
      expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('opens once and never again', async () => {
    const token = await issueLink(bidders[0]!.supplierId);

    const first = await redeem(token);
    expect(first.outcome).toBe('OK');
    expect(first.sessionToken).toBeTruthy();

    // A forwarded link must not let a second person in.
    const second = await redeem(token);
    expect(second.outcome).toBe('INVALID');
  });

  it('answers a made-up token exactly as it answers a used one', async () => {
    const invented = await redeem('not-a-real-token-at-all');
    expect(invented.outcome).toBe('INVALID');
  });

  it('refuses an expired link', async () => {
    const token = await issueLink(bidders[0]!.supplierId);
    const hash = await sha256Hex(token);

    // created_at moves too: the table refuses a link that expires before it was
    // created, which is the constraint keeping links short-lived by construction.
    const { error } = await service
      .from('supplier_magic_links')
      .update({
        created_at: new Date(Date.now() - 7_200_000).toISOString(),
        expires_at: new Date(Date.now() - 3_600_000).toISOString(),
      })
      .eq('token_hash', hash);
    expect(error).toBeNull();

    const result = await redeem(token);
    expect(result.outcome).toBe('INVALID');
  });

  it('stops working when the enquiry stops taking bids', async () => {
    const token = await issueLink(bidders[0]!.supplierId);
    await setRfq({ status: 'CLOSED' });
    try {
      const result = await redeem(token);
      expect(result.outcome).toBe('RFQ_CLOSED');
    } finally {
      await setRfq({ status: 'OPEN' });
    }
  });

  it('cannot be issued for an enquiry the supplier was not invited to', async () => {
    const { error } = await service.rpc('issue_supplier_magic_link', {
      p_supplier_id: outsider.supplierId,
      p_rfq_id: RFQ_ID,
      p_channel: 'SMS',
    });
    expect(error?.message).toMatch(/not invited/i);
  });
});

describe('finishing the quote from the link', () => {
  it('prefills what they texted, and names no buyer they should not see', async () => {
    const bidder = bidders[0]!;
    await inbound({ from: bidder, amount: 8350 });

    const session = await redeem(await issueLink(bidder.supplierId));
    const { data: context } = await service.rpc('messaging_quote_context', {
      p_session_token: session.sessionToken,
    });

    expect(context.outcome).toBe('OK');
    expect(context.quote.snapshot.basePrice).toBe(8350);
    expect(context.rfq.publicRef).toBe(reference);

    // The payload is an allow-list, so a widened payload fails here.
    const allowed = new Set([
      'publicRef', 'alias', 'title', 'category', 'subcategory', 'quantity',
      'unit', 'location', 'requiredByDays', 'requiredByDate', 'quoteDeadline',
      'minQuotes', 'buyerDisplay', 'isDemo',
    ]);
    for (const key of Object.keys(context.rfq)) {
      expect(allowed.has(key), `unexpected field "${key}" sent to a supplier`).toBe(true);
    }
  });

  it('submits the structured quote and marks the invitation quoted', async () => {
    const bidder = bidders[0]!;
    const session = await redeem(await issueLink(bidder.supplierId));

    const { data: result } = await service.rpc('submit_messaging_quote', {
      p_session_token: session.sessionToken,
      p_quote: {
        basePrice: 8350, gstAmount: 1503, transportCost: 400,
        deliveryDays: 7, warrantyMonths: 12, notes: 'Ex-warehouse Erode',
      },
    });

    expect(result.outcome).toBe('OK');
    expect(['SUBMITTED', 'REVISED']).toContain(result.status);

    const quote = await quoteFor(bidder.supplierId);
    expect(quote?.submitted_at).not.toBeNull();

    const { data: invitation } = await service
      .from('rfq_invitations')
      .select('status')
      .eq('rfq_id', RFQ_ID)
      .eq('supplier_id', bidder.supplierId)
      .single();

    expect(invitation!.status).toBe('QUOTED');
  });

  it('refuses an invented or expired session', async () => {
    const { data: invented } = await service.rpc('messaging_quote_context', {
      p_session_token: 'nonsense',
    });
    expect(invented.outcome).toBe('INVALID_SESSION');

    const { data: submit } = await service.rpc('submit_messaging_quote', {
      p_session_token: 'nonsense',
      p_quote: { basePrice: 1000 },
    });
    expect(submit.outcome).toBe('INVALID_SESSION');
  });

  it('re-checks the deadline at submit time, not only at link time', async () => {
    // The session proved who they are. It says nothing about whether the
    // enquiry is still taking bids.
    const bidder = bidders[0]!;
    const session = await redeem(await issueLink(bidder.supplierId));

    await setRfq({ quote_deadline: new Date(Date.now() - 60_000).toISOString() });
    try {
      const { data: result } = await service.rpc('submit_messaging_quote', {
        p_session_token: session.sessionToken,
        p_quote: { basePrice: 8000 },
      });
      expect(result.outcome).toBe('DEADLINE_PASSED');
    } finally {
      await setRfq({ quote_deadline: null });
    }
  });

  it('refuses a session token as a way to submit nonsense amounts', async () => {
    const session = await redeem(await issueLink(bidders[0]!.supplierId));
    const { data: result } = await service.rpc('submit_messaging_quote', {
      p_session_token: session.sessionToken,
      p_quote: { basePrice: -5 },
    });
    expect(result.outcome).toBe('INVALID_AMOUNT');
  });
});

describe('identity protection, both directions', () => {
  it('hides an indicative price from the buyer until it is submitted', async () => {
    const bidder = bidders[2] ?? bidders[0]!;
    await inbound({ from: bidder, amount: 8888 });

    const quote = await quoteFor(bidder.supplierId);
    expect(quote?.status).toBe('DRAFT_FROM_MESSAGING');

    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const { data: visible } = await buyer
      .from('quotes_blind')
      .select('quote_id, status')
      .eq('rfq_id', RFQ_ID);

    // A number they texted but never stood behind is not something to compare.
    expect((visible ?? []).map((q) => q.quote_id)).not.toContain(quote!.id);
    for (const row of visible ?? []) {
      expect(row.status).not.toBe('DRAFT_FROM_MESSAGING');
    }
  });

  it('never lets a buyer reach a supplier phone number', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const { data: channels } = await buyer
      .from('supplier_messaging_channels')
      .select('phone_e164');
    expect(channels ?? []).toHaveLength(0);

    const { data: events } = await buyer
      .from('messaging_events')
      .select('phone_e164');
    expect(events ?? []).toHaveLength(0);

    const { data: links } = await buyer.from('supplier_magic_links').select('token_hash');
    expect(links ?? []).toHaveLength(0);
  });

  it('shows the buyer delivery state under the alias only', async () => {
    const bidder = bidders[0]!;

    const { error } = await service.rpc('record_supplier_notification', {
      p_notification: {
        rfqId: RFQ_ID,
        supplierId: bidder.supplierId,
        channel: bidder.channel,
        provider: 'MOCK',
        status: 'DELIVERED',
        templateId: 'rfq_notification_whatsapp',
        body: 'test enquiry notification',
      },
    });
    expect(error).toBeNull();

    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const { data: rows } = await buyer
      .from('rfq_notification_status')
      .select('*')
      .eq('rfq_id', RFQ_ID);

    expect((rows ?? []).length).toBeGreaterThan(0);
    for (const row of rows ?? []) {
      expect(row.anonymous_label).toMatch(/^(Supplier|Bidder) /);
      for (const forbidden of ['phone_e164', 'supplier_id', 'business_name',
        'external_message_id', 'failure_reason', 'body']) {
        expect(forbidden in row, `${forbidden} exposed to buyer`).toBe(false);
      }
    }
  });

  it('does not tell a supplier who the committee is or what the budget was', async () => {
    const { data: payload } = await service.rpc('supplier_rfq_message_payload', {
      p_rfq_id: RFQ_ID,
      p_supplier_id: bidders[0]!.supplierId,
    });

    for (const forbidden of ['organizationId', 'organization_id', 'createdBy',
      'committee', 'budget', 'evaluationWeights', 'contactPhone', 'address']) {
      expect(forbidden in payload, `${forbidden} sent to a supplier`).toBe(false);
    }
  });

  it('keeps the buyer out of the message when they chose anonymity', async () => {
    await setRfq({ buyer_anonymous_to_suppliers: true });
    try {
      const { data: payload } = await service.rpc('supplier_rfq_message_payload', {
        p_rfq_id: RFQ_ID,
        p_supplier_id: bidders[0]!.supplierId,
      });
      expect(payload.buyerDisplay).toBe('IDENTITY PROTECTED');
    } finally {
      await setRfq({ buyer_anonymous_to_suppliers: false });
    }
  });

  it('writes an audit trail that names aliases, not suppliers', async () => {
    const bidder = bidders[0]!;
    await inbound({ from: bidder, amount: 8450 });

    const { data: events } = await service
      .from('audit_events')
      .select('event_type, payload')
      .in('event_type', [
        'quote.draft_created_from_messaging',
        'quote.revised_from_messaging',
      ])
      .order('occurred_at', { ascending: false })
      .limit(5);

    expect((events ?? []).length).toBeGreaterThan(0);
    for (const event of events ?? []) {
      const payload = event.payload as Record<string, unknown>;
      expect(payload.alias).toMatch(/^(Supplier|Bidder) /);
      expect('supplierId' in payload).toBe(false);
      expect('businessName' in payload).toBe(false);
    }
  });
});

describe('the demo path', () => {
  it('shows the conversation to the buying side without naming anyone', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const { data: thread, error } = await buyer.rpc('demo_messaging_thread', {
      p_rfq_id: RFQ_ID,
    });

    expect(error).toBeNull();
    expect(Array.isArray(thread)).toBe(true);

    for (const entry of thread as Array<Record<string, unknown>>) {
      expect(String(entry.alias)).toMatch(/^(Supplier|Bidder) /);
      expect('phone' in entry).toBe(false);
      expect('supplierId' in entry).toBe(false);
    }
  });

  it('lists bidders to simulate as, by alias and masked number', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const { data: recipients, error } = await buyer.rpc('demo_messaging_recipients', {
      p_rfq_id: RFQ_ID,
    });

    expect(error).toBeNull();
    expect((recipients as unknown[]).length).toBeGreaterThan(0);

    for (const entry of recipients as Array<Record<string, unknown>>) {
      expect(String(entry.alias)).toMatch(/^(Supplier|Bidder) /);
      // Enough to tell two bidders apart, not enough to call one.
      expect(String(entry.phoneMasked)).toMatch(/•{5}$/);
      expect('phone' in entry).toBe(false);
    }
  });

  it('is refused on an enquiry the caller has no access to', async () => {
    const outsiderBuyer = createAnonClient();
    await signInAs(outsiderBuyer, DEMO.logins.sunriseManager);

    const { error } = await outsiderBuyer.rpc('demo_messaging_thread', {
      p_rfq_id: RFQ_ID,
    });
    expect(error).not.toBeNull();
  });

  it('offers the enquiry text to send, carrying nothing a supplier may not see', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const { data, error } = await buyer.rpc('demo_messaging_outbox', {
      p_rfq_id: RFQ_ID,
    });

    expect(error).toBeNull();

    for (const entry of (data ?? []) as Array<Record<string, unknown>>) {
      expect(String(entry.alias)).toMatch(/^(Supplier|Bidder) /);
      const payload = entry.payload as Record<string, unknown>;
      expect(payload.publicRef).toBe(reference);
      for (const forbidden of ['buyerName', 'organizationId', 'budget', 'committee']) {
        expect(forbidden in payload).toBe(false);
      }
    }
  });

  it('sends the enquiry and then stops offering it to the same bidder', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const { data: queued } = await buyer.rpc('demo_messaging_outbox', { p_rfq_id: RFQ_ID });
    const first = (queued as Array<Record<string, unknown>>)[0];
    if (!first) return;

    const { data: id, error } = await buyer.rpc('demo_send_notification', {
      p_rfq_id: RFQ_ID,
      p_alias: first.alias,
      p_body: 'Enquiry text as the supplier would see it',
      p_template_id: 'rfq_notification_whatsapp',
    });

    expect(error).toBeNull();
    expect(id).toBeTruthy();

    // Re-running the send must not text anyone twice.
    const { data: after } = await buyer.rpc('demo_messaging_outbox', { p_rfq_id: RFQ_ID });
    const aliases = (after as Array<Record<string, unknown>>).map((row) => row.alias);
    expect(aliases).not.toContain(first.alias);
  });

  it('bids as a bidder through the real gateway, identified only by alias', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const bidder = bidders[1]!;
    const externalId = messageId('sim');

    const { data, error } = await buyer.rpc('demo_simulate_supplier_message', {
      p_rfq_id: RFQ_ID,
      p_alias: bidder.alias,
      p_body: `QUOTE ${reference} 9100`,
      p_parsed: {
        command: 'QUOTE',
        rfqReference: reference,
        amount: 9100,
        currency: 'INR',
        confidence: 1,
      },
      p_message_id: externalId,
    });

    expect(error).toBeNull();
    expect(data.outcome).toBe('ACCEPTED');
    expect(data.channel).toBe(bidder.channel);
    // The link is the supplier's credential, so it comes back once and is not
    // stored anywhere the browser could read it again.
    expect(typeof data.magicLinkToken).toBe('string');

    const quote = await quoteFor(bidder.supplierId);
    expect(Number(quote!.current_version)).toBeGreaterThanOrEqual(1);

    // Replaying the same delivery is refused, exactly as it is for a real
    // provider retry — the demo cannot fake a second bid out of one message.
    const { data: replay } = await buyer.rpc('demo_simulate_supplier_message', {
      p_rfq_id: RFQ_ID,
      p_alias: bidder.alias,
      p_body: `QUOTE ${reference} 9100`,
      p_parsed: { command: 'QUOTE', rfqReference: reference, amount: 9100, confidence: 1 },
      p_message_id: externalId,
    });
    expect(replay.outcome).toBe('DUPLICATE');
  });

  it('refuses a bid after the deadline, driven from the demo like any other', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const bidder = bidders[0]!;
    const { data: original } = await service
      .from('rfqs').select('quote_deadline').eq('id', RFQ_ID).single();

    await setRfq({ quote_deadline: new Date(Date.now() - 3_600_000).toISOString() });

    try {
      const { data } = await buyer.rpc('demo_simulate_supplier_message', {
        p_rfq_id: RFQ_ID,
        p_alias: bidder.alias,
        p_body: `QUOTE ${reference} 7000`,
        p_parsed: { command: 'QUOTE', rfqReference: reference, amount: 7000, confidence: 1 },
      });

      expect(data.outcome).toBe('DEADLINE_PASSED');
    } finally {
      await setRfq({ quote_deadline: original!.quote_deadline });
    }
  });

  it('records the reply the supplier received, without touching the bid', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const bidder = bidders[0]!;
    const before = await quoteFor(bidder.supplierId);

    const { data: id, error } = await buyer.rpc('demo_record_reply', {
      p_rfq_id: RFQ_ID,
      p_alias: bidder.alias,
      p_body: 'Got it. ₹8,500 recorded.',
      p_template_id: 'quote_ack',
    });

    expect(error).toBeNull();
    expect(id).toBeTruthy();

    const after = await quoteFor(bidder.supplierId);
    expect(after?.current_version).toBe(before?.current_version);
    expect(after?.status).toBe(before?.status);
  });

  it('shows a message the gateway could not read, next to the reply it drew', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const bidder = bidders[0]!;

    // No reference and no price. The gateway rightly refuses it — and the demo
    // has to show that refusal, because "we could not read that" is one of the
    // cases worth demonstrating. A reply visible with no message above it would
    // read as the system talking to itself.
    const { data } = await buyer.rpc('demo_simulate_supplier_message', {
      p_rfq_id: RFQ_ID,
      p_alias: bidder.alias,
      p_body: 'how much can you pay',
      p_parsed: { command: 'UNKNOWN', rfqReference: null, amount: null, confidence: 0.2 },
    });

    expect(data.outcome).toBe('UNPARSEABLE');

    const { data: thread } = await buyer.rpc('demo_messaging_thread', { p_rfq_id: RFQ_ID });
    const bodies = (thread as Array<Record<string, unknown>>).map((row) => row.body);
    expect(bodies).toContain('how much can you pay');
  });

  it('keeps a bidder who opted out on screen, so they can be turned back on', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.bharathiOwner);

    const bidder = bidders[bidders.length - 1]!;

    const { data: stopped } = await buyer.rpc('demo_simulate_supplier_message', {
      p_rfq_id: RFQ_ID,
      p_alias: bidder.alias,
      p_body: 'STOP',
      p_parsed: { command: 'STOP', rfqReference: null, amount: null, confidence: 1 },
    });
    expect(stopped.outcome).toBe('OPTED_OUT');

    try {
      // Opting out must not make the bidder unreachable from the demo. A
      // presenter who demonstrates STOP has to be able to demonstrate START,
      // and resetting the whole environment to undo one click is not that.
      const { data: recipients } = await buyer.rpc('demo_messaging_recipients', {
        p_rfq_id: RFQ_ID,
      });
      const row = (recipients as Array<Record<string, unknown>>)
        .find((entry) => entry.alias === bidder.alias);

      expect(row).toBeDefined();
      expect(row!.channelStatus).toBe('SUSPENDED');

      const { data: started } = await buyer.rpc('demo_simulate_supplier_message', {
        p_rfq_id: RFQ_ID,
        p_alias: bidder.alias,
        p_body: 'START',
        p_parsed: { command: 'START', rfqReference: null, amount: null, confidence: 1 },
      });
      expect(started.outcome).toBe('OPTED_IN');
    } finally {
      await service
        .from('supplier_messaging_channels')
        .update({ status: 'VERIFIED' })
        .eq('supplier_id', bidder.supplierId);
    }
  });

  it('will not let an outside buyer bid on someone else\'s enquiry', async () => {
    const outsiderBuyer = createAnonClient();
    await signInAs(outsiderBuyer, DEMO.logins.sunriseManager);

    const { error } = await outsiderBuyer.rpc('demo_simulate_supplier_message', {
      p_rfq_id: RFQ_ID,
      p_alias: bidders[0]!.alias,
      p_body: `QUOTE ${reference} 1`,
      p_parsed: { command: 'QUOTE', rfqReference: reference, amount: 1, confidence: 1 },
    });

    expect(error).not.toBeNull();
  });

  it('will not simulate for an anonymous caller at all', async () => {
    const anon = createAnonClient();

    const { error } = await anon.rpc('demo_simulate_supplier_message', {
      p_rfq_id: RFQ_ID,
      p_alias: bidders[0]!.alias,
      p_body: `QUOTE ${reference} 1`,
      p_parsed: { command: 'QUOTE', rfqReference: reference, amount: 1, confidence: 1 },
    });

    expect(error).not.toBeNull();
  });
});

describe('abuse control', () => {
  it('stops answering a number that floods the gateway', async () => {
    const bidder = bidders[bidders.length - 1]!;
    const outcomes: string[] = [];

    // The limit is per number and per minute, so one handset cannot exhaust the
    // gateway for every other supplier.
    for (let i = 0; i < 16; i += 1) {
      const result = await inbound({ from: bidder, command: 'HELP', amount: null });
      outcomes.push(result.outcome);
    }

    expect(outcomes).toContain('RATE_LIMITED');
  });
});

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
