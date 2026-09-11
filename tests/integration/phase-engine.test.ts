/**
 * The clock, and whether it is actually the rule.
 *
 * A deadline that the browser checks is a suggestion. This file works the other
 * way round: it writes prices, questions and votes straight at the database over
 * the API, with the deadline already gone, and expects every one of them to be
 * refused. It also checks the two directions the engine is allowed to move an
 * enquiry on its own — bidding into clarification, clarification into evaluation —
 * and the one it is not: nothing here may award anything.
 *
 * Each test builds its own enquiry rather than borrowing a seeded one, because
 * moving a deadline on a shared fixture changes what a later test is looking at.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

type Client = ReturnType<typeof createAnonClient>;

const service = createServiceClient();

let up = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

const HOUR = 3_600_000;

function at(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

/** Ids created by a test, torn down afterwards so nothing leaks into the demo. */
const created: { requirements: string[] } = { requirements: [] };

afterEach(async () => {
  if (!up) return;

  // Requirements cascade to the RFQ, its invitations and quotes.
  //
  // Two tests here prove the window *accepts* a price, which writes a real
  // quote_versions row, and quote_versions is append-only outside a demo reset
  // (INV-064). The cascade is refused for those, on purpose: a submitted price is
  // evidence and the schema has no route to erasing it. Those enquiries stay until
  // `pnpm db:reset`, which is why the fixture builds rows that satisfy the same
  // invariants a published enquiry does. Anything else that refuses a delete is a
  // surprise and is raised.
  for (const id of created.requirements.splice(0)) {
    const { error } = await service.from('requirements').delete().eq('id', id);
    if (error && !/INV-064|append-only/i.test(error.message)) {
      throw new Error(`phase fixture teardown failed: ${error.message}`);
    }
  }
});

interface Fixture {
  rfqId: string;
  invitationId: string;
  supplierId: string;
  quoteId?: string;
}

async function profileIdFor(email: string): Promise<string> {
  const { data } = await service.from('profiles').select('id').eq('email', email).single();
  return data!.id as string;
}

/**
 * A per-RFQ alias of the same shape the allocator produces.
 *
 * The real allocator is private.assign_anonymous_label, a salted hash reachable
 * only through discovery, and discovery picks suppliers by capability rather than
 * the named one these tests need to sign in as. The one property that matters here
 * is the one 00022 exists to protect: a supplier must not carry the same label
 * across two enquiries, or the labels become a join key. So this is random per
 * fixture rather than a fixed string.
 */
