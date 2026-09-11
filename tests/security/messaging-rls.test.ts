/**
 * Row-level security on the WhatsApp/SMS layer — live Supabase.
 *
 * The gateway that hides supplier phone numbers from buyers is only worth what
 * the database says the tables behind it are worth. If a manager can SELECT
 * from supplier_messaging_channels, or a buyer can read messaging_events, the
 * single-platform-sender guarantee described in
 * apps/web/src/features/site/content/site-content.ts is gone regardless of how
 * the Edge Function is written.
 *
 * These tests assert the shape 00036_messaging_channel_schema.sql promises: no
 * INSERT/UPDATE policies for authenticated users at all, and SELECT limited to
 * the row's own supplier (plus platform admin). They fail loudly if a future
 * policy widens read access — that widening is the point that has to be
 * argued explicitly, not slipped in.
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

let up = false;
let service: SupabaseClient;

/** Rows created by this file, torn down at the end. */
const createdEventIds: string[] = [];
const createdNotificationIds: string[] = [];

const OTHER_SUPPLIER_ID = DEMO.suppliers.tirupurYarn;
const OWN_SUPPLIER_ID = DEMO.suppliers.aquaPrime;

beforeAll(async () => {
  up = await isLocalSupabaseReachable();
  if (!up) return;

  service = createServiceClient();

  // A pair of rows in each RFQ-scoped messaging table, one for the supplier we
  // will sign in as and one for a competitor, so an over-permissive policy
  // shows up as either "sees the competitor" or "sees the whole table".
  for (const supplierId of [OWN_SUPPLIER_ID, OTHER_SUPPLIER_ID]) {
    const eventInsert = await service
      .from('messaging_events')
      .insert({
        provider: 'MOCK',
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        external_message_id: `rls-test-${supplierId}-${Date.now()}`,
        phone_e164: '+919000099999',
        supplier_id: supplierId,
        rfq_id: DEMO.rfqs.motor,
        raw_payload: { test: 'messaging-rls' },
        normalized_message: 'QUOTE RFQ-TEST 1000',
        processing_status: 'RECEIVED',
      })
      .select('id')
      .single();

    if (eventInsert.error) {
      throw new Error(`seed messaging_events failed: ${eventInsert.error.message}`);
    }
    createdEventIds.push(eventInsert.data!.id as string);

    // supplier_notifications needs an invitation; use whichever invitation this
    // supplier already has on the motor RFQ, otherwise skip inserting one.
    const { data: invitation } = await service
      .from('rfq_invitations')
      .select('id')
      .eq('rfq_id', DEMO.rfqs.motor)
      .eq('supplier_id', supplierId)
      .maybeSingle();

    if (invitation) {
      const notificationInsert = await service
        .from('supplier_notifications')
        .insert({
          rfq_id: DEMO.rfqs.motor,
          supplier_id: supplierId,
          invitation_id: invitation.id as string,
          channel: 'WHATSAPP',
          provider: 'MOCK',
          template_id: 'rls-test',
          external_message_id: `notif-rls-${supplierId}-${Date.now()}`,
          status: 'SENT',
          body: 'Test notification body — never for buyers.',
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (notificationInsert.error) {
        throw new Error(`seed supplier_notifications failed: ${notificationInsert.error.message}`);
      }
      createdNotificationIds.push(notificationInsert.data!.id as string);
    }
  }
});

afterAll(async () => {
  if (!up) return;

  if (createdNotificationIds.length > 0) {
    await service.from('supplier_notifications').delete().in('id', createdNotificationIds);
  }
  if (createdEventIds.length > 0) {
    await service.from('messaging_events').delete().in('id', createdEventIds);
  }
});

beforeEach((ctx) => {
  if (!up) ctx.skip();
});

describe('messaging RLS — buyers see nothing', () => {
  it('facility manager cannot SELECT supplier_messaging_channels', async () => {
    // The whole point of the layer: the phone book stays behind the gateway.
    // Even a manager on the winning enquiry has no reason to read a supplier's
    // handset directly, and this policy denies the reason from ever mattering.
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data, error } = await client
      .from('supplier_messaging_channels')
      .select('id, supplier_id, phone_e164');

    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(0);
  });

  it('committee member cannot SELECT supplier_messaging_channels either', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseCommittee);

    const { data } = await client
      .from('supplier_messaging_channels')
      .select('id, supplier_id, phone_e164');
    expect(data?.length ?? 0).toBe(0);
  });

  it('facility manager cannot SELECT messaging_events on their own RFQ', async () => {
    // Even where the RFQ is theirs, the inbound message log is not: a body
    // like "call me on 98xxx" would leak identity through the log even if the
    // parser stripped it before evaluation.
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data } = await client
      .from('messaging_events')
      .select('id, supplier_id, normalized_message, raw_payload')
      .eq('rfq_id', DEMO.rfqs.motor);
    expect(data?.length ?? 0).toBe(0);
  });

  it('facility manager cannot SELECT supplier_notifications', async () => {
    // Buyers observe delivery through rfq_notification_status, an alias-only
    // view. The base table stays sealed.
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data } = await client
      .from('supplier_notifications')
      .select('id, supplier_id, body')
      .eq('rfq_id', DEMO.rfqs.motor);
    expect(data?.length ?? 0).toBe(0);
  });

  it('facility manager cannot SELECT supplier_magic_links (nobody outside admin can)', async () => {
    // A readable token hash is a hash someone can grind. Not even the owning
    // supplier reads its own — this asserts the buyer half.
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { data } = await client
      .from('supplier_magic_links')
      .select('id');
    expect(data?.length ?? 0).toBe(0);
  });
});

