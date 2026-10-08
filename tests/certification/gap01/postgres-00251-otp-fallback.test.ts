/**
 * Migration 00251 — OTP-registered fallback when fresh external coverage
 * has no addressable supplier. Local Docker only. Each case rolls back.
 *
 * Trust labels stay distinct. A Google pin invitation is discovered_in_area.
 * An OTP login is otp_registered. GST_VERIFIED requires the supplier's own
 * verification flags plus a login. Google discovery does not set those flags.
 */
import { randomUUID } from 'node:crypto';
import { Client, type ClientConfig } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { isLocalSupabaseReachable } from '../../helpers/supabase-local';

const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

let dbUp = false;

async function withRollback(fn: (c: Client) => Promise<void>): Promise<void> {
  const c = new Client(LOCAL_PG);
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`SELECT set_config('otp.demo_staging', 'on', true)`);
    await fn(c);
  } finally {
    await c.query('ROLLBACK');
    await c.end();
  }
}

function completeCoverage(placeId: string): Record<string, unknown> {
  return {
    placeId,
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

async function scopeFor(c: Client, supplierJson: Record<string, unknown> | null, freshness: 'FRESH' | 'STALE' | 'NEVER') {
  const cat = await c.query<{ id: string; name: string }>(
    `SELECT id, name FROM requirement_categories ORDER BY name LIMIT 1`,
  );
  const category = cat.rows[0];
  expect(category).toBeTruthy();
  const sk = await c.query<{ sk: string }>(
    `SELECT public.location_pin_coverage_build_scope_key('Karnataka', 'Bengaluru', '560048', $1) AS sk`,
    [category.name],
  );
  const scopeKey = sk.rows[0].sk;
  await c.query(`DELETE FROM location_pin_coverage_supplier WHERE scope_key = $1`, [scopeKey]);
  await c.query(`DELETE FROM location_pin_coverage_scope WHERE scope_key = $1`, [scopeKey]);
  if (freshness !== 'NEVER') {
    const seen = freshness === 'FRESH' ? 'now()' : `now() - interval '40 days'`;
    await c.query(
      `INSERT INTO location_pin_coverage_scope (scope_key, state, city, pincode, category, supplier_count, last_successful_discovery_at)
       VALUES ($1, 'Karnataka', 'Bengaluru', '560048', $2, $3, ${seen})`,
      [scopeKey, category.name, supplierJson ? 1 : 0],
    );
    if (supplierJson) {
      await c.query(
        `INSERT INTO location_pin_coverage_supplier (scope_key, place_id, supplier_json)
         VALUES ($1, $2, $3::jsonb)`,
        [scopeKey, supplierJson.placeId, JSON.stringify(supplierJson)],
      );
    }
  }
  return { scopeKey, categoryId: category.id };
}

async function seedRfq(c: Client, categoryId: string, title: string): Promise<string> {
  const org = await c.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`);
  const profile = await c.query<{ id: string }>(`SELECT id FROM profiles LIMIT 1`);
  const reqId = randomUUID();
  const rfqId = randomUUID();
  await c.query(
    `INSERT INTO requirements (
      id, organization_id, created_by, title, status, requirement_type,
      delivery_city, delivery_pincode, category_id, structured_specs
    ) VALUES ($1, $2, $3, $4, 'SUBMITTED', 'SERVICE', 'Bengaluru', '560048', $5,
      '{"deliveryLocation":{"state":"Karnataka","city":"Bengaluru","pincode":"560048"}}'::jsonb)`,
    [reqId, org.rows[0].id, profile.rows[0].id, title, categoryId],
  );
  await c.query(
    `INSERT INTO rfqs (id, organization_id, created_by, requirement_id, title, status)
     VALUES ($1, $2, $3, $4, $5, 'DRAFT')`,
    [rfqId, org.rows[0].id, profile.rows[0].id, reqId, title],
  );
  return rfqId;
}

async function existingSupplierIds(c: Client): Promise<string[]> {
  const rows = await c.query<{ id: string }>(`SELECT id FROM suppliers`);
  return rows.rows.map((row) => row.id);
}

async function profileWithLogin(c: Client): Promise<string> {
  const row = await c.query<{ id: string }>(
    `SELECT pr.id
     FROM profiles pr
     JOIN auth.users au ON au.id = pr.auth_user_id
     LIMIT 1`,
  );
  expect(row.rowCount).toBeGreaterThan(0);
  return row.rows[0].id;
}

async function insertSupplier(
  c: Client,
  input: {
    name: string;
    city: string;
    status?: string;
    areaCity?: string | null;
    linkProfileId?: string | null;
    gstVerified?: boolean;
  },
): Promise<string> {
  const inserted = await c.query<{ id: string }>(
    `INSERT INTO suppliers (
       business_name, city, status, lifecycle_state, verification_status, gst_verified
     ) VALUES (
       $1, $2, $3, $4, $5, $6
     ) RETURNING id`,
    [
      input.name,
      input.city,
      input.status ?? 'ACTIVE',
      input.gstVerified ? 'VERIFIED' : 'QUOTE_PARTICIPANT',
      input.gstVerified ? 'VERIFIED' : 'NOT_PROVIDED',
      input.gstVerified === true,
    ],
  );
  const id = inserted.rows[0].id;
  if (input.areaCity) {
    await c.query(
      `INSERT INTO supplier_service_areas (supplier_id, city, is_primary) VALUES ($1, $2, true)`,
      [id, input.areaCity],
    );
  }
  if (input.linkProfileId) {
    await c.query(
      `INSERT INTO supplier_users (supplier_id, profile_id, role) VALUES ($1, $2, 'OWNER')`,
      [id, input.linkProfileId],
    );
  }
  return id;
}

async function discover(
  c: Client,
  rfqId: string,
  exclude: string[],
  network = 'GOOGLE_PLACES',
): Promise<Record<string, unknown>> {
  const res = await c.query<{ j: Record<string, unknown> }>(
    `SELECT public.discover_and_invite_for_rfq($1::uuid, 10, $2::uuid[], $3) AS j`,
    [rfqId, exclude, network],
  );
  return res.rows[0].j;
}

async function invitedReasons(c: Client, rfqId: string, supplierId: string): Promise<string[] | null> {
  const res = await c.query<{ match_reasons: string[] }>(
    `SELECT match_reasons FROM rfq_invitations WHERE rfq_id = $1 AND supplier_id = $2`,
    [rfqId, supplierId],
  );
  if (res.rowCount === 0) return null;
  return res.rows[0].match_reasons ?? [];
}

describe('00251 fresh coverage OTP-registered fallback (local postgres)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
  });

  it('invites an addressable fresh external supplier as discovered in area, not GST verified', async () => {
    if (!dbUp) return;
    await withRollback(async (c) => {
      const placeId = `ChIJ_ext_${randomUUID().slice(0, 8)}`;
      const { categoryId } = await scopeFor(c, completeCoverage(placeId), 'FRESH');
      const profileId = await profileWithLogin(c);
      const exclude = await existingSupplierIds(c);
      const otpId = await insertSupplier(c, {
        name: 'Fallback OTP Bengaluru',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        linkProfileId: profileId,
      });
      const rfqId = await seedRfq(c, categoryId, 'Fresh external available');
      const payload = await discover(c, rfqId, exclude);
      expect(payload.outcome).toBe('GOOGLE_PLACES_DISCOVERY');
      expect(payload.pin_coverage_invited).toBe(1);
      expect(payload.otp_registered_invited).toBe(0);
      const google = await c.query<{ gst_verified: boolean; verification_status: string; id: string }>(
        `SELECT id, gst_verified, verification_status FROM suppliers WHERE external_place_id = $1`,
        [placeId],
      );
      expect(google.rowCount).toBe(1);
      expect(google.rows[0].gst_verified).toBe(false);
      expect(google.rows[0].verification_status).not.toBe('VERIFIED');
      const reasons = await invitedReasons(c, rfqId, google.rows[0].id);
      expect(reasons).toEqual(expect.arrayContaining(['pin_coverage', 'discovered_in_area']));
      expect(reasons).not.toContain('otp_registered');
      expect(reasons).not.toContain('gst_verified');
      expect(await invitedReasons(c, rfqId, otpId)).toBeNull();
    });
  });

  it('does not invite registered suppliers when coverage was never discovered', async () => {
    if (!dbUp) return;
    await withRollback(async (c) => {
      const { categoryId } = await scopeFor(c, null, 'NEVER');
      const profileId = await profileWithLogin(c);
      const otpId = await insertSupplier(c, {
        name: 'OTP while undiscovered',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        linkProfileId: profileId,
      });
      const rfqId = await seedRfq(c, categoryId, 'Never discovered');
      const payload = await discover(c, rfqId, []);
      expect(payload.outcome).toBe('COVERAGE_NOT_FRESH');
      expect(payload.coverage_status).toBe('NEVER_DISCOVERED');
      expect(payload.otp_registered_invited).toBe(0);
      expect(payload.pin_coverage_invited).toBe(0);
      expect(await invitedReasons(c, rfqId, otpId)).toBeNull();
      const rfq = await c.query<{ status: string }>(`SELECT status FROM rfqs WHERE id = $1`, [rfqId]);
      expect(rfq.rows[0].status).toBe('DRAFT');
    });
  });

  it('does not invite registered suppliers from stale coverage', async () => {
    if (!dbUp) return;
    await withRollback(async (c) => {
      const placeId = `ChIJ_stale_${randomUUID().slice(0, 8)}`;
      const { categoryId } = await scopeFor(c, completeCoverage(placeId), 'STALE');
      const profileId = await profileWithLogin(c);
      const otpId = await insertSupplier(c, {
        name: 'OTP while stale',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        linkProfileId: profileId,
      });
      const rfqId = await seedRfq(c, categoryId, 'Stale coverage');
      const payload = await discover(c, rfqId, []);
      expect(payload.outcome).toBe('COVERAGE_NOT_FRESH');
      expect(payload.coverage_status).toBe('REFRESH_ELIGIBLE');
      expect(payload.otp_registered_invited).toBe(0);
      expect(await invitedReasons(c, rfqId, otpId)).toBeNull();
      const google = await c.query(`SELECT id FROM suppliers WHERE external_place_id = $1`, [placeId]);
      expect(google.rowCount).toBe(0);
    });
  });

  it('falls back to OTP-registered and GST-verified suppliers when fresh coverage has no addressable candidate', async () => {
    if (!dbUp) return;
    await withRollback(async (c) => {
      const placeId = `ChIJ_nophone_${randomUUID().slice(0, 8)}`;
      const { categoryId } = await scopeFor(c, {
        placeId,
        businessName: 'No phone place',
        locations: [{ pincode: '560048', city: 'Bengaluru', state: 'Karnataka' }],
      }, 'FRESH');
      const profileId = await profileWithLogin(c);
      const exclude = await existingSupplierIds(c);
      const otpId = await insertSupplier(c, {
        name: 'OTP Bengaluru fallback',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        linkProfileId: profileId,
      });
      const gstId = await insertSupplier(c, {
        name: 'GST Bengaluru fallback',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        linkProfileId: profileId,
        gstVerified: true,
      });
      const directoryId = await insertSupplier(c, {
        name: 'Directory only Bengaluru',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
      });
      const farId = await insertSupplier(c, {
        name: 'OTP Chennai mismatch',
        city: 'Chennai',
        areaCity: 'Chennai',
        linkProfileId: profileId,
      });
      const inactiveId = await insertSupplier(c, {
        name: 'Suspended Bengaluru',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        status: 'SUSPENDED',
        linkProfileId: profileId,
      });
      const rfqId = await seedRfq(c, categoryId, 'Fresh empty fallback');
      const payload = await discover(c, rfqId, exclude);
      expect(payload.outcome).toBe('OTP_REGISTERED_FALLBACK');
      expect(payload.pin_coverage_invited).toBe(0);
      expect(payload.pin_coverage_dropped).toBeGreaterThanOrEqual(1);
      expect(Number(payload.otp_registered_invited)).toBeGreaterThanOrEqual(2);
      const otpReasons = await invitedReasons(c, rfqId, otpId);
      const gstReasons = await invitedReasons(c, rfqId, gstId);
      expect(otpReasons).toContain('otp_registered');
      expect(otpReasons).not.toContain('gst_verified');
      expect(otpReasons).not.toContain('pin_coverage');
      expect(otpReasons).not.toContain('discovered_in_area');
      expect(gstReasons).toContain('gst_verified');
      expect(gstReasons).not.toContain('otp_registered');
      expect(gstReasons).not.toContain('pin_coverage');
      expect(await invitedReasons(c, rfqId, directoryId)).toBeNull();
      expect(await invitedReasons(c, rfqId, farId)).toBeNull();
      expect(await invitedReasons(c, rfqId, inactiveId)).toBeNull();
      const tier = await c.query<{ tier: string }>(
        `SELECT private.supplier_discovery_trust_tier($1) AS tier`,
        [directoryId],
      );
      expect(tier.rows[0].tier).toBe('DISCOVERED_IN_AREA');
      const google = await c.query(`SELECT id FROM suppliers WHERE external_place_id = $1`, [placeId]);
      expect(google.rowCount).toBe(0);
    });
  });

  it('keeps external and registered invitations on distinct labels when both exist', async () => {
    if (!dbUp) return;
    await withRollback(async (c) => {
      const placeId = `ChIJ_both_${randomUUID().slice(0, 8)}`;
      const { categoryId } = await scopeFor(c, completeCoverage(placeId), 'FRESH');
      const profileId = await profileWithLogin(c);
      const exclude = await existingSupplierIds(c);
      const otpId = await insertSupplier(c, {
        name: 'OTP beside Google',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        linkProfileId: profileId,
      });
      const rfqId = await seedRfq(c, categoryId, 'Both networks');
      const first = await discover(c, rfqId, exclude);
      expect(first.outcome).toBe('GOOGLE_PLACES_DISCOVERY');
      const second = await discover(c, rfqId, exclude, 'OTP_REGISTERED');
      expect(second.outcome).toBe('OTP_REGISTERED_SUPPLIER_DISCOVERY');
      const google = await c.query<{ id: string }>(
        `SELECT id FROM suppliers WHERE external_place_id = $1`,
        [placeId],
      );
      const googleReasons = await invitedReasons(c, rfqId, google.rows[0].id);
      const otpReasons = await invitedReasons(c, rfqId, otpId);
      expect(googleReasons).toEqual(expect.arrayContaining(['pin_coverage', 'discovered_in_area']));
      expect(googleReasons).not.toContain('otp_registered');
      expect(otpReasons).toContain('otp_registered');
      expect(otpReasons).not.toContain('pin_coverage');
      expect(otpReasons).not.toContain('gst_verified');
    });
  });

  it('invites nobody when fresh coverage is empty and no registered supplier is eligible', async () => {
    if (!dbUp) return;
    await withRollback(async (c) => {
      const placeId = `ChIJ_none_${randomUUID().slice(0, 8)}`;
      const { categoryId } = await scopeFor(c, {
        placeId,
        businessName: 'Still no phone',
      }, 'FRESH');
      const profileId = await profileWithLogin(c);
      const exclude = await existingSupplierIds(c);
      const directoryId = await insertSupplier(c, {
        name: 'Directory neither',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
      });
      const inactiveId = await insertSupplier(c, {
        name: 'Inactive neither',
        city: 'Bengaluru',
        areaCity: 'Bengaluru',
        status: 'SUSPENDED',
        linkProfileId: profileId,
      });
      const rfqId = await seedRfq(c, categoryId, 'Neither');
      const payload = await discover(c, rfqId, exclude);
      expect(payload.outcome).toBe('ZERO_RESULTS');
      expect(payload.invited).toBe(0);
      expect(payload.otp_registered_invited).toBe(0);
      expect(payload.quoting_opened).toBe(false);
      expect(await invitedReasons(c, rfqId, directoryId)).toBeNull();
      expect(await invitedReasons(c, rfqId, inactiveId)).toBeNull();
    });
  });

  it('rejects discovery by a caller who cannot see the organization', async () => {
    if (!dbUp) return;
    await withRollback(async (c) => {
      const { categoryId } = await scopeFor(c, null, 'NEVER');
      const rfqId = await seedRfq(c, categoryId, 'Unauthorized');
      const outsider = await c.query<{ auth_user_id: string }>(`
        SELECT p.auth_user_id
        FROM profiles p
        WHERE p.auth_user_id IS NOT NULL
          AND COALESCE(p.is_platform_admin, false) = false
          AND lower(coalesce(p.email, '')) NOT IN (
            'admin@otp.test', 'bvnbasu@gmail.com', 'ops@otp.test', 'superadmin@otp.test',
            'admin@otp.ai', 'ops@otp.ai', 'admin@procureos.test'
          )
          AND NOT EXISTS (
            SELECT 1 FROM organization_members m
            JOIN rfqs r ON r.organization_id = m.organization_id
            WHERE m.profile_id = p.id AND r.id = $1
          )
        LIMIT 1
      `, [rfqId]);
      expect(outsider.rowCount).toBeGreaterThan(0);
      const uid = outsider.rows[0].auth_user_id;
      await c.query(`SELECT set_config('otp.demo_staging', 'off', true)`);
      await c.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [uid]);
      await c.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
      await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: uid, role: 'authenticated' }),
      ]);
      await c.query('SET LOCAL ROLE authenticated');
      await expect(
        c.query(`SELECT public.discover_and_invite_for_rfq($1::uuid)`, [rfqId]),
      ).rejects.toThrow(/Access denied/);
    });
  });
});
