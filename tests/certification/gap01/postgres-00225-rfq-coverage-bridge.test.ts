/**
 * Migration 00225 — RFQ bridge from FRESH location_pin_coverage (LOCAL ONLY).
 */
import { randomUUID } from 'node:crypto';
import { Client, type ClientConfig } from 'pg';
import { describe, expect, it, beforeAll, afterEach } from 'vitest';
import { observeRfqInvitationDispatch } from '../../../packages/services/src/discovery/google-places-quality-gate';
import { isLocalSupabaseReachable } from '../../helpers/supabase-local';

const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

let dbUp = false;
let migrationApplied = false;

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(LOCAL_PG);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

async function withServiceRole<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  return withPg(async (c) => {
    await c.query('SET ROLE service_role');
    try {
      return await fn(c);
    } finally {
      await c.query('RESET ROLE');
    }
  });
}

async function seedScopeForCategory(
  c: Client,
  placeId: string,
  supplierJson: Record<string, unknown>,
): Promise<string> {
  const catRow = await c.query(`SELECT id, name FROM requirement_categories LIMIT 1`);
  const catName = (catRow.rows[0]?.name as string) ?? 'General Commercial Supplies';
  const sk = await c.query(
    `SELECT public.location_pin_coverage_build_scope_key('Karnataka', 'Bengaluru', '560048', $1) AS sk`,
    [catName],
  );
  const scopeKey = sk.rows[0].sk as string;
  await c.query(
    `INSERT INTO location_pin_coverage_scope (scope_key, state, city, pincode, category, supplier_count, last_successful_discovery_at)
     VALUES ($1, 'Karnataka', 'Bengaluru', '560048', $2, 1, now())`,
    [scopeKey, catName],
  );
  await c.query(
    `INSERT INTO location_pin_coverage_supplier (scope_key, place_id, supplier_json) VALUES ($1, $2, $3::jsonb)`,
    [scopeKey, placeId, JSON.stringify(supplierJson)],
  );
  return scopeKey;
}

function completeCoverageJson(id: string): Record<string, unknown> {
  return {
    placeId: id,
    businessName: 'Callable Paint Co',
    formattedAddress: '12 Industrial Road, Bengaluru 560048',
    phone: '+919876543210',
    lat: 12.97,
    lng: 77.71,
    googleMapsUri: 'https://maps.google.com/?cid=callable',
    businessStatus: 'OPERATIONAL',
    locations: [{
      pincode: '560048',
      city: 'Bengaluru',
      state: 'Karnataka',
      phone: '+919876543210',
      addressLine: '12 Industrial Road, Bengaluru 560048',
      latitude: 12.97,
      longitude: 77.71,
    }],
  };
}

async function seedDraftRfq(c: Client, title: string): Promise<string> {
  const org = await c.query(`SELECT id FROM organizations LIMIT 1`);
  const profile = await c.query(`SELECT id FROM profiles LIMIT 1`);
  const catRow = await c.query(`SELECT id FROM requirement_categories LIMIT 1`);
  expect(org.rowCount).toBeGreaterThan(0);
  expect(profile.rowCount).toBeGreaterThan(0);
  expect(catRow.rowCount).toBeGreaterThan(0);
  const reqId = randomUUID();
  const rfqId = randomUUID();
  await c.query(
    `INSERT INTO requirements (
      id, organization_id, created_by, title, status, requirement_type,
      delivery_city, delivery_pincode, category_id, structured_specs
    ) VALUES ($1, $2, $3, $4, 'SUBMITTED', 'SERVICE', 'Bengaluru', '560048', $5,
      '{"deliveryLocation":{"state":"Karnataka","city":"Bengaluru","pincode":"560048"}}'::jsonb)`,
    [reqId, org.rows[0].id, profile.rows[0].id, title, catRow.rows[0].id],
  );
  await c.query(
    `INSERT INTO rfqs (id, organization_id, created_by, requirement_id, title, status)
     VALUES ($1, $2, $3, $4, $5, 'DRAFT')`,
    [rfqId, org.rows[0].id, profile.rows[0].id, reqId, title],
  );
  await c.query(`SELECT set_config('otp.demo_staging', 'on', true)`);
  return rfqId;
}