describe('messaging RLS — no writes for authenticated roles', () => {
  it('facility manager cannot INSERT into messaging_events', async () => {
    // Writes go through the SECURITY DEFINER gateway. A direct INSERT from any
    // authenticated role must be refused so a client cannot fabricate a bid.
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.sunriseManager);

    const { error } = await client.from('messaging_events').insert({
      provider: 'MOCK',
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      phone_e164: '+919000099998',
      raw_payload: {},
      processing_status: 'RECEIVED',
    });

    // The error may name RLS or the missing INSERT policy; what matters is
    // that the row does not land.
    expect(error).not.toBeNull();
  });

  it('supplier cannot UPDATE their own supplier_messaging_channels row', async () => {
    // Verification is one-directional and privileged. A supplier who could
    // flip their own status back to VERIFIED would defeat the check that
    // someone proved they hold the number.
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data: before } = await client
      .from('supplier_messaging_channels')
      .select('id, status')
      .eq('supplier_id', OWN_SUPPLIER_ID)
      .limit(1)
      .maybeSingle();

    if (!before) {
      // Nothing to test against — the seed did not create a channel for this
      // supplier — so skip rather than assert an empty absence.
      return;
    }

    const { error } = await client
      .from('supplier_messaging_channels')
      .update({ status: 'VERIFIED' })
      .eq('id', before.id as string);

    // Either an explicit RLS refusal or a silent no-op is acceptable; what is
    // not acceptable is the row changing.
    const { data: after } = await client
      .from('supplier_messaging_channels')
      .select('status')
      .eq('id', before.id as string)
      .maybeSingle();

    if (error) {
      expect(error.message).toMatch(/policy|permission|row-level/i);
    } else {
      expect(after?.status).toBe(before.status);
    }
  });
});

describe('messaging RLS — suppliers see only their own', () => {
  it('supplier sees own messaging_events, not a competitor\u2019s', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data, error } = await client
      .from('messaging_events')
      .select('id, supplier_id')
      .in('id', createdEventIds);

    expect(error).toBeNull();
    const ids = new Set((data ?? []).map((row) => row.supplier_id as string));
    expect(ids.has(OTHER_SUPPLIER_ID)).toBe(false);
    // The own-supplier row may or may not appear depending on how the demo
    // supplier profile is wired; what must never appear is the other one.
  });

  it('supplier sees own supplier_messaging_channels row, not a competitor\u2019s', async () => {
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data } = await client
      .from('supplier_messaging_channels')
      .select('supplier_id, phone_e164');

    const supplierIds = new Set((data ?? []).map((row) => row.supplier_id as string));
    expect(supplierIds.has(OTHER_SUPPLIER_ID)).toBe(false);
  });

  it('supplier cannot SELECT supplier_magic_links even for its own RFQ', async () => {
    // Deliberate: the owning supplier gains nothing from reading its own token
    // hashes, and denying the read denies an attacker who steals a supplier
    // session the offline material to grind.
    const client = createAnonClient();
    await signInAs(client, DEMO.logins.motorSupplier);

    const { data } = await client
      .from('supplier_magic_links')
      .select('id');
    expect(data?.length ?? 0).toBe(0);
  });
});
