/**
 * A stranger is not a manager.
 *
 * Every governance action in this platform is guarded by the same question — does
 * this person manage the buying organisation — and for most of the product's life
 * that guard had a hole in it that only a stranger could walk through. A member
 * with the wrong role was refused correctly, because the check got a real role back
 * and compared it. Someone with no membership at all got NULL, `NOT NULL` is NULL,
 * `IF NULL` does not branch, and the refusal was skipped. The wrong people were
 * stopped and the worst people were not.
 *
 * So this file is not organised by feature. It is one question asked of every
 * entry point that guard protects, from an account belonging to a different
 * organisation, because that is the case the original check answered "unknown" to.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';

type Client = ReturnType<typeof createAnonClient>;

let service: ReturnType<typeof createServiceClient>;

let up = false;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (up) {
    service = createServiceClient();
  }
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

/**
 * A committee member at Kovai Precision — a real, verified, signed-in account with
 * a governance title, and no relationship whatsoever to Sunrise's enquiries.
 */
async function stranger(): Promise<Client> {
  const client = createAnonClient();
  await signInAs(client, DEMO.logins.kovaiPartner);
  return client;
}

/** Sunrise's motor enquiry: under evaluation, six quotes, not yet awarded. */
const RFQ = DEMO.rfqs.motor;

async function aQuoteOn(rfqId: string): Promise<string> {
  const { data } = await service
    .from('quotes')
    .select('id')
    .eq('rfq_id', rfqId)
    .not('status', 'in', '("DRAFT","WITHDRAWN")')
    .limit(1)
    .single();

  return data!.id as string;
}

describe('voting on another organisation\u2019s enquiry', () => {
  it('is refused, even to an account whose own title carries a vote', async () => {
    const client = await stranger();

    const { error } = await client.rpc('cast_committee_vote', {
      p_rfq_id: RFQ,
      p_recommended_quote_id: await aQuoteOn(RFQ),
      p_choice: 'RECOMMEND',
      p_comment: 'A title at one organisation is not a seat at another',
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not on this evaluation committee/i);
  });

  it('writes no vote, so a tally cannot be moved by a refused call', async () => {
    const client = await stranger();
    const { data: before } = await service
      .from('committee_votes')
      .select('id', { count: 'exact' })
      .eq('rfq_id', RFQ);

    await client.rpc('cast_committee_vote', {
      p_rfq_id: RFQ,
      p_recommended_quote_id: await aQuoteOn(RFQ),
      p_choice: 'RECOMMEND',
      p_comment: 'should not land',
    });

    const { data: after } = await service
      .from('committee_votes')
      .select('id')
      .eq('rfq_id', RFQ);

    expect(after!.length).toBe(before!.length);
  });
});

describe('awarding and revealing another organisation\u2019s enquiry', () => {
  it('refuses the award, which is the decision the whole platform exists to protect', async () => {
    const client = await stranger();

    const { error } = await client.rpc('lock_award', {
      p_rfq_id: RFQ,
      p_quote_id: await aQuoteOn(RFQ),
    });

    expect(error).not.toBeNull();
    expect(error!.message).not.toMatch(/^$/);
  });

  it('refuses the reveal, which is the one irreversible step for a supplier', async () => {
    const client = await stranger();

    const { error } = await client.rpc('reveal_award_winner', { p_rfq_id: RFQ });

    expect(error).not.toBeNull();
  });

  it('leaves the enquiry blind and unawarded afterwards', async () => {
    const { data: rfq } = await service
      .from('rfqs')
      .select('status, reveal_status')
      .eq('id', RFQ)
      .single();
    const { data: awards } = await service.from('awards').select('id').eq('rfq_id', RFQ);

    expect(rfq!.reveal_status).toBe('BLIND');
    expect(awards).toEqual([]);
  });
});

describe('moving another organisation\u2019s clock', () => {
  it('refuses to reschedule the deadlines suppliers were given', async () => {
    const client = await stranger();

    const { error } = await client.rpc('set_rfq_schedule', {
      p_rfq_id: DEMO.rfqs.liftAmc,
      p_bid_deadline: new Date(Date.now() + 60 * 86_400_000).toISOString(),
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/manager of the buying organisation/i);
  });

  it('refuses to close the bidding phase early', async () => {
    const client = await stranger();

    const { error } = await client.rpc('close_initial_quoting', {
      p_rfq_id: DEMO.rfqs.liftAmc,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/only managers/i);
  });

  it('refuses to push an enquiry into evaluation', async () => {
    const client = await stranger();

    const { error } = await client.rpc('close_clarification_for_evaluation', {
      p_rfq_id: DEMO.rfqs.liftAmc,
    });

    expect(error).not.toBeNull();
  });

  it('leaves the enquiry in the phase its own organisation put it in', async () => {
    const { data } = await service
      .from('rfqs')
      .select('status')
      .eq('id', DEMO.rfqs.liftAmc)
      .single();

    expect(data!.status).toBe('OPEN');
  });
});

describe('writing to another organisation\u2019s record', () => {
  it('refuses a performance review, which is a supplier\u2019s reputation', async () => {
    const client = await stranger();

    const { error } = await client.rpc('submit_performance_review', {
      p_rfq_id: DEMO.rfqs.cnc,
      p_quality_rating: 1,
      p_notes: 'A review from an organisation with no part in this order',
    });

    expect(error).not.toBeNull();
  });

  it('refuses to simulate quotes into an enquiry that is not theirs', async () => {
    const client = await stranger();

    const { error } = await client.rpc('demo_simulate_quotes', {
      p_rfq_id: DEMO.rfqs.liftAmc,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/manager|denied|not/i);
  });
});

describe('the helper underneath all of the above', () => {
  it('answers no rather than unknown for an organisation the caller has no part in', async () => {
    // Asked through the one RPC whose refusal message names the check directly.
    // The distinction matters: a NULL answer reads as no inside a policy and as
    // yes inside IF NOT, which is how one hole produced seven.
    const client = await stranger();

    const { error } = await client.rpc('set_rfq_schedule', {
      p_rfq_id: DEMO.rfqs.turmeric,
      p_evaluation_deadline: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    });

    expect(error).not.toBeNull();
  });

  it('still refuses a member of the right organisation who holds the wrong role', async () => {
    // The case that always worked, kept because the fix must not have been a
    // widening: a committee member at Sunrise manages nothing at Sunrise.
    const member = createAnonClient();
    await signInAs(member, DEMO.logins.sunriseCommittee);

    const { error } = await member.rpc('close_initial_quoting', {
      p_rfq_id: DEMO.rfqs.liftAmc,
    });

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/only managers/i);
  });

  it('still lets the actual manager do their job', async () => {
    // And the other direction, which is the real risk when a guard is tightened:
    // the person who is supposed to pass has to still pass.
    const manager = createAnonClient();
    await signInAs(manager, DEMO.logins.sunriseManager);

    const { data, error } = await manager.rpc('rfq_phase', { p_rfq_id: DEMO.rfqs.liftAmc });

    expect(error).toBeNull();
    expect((data as any).status).toBe('OPEN');

    // Extended, but still inside the voting deadline this enquiry was published
    // with — the schedule has to stay in order, whoever is asking.
    const extended = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const { data: rescheduled, error: scheduleError } = await manager.rpc('set_rfq_schedule', {
      p_rfq_id: DEMO.rfqs.liftAmc,
      p_bid_deadline: extended,
    });

    expect(scheduleError).toBeNull();
    expect((rescheduled as any).quotingOpen).toBe(true);
  });
});
