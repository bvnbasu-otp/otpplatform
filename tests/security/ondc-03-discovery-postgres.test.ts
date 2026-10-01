/**
 * Local Docker Postgres only (127.0.0.1:54322). Never a hosted database.
 * Skips when that database is down or migration 00230 is not applied.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client, type ClientConfig } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';

const LOCAL_PG: ClientConfig = {
  host: '127.0.0.1',
  port: 54322,
  database: 'postgres',
  user: 'postgres',
  password: 'postgres',
};

let dbUp = false;
let migrationApplied = false;
let skipReason = 'local postgres 127.0.0.1:54322 is not reachable';

async function withPg<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client(LOCAL_PG);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe('00230 ONDC discovery observations (local postgres)', () => {
  beforeAll(async () => {
    try {
      migrationApplied = await withPg(async (c) => {
        const addr = await c.query(`SELECT inet_server_addr()::text AS addr`);
        const host = String(addr.rows[0]?.addr ?? '');
        if (host && !host.startsWith('127.') && host !== '::1' && !host.includes('172.') && !host.includes('192.168.')) {
          skipReason = `refusing non-local postgres address`;
          return false;
        }
        dbUp = true;
        const reg = await c.query(`SELECT to_regprocedure('private.upsert_ondc_discovery_observation(text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean)') AS reg`);
        return Boolean(reg.rows[0]?.reg);
      });
      if (dbUp && !migrationApplied) skipReason = '00230 is not applied on local postgres';
    } catch {
      dbUp = false;
      migrationApplied = false;
    }
  });

  it('skips with a reason when local postgres or 00230 is unavailable', () => {
    if (!dbUp || !migrationApplied) {
      expect(skipReason.length).toBeGreaterThan(0);
      return;
    }
    expect(migrationApplied).toBe(true);
  });

  it('stores one discovery identity without a supplier, live success, or buyer access', async () => {
    if (!dbUp || !migrationApplied) return;
    const migration = readFileSync(
      fileURLToPath(new URL('../../supabase/migrations/00230_ondc_discovery_observations.sql', import.meta.url)),
      'utf8',
    );
    expect(migration).not.toMatch(/place_id/i);

    await withPg(async (c) => {
      const suppliersBefore = await c.query(`SELECT count(*)::int AS n FROM suppliers`);
      const invitationsBefore = await c.query(`SELECT count(*)::int AS n FROM rfq_invitations`);
      await c.query('BEGIN');
      try {
        await c.query('SET LOCAL ROLE service_role');
        const providerSupplierId = `ondc-security-${Date.now()}`;
        const args = [
          providerSupplierId,
          'participant-local',
          'tx-local-1',
          'msg-local-1',
          '560048',
          'cotton yarn',
          '2026-10-01T05:30:00.000Z',
          'https://bpp.example.test/ondc',
          'MOCK',
          'LOCAL',
          'Local Reported Seller',
          '641001',
          null,
          'Coimbatore',
          'Tamil Nadu',
          'IND',
          null,
          null,
          null,
          'location-local',
          'ONDC:RET12',
          null,
          false,
        ];
        const first = await c.query(
          `SELECT private.upsert_ondc_discovery_observation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) AS id`,
          args,
        );
        const second = await c.query(
          `SELECT private.upsert_ondc_discovery_observation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) AS id`,
          args,
        );
        expect(first.rows[0].id).toBe(second.rows[0].id);
        const counts = await c.query(
          `SELECT
             (SELECT count(*)::int FROM ondc_discovery_identities WHERE provider_supplier_id = $1) AS identities,
             (SELECT count(*)::int FROM ondc_discovery_observations o
               JOIN ondc_discovery_identities i ON i.id = o.identity_id
              WHERE i.provider_supplier_id = $1) AS observations,
             (SELECT requested_pin FROM ondc_discovery_observations o
               JOIN ondc_discovery_identities i ON i.id = o.identity_id
              WHERE i.provider_supplier_id = $1) AS requested_pin,
             (SELECT seller_pin FROM ondc_discovery_observations o
               JOIN ondc_discovery_identities i ON i.id = o.identity_id
              WHERE i.provider_supplier_id = $1) AS seller_pin`,
          [providerSupplierId],
        );
        expect(counts.rows[0].identities).toBe(1);
        expect(counts.rows[0].observations).toBe(1);
        expect(counts.rows[0].requested_pin).toBe('560048');
        expect(counts.rows[0].seller_pin).toBe('641001');

        await c.query('SAVEPOINT provider_change');
        await expect(
          c.query(`UPDATE ondc_discovery_identities SET provider = 'GOOGLE_PLACES' WHERE provider_supplier_id = $1`, [providerSupplierId]),
        ).rejects.toThrow(/provider_immutable|violates check constraint/i);
        await c.query('ROLLBACK TO SAVEPOINT provider_change');

        await c.query('RESET ROLE');
        await expect(c.query(`SET LOCAL ROLE anon`)).resolves.toBeDefined();
        await expect(c.query(`SELECT bpp_uri FROM ondc_discovery_observations`)).rejects.toThrow(/permission denied/i);
      } finally {
        await c.query('ROLLBACK');
      }
      const suppliersAfter = await c.query(`SELECT count(*)::int AS n FROM suppliers`);
      const invitationsAfter = await c.query(`SELECT count(*)::int AS n FROM rfq_invitations`);
      expect(suppliersAfter.rows[0].n).toBe(suppliersBefore.rows[0].n);
      expect(invitationsAfter.rows[0].n).toBe(invitationsBefore.rows[0].n);
    });
  });
});
