/**
 * Phase 4, checked from three chairs at once.
 *
 * An award is the only moment this platform lets identity move, and it has to
 * move for exactly two parties and no others. So each test here asks the same
 * question of three different sessions — the winner, a losing bidder, and a
 * supplier with no part in the round — and the interesting answers are the
 * refusals.
 *
 * The enquiry is built here rather than borrowed from the demo, because awarding
 * is irreversible and a shared fixture would be spent after the first test.
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

/** A distinct alias per enquiry, as the real allocator produces (00022). */
function freshAlias(): string {
  return `Supplier ${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

interface Round {
  rfqId: string;
  publicRef: string;
  /** The bid that will be awarded. */
  winner: { supplierId: string; login: string; quoteId: string; alias: string };
  /** Bids that will lose. */
  losers: { supplierId: string; login: string; quoteId: string; alias: string }[];
}

const created: string[] = [];
const notified: string[] = [];

afterEach(async () => {
  if (!up) return;

  // Notifications hang off a profile, not the enquiry, so they do not cascade.
  for (const rfqId of notified.splice(0)) {
    await service.from('notifications').delete().eq('payload->>rfqId', rfqId);
  }

  for (const id of created.splice(0)) {
    const { error } = await service.from('requirements').delete().eq('id', id);
    if (error) {
      throw new Error(`award fixture teardown failed: ${error.message}`);
    }
  }
});

async function profileIdFor(email: string): Promise<string> {
  const { data } = await service.from('profiles').select('id').eq('email', email).single();
  return data!.id as string;
}

async function sessionFor(email: string): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, email);
  return client;
}

/**
 * Two sealed bids on one enquiry, sitting in evaluation.
 *
 * Two rather than three so that the yarn trader stays outside the round
 * altogether. Most of what these tests need to prove is about people who should
 * see nothing, and a losing bidder is a different kind of nothing from a supplier
 * who was never invited.
 *
 * Built through the states in order — DRAFT, OPEN, then EVALUATING — because the
 * phase triggers refuse a quote written outside the bidding window, and a fixture
 * that had to switch them off would not be testing the same system.
 */
async function makeRound(): Promise<Round> {
  const creator = await profileIdFor(DEMO.logins.sunriseManager);

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
      title: 'Award close-out fixture',
      description: 'Created by tests/security/award-closeout.test.ts',
      delivery_city: 'Bengaluru',
    })
    .select('id')
    .single();

  expect(reqError).toBeNull();
  created.push(requirement!.id);

  const { data: rfq, error: rfqError } = await service
    .from('rfqs')
    .insert({
      requirement_id: requirement!.id,
      organization_id: DEMO.orgs.sunrise,
      status: 'DRAFT',
      reveal_status: 'BLIND',
      title: 'Award close-out fixture',
      created_by: creator,
      buyer_anonymous_to_suppliers: true,
      min_quotes_required: 2,
      quote_deadline: at(24 * HOUR),
      bid_deadline: at(24 * HOUR),
    })
    .select('id, public_ref')
    .single();

  expect(rfqError).toBeNull();
  notified.push(rfq!.id);

  await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfq!.id);

  const bidders = [
    { supplierId: DEMO.suppliers.aquaPrime, login: DEMO.logins.motorSupplier },
    { supplierId: DEMO.suppliers.nandi, login: DEMO.logins.tooSmallSupplier },
  ];

  const placed: Round['losers'] = [];

  for (const bidder of bidders) {
    const alias = freshAlias();

    const { data: invitation, error: inviteError } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: bidder.supplierId,
        anonymous_label: alias,
        status: 'QUOTED',
      })
      .select('id, anonymous_label')
      .single();

    expect(inviteError).toBeNull();

    const { data: quote, error: quoteError } = await service
      .from('quotes')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: bidder.supplierId,
        invitation_id: invitation!.id,
        status: 'FINAL',
        current_version: 1,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    expect(quoteError).toBeNull();
    placed.push({ ...bidder, quoteId: quote!.id, alias: invitation!.anonymous_label || alias });
  }

  const { error: statusError } = await service
    .from('rfqs')
    .update({ status: 'EVALUATING' })
    .eq('id', rfq!.id);
  expect(statusError).toBeNull();

  return {
    rfqId: rfq!.id,
    publicRef: rfq!.public_ref,
    winner: placed[0]!,
    losers: placed.slice(1),
  };
}

async function award(round: Round): Promise<void> {
  const manager = await sessionFor(DEMO.logins.sunriseManager);
  const { error } = await manager.rpc('lock_award', {
    p_rfq_id: round.rfqId,
    p_quote_id: round.winner.quoteId,
    p_justification: 'Best weighted score on turnaround and compliance.',
  });
  expect(error).toBeNull();
}

async function reveal(round: Round): Promise<void> {
  const manager = await sessionFor(DEMO.logins.sunriseManager);
  const { error } = await manager.rpc('reveal_award', { p_rfq_id: round.rfqId });
  expect(error).toBeNull();
}

// ---------------------------------------------------------------------------
// The buyer, released to the winner and to nobody else
// ---------------------------------------------------------------------------

describe('the buyer becoming visible', () => {
  it('stays hidden from the winner until the award is revealed', async () => {
    const round = await makeRound();
    await award(round);

    const winner = await sessionFor(round.winner.login);
    const { data } = await winner.from('rfq_buyer_revealed').select('*').eq('rfq_id', round.rfqId);

    // Awarded, still blind. This is the gap the platform insists on: the
    // decision is locked before anybody learns who it was between.
    expect(data).toEqual([]);
  });

  it('hands the winner the buying organization in full once revealed', async () => {
    const round = await makeRound();
    await award(round);
    await reveal(round);

    const winner = await sessionFor(round.winner.login);
    const { data, error } = await winner
      .from('rfq_buyer_revealed')
      .select('*')
      .eq('rfq_id', round.rfqId)
      .single();

    expect(error).toBeNull();
    expect(data!.buyer_organization).toBe('Sunrise Residency Owners Association');
    // Enough to raise an invoice and pick up a phone, which is the point of the
    // reveal. An award to an anonymous buyer is not a contract.
    expect(data!.contact_phone).toBeTruthy();
    expect(data!.contact_email).toBeTruthy();
    expect(data!.tax_registration).toBeTruthy();
    expect(data!.awarded_by_name).toBeTruthy();
  });

  it('keeps the buyer hidden from a bidder who lost, even after the reveal', async () => {
    const round = await makeRound();
    await award(round);
    await reveal(round);

    for (const loser of round.losers) {
      const client = await sessionFor(loser.login);
      const { data } = await client
        .from('rfq_buyer_revealed')
        .select('*')
        .eq('rfq_id', round.rfqId);

      expect(data, `${loser.login} could read the buyer`).toEqual([]);
    }
  });

  it('keeps the buyer hidden from a supplier who never bid', async () => {
    const round = await makeRound();
    await award(round);
    await reveal(round);

    const outsider = await sessionFor(DEMO.logins.yarnSupplier);
    const { data } = await outsider
      .from('rfq_buyer_revealed')
      .select('*')
      .eq('rfq_id', round.rfqId);

    expect(data).toEqual([]);
  });

  it('keeps the buyer hidden from the buying side of another organization', async () => {
    const round = await makeRound();
    await award(round);
    await reveal(round);

    // This view exists to release a buyer to a supplier. A rival buyer reading it
    // would be a contact-list leak dressed up as an award.
    const rival = await sessionFor(DEMO.logins.kovaiOwner);
    const { data } = await rival.from('rfq_buyer_revealed').select('*').eq('rfq_id', round.rfqId);

    expect(data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Telling the losers
// ---------------------------------------------------------------------------

describe('closing the round out with the bidders', () => {
  it('tells every bidder the round was decided', async () => {
    const round = await makeRound();
    await award(round);

    for (const bidder of [round.winner, ...round.losers]) {
      const client = await sessionFor(bidder.login);
      const { data } = await client
        .from('notifications')
        .select('event_type, payload')
        .eq('payload->>rfqId', round.rfqId);

      expect(data!.length, `${bidder.login} was told nothing`).toBeGreaterThan(0);
    }
  });

  it('tells the winner they won and the losers that they did not', async () => {
    const round = await makeRound();
    await award(round);

    const winner = await sessionFor(round.winner.login);
    const { data: won } = await winner
      .from('notifications')
      .select('event_type')
      .eq('payload->>rfqId', round.rfqId);

    expect(won!.map((n) => n.event_type)).toContain('rfq.awarded_to_you');

    for (const loser of round.losers) {
      const client = await sessionFor(loser.login);
      const { data } = await client
        .from('notifications')
        .select('event_type')
        .eq('payload->>rfqId', round.rfqId);

      expect(data!.map((n) => n.event_type)).toContain('rfq.not_selected');
      expect(data!.map((n) => n.event_type)).not.toContain('rfq.awarded_to_you');
    }
  });

  it('tells a loser nothing about who won or for how much', async () => {
    const round = await makeRound();
    await award(round);

    for (const loser of round.losers) {
      const client = await sessionFor(loser.login);
      const { data } = await client
        .from('notifications')
        .select('payload')
        .eq('event_type', 'rfq.not_selected')
        .eq('payload->>rfqId', round.rfqId);

      expect(data!.length).toBeGreaterThan(0);
      for (const row of data!) {
        const text = JSON.stringify(row.payload);

        // Their own alias is theirs to see; the winner's is not, and neither is
        // any amount. A losing bidder should not be able to reconstruct the
        // round from the message that closed it.
        expect(text).toContain(loser.alias);
        expect(text).not.toContain(round.winner.alias);
        expect(text).not.toMatch(/amount|price|basePrice|total/i);
      }
    }
  });

  it('does not tell a supplier about a round they were not invited to', async () => {
    const round = await makeRound();
    await award(round);

    for (const login of [DEMO.logins.yarnSupplier, DEMO.logins.kovaiOwner]) {
      const stranger = await sessionFor(login);
      const { data } = await stranger
        .from('notifications')
        .select('id')
        .eq('payload->>rfqId', round.rfqId);

      expect(data, `${login} was told about someone else's round`).toEqual([]);
    }
  });

  it('records the close-out for the buying side by alias', async () => {
    const round = await makeRound();
    await award(round);

    const { data } = await service
      .from('audit_events')
      .select('payload')
      .in('event_type', ['rfq.suppliers_closed_out', 'rfq.bidders_closed_out'])
      .eq('entity_id', round.rfqId)
      .limit(1)
      .single();

    // An auditor asking "were the losers ever told" gets an answer from the
    // trail rather than from a mail server.
    expect(data!.payload.notified).toBe(2);
    expect(data!.payload.notSelected).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Each bidder's own result
// ---------------------------------------------------------------------------

describe('a bidder reading their own result', () => {
  it('shows the winner that they won and that the buyer is available', async () => {
    const round = await makeRound();
    await award(round);
    await reveal(round);

    const winner = await sessionFor(round.winner.login);
    const { data } = await winner
      .from('my_bid_outcome')
      .select('*')
      .eq('rfq_id', round.rfqId)
      .single();

    expect(data!.outcome).toBe('WON');
    expect(data!.buyer_released).toBe(true);
    expect(data!.my_alias).toBe(round.winner.alias);
  });

  it('shows a loser their own result and no route to the buyer', async () => {
    const round = await makeRound();
    await award(round);
    await reveal(round);

    for (const loser of round.losers) {
      const client = await sessionFor(loser.login);
      const { data } = await client
        .from('my_bid_outcome')
        .select('*')
        .eq('rfq_id', round.rfqId)
        .single();

      expect(data!.outcome).toBe('NOT_SELECTED');
      expect(data!.buyer_released).toBe(false);
      expect(data!.my_alias).toBe(loser.alias);
    }
  });

  it('shows a bidder only their own row, never a rival\u2019s', async () => {
    const round = await makeRound();
    await award(round);

    for (const bidder of [round.winner, ...round.losers]) {
      const client = await sessionFor(bidder.login);
      const { data } = await client.from('my_bid_outcome').select('my_alias').eq('rfq_id', round.rfqId);

      expect(data).toHaveLength(1);
      expect(data![0]!.my_alias).toBe(bidder.alias);
    }
  });

  it('says nothing at all before the round is decided', async () => {
    const round = await makeRound();

    const bidder = await sessionFor(round.winner.login);
    const { data } = await bidder.from('my_bid_outcome').select('*').eq('rfq_id', round.rfqId);

    // Still in evaluation. An outcome view that answered here would leak the
    // committee's progress.
    expect(data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Buyer credentials
// ---------------------------------------------------------------------------

describe('the buying organization\u2019s own details', () => {
  it('lets a manager set them', async () => {
    const manager = await sessionFor(DEMO.logins.sunriseManager);

    const { error } = await manager.rpc('set_organization_credentials', {
      p_organization_id: DEMO.orgs.sunrise,
      p_contact_person: 'Priya Sharma',
    });

    expect(error).toBeNull();
  });

  it('refuses a manager from another organization', async () => {
    const outsider = await sessionFor(DEMO.logins.kovaiOwner);

    const { error } = await outsider.rpc('set_organization_credentials', {
      p_organization_id: DEMO.orgs.sunrise,
      p_contact_phone: '+919999999999',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/manager or owner/i);
  });

  it('refuses a supplier outright', async () => {
    const supplier = await sessionFor(DEMO.logins.motorSupplier);

    const { error } = await supplier.rpc('set_organization_credentials', {
      p_organization_id: DEMO.orgs.sunrise,
      p_contact_phone: '+919999999999',
    });

    expect(error).not.toBeNull();
  });

  it('leaves untouched fields alone rather than clearing them', async () => {
    const manager = await sessionFor(DEMO.logins.sunriseManager);

    await manager.rpc('set_organization_credentials', {
      p_organization_id: DEMO.orgs.sunrise,
      p_contact_person: 'Priya Sharma',
    });

    const { data } = await service
      .from('organizations')
      .select('contact_person, contact_phone, tax_registration')
      .eq('id', DEMO.orgs.sunrise)
      .single();

    // A form that shows one field must not silently erase the rest, or a partial
    // edit becomes a way to strip the details a winner is owed.
    expect(data!.contact_person).toBe('Priya Sharma');
    expect(data!.contact_phone).toBeTruthy();
    expect(data!.tax_registration).toBeTruthy();
  });
});
