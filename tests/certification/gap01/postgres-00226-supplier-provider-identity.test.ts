/**
 * Migration 00226 — supplier_provider_identities + ONDC insert guard (LOCAL ONLY).
 */
import { randomUUID } from 'node:crypto';
import { Client, type ClientConfig } from 'pg';
import { describe, expect, it, beforeAll } from 'vitest';
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

describe('00226 supplier provider identities (local postgres)', () => {
  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
    if (!dbUp) return;
    migrationApplied = await withPg(async (c) => {
      const r = await c.query(`SELECT to_regclass('public.supplier_provider_identities') AS reg`);
      return r.rows[0]?.reg === 'supplier_provider_identities';
    });
  });

  it('skips when migration is not applied locally', () => {
    if (!dbUp) {
      expect(true).toBe(true);
      return;
    }
    expect(typeof migrationApplied).toBe('boolean');
  });

  it('refresh upsert does not duplicate GOOGLE_PLACES provider identity', async () => {
    if (!dbUp || !migrationApplied) return;

    const placeId = `ChIJ_refresh_${randomUUID().slice(0, 8)}`;
    await withServiceRole(async (c) => {
      const supId = randomUUID();
      await c.query(
        `INSERT INTO suppliers (id, business_name, source, status, lifecycle_state, verification_status, external_place_id, source_ref)
         VALUES ($1, 'Refresh Co', 'OTHER', 'PENDING', 'QUOTE_PARTICIPANT', 'NOT_PROVIDED', $2, $3)`,
        [supId, placeId, `google_place:${placeId}`],
      );
      try {
        await c.query(
          `SELECT private.upsert_supplier_provider_identity($1::uuid, 'GOOGLE_PLACES', $2, NULL, NULL, NULL)`,
          [supId, placeId],
        );
        await c.query(
          `SELECT private.upsert_supplier_provider_identity($1::uuid, 'GOOGLE_PLACES', $2, NULL, NULL, NULL)`,
          [supId, placeId],
        );
        const cnt = await c.query(
          `SELECT count(*)::int AS n FROM supplier_provider_identities WHERE provider = 'GOOGLE_PLACES' AND provider_supplier_id = $1`,
          [placeId],
        );
        expect(cnt.rows[0].n).toBe(1);
      } finally {
        await c.query(`DELETE FROM supplier_provider_identities WHERE supplier_id = $1`, [supId]);
        await c.query(`DELETE FROM suppliers WHERE id = $1`, [supId]);
      }
    });
  });

  it('ONDC guarded insert returns null unless live success with seller + participant ids', async () => {
    if (!dbUp || !migrationApplied) return;

    await withServiceRole(async (c) => {
      const supId = randomUUID();
      await c.query(
        `INSERT INTO suppliers (id, business_name, source, status, lifecycle_state, verification_status)
         VALUES ($1, 'ONDC Guard Co', 'ONDC', 'PENDING', 'QUOTE_PARTICIPANT', 'NOT_PROVIDED')`,
        [supId],
      );
      try {
        const blocked = await c.query(
          `SELECT private.insert_ondc_provider_identity_guarded($1::uuid, 'seller-1', 'bpp-1', NULL, NULL, false) AS id`,
          [supId],
        );
        expect(blocked.rows[0].id).toBeNull();

        const missingSeller = await c.query(
          `SELECT private.insert_ondc_provider_identity_guarded($1::uuid, '', 'bpp-1', NULL, NULL, true) AS id`,
          [supId],
        );
        expect(missingSeller.rows[0].id).toBeNull();

        const ok = await c.query(
          `SELECT private.insert_ondc_provider_identity_guarded($1::uuid, 'seller-live', 'bpp.live', NULL, 'corr-1', true) AS id`,
          [supId],
        );
        expect(ok.rows[0].id).not.toBeNull();

        const cnt = await c.query(
          `SELECT count(*)::int AS n FROM supplier_provider_identities WHERE supplier_id = $1 AND provider = 'ONDC'`,
          [supId],
        );
        expect(cnt.rows[0].n).toBe(1);
      } finally {
        await c.query(`DELETE FROM supplier_provider_identities WHERE supplier_id = $1`, [supId]);
        await c.query(`DELETE FROM suppliers WHERE id = $1`, [supId]);
      }
    });
  });
});
