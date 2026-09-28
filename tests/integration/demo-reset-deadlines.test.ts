/**
 * demo_reset and the deadlines it hands back (00214).
 *
 * The seed stamps each demo RFQ's windows as now() + an offset. Until 00214
 * the reset left those timestamps alone, so a demo reset a week after seeding
 * restaged enquiries whose voting and quoting windows had already closed. The
 * enforcement was right; the reset was incomplete. These tests hold both
 * halves: the reset restarts the demo windows, and a closed window still
 * refuses, on demo and real enquiries alike.
 *
 * Requires a local Supabase seeded with `pnpm db:reset`. Skips otherwise.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createAnonClient,
  createServiceClient,
  isLocalSupabaseReachable,
  signInAs,
} from '../helpers/supabase-local';
import { DEMO } from '../helpers/demo-fixtures';
import { ISOLATED_ORGS, useIsolatedBuyerOrg } from '../helpers/isolated-buyer-org';

const DAY = 86_400_000;
const TOLERANCE = 5 * 60_000;

/** The offsets seed_demo_environment.sql gives each demo RFQ. */
const SEED_WINDOWS: Record<string, { quoteDays: number; evaluationDays: number }> = {
  [DEMO.rfqs.motor]: { quoteDays: 3, evaluationDays: 6 },
  [DEMO.rfqs.liftAmc]: { quoteDays: 10, evaluationDays: 18 },
  [DEMO.rfqs.cnc]: { quoteDays: 4, evaluationDays: 8 },
  [DEMO.rfqs.yarn]: { quoteDays: 2, evaluationDays: 5 },
  [DEMO.rfqs.turmeric]: { quoteDays: 7, evaluationDays: 11 },
};

let up = false;
let service: SupabaseClient;
let releaseOrg: (() => Promise<void>) | undefined;

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

async function resetDemo(): Promise<void> {
  await service.from('demo_settings').update({ demo_mode_enabled: true }).eq('id', true);
  const admin = createAnonClient();
  await signInAs(admin, DEMO.logins.admin);
  const { error } = await admin.rpc('demo_reset', { p_restage: true });
  if (error) throw new Error(`demo_reset failed: ${error.message}`);
}

async function demoWindows() {
  const { data } = await service
    .from('rfqs')
    .select('id, quote_deadline, bid_deadline, evaluation_deadline, revision_deadline')
    .in('id', Object.keys(SEED_WINDOWS));
  return data ?? [];
}

async function invitationsOn(rfqId: string) {
  const { data } = await service
    .from('rfq_invitations')
    .select('id, supplier_id')
    .eq('rfq_id', rfqId)
    .order('id');
  return data ?? [];
}

function quoteFor(rfqId: string, invitation: { id: string; supplier_id: string }) {
  return service.from('quotes').insert({
    rfq_id: rfqId,
    supplier_id: invitation.supplier_id,
    invitation_id: invitation.id,
    status: 'SUBMITTED',
    current_version: 1,
    submitted_at: new Date().toISOString(),
  });
}

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;
  service = createServiceClient();
  ({ release: releaseOrg } = await useIsolatedBuyerOrg(
    service,
    ISOLATED_ORGS.demoResetControl,
    'Demo reset control society',
    DEMO.logins.sunriseManager,
  ));
}, 120_000);

afterAll(async () => {
  if (!up) return;
  await releaseOrg?.();
  // Other files expect the demo as the seed leaves it.
  await resetDemo();
}, 120_000);

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

