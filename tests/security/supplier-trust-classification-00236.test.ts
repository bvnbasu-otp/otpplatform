/**
 * Supplier discovery trust tier (00236).
 *
 * OTP_REGISTERED is a supplier_users login linked to auth.users.
 * A directory row, including ONBOARDING_REQUIRED / NOT_PROVIDED, is not.
 * GST_VERIFIED additionally requires verification_status VERIFIED,
 * lifecycle_state VERIFIED, and gst_verified.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATION_236 = resolve(ROOT, 'supabase/migrations/00236_supplier_discovery_trust_tier.sql');
const MIGRATION_235 = resolve(ROOT, 'supabase/migrations/00235_demo_staging_uses_otp_discovery.sql');
const MIGRATION_222 = resolve(ROOT, 'supabase/migrations/00222_otp_document_issuance_snapshots.sql');

const LOCAL_PG = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

let dbUp = false;

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(LOCAL_PG);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe('00236 supplier trust classification', () => {
  const sql236 = readFileSync(MIGRATION_236, 'utf8');
  const sql235 = readFileSync(MIGRATION_235, 'utf8');
  const sql222 = readFileSync(MIGRATION_222, 'utf8');

  beforeAll(async () => {
    try {
      await withPg(async (c) => {
        await c.query('SELECT 1');
      });
      dbUp = true;
    } catch {
      dbUp = false;
    }
  });

  it('keeps the Google Places default and the purchase-order verification guard', () => {
    expect(sql236).toContain("p_network text DEFAULT 'GOOGLE_PLACES'");
    expect(sql236).toContain('private.supplier_discovery_trust_tier');
    expect(sql236).not.toContain('CREATE TABLE');
    expect(sql236).not.toContain('create_po_from_award');
    expect(sql235).toContain("'OTP_REGISTERED'");
    expect(sql235).toContain('discover_and_invite_for_rfq');
    expect(sql222).toContain(
      'Cannot create Purchase Order: Supplier must complete onboarding and verification before PO creation.',
    );
    expect(sql222).toContain("v_supplier.lifecycle_state <> 'VERIFIED' OR v_supplier.verification_status <> 'VERIFIED'");
  });

  it('classifies directory, OTP login, and GST-verified suppliers from the canonical identity', async (ctx) => {
    if (!dbUp) ctx.skip();
    const rows = await withPg(async (c) => {
      const res = await c.query<{
        business_name: string;
        verification_status: string;
        lifecycle_state: string;
        gst_verified: boolean;
        logins: string;
        tier: string;
      }>(`
        SELECT s.business_name,
               s.verification_status,
               s.lifecycle_state,
               s.gst_verified,
               (
                 SELECT count(*)
                 FROM supplier_users su
                 JOIN profiles pr ON pr.id = su.profile_id
                 JOIN auth.users au ON au.id = pr.auth_user_id
                 WHERE su.supplier_id = s.id
               )::text AS logins,
               private.supplier_discovery_trust_tier(s.id) AS tier
        FROM suppliers s
        WHERE s.business_name IN (
          'Kongu Cotton Suppliers',
          'Nandi Electricals & Rewinding',
          'Royal Teak & Home Furnishing Solutions Private Limited',
          'Apex High-Rise Painters & Society Waterproofing'
        )
      `);
      return res.rows;
    });

    const byName = new Map(rows.map((row) => [row.business_name, row]));
    const kongu = byName.get('Kongu Cotton Suppliers');
    const nandi = byName.get('Nandi Electricals & Rewinding');
    const royal = byName.get('Royal Teak & Home Furnishing Solutions Private Limited');
    const apex = byName.get('Apex High-Rise Painters & Society Waterproofing');

    expect(kongu?.verification_status).toBe('NOT_PROVIDED');
    expect(kongu?.logins).toBe('0');
    expect(kongu?.tier).toBe('DISCOVERED_IN_AREA');
    expect(kongu?.tier).not.toBe('OTP_REGISTERED');

    const onboarding = await withPg(async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(`
          UPDATE suppliers
          SET lifecycle_state = 'ONBOARDING_REQUIRED',
              verification_status = 'NOT_PROVIDED'
          WHERE business_name = 'Kongu Cotton Suppliers'
        `);
        const res = await c.query<{ tier: string; lifecycle_state: string; verification_status: string }>(`
          SELECT lifecycle_state,
                 verification_status,
                 private.supplier_discovery_trust_tier(id) AS tier
          FROM suppliers
          WHERE business_name = 'Kongu Cotton Suppliers'
        `);
        return res.rows[0];
      } finally {
        await c.query('ROLLBACK');
      }
    });
    expect(onboarding?.lifecycle_state).toBe('ONBOARDING_REQUIRED');
    expect(onboarding?.verification_status).toBe('NOT_PROVIDED');
    expect(onboarding?.tier).toBe('DISCOVERED_IN_AREA');

    expect(Number(nandi?.logins)).toBeGreaterThan(0);
    expect(nandi?.gst_verified).toBe(false);
    expect(nandi?.tier).toBe('OTP_REGISTERED');

    expect(Number(royal?.logins)).toBeGreaterThan(0);
    expect(royal?.verification_status).toBe('VERIFIED');
    expect(royal?.lifecycle_state).toBe('VERIFIED');
    expect(royal?.gst_verified).toBe(true);
    expect(royal?.tier).toBe('GST_VERIFIED');

    expect(apex?.logins).toBe('0');
    expect(apex?.gst_verified).toBe(true);
    expect(apex?.tier).toBe('DISCOVERED_IN_AREA');
  });

  it('keeps Google Places as the default network and invites only registered suppliers on OTP_REGISTERED', async (ctx) => {
    if (!dbUp) ctx.skip();
    await withPg(async (c) => {
      const signature = await c.query<{ args: string; full_args: string }>(`
        SELECT pg_get_function_identity_arguments(p.oid) AS args,
               pg_get_function_arguments(p.oid) AS full_args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'discover_and_invite_for_rfq'
      `);
      expect(signature.rows).toHaveLength(1);
      expect(signature.rows[0]?.args).toBe('p_rfq_id uuid, p_limit integer, p_exclude uuid[], p_network text');
      expect(signature.rows[0]?.full_args).toContain("DEFAULT 'GOOGLE_PLACES'::text");
      expect(signature.rows[0]?.full_args).not.toMatch(/DEFAULT 'OTP_REGISTERED'/);

      const demo = await c.query<{ def: string }>(`
        SELECT pg_get_functiondef('public.demo_stage_scenario(text)'::regprocedure) AS def
      `);
      expect(demo.rows[0]?.def).toContain("'OTP_REGISTERED'");
      expect(demo.rows[0]?.def).toContain('discover_and_invite_for_rfq');

      await c.query('BEGIN');
      try {
        await c.query(`SELECT set_config('otp.demo_staging', 'on', true)`);
        const rfq = await c.query<{ id: string }>(`
          SELECT id FROM rfqs WHERE status = 'OPEN' ORDER BY id LIMIT 1
        `);
        expect(rfq.rowCount).toBeGreaterThan(0);
        const rfqId = rfq.rows[0]!.id;

        const places = await c.query<{ outcome: string }>(`
          SELECT public.discover_and_invite_for_rfq($1::uuid, 5, '{}'::uuid[], 'GOOGLE_PLACES') ->> 'outcome' AS outcome
        `, [rfqId]);
        expect(places.rows[0]?.outcome).not.toBe('OTP_REGISTERED_SUPPLIER_DISCOVERY');
        expect(['GOOGLE_PLACES_DISCOVERY', 'ZERO_RESULTS', 'COVERAGE_NOT_FRESH', 'INVALID_REQUIREMENT']).toContain(
          places.rows[0]?.outcome,
        );

        const before = await c.query<{ id: string }>(`
          SELECT id FROM rfq_invitations WHERE rfq_id = $1
        `, [rfqId]);
        const beforeIds = new Set(before.rows.map((row) => row.id));

        const otp = await c.query<{ outcome: string }>(`
          SELECT public.discover_and_invite_for_rfq($1::uuid, 25, '{}'::uuid[], 'OTP_REGISTERED') ->> 'outcome' AS outcome
        `, [rfqId]);
        expect(['OTP_REGISTERED_SUPPLIER_DISCOVERY', 'ZERO_RESULTS']).toContain(otp.rows[0]?.outcome);

        const invited = await c.query<{ id: string; business_name: string; tier: string; reasons: string[] }>(`
          SELECT i.id,
                 s.business_name,
                 private.supplier_discovery_trust_tier(s.id) AS tier,
                 i.match_reasons AS reasons
          FROM rfq_invitations i
          JOIN suppliers s ON s.id = i.supplier_id
          WHERE i.rfq_id = $1
        `, [rfqId]);

        const created = invited.rows.filter((row) => !beforeIds.has(row.id));
        expect(created.some((row) => row.business_name === 'Kongu Cotton Suppliers')).toBe(false);
        for (const row of created) {
          expect(['OTP_REGISTERED', 'GST_VERIFIED']).toContain(row.tier);
          const reasons = row.reasons ?? [];
          expect(reasons.includes('otp_registered') || reasons.includes('gst_verified')).toBe(true);
          if (row.tier === 'GST_VERIFIED') expect(reasons).toContain('gst_verified');
          if (row.tier === 'OTP_REGISTERED') {
            expect(reasons).toContain('otp_registered');
            expect(reasons).not.toContain('gst_verified');
          }
        }
      } finally {
        await c.query('ROLLBACK');
      }
    });
  });
});