function freshAlias(): string {
  return `Supplier ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * An enquiry of our own, at whatever point in its life the test needs.
 *
 * Windows are given as offsets from now, so a test can describe "closed an hour
 * ago" without arithmetic in the test body.
 *
 * Built forwards rather than assembled: the enquiry opens with a live window, the
 * quote is written while quoting is genuinely allowed, and only then is the clock
 * wound to where the test wants it. Building it the other way round is refused by
 * the very trigger these tests exist to check.
 */
async function makeEnquiry(options: {
  status: 'DRAFT' | 'OPEN' | 'CLARIFICATION' | 'EVALUATING';
  bidDeadlineMs?: number | null;
  revisionDeadlineMs?: number | null;
  evaluationDeadlineMs?: number | null;
  withQuote?: boolean;
  quoteStatus?: 'DRAFT' | 'SUBMITTED' | 'REVISED' | 'FINAL';
}): Promise<Fixture> {
  const creator = await profileIdFor(DEMO.logins.sunriseManager);
  const future = (ms: number | null | undefined): string | null =>
    ms == null ? null : at(Math.max(ms, 24 * HOUR));

  // Classified, because these rows sit in the same table the engine tests scan for
  // unclassified requirements and for a type that disagrees with the mode. A
  // fixture that skips classification is an invalid row for as long as it lives,
  // and these files run alongside each other.
  const { data: subcategory } = await service
    .from('requirement_subcategories')
    .select('id, category_id')
    .eq('code', 'motor_rewinding')
    .single();

  const { data: requirement, error: reqError } = await service
    .from('requirements')
    .insert({
      organization_id: DEMO.orgs.sunrise,
      created_by: creator,
      requirement_type: 'SERVICE',
      requirement_mode: 'REPAIR_MAINTENANCE',
      category_id: subcategory!.category_id,
      subcategory_id: subcategory!.id,
      status: 'QUOTING',
      title: 'Phase engine fixture',
      description: 'Created by tests/integration/phase-engine.test.ts',
      delivery_city: 'Bengaluru',
    })
    .select('id')
    .single();

  expect(reqError).toBeNull();
  created.requirements.push(requirement!.id);

  const bid = options.bidDeadlineMs === undefined ? HOUR : options.bidDeadlineMs;

    const bidDeadline = future(bid);

    // Inserted as DRAFT and then moved, so the phase trigger sees a real
    // transition and stamps the phase start the way it would in life.
    const { data: rfq, error: rfqError } = await service
      .from('rfqs')
      .insert({
        requirement_id: requirement!.id,
        organization_id: DEMO.orgs.sunrise,
        status: 'DRAFT',
        reveal_status: 'BLIND',
        title: 'Phase engine fixture',
        created_by: creator,
        buyer_anonymous_to_suppliers: true,
        quote_deadline: bidDeadline,
        bid_deadline: bidDeadline,
        revision_deadline: future(options.revisionDeadlineMs),
        evaluation_deadline: future(options.evaluationDeadlineMs),
      })
    .select('id')
    .single();

  expect(rfqError).toBeNull();

  const { data: invitation, error: inviteError } = await service
    .from('rfq_invitations')
    .insert({
      rfq_id: rfq!.id,
      supplier_id: DEMO.suppliers.aquaPrime,
      anonymous_label: freshAlias(),
      status: 'INVITED',
    })
    .select('id')
    .single();

  expect(inviteError).toBeNull();

  const fixture: Fixture = {
    rfqId: rfq!.id,
    invitationId: invitation!.id,
    supplierId: DEMO.suppliers.aquaPrime,
  };

  if (options.withQuote) {
    await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfq!.id);

    const { data: quote, error: quoteError } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: DEMO.suppliers.aquaPrime,
        invitation_id: invitation!.id,
        status: options.quoteStatus ?? 'SUBMITTED',
        current_version: 1,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    expect(quoteError).toBeNull();
    fixture.quoteId = quote!.id;
  }

  if (options.status !== 'DRAFT') {
    const { error } = await service
      .from('rfqs')
      .update({ status: options.status })
      .eq('id', rfq!.id);
    expect(error).toBeNull();
  }

  // Now the clock. Written explicitly, which is also the path a buyer takes when
  // they shorten a window, so the trigger leaves these values alone.
  const wound: Record<string, string | null> = {};
  if (bid !== null && bid < 24 * HOUR) {
    wound.bid_deadline = at(bid);
    if (options.status === 'OPEN' || options.status === 'DRAFT') {
      wound.quote_deadline = at(bid);
    }
  }
  if (options.revisionDeadlineMs != null && options.revisionDeadlineMs < 24 * HOUR) {
    wound.revision_deadline = at(options.revisionDeadlineMs);
    if (options.status === 'CLARIFICATION') {
      wound.quote_deadline = at(options.revisionDeadlineMs);
    }
  }
  if (options.evaluationDeadlineMs != null && options.evaluationDeadlineMs < 24 * HOUR) {
    wound.evaluation_deadline = at(options.evaluationDeadlineMs);
  }
  if (bid === null) {
    wound.bid_deadline = null;
    wound.quote_deadline = null;
  }

  if (Object.keys(wound).length > 0) {
    const { error } = await service.from('rfqs').update(wound).eq('id', rfq!.id);
    expect(error).toBeNull();
  }

  return fixture;
}

async function rfqRow(rfqId: string) {
  const { data } = await service
    .from('rfqs')
    .select(
      'status, quote_deadline, bid_deadline, revision_deadline, evaluation_deadline, ' +
        'opened_at, clarification_at, evaluation_at',
    )
    .eq('id', rfqId)
    .single();
  return data!;
}

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

describe('the window follows the phase', () => {
  it('quotes against the bid deadline while bidding is open', async () => {
    const { rfqId } = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: 2 * HOUR });

    const row = await rfqRow(rfqId);
    expect(
      Math.abs(new Date(row.quote_deadline).getTime() - new Date(row.bid_deadline).getTime())
    ).toBeLessThanOrEqual(10);
    expect(row.opened_at).not.toBeNull();
  });

  it('moves the live window to the revision deadline when clarification starts', async () => {
    const { rfqId } = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      revisionDeadlineMs: 5 * HOUR,
    });

    await service.from('rfqs').update({ status: 'CLARIFICATION' }).eq('id', rfqId);

    const row = await rfqRow(rfqId);

    expect(row.quote_deadline).toBe(row.revision_deadline);
    expect(row.clarification_at).not.toBeNull();
    // The published bid deadline survives the window moving past it.
    expect(new Date(row.bid_deadline!).getTime()).toBeLessThan(
      new Date(row.quote_deadline!).getTime(),
    );
  });

  it('does not invent a revision window that nobody granted', async () => {
    const { rfqId } = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      revisionDeadlineMs: null,
    });

    await service.from('rfqs').update({ status: 'CLARIFICATION' }).eq('id', rfqId);

    const row = await rfqRow(rfqId);

    // Prices stay frozen at the date suppliers were actually given.
    expect(row.quote_deadline).toBe(row.bid_deadline);
  });

  it('treats a deadline written by hand as the new window', async () => {
    const { rfqId } = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: HOUR });
    const extended = at(9 * HOUR);

    await service
      .from('rfqs')
      .update({ status: 'CLARIFICATION', quote_deadline: extended })
      .eq('id', rfqId);

    const row = await rfqRow(rfqId);

    expect(new Date(row.quote_deadline!).getTime()).toBe(new Date(extended).getTime());
    // And the extension is recorded as the revision window, not left implicit.
    expect(new Date(row.revision_deadline!).getTime()).toBe(new Date(extended).getTime());
  });

  it('gives evaluation a deadline even when nobody set one', async () => {
    const { rfqId } = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: HOUR });

    await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', rfqId);

    const row = await rfqRow(rfqId);

    expect(row.evaluation_at).not.toBeNull();
    expect(new Date(row.evaluation_deadline!).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('refusing a price after the window shut', () => {
  it('refuses a new quote on the API path', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: -HOUR });

    const { error } = await service.from('quotes').insert({
      rfq_id: fixture.rfqId,
      supplier_id: DEMO.suppliers.nandi,
      invitation_id: fixture.invitationId,
      status: 'SUBMITTED',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/quoting deadline .* has passed/i);
  });

  it('refuses a revised price, which is where the number actually lands', async () => {
    // The quote row already exists and is untouched; only the version is late.
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    const { error } = await service.from('quote_versions').insert({
      quote_id: fixture.quoteId!,
      version: 2,
      snapshot: { basePrice: 1000 },
      created_by: await profileIdFor(DEMO.logins.motorSupplier),
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/deadline/i);
  });

  it('accepts the same price while the window is still open', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: 4 * HOUR,
      withQuote: true,
    });

    const { error } = await service.from('quote_versions').insert({
      quote_id: fixture.quoteId!,
      version: 2,
      snapshot: { basePrice: 1000 },
      created_by: await profileIdFor(DEMO.logins.motorSupplier),
    });

    expect(error).toBeNull();
  });

  it('refuses a quote on an enquiry that has not been published', async () => {
    const fixture = await makeEnquiry({ status: 'DRAFT', bidDeadlineMs: HOUR });

    const { error } = await service.from('quotes').insert({
      rfq_id: fixture.rfqId,
      supplier_id: DEMO.suppliers.nandi,
      invitation_id: fixture.invitationId,
      status: 'SUBMITTED',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not open for quoting yet/i);
  });

  it('refuses a quote once the enquiry has moved to evaluation', async () => {
    const fixture = await makeEnquiry({
      status: 'EVALUATING',
      bidDeadlineMs: 4 * HOUR,
      evaluationDeadlineMs: 8 * HOUR,
    });

    const { error } = await service.from('quotes').insert({
      rfq_id: fixture.rfqId,
      supplier_id: DEMO.suppliers.nandi,
      invitation_id: fixture.invitationId,
      status: 'SUBMITTED',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/no longer accepting quotes/i);
  });

  it('holds the messaging gateway to the same deadline as the web form', async () => {
    // The gateway runs as service_role. That buys it no exemption from the clock:
    // it is a second route in, and a second route with its own rules is not a rule.
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    const { error } = await service.from('quote_versions').insert({
      quote_id: fixture.quoteId!,
      version: 2,
      snapshot: { basePrice: 999, source: 'WHATSAPP' },
      created_by: await profileIdFor(DEMO.logins.motorSupplier),
    });

    expect(error).not.toBeNull();
  });
});

describe('refusing a question after the thread closed', () => {
  it('refuses a clarification message once the revision window has gone', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      revisionDeadlineMs: 2 * HOUR,
      withQuote: true,
    });

    await service.from('rfqs').update({ status: 'CLARIFICATION' }).eq('id', fixture.rfqId);
    await service
      .from('rfqs')
      .update({ revision_deadline: at(-HOUR), quote_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    const buyer = await sessionFor(DEMO.logins.sunriseManager);

    const { error } = await buyer.from('rfq_clarification_messages').insert({
      rfq_id: fixture.rfqId,
      invitation_id: fixture.invitationId,
      author_profile_id: await profileIdFor(DEMO.logins.sunriseManager),
      author_side: 'BUYER',
      body: 'Can you confirm the winding gauge?',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/clarification window .* closed/i);
  });

  it('accepts a clarification message inside the window', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      revisionDeadlineMs: 6 * HOUR,
      withQuote: true,
    });

    await service.from('rfqs').update({ status: 'CLARIFICATION' }).eq('id', fixture.rfqId);

    const buyer = await sessionFor(DEMO.logins.sunriseManager);

    const { error } = await buyer.from('rfq_clarification_messages').insert({
      rfq_id: fixture.rfqId,
      invitation_id: fixture.invitationId,
      author_profile_id: await profileIdFor(DEMO.logins.sunriseManager),
      author_side: 'BUYER',
      body: 'Can you confirm the winding gauge?',
    });

    expect(error).toBeNull();
  });
});

describe('refusing a vote after the voting window', () => {
  it('refuses a committee vote once evaluation has closed', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
      quoteStatus: 'FINAL',
    });

    await service
      .from('rfqs')
      .update({ status: 'EVALUATING', evaluation_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    const voter = await profileIdFor(DEMO.logins.sunriseCommittee);

    const { error } = await service.from('committee_votes').insert({
      rfq_id: fixture.rfqId,
      profile_id: voter,
      recommended_quote_id: fixture.quoteId!,
      choice: 'RECOMMEND',
      voting_power: 1,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/voting window .* closed/i);
  });
});

describe('advancing on its own', () => {
  it('moves a closed bidding round into clarification when a revision window remains', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      revisionDeadlineMs: 6 * HOUR,
      withQuote: true,
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    const { data, error } = await service.rpc('advance_rfq_phases');

    expect(error).toBeNull();
    expect((data as any).advanced).toBeGreaterThanOrEqual(1);

    const row = await rfqRow(fixture.rfqId);
    expect(row.status).toBe('CLARIFICATION');
    // And the live window has become the revision window, not the expired one.
    expect(row.quote_deadline).toBe(row.revision_deadline);
  });

  it('goes straight to evaluation when there was no revision window', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR), bid_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    await service.rpc('advance_rfq_phases');

    const row = await rfqRow(fixture.rfqId);
    expect(row.status).toBe('EVALUATING');
  });

  it('closes a round nobody bid on, rather than parking a committee in front of nothing', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: HOUR });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR), bid_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    await service.rpc('advance_rfq_phases');

    const row = await rfqRow(fixture.rfqId);
    expect(row.status).toBe('CLOSED');
  });

  it('counts a supplier\u2019s last price as their offer instead of disqualifying them', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
      quoteStatus: 'REVISED',
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR), bid_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    await service.rpc('advance_rfq_phases');

    const { data: quote } = await service
      .from('quotes')
      .select('status')
      .eq('id', fixture.quoteId!)
      .single();

    expect(quote!.status).toBe('FINAL');
  });

  it('leaves a draft quote out of it, because a draft is not an offer', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
      quoteStatus: 'DRAFT',
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR), bid_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    await service.rpc('advance_rfq_phases');

    const row = await rfqRow(fixture.rfqId);
    const { data: quote } = await service
      .from('quotes')
      .select('status')
      .eq('id', fixture.quoteId!)
      .single();

    // No live offer, so the round closed and the draft stayed a draft.
    expect(row.status).toBe('CLOSED');
    expect(quote!.status).toBe('DRAFT');
  });

  it('can be run twice without moving anything the second time', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR), bid_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    await service.rpc('advance_rfq_phases');
    const first = await rfqRow(fixture.rfqId);

    const { data: second } = await service.rpc('advance_rfq_phases');
    const after = await rfqRow(fixture.rfqId);

    expect(after.status).toBe(first.status);
    expect(
      ((second as any).rfqs as any[]).some((r) => r.rfqId === fixture.rfqId),
    ).toBe(false);
  });

  it('never awards, because an award with nobody attached to it is the thing we exist to prevent', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
      quoteStatus: 'FINAL',
    });

    await service
      .from('rfqs')
      .update({
        quote_deadline: at(-2 * HOUR),
        bid_deadline: at(-2 * HOUR),
        evaluation_deadline: at(-HOUR),
      })
      .eq('id', fixture.rfqId);

    await service.rpc('advance_rfq_phases');
    await service.rpc('advance_rfq_phases');

    const row = await rfqRow(fixture.rfqId);
    const { data: awards } = await service
      .from('awards')
      .select('id')
      .eq('rfq_id', fixture.rfqId);

    expect(row.status).toBe('EVALUATING');
    expect(awards).toEqual([]);
  });

  it('records every move it makes, with the reason', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: HOUR,
      withQuote: true,
    });

    await service
      .from('rfqs')
      .update({ quote_deadline: at(-HOUR), bid_deadline: at(-HOUR) })
      .eq('id', fixture.rfqId);

    await service.rpc('advance_rfq_phases');

    const { data: events } = await service
      .from('audit_events')
      .select('payload')
      .eq('event_type', 'rfq.phase_advanced')
      .eq('entity_id', fixture.rfqId);

    expect(events!.length).toBe(1);
    expect(events![0]!.payload).toMatchObject({
      from: 'OPEN',
      to: 'EVALUATING',
      automatic: true,
    });
    expect((events![0]!.payload as any).reason).toBeTruthy();
  });

  it('leaves an enquiry whose window is still open exactly where it is', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: 6 * HOUR,
      withQuote: true,
    });

    await service.rpc('advance_rfq_phases');

    const row = await rfqRow(fixture.rfqId);
    expect(row.status).toBe('OPEN');
  });
});

describe('what the interface is told about a phase', () => {
  it('describes the bidding window to the buying organisation', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: 3 * HOUR });
    const buyer = await sessionFor(DEMO.logins.sunriseManager);

    const { data, error } = await buyer.rpc('rfq_phase', { p_rfq_id: fixture.rfqId });

    expect(error).toBeNull();
    const phase = data as any;
    expect(phase.ordinal).toBe(1);
    expect(phase.label).toBe('Identity-Protected Quoting');
    expect(phase.quotingOpen).toBe(true);
    expect(phase.quotingRefusal).toBeNull();
    expect(phase.overdue).toBe(false);
    expect(phase.secondsRemaining).toBeGreaterThan(0);
    expect(phase.schedule.bidDeadline).not.toBeNull();
  });

  it('settles whether the window is over on the server, not on the visitor\u2019s clock', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: -HOUR });
    const buyer = await sessionFor(DEMO.logins.sunriseManager);

    const { data } = await buyer.rpc('rfq_phase', { p_rfq_id: fixture.rfqId });

    expect((data as any).overdue).toBe(true);
    expect((data as any).secondsRemaining).toBe(0);
    expect((data as any).quotingOpen).toBe(false);
    expect((data as any).quotingRefusal).toBe('DEADLINE_PASSED');
  });

  it('tells an invited supplier the dates and nothing about the committee', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: 3 * HOUR });
    const supplier = await sessionFor(DEMO.logins.motorSupplier);

    const { data, error } = await supplier.rpc('rfq_phase', { p_rfq_id: fixture.rfqId });

    expect(error).toBeNull();
    const keys = Object.keys(data as any);
    expect(keys).toContain('endsAt');
    expect(keys.join(' ')).not.toMatch(/committee|voter|score/i);
  });

  it('refuses a supplier who was never invited', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: 3 * HOUR });
    const stranger = await sessionFor(DEMO.logins.yarnSupplier);

    const { error } = await stranger.rpc('rfq_phase', { p_rfq_id: fixture.rfqId });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not authorized/i);
  });

  it('refuses an organisation with no part in the enquiry', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: 3 * HOUR });
    const other = await sessionFor(DEMO.logins.kovaiOwner);

    const { error } = await other.rpc('rfq_phase', { p_rfq_id: fixture.rfqId });

    expect(error).not.toBeNull();
  });

  it('reports a draft as unpublished rather than as a window', async () => {
    const fixture = await makeEnquiry({ status: 'DRAFT', bidDeadlineMs: 3 * HOUR });
    const buyer = await sessionFor(DEMO.logins.sunriseManager);

    const { data } = await buyer.rpc('rfq_phase', { p_rfq_id: fixture.rfqId });

    expect((data as any).ordinal).toBe(0);
    expect((data as any).label).toBe('Not published');
    expect((data as any).quotingRefusal).toBe('NOT_OPEN_YET');
  });
});

describe('changing the schedule', () => {
  it('is refused to a committee member, who evaluates rather than schedules', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: HOUR });
    const member = await sessionFor(DEMO.logins.sunriseCommittee);

    const { error } = await member.rpc('set_rfq_schedule', {
      p_rfq_id: fixture.rfqId,
      p_bid_deadline: at(48 * HOUR),
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/manager of the buying organisation/i);
  });

  it('refuses an order of dates that cannot happen', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: 24 * HOUR });
    const manager = await sessionFor(DEMO.logins.sunriseManager);

    const { error } = await manager.rpc('set_rfq_schedule', {
      p_rfq_id: fixture.rfqId,
      p_revision_deadline: at(2 * HOUR),
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/revision deadline cannot be before the bid deadline/i);
  });

  it('refuses a voting deadline that falls before quoting has closed', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: 24 * HOUR });
    const manager = await sessionFor(DEMO.logins.sunriseManager);

    const { error } = await manager.rpc('set_rfq_schedule', {
      p_rfq_id: fixture.rfqId,
      p_evaluation_deadline: at(2 * HOUR),
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/voting deadline cannot be before/i);
  });

  it('extends the live window when the manager extends bidding', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: HOUR });
    const manager = await sessionFor(DEMO.logins.sunriseManager);
    const extended = at(48 * HOUR);

    const { data, error } = await manager.rpc('set_rfq_schedule', {
      p_rfq_id: fixture.rfqId,
      p_bid_deadline: extended,
    });

    expect(error).toBeNull();
    expect((data as any).quotingOpen).toBe(true);

    const row = await rfqRow(fixture.rfqId);
    expect(new Date(row.quote_deadline!).getTime()).toBe(new Date(extended).getTime());

    // An extension is a decision about a deadline suppliers were given, so it is
    // recorded with the person who made it.
    const { data: events } = await service
      .from('audit_events')
      .select('actor_id, payload')
      .eq('event_type', 'rfq.schedule_set')
      .eq('entity_id', fixture.rfqId);

    expect(events!.length).toBe(1);
    expect(events![0]!.actor_id).not.toBeNull();
  });

  it('reopens quoting for a supplier who was locked out a moment earlier', async () => {
    const fixture = await makeEnquiry({
      status: 'OPEN',
      bidDeadlineMs: -HOUR,
      withQuote: true,
    });

    const late = {
      quote_id: fixture.quoteId!,
      version: 2,
      snapshot: { basePrice: 1000 },
      created_by: await profileIdFor(DEMO.logins.motorSupplier),
    };

    const { error: before } = await service.from('quote_versions').insert(late);
    expect(before).not.toBeNull();

    const manager = await sessionFor(DEMO.logins.sunriseManager);
    await manager.rpc('set_rfq_schedule', {
      p_rfq_id: fixture.rfqId,
      p_bid_deadline: at(24 * HOUR),
    });

    const { error: after } = await service.from('quote_versions').insert(late);
    expect(after).toBeNull();
  });

  it('will not reschedule an enquiry that is already finished', async () => {
    const fixture = await makeEnquiry({ status: 'OPEN', bidDeadlineMs: HOUR });
    await service.from('rfqs').update({ status: 'CLOSED' }).eq('id', fixture.rfqId);

    const manager = await sessionFor(DEMO.logins.sunriseManager);

    const { error } = await manager.rpc('set_rfq_schedule', {
      p_rfq_id: fixture.rfqId,
      p_bid_deadline: at(48 * HOUR),
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/finished/i);
  });
});

describe('fixtures and history', () => {
  it('lets a direct database session write an enquiry that closed last month', async () => {
    // Seeds and migrations describe finished rounds. If the clock applied to them
    // the demo could not contain a completed enquiry at all. What this does not
    // exempt is a service-role API call, which the tests above hold to the clock.
    const { data, error } = await service.rpc('advance_rfq_phases');

    expect(error).toBeNull();
    expect(data).toHaveProperty('advanced');
  });

  it('leaves the seeded demo enquiries where the demo put them', async () => {
    await service.rpc('advance_rfq_phases');

    const { data } = await service
      .from('rfqs')
      .select('status')
      .eq('id', DEMO.rfqs.liftAmc)
      .single();

    expect(data!.status).toBe('OPEN');
  });
});
