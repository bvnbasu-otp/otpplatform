/**
 * 00215. A direct invitation whose contact belongs to a supplier the buyer did
 * not create must not hand the buyer anything that opens a quoting session as
 * that supplier.
 *
 * Before 00215 a buyer who typed the email or phone of a registered supplier
 * received a quick-quote token; redeeming it opened a session AS that supplier
 * on the buyer's own RFQ. A share link is now issued only for a placeholder
 * this organisation created for exactly this contact and nobody has acted as.
 *
 * Requires a local Supabase (`pnpm db:start`, `pnpm db:reset`). Skips when not
 * reachable.
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

const LIFT = DEMO.rfqs.liftAmc;
const TURMERIC = DEMO.rfqs.turmeric;

/** Registered, logged-in supplier already invited to the lift RFQ. */
const AQUA_PRIME = {
  id: '0d500000-0000-4000-8000-000000000001',
  email: 'contact01@otpdemo.test',
  phone: '+919845000001',
};
/** Registered supplier with logins that is not invited to the lift RFQ. */
const KAVERI = {
  id: '0d500000-0000-4000-8000-000000000005',
  email: 'contact05@otpdemo.test',
};
/** Seeded DIRECT supplier with no login: still not the buyer's placeholder. */
const APEX = {
  id: '0d500000-0000-4000-8000-000000000084',
  email: 'contracts@apex-society-painters.test',
};

type InviteResponse = {
  ok?: boolean;
  reused?: boolean;
  supplierId?: string | null;
  invitationId?: string | null;
  token?: string | null;
  quickQuotePath?: string | null;
  shareLinkAvailable?: boolean;
};

let up = false;
let service: SupabaseClient;
let buyer: SupabaseClient;
const originalStatus = new Map<string, string>();
const createdSuppliers: string[] = [];
const preInvitedOnLift = new Set<string>();

const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const uniqueEmail = () => `placeholder-${stamp()}@invite.test`;

async function invite(
  client: SupabaseClient,
  rfqId: string,
  kind: 'PHONE' | 'EMAIL',
  value: string,
): Promise<{ data: InviteResponse | null; error: { message: string } | null }> {
  const { data, error } = await client.rpc('invite_direct_supplier', {
    p_rfq_id: rfqId,
    p_contact_kind: kind,
    p_contact_value: value,
  });
  return { data: data as never, error: error as never };
}

async function redeem(token: string) {
  const { data } = await createAnonClient().rpc('redeem_supplier_magic_link', {
    p_token: token,
    p_from: 'direct-invite-existing-supplier.test',
  });
  return (data ?? {}) as { outcome?: string; sessionToken?: string };
}