describe('demo_reset restarts the demo windows', () => {
  it('moves expired demo deadlines back to the seed offsets from now', async () => {
    for (const id of Object.keys(SEED_WINDOWS)) {
      const { error } = await service
        .from('rfqs')
        .update({
          quote_deadline: ago(3 * DAY),
          bid_deadline: ago(3 * DAY),
          revision_deadline: ago(2 * DAY),
          evaluation_deadline: ago(DAY),
        })
        .eq('id', id);
      expect(error).toBeNull();
    }

    await resetDemo();

    const rows = await demoWindows();
    expect(rows).toHaveLength(5);
    const now = Date.now();
    for (const row of rows) {
      const seed = SEED_WINDOWS[row.id as string];
      expect(Math.abs(Date.parse(row.bid_deadline) - (now + seed.quoteDays * DAY))).toBeLessThan(TOLERANCE);
      expect(Math.abs(Date.parse(row.quote_deadline) - (now + seed.quoteDays * DAY))).toBeLessThan(TOLERANCE);
      expect(
        Math.abs(Date.parse(row.evaluation_deadline) - (now + seed.evaluationDays * DAY)),
      ).toBeLessThan(TOLERANCE);
      expect(row.revision_deadline).toBeNull();
    }
  }, 120_000);

  it('accepts a committee vote in the restored window and refuses one once it closes', async () => {
    const { data: quotes } = await service
      .from('quotes')
      .select('id')
      .eq('rfq_id', DEMO.rfqs.motor)
      .not('status', 'in', '("DRAFT","WITHDRAWN")')
      .order('id')
      .limit(1);
    expect(quotes).toHaveLength(1);

    const member = createAnonClient();
    await signInAs(member, DEMO.logins.sunriseCommittee);
    const vote = () =>
      member.rpc('cast_committee_vote', {
        p_rfq_id: DEMO.rfqs.motor,
        p_recommended_quote_id: quotes![0].id,
        p_choice: 'RECOMMEND',
        p_comment: 'within the window',
      });

    const open = await vote();
    expect(open.error).toBeNull();

    await service.from('rfqs').update({ evaluation_deadline: ago(60_000) }).eq('id', DEMO.rfqs.motor);
    const closed = await vote();
    expect(closed.error?.message).toMatch(/voting window for this enquiry closed/i);
  });

  it('accepts a bid in the restored window and refuses one once it closes', async () => {
    const invitations = await invitationsOn(DEMO.rfqs.turmeric);
    expect(invitations.length).toBeGreaterThanOrEqual(2);

    const before = await quoteFor(DEMO.rfqs.turmeric, invitations[0]);
    expect(before.error).toBeNull();

    await service.from('rfqs').update({ quote_deadline: ago(60_000) }).eq('id', DEMO.rfqs.turmeric);
    const after = await quoteFor(DEMO.rfqs.turmeric, invitations[1]);
    expect(after.error?.message).toMatch(/quoting deadline for this enquiry has passed/i);
  });
});

describe('demo_reset leaves real enquiries alone', () => {
  it('does not move an expired non-demo deadline, which keeps refusing bids', async () => {
    const orgId = ISOLATED_ORGS.demoResetControl;
    const { data: creator } = await service
      .from('profiles')
      .select('id')
      .eq('email', DEMO.logins.sunriseManager)
      .single();
    const { data: subcategory } = await service
      .from('requirement_subcategories')
      .select('id, category_id')
      .eq('code', 'motor_rewinding')
      .single();

    const { data: requirement, error: reqError } = await service
      .from('requirements')
      .insert({
        organization_id: orgId,
        created_by: creator!.id,
        requirement_type: 'SERVICE',
        requirement_mode: 'REPAIR_MAINTENANCE',
        category_id: subcategory!.category_id,
        subcategory_id: subcategory!.id,
        status: 'QUOTING',
        title: 'Expired real enquiry',
        description: 'Created by tests/integration/demo-reset-deadlines.test.ts',
        delivery_city: 'Bengaluru',
      })
      .select('id')
      .single();
    expect(reqError).toBeNull();

    const expired = { quote: ago(2 * DAY), evaluation: ago(DAY) };
    const { data: rfq, error: rfqError } = await service
      .from('rfqs')
      .insert({
        requirement_id: requirement!.id,
        organization_id: orgId,
        status: 'DRAFT',
        reveal_status: 'BLIND',
        title: 'Expired real enquiry',
        created_by: creator!.id,
        quote_deadline: expired.quote,
        bid_deadline: expired.quote,
        evaluation_deadline: expired.evaluation,
      })
      .select('id, is_demo')
      .single();
    expect(rfqError).toBeNull();
    expect(rfq!.is_demo).toBe(false);

    await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfq!.id);
    const { data: invitation } = await service
      .from('rfq_invitations')
      .insert({
        rfq_id: rfq!.id,
        supplier_id: DEMO.suppliers.aquaPrime,
        anonymous_label: `Supplier ${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        status: 'INVITED',
      })
      .select('id, supplier_id')
      .single();

    const read = async () =>
      (
        await service
          .from('rfqs')
          .select('status, quote_deadline, bid_deadline, evaluation_deadline')
          .eq('id', rfq!.id)
          .single()
      ).data!;
    const beforeReset = await read();

    await resetDemo();

    const afterReset = await read();
    expect(afterReset).toEqual(beforeReset);
    expect(afterReset.status).toBe('OPEN');
    expect(Date.parse(afterReset.quote_deadline)).toBeLessThan(Date.now());

    const bid = await quoteFor(rfq!.id, invitation!);
    expect(bid.error?.message).toMatch(/quoting deadline for this enquiry has passed/i);
  }, 120_000);
});
