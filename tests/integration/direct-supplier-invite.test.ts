/**
 * Direct supplier invitations by phone or email.
 *
 * This is the flow that graduates the "Direct suppliers" channel from a stub
 * adapter (a marketing label with no code path behind it) into an actual
 * capability. The tests here defend the smallest set of properties that the
 * feature would be dishonest without:
 *
 *   - only a buyer/manager/owner on the RFQ's organization can invite;
 *   - only DRAFT or OPEN RFQs accept a direct invitation;
 *   - the created supplier lands with source = 'DIRECT' and is counted under
 *     the DIRECT bucket of the network summary the buyer already reads;
 *   - a repeat submission for the same contact is idempotent;
 *   - malformed contacts are rejected inside the database, not the UI.
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

const RFQ_ID = DEMO.rfqs.motor;

let up = false;
let service: SupabaseClient;
let originalRfqStatus: string | null = null;
const createdInvites: string[] = [];

async function callInvite(
  client: SupabaseClient,
  kind: 'PHONE' | 'EMAIL',
  value: string,
): Promise<{
  data: { ok?: boolean; reused?: boolean; supplierId?: string; invitationId?: string } | null;
  error: { message: string } | null;
}> {
  const { data, error } = await client.rpc('invite_direct_supplier', {
    p_rfq_id: RFQ_ID,
    p_contact_kind: kind,
    p_contact_value: value,
  });
  return { data: data as never, error: error as never };
}

// Unique contacts so the test does not race prior runs when the demo has not
// been reset between them.
const stamp = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const uniquePhone = () => `+9199${Math.floor(1e7 + Math.random() * 9e7)}`;
const uniqueEmail = () => `direct-${stamp()}@invite.test`;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;

  service = createServiceClient();

  const { data: rfq } = await service
    .from('rfqs')
    .select('status')
    .eq('id', RFQ_ID)
    .single();
  originalRfqStatus = (rfq?.status as string | null) ?? null;

  // The function only accepts DRAFT or OPEN. The demo may have staged the RFQ
  // further along, so pin it to DRAFT for the duration of the file and put it
  // back at the end.
  if (originalRfqStatus !== 'DRAFT' && originalRfqStatus !== 'OPEN') {
    const { error } = await service
      .from('rfqs')
      .update({ status: 'DRAFT' })
      .eq('id', RFQ_ID);
    if (error) throw new Error(`could not stage RFQ to DRAFT: ${error.message}`);
  }
});

afterAll(async () => {
  if (!up) return;

  // Roll back any suppliers we created; the cascade cleans up invitations and
  // the direct-invite rows.
  if (createdInvites.length > 0) {
    await service.from('suppliers').delete().in('id', createdInvites);
  }

  if (originalRfqStatus && originalRfqStatus !== 'DRAFT') {
    await service.from('rfqs').update({ status: originalRfqStatus }).eq('id', RFQ_ID);
  }
});

describe('invite_direct_supplier', () => {
  beforeEach((ctx) => {
    if (!up) ctx.skip();
  });

  it('creates a DIRECT-sourced supplier and an invitation for a new phone', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const phone = uniquePhone();
    const { data, error } = await callInvite(buyer, 'PHONE', phone);

    expect(error).toBeNull();
    expect(data?.ok).toBe(true);
    expect(data?.reused).toBe(false);
    expect(data?.supplierId).toBeTruthy();
    expect(data?.invitationId).toBeTruthy();

    if (data?.supplierId) createdInvites.push(data.supplierId);

    const { data: supplier } = await service
      .from('suppliers')
      .select('source, status, contact_phone, contact_email')
      .eq('id', data!.supplierId!)
      .single();

    expect(supplier?.source).toBe('DIRECT');
    expect(supplier?.status).toBe('PENDING');
    expect(supplier?.contact_phone).toBe(phone);
    expect(supplier?.contact_email).toBeNull();

    const { data: invitation } = await service
      .from('rfq_invitations')
      .select('rfq_id, supplier_id, anonymous_label, status, match_reasons')
      .eq('id', data!.invitationId!)
      .single();

    expect(invitation?.rfq_id).toBe(RFQ_ID);
    expect(invitation?.supplier_id).toBe(data!.supplierId!);
    expect(invitation?.anonymous_label).toMatch(/^Supplier (?:[A-Z]|[0-9A-HJKMNP-TV-Z]{4})$/);
    expect(invitation?.status).toBe('INVITED');
    expect(invitation?.match_reasons).toContain('direct:phone');
  });

  it('is idempotent: a second call for the same contact returns reused', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const email = uniqueEmail();

    const first = await callInvite(buyer, 'EMAIL', email);
    expect(first.error).toBeNull();
    expect(first.data?.reused).toBe(false);
    if (first.data?.supplierId) createdInvites.push(first.data.supplierId);

    const second = await callInvite(buyer, 'EMAIL', email);
    expect(second.error).toBeNull();
    expect(second.data?.reused).toBe(true);
    expect(second.data?.supplierId).toBe(first.data?.supplierId);
    expect(second.data?.invitationId).toBe(first.data?.invitationId);
  });

  it('lowercases and trims email so casing does not create duplicates', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const email = uniqueEmail();

    const first = await callInvite(buyer, 'EMAIL', email);
    if (first.data?.supplierId) createdInvites.push(first.data.supplierId);

    const second = await callInvite(buyer, 'EMAIL', `  ${email.toUpperCase()}  `);
    expect(second.error).toBeNull();
    expect(second.data?.reused).toBe(true);
    expect(second.data?.supplierId).toBe(first.data?.supplierId);
  });

  it('strips separators from phone so 98765 43210 and +919876543210 are one contact', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const digits = `9199${Math.floor(1e7 + Math.random() * 9e7)}`;
    const spaced = `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;

    const first = await callInvite(buyer, 'PHONE', spaced);
    expect(first.error).toBeNull();
    if (first.data?.supplierId) createdInvites.push(first.data.supplierId);

    const second = await callInvite(buyer, 'PHONE', `+${digits}`);
    expect(second.error).toBeNull();
    expect(second.data?.reused).toBe(true);
    expect(second.data?.supplierId).toBe(first.data?.supplierId);
  });

  it('rejects a malformed phone', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const { error } = await callInvite(buyer, 'PHONE', 'not-a-number');
    expect(error?.message).toMatch(/valid phone/i);
  });

  it('rejects a malformed email', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const { error } = await callInvite(buyer, 'EMAIL', 'nope-at-nothing');
    expect(error?.message).toMatch(/valid email/i);
  });

  it('rejects an unknown contact_kind', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const { error } = await callInvite(
      buyer,
      'FAX' as unknown as 'PHONE',
      '+919876543210',
    );
    expect(error?.message).toMatch(/PHONE or EMAIL/i);
  });

  it('refuses a caller from a different organization', async () => {
    const outsider = createAnonClient();
    // bharathiOwner runs a different org and has no role on the sunrise motor RFQ.
    await signInAs(outsider, DEMO.logins.bharathiOwner);

    const { error } = await callInvite(outsider, 'PHONE', uniquePhone());
    expect(error?.message).toMatch(/access denied/i);
  });

  it('refuses a caller with no session at all', async () => {
    const anon = createAnonClient();

    const { error } = await callInvite(anon, 'PHONE', uniquePhone());
    // With no profile or unauthenticated session, request is refused.
    expect(error?.message).toMatch(/access denied|no profile|not signed in|not allowed|permission denied|wrong key type/i);
  });

  it('does not accept invitations once the RFQ leaves DRAFT or OPEN', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    await service.from('rfqs').update({ status: 'EVALUATING' }).eq('id', RFQ_ID);
    try {
      const { error } = await callInvite(buyer, 'PHONE', uniquePhone());
      expect(error?.message).toMatch(/DRAFT or OPEN/i);
    } finally {
      await service.from('rfqs').update({ status: 'DRAFT' }).eq('id', RFQ_ID);
    }
  });

  it('counts the new invitation under the DIRECT bucket of the network summary', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const { data: before } = await buyer
      .from('rfq_supplier_networks')
      .select('network, invited_count')
      .eq('rfq_id', RFQ_ID);
    const priorDirect = (before ?? []).find((r: { network: string }) => r.network === 'DIRECT');
    const priorCount = (priorDirect?.invited_count as number | undefined) ?? 0;

    const invited = await callInvite(buyer, 'PHONE', uniquePhone());
    expect(invited.error).toBeNull();
    if (invited.data?.supplierId) createdInvites.push(invited.data.supplierId);

    const { data: after } = await buyer
      .from('rfq_supplier_networks')
      .select('network, invited_count')
      .eq('rfq_id', RFQ_ID);
    const nextDirect = (after ?? []).find((r: { network: string }) => r.network === 'DIRECT');
    const nextCount = (nextDirect?.invited_count as number | undefined) ?? 0;

    expect(nextCount).toBe(priorCount + 1);
  });

  it('leaves the underlying direct_supplier_invites table unreadable by the buyer', async () => {
    const buyer = createAnonClient();
    await signInAs(buyer, DEMO.logins.sunriseManager);

    const { data, error } = await buyer
      .from('direct_supplier_invites')
      .select('*')
      .eq('rfq_id', RFQ_ID);

    // RLS returns an empty set rather than an error for a table with no
    // matching policy — either shape is acceptable, as long as the buyer sees
    // nothing per-supplier.
    if (error) {
      expect(error.message).toMatch(/permission|policy|denied/i);
    } else {
      expect(data ?? []).toEqual([]);
    }
  });
});