describe('00225 RFQ pin coverage supplier bridge (local postgres)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
    if (!dbUp) return;
    migrationApplied = await withPg(async (c) => {
      const r = await c.query(
        `SELECT 1 FROM pg_proc WHERE proname = 'location_pin_coverage_drop_unreachable' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')`,
      );
      return r.rowCount === 1;
    });
  });

  let scopeKey = '';
  const placeId = `ChIJ_test_bridge_${randomUUID().slice(0, 8)}`;

  afterEach(async () => {
    if (!dbUp || !migrationApplied || !scopeKey) return;
    await withServiceRole(async (c) => {
      await c.query(
        `DELETE FROM rfq_invitations WHERE supplier_id IN (SELECT id FROM suppliers WHERE external_place_id = $1)`,
        [placeId],
      );
      await c.query(
        `DELETE FROM supplier_provider_identities WHERE supplier_id IN (SELECT id FROM suppliers WHERE external_place_id = $1)`,
        [placeId],
      );
      await c.query(`DELETE FROM suppliers WHERE external_place_id = $1`, [placeId]);
      await c.query(`DELETE FROM location_pin_coverage_supplier WHERE scope_key = $1`, [scopeKey]);
      await c.query(`DELETE FROM location_pin_coverage_scope WHERE scope_key = $1`, [scopeKey]);
      scopeKey = '';
    });
  });

  it('skips when migration is not applied locally', () => {
    if (!dbUp) {
      expect(true).toBe(true);
      return;
    }
    expect(typeof migrationApplied).toBe('boolean');
  });

  it('FRESH coverage without phone does not create a supplier, identity, or invitation', async () => {
    if (!dbUp || !migrationApplied) return;

    await withServiceRole(async (c) => {
      scopeKey = await seedScopeForCategory(c, placeId, {
        placeId,
        businessName: 'Bridge Paint Co',
        provenanceProviders: ['GOOGLE_PLACES'],
        locations: [{ pincode: '560048', city: 'Bengaluru', state: 'Karnataka' }],
      });
      const rfqId = await seedDraftRfq(c, 'Bridge test req');

      const res = await c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid) AS j`, [rfqId]);
      const payload = res.rows[0].j as {
        pin_coverage_invited?: number;
        pin_coverage_dropped?: number;
        invited?: number;
      };
      expect(payload.pin_coverage_invited ?? 0).toBe(0);
      expect(payload.pin_coverage_dropped ?? 0).toBeGreaterThanOrEqual(1);

      const sup = await c.query(`SELECT id, status FROM suppliers WHERE external_place_id = $1`, [placeId]);
      expect(sup.rowCount).toBe(0);
      const ident = await c.query(
        `SELECT count(*)::int AS n FROM supplier_provider_identities WHERE provider_supplier_id = $1`,
        [placeId],
      );
      expect(ident.rows[0].n).toBe(0);
      const inv = await c.query(
        `SELECT count(*)::int AS n FROM rfq_invitations i
         JOIN suppliers s ON s.id = i.supplier_id
         WHERE i.rfq_id = $1 AND s.external_place_id = $2`,
        [rfqId, placeId],
      );
      expect(inv.rows[0].n).toBe(0);

      const active = await c.query(`SELECT count(*)::int AS n FROM suppliers WHERE status = 'ACTIVE'`);
      if ((active.rows[0].n as number) > 0) {
        const activeInvited = await c.query(
          `SELECT count(*)::int AS n
           FROM rfq_invitations i
           JOIN suppliers s ON s.id = i.supplier_id
           WHERE i.rfq_id = $1 AND s.status = 'ACTIVE'`,
          [rfqId],
        );
        expect(activeInvited.rows[0].n).toBeGreaterThan(0);
        expect(payload.invited ?? 0).toBeGreaterThan(0);
      }

      const blind = await c.query(`SELECT * FROM rfq_invitations_blind WHERE rfq_id = $1`, [rfqId]);
      for (const row of blind.rows) {
        expect(JSON.stringify(row)).not.toContain(placeId);
        expect(JSON.stringify(row)).not.toMatch(/GOOGLE|ONDC|place_id/i);
      }
    });
  });

  it('FRESH coverage with phone but without the quality gate does not become a supplier or an invitation', async () => {
    if (!dbUp || !migrationApplied) return;

    await withServiceRole(async (c) => {
      scopeKey = await seedScopeForCategory(c, placeId, {
        placeId,
        businessName: 'Callable Paint Co',
        phone: '+919876543210',
        locations: [{ pincode: '560048', city: 'Bengaluru', state: 'Karnataka', phone: '+919876543210' }],
      });
      const rfqId = await seedDraftRfq(c, 'Phone incomplete');
      const res = await c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid) AS j`, [rfqId]);
      const payload = res.rows[0].j as { pin_coverage_invited?: number; pin_coverage_dropped?: number };
      expect(payload.pin_coverage_invited ?? 0).toBe(0);
      expect(payload.pin_coverage_dropped ?? 0).toBeGreaterThanOrEqual(1);
      const sup = await c.query(`SELECT count(*)::int AS n FROM suppliers WHERE external_place_id = $1`, [placeId]);
      expect(sup.rows[0].n).toBe(0);
      const inv = await c.query(
        `SELECT count(*)::int AS n FROM rfq_invitations i
         JOIN suppliers s ON s.id = i.supplier_id
         WHERE i.rfq_id = $1 AND s.external_place_id = $2`,
        [rfqId, placeId],
      );
      expect(inv.rows[0].n).toBe(0);
    });
  });

  it('FRESH coverage that passes the quality gate creates an invitation and does not claim a send', async () => {
    if (!dbUp || !migrationApplied) return;

    await withServiceRole(async (c) => {
      scopeKey = await seedScopeForCategory(c, placeId, completeCoverageJson(placeId));
      const rfqId = await seedDraftRfq(c, 'Phone bridge');
      const res = await c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid) AS j`, [rfqId]);
      const payload = res.rows[0].j as { pin_coverage_invited?: number };
      expect(payload.pin_coverage_invited).toBeGreaterThanOrEqual(1);

      const inv = await c.query(
        `SELECT i.id FROM rfq_invitations i
         JOIN suppliers s ON s.id = i.supplier_id
         WHERE i.rfq_id = $1 AND s.external_place_id = $2`,
        [rfqId, placeId],
      );
      expect(inv.rowCount).toBe(1);
      const notes = await c.query(
        `SELECT count(*)::int AS n FROM supplier_notifications WHERE invitation_id = $1`,
        [inv.rows[0].id],
      );
      expect(notes.rows[0].n).toBe(0);
      const observed = observeRfqInvitationDispatch({
        invitationRowCreated: true,
        messagingHttpAttempted: false,
      });
      expect(observed).toEqual({ invitation: 'CREATED', dispatch: 'NOT_ATTEMPTED', rfqSent: false });
    });
  });

  it('idempotent second discover does not duplicate suppliers', async () => {
    if (!dbUp || !migrationApplied) return;

    await withServiceRole(async (c) => {
      scopeKey = await seedScopeForCategory(c, placeId, completeCoverageJson(placeId));
      const rfqId = await seedDraftRfq(c, 'Dup');
      await c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid)`, [rfqId]);
      await c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid)`, [rfqId]);

      const cnt = await c.query(`SELECT count(*)::int AS n FROM suppliers WHERE external_place_id = $1`, [placeId]);
      expect(cnt.rows[0].n).toBe(1);

      const identCnt = await c.query(
        `SELECT count(*)::int AS n FROM supplier_provider_identities WHERE provider_supplier_id = $1`,
        [placeId],
      );
      expect(identCnt.rows[0].n).toBe(1);
      const invCnt = await c.query(
        `SELECT count(*)::int AS n FROM rfq_invitations i
         JOIN suppliers s ON s.id = i.supplier_id
         WHERE i.rfq_id = $1 AND s.external_place_id = $2`,
        [rfqId, placeId],
      );
      expect(invCnt.rows[0].n).toBe(1);
    });
  });

  it('no-phone rediscovery suspends a placeholder; a later phone result invites once and does not send', async () => {
    if (!dbUp || !migrationApplied) return;

    await withServiceRole(async (c) => {
      scopeKey = await seedScopeForCategory(c, placeId, { placeId, businessName: 'Old No Phone' });
      const inserted = await c.query(
        `INSERT INTO suppliers (
           business_name, source, source_ref, external_place_id, status, lifecycle_state, verification_status
         ) VALUES ('Old No Phone', 'OTHER', $1, $2, 'PENDING', 'QUOTE_PARTICIPANT', 'NOT_PROVIDED')
         RETURNING id`,
        [`google_place:${placeId}`, placeId],
      );
      const supplierId = inserted.rows[0].id as string;
      await c.query(
        `INSERT INTO supplier_provider_identities (supplier_id, provider, provider_supplier_id)
         VALUES ($1, 'GOOGLE_PLACES', $2)`,
        [supplierId, placeId],
      );
      const rfqId = await seedDraftRfq(c, 'Retire');
      await c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid)`, [rfqId]);
      const suspended = await c.query(`SELECT status FROM suppliers WHERE id = $1`, [supplierId]);
      expect(suspended.rows[0].status).toBe('SUSPENDED');
      const ident = await c.query(
        `SELECT count(*)::int AS n FROM supplier_provider_identities WHERE supplier_id = $1`,
        [supplierId],
      );
      expect(ident.rows[0].n).toBe(0);
      const inv0 = await c.query(
        `SELECT count(*)::int AS n FROM rfq_invitations WHERE rfq_id = $1 AND supplier_id = $2`,
        [rfqId, supplierId],
      );
      expect(inv0.rows[0].n).toBe(0);

      await c.query(
        `UPDATE location_pin_coverage_scope
         SET supplier_count = 1, last_successful_discovery_at = now()
         WHERE scope_key = $1`,
        [scopeKey],
      );
      await c.query(
        `INSERT INTO location_pin_coverage_supplier (scope_key, place_id, supplier_json)
         VALUES ($1, $2, $3::jsonb)`,
        [scopeKey, placeId, JSON.stringify(completeCoverageJson(placeId))],
      );
      const rfq2 = await seedDraftRfq(c, 'Revive');
      await c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid)`, [rfq2]);
      const revived = await c.query(
        `SELECT status, lifecycle_state, verification_status FROM suppliers WHERE id = $1`,
        [supplierId],
      );
      expect(revived.rows[0].status).toBe('PENDING');
      expect(revived.rows[0].lifecycle_state).toBe('QUOTE_PARTICIPANT');
      expect(revived.rows[0].verification_status).not.toBe('VERIFIED');
      const ident2 = await c.query(
        `SELECT provider, provider_supplier_id FROM supplier_provider_identities WHERE supplier_id = $1`,
        [supplierId],
      );
      expect(ident2.rowCount).toBe(1);
      expect(ident2.rows[0].provider).toBe('GOOGLE_PLACES');
      expect(ident2.rows[0].provider_supplier_id).toBe(placeId);
      const inv1 = await c.query(
        `SELECT count(*)::int AS n FROM rfq_invitations WHERE rfq_id = $1 AND supplier_id = $2`,
        [rfq2, supplierId],
      );
      expect(inv1.rows[0].n).toBe(1);
      const notes = await c.query(
        `SELECT count(*)::int AS n FROM supplier_notifications sn
         JOIN rfq_invitations i ON i.id = sn.invitation_id
         WHERE i.rfq_id = $1 AND i.supplier_id = $2`,
        [rfq2, supplierId],
      );
      expect(notes.rows[0].n).toBe(0);
      expect(
        observeRfqInvitationDispatch({ invitationRowCreated: true, messagingHttpAttempted: false }).rfqSent,
      ).toBe(false);
    });
  });
});