async function countRows(table: string, supplierId: string, rfqId: string) {
  const { count, error } = await service
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
    .eq('rfq_id', rfqId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function latestAudit(supplierId: string, rfqId: string) {
  const { data } = await service
    .from('audit_events')
    .select('payload')
    .eq('event_type', 'rfq.direct_invitation_created')
    .eq('entity_id', rfqId)
    .eq('payload->>supplier_id', supplierId)
    .order('occurred_at', { ascending: false })
    .limit(1);
  return (data?.[0]?.payload ?? null) as Record<string, unknown> | null;
}

/** Everything the buyer received that could be mistaken for a link. */
function buyerHeldStrings(data: InviteResponse | null): string[] {
  const values = [data?.token, data?.quickQuotePath, data?.quickQuotePath?.replace(/^\/q\//, '')];
  return [...values.filter((v): v is string => typeof v === 'string'), '', 'null', 'undefined'];
}

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;

  service = createServiceClient();

  for (const rfqId of [LIFT, TURMERIC]) {
    const { data } = await service.from('rfqs').select('status').eq('id', rfqId).single();
    originalStatus.set(rfqId, data!.status as string);
    if (data!.status !== 'OPEN') {
      const { error } = await service.from('rfqs').update({ status: 'OPEN' }).eq('id', rfqId);
      if (error) throw new Error(`could not open ${rfqId}: ${error.message}`);
    }
  }

  const { data: invited } = await service
    .from('rfq_invitations')
    .select('supplier_id')
    .eq('rfq_id', LIFT)
    .in('supplier_id', [AQUA_PRIME.id, KAVERI.id, APEX.id]);
  for (const row of invited ?? []) preInvitedOnLift.add(row.supplier_id as string);

  buyer = createAnonClient();
  await signInAs(buyer, DEMO.logins.sunriseManager);
});

afterAll(async () => {
  if (!up) return;

  await service
    .from('direct_supplier_invites')
    .delete()
    .eq('rfq_id', LIFT)
    .in('supplier_id', [AQUA_PRIME.id, KAVERI.id, APEX.id]);
  const added = [AQUA_PRIME.id, KAVERI.id, APEX.id].filter((id) => !preInvitedOnLift.has(id));
  if (added.length > 0) {
    await service.from('rfq_invitations').delete().eq('rfq_id', LIFT).in('supplier_id', added);
  }

  if (createdSuppliers.length > 0) {
    await service.from('suppliers').delete().in('id', createdSuppliers);
  }

  for (const [rfqId, status] of originalStatus) {
    if (status !== 'OPEN') await service.from('rfqs').update({ status }).eq('id', rfqId);
  }
});

describe('invite_direct_supplier withholds the link for an existing supplier', () => {
  beforeEach((ctx) => {
    if (!up) ctx.skip();
  });

  for (const [kind, value, masked] of [
    ['EMAIL', AQUA_PRIME.email, 'c***@otpdemo.test'],
    ['PHONE', AQUA_PRIME.phone, '*********0001'],
  ] as const) {
    it(`gives the buyer nothing redeemable when inviting Aqua Prime by ${kind}`, async () => {
      const linksBefore = await countRows('supplier_magic_links', AQUA_PRIME.id, LIFT);
      const sessionsBefore = await countRows('supplier_quote_sessions', AQUA_PRIME.id, LIFT);

      const { data, error } = await invite(buyer, LIFT, kind, value);

      expect(error).toBeNull();
      expect(data).toMatchObject({
        ok: true,
        token: null,
        quickQuotePath: null,
        supplierId: null,
        invitationId: null,
        shareLinkAvailable: false,
      });

      expect(await countRows('supplier_magic_links', AQUA_PRIME.id, LIFT)).toBe(linksBefore);

      for (const candidate of buyerHeldStrings(data)) {
        const outcome = await redeem(candidate);
        expect(outcome.outcome).not.toBe('OK');
        expect(outcome.sessionToken).toBeUndefined();
      }
      expect(await countRows('supplier_quote_sessions', AQUA_PRIME.id, LIFT)).toBe(sessionsBefore);

      const audit = await latestAudit(AQUA_PRIME.id, LIFT);
      expect(audit).toMatchObject({
        contact_kind: kind,
        contact_value_masked: masked,
        magic_link_issued: false,
      });
      expect(JSON.stringify(audit)).not.toContain(value);
    });
  }

  it('keeps a repeat invite of the same existing contact idempotent and still withheld', async () => {
    await invite(buyer, LIFT, 'EMAIL', AQUA_PRIME.email);
    const repeat = await invite(buyer, LIFT, 'EMAIL', `  ${AQUA_PRIME.email.toUpperCase()} `);

    expect(repeat.error).toBeNull();
    expect(repeat.data).toMatchObject({ reused: true, token: null, shareLinkAvailable: false });
    expect(await countRows('rfq_invitations', AQUA_PRIME.id, LIFT)).toBe(1);

    const { count: directRows } = await service
      .from('direct_supplier_invites')
      .select('id', { count: 'exact', head: true })
      .eq('rfq_id', LIFT)
      .eq('contact_kind', 'EMAIL')
      .eq('contact_value', AQUA_PRIME.email);
    expect(directRows).toBe(1);
  });

  it('invites an existing supplier not yet on the RFQ without returning its invitation or id', async () => {
    const { data, error } = await invite(buyer, LIFT, 'EMAIL', KAVERI.email);

    expect(error).toBeNull();
    expect(data).toMatchObject({
      ok: true,
      reused: false,
      invitationId: null,
      supplierId: null,
      token: null,
      shareLinkAvailable: false,
    });

    const { data: invitation } = await service
      .from('rfq_invitations')
      .select('status, match_reasons')
      .eq('rfq_id', LIFT)
      .eq('supplier_id', KAVERI.id)
      .single();
    expect(invitation).toMatchObject({ status: 'INVITED', match_reasons: ['direct:email'] });
    expect(await countRows('supplier_magic_links', KAVERI.id, LIFT)).toBe(0);
  });

  it('withholds the link for a seeded DIRECT supplier with no login', async () => {
    const { data, error } = await invite(buyer, LIFT, 'EMAIL', APEX.email);

    expect(error).toBeNull();
    expect(data).toMatchObject({ token: null, supplierId: null, shareLinkAvailable: false });
    expect(await countRows('supplier_magic_links', APEX.id, LIFT)).toBe(0);
  });

  it('answers an existing-supplier match with the same keys as a new-supplier invite', async () => {
    const fresh = await invite(buyer, LIFT, 'EMAIL', uniqueEmail());
    if (fresh.data?.supplierId) createdSuppliers.push(fresh.data.supplierId);
    const existing = await invite(buyer, LIFT, 'PHONE', AQUA_PRIME.phone);

    expect(Object.keys(existing.data ?? {}).sort()).toEqual(Object.keys(fresh.data ?? {}).sort());
  });
});

describe('invite_direct_supplier still shares a link for the buyer’s own placeholder', () => {
  beforeEach((ctx) => {
    if (!up) ctx.skip();
  });

  it('returns a working link for a new supplier; a repeat issues a fresh one and retires the old', async () => {
    const email = uniqueEmail();
    const first = await invite(buyer, LIFT, 'EMAIL', email);
    expect(first.error).toBeNull();
    if (first.data?.supplierId) createdSuppliers.push(first.data.supplierId);

    expect(first.data).toMatchObject({ ok: true, reused: false, shareLinkAvailable: true });
    expect(first.data?.token).toBeTruthy();
    expect(first.data?.quickQuotePath).toBe(`/q/${first.data!.token}`);

    const repeat = await invite(buyer, LIFT, 'EMAIL', email);
    expect(repeat.data).toMatchObject({
      reused: true,
      shareLinkAvailable: true,
      supplierId: first.data!.supplierId,
      invitationId: first.data!.invitationId,
    });
    expect(repeat.data?.token).toBeTruthy();
    expect(repeat.data?.token).not.toBe(first.data?.token);

    const retired = await redeem(first.data!.token!);
    expect(retired.outcome).toBe('INVALID');
    expect(retired.sessionToken).toBeUndefined();

    const redeemed = await redeem(repeat.data!.token!);
    expect(redeemed.outcome).toBe('OK');
    expect(redeemed.sessionToken).toBeTruthy();

    const { data: links } = await service
      .from('supplier_magic_links')
      .select('used_at, expires_at')
      .eq('supplier_id', first.data!.supplierId!)
      .eq('rfq_id', LIFT);
    const live = (links ?? []).filter(
      (l) => l.used_at === null && Date.parse(l.expires_at as string) > Date.now(),
    );
    expect(links).toHaveLength(2);
    expect(live).toHaveLength(0);
  });

  it('stops sharing once someone has quoted through the placeholder', async () => {
    const email = uniqueEmail();
    const first = await invite(buyer, LIFT, 'EMAIL', email);
    if (first.data?.supplierId) createdSuppliers.push(first.data.supplierId);
    expect((await redeem(first.data!.token!)).outcome).toBe('OK');

    const after = await invite(buyer, LIFT, 'EMAIL', email);
    expect(after.error).toBeNull();
    expect(after.data).toMatchObject({
      reused: true,
      token: null,
      quickQuotePath: null,
      supplierId: null,
      invitationId: null,
      shareLinkAvailable: false,
    });
  });

  it('does not share a link for a placeholder another organisation created', async () => {
    const other = createAnonClient();
    await signInAs(other, DEMO.logins.bharathiOwner);

    const email = uniqueEmail();
    const theirs = await invite(other, TURMERIC, 'EMAIL', email);
    expect(theirs.error).toBeNull();
    expect(theirs.data?.shareLinkAvailable).toBe(true);
    if (theirs.data?.supplierId) createdSuppliers.push(theirs.data.supplierId);

    const ours = await invite(buyer, LIFT, 'EMAIL', email);
    expect(ours.error).toBeNull();
    expect(ours.data).toMatchObject({ token: null, supplierId: null, shareLinkAvailable: false });
    expect(await countRows('supplier_magic_links', theirs.data!.supplierId!, LIFT)).toBe(0);

    const theirRepeat = await invite(other, TURMERIC, 'EMAIL', email);
    expect(theirRepeat.data?.shareLinkAvailable).toBe(true);
    expect(theirRepeat.data?.token).toBeTruthy();
  });

  it('still refuses buyers outside the RFQ organisation and committee members', async () => {
    const outsider = createAnonClient();
    await signInAs(outsider, DEMO.logins.bharathiOwner);
    expect((await invite(outsider, LIFT, 'EMAIL', AQUA_PRIME.email)).error?.message).toMatch(
      /access denied/i,
    );

    const committee = createAnonClient();
    await signInAs(committee, DEMO.logins.sunriseCommittee);
    expect((await invite(committee, LIFT, 'EMAIL', AQUA_PRIME.email)).error?.message).toMatch(
      /insufficient role/i,
    );
  });
});
