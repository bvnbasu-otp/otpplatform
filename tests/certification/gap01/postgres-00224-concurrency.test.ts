/**
 * GAP-01 migration 00224 — real PostgreSQL concurrency certification (LOCAL ONLY).
 * Uses separate pg clients (Promise.all). Zero Google HTTP.
 */
import { randomUUID } from 'node:crypto';
import { Client, type ClientConfig } from 'pg';
import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest';
import { isLocalSupabaseReachable } from '../../helpers/supabase-local';

const LOCAL_PG: ClientConfig = {
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

/** Authorized server path (matches edge SUPABASE_SERVICE_ROLE_KEY / PostgREST service_role). */
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

async function expectRoleDenied(
  role: 'anon' | 'authenticated',
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  await withPg(async (c) => {
    await c.query(`SET ROLE ${role}`);
    try {
      await expect(c.query(sql, params)).rejects.toMatchObject({ code: '42501' });
    } finally {
      await c.query('RESET ROLE');
    }
  });
}

async function rpcAcquire(scopeKey: string, token: string, staleMinutes = 15): Promise<string> {
  return withServiceRole(async (c) => {
    const r = await c.query(`SELECT public.location_pin_coverage_try_acquire_generation($1::text, $2::uuid, $3::int) AS v`, [
      scopeKey,
      token,
      staleMinutes,
    ]);
    return r.rows[0].v as string;
  });
}

async function rpcAssert(scopeKey: string, token: string): Promise<boolean> {
  return withServiceRole(async (c) => {
    const r = await c.query(`SELECT public.location_pin_coverage_assert_generation_lock($1::text, $2::uuid) AS v`, [
      scopeKey,
      token,
    ]);
    return Boolean(r.rows[0].v);
  });
}

async function rpcReserve(calls: number, limit = 1500): Promise<{ allowed: boolean; requestCount: number }> {
  return withServiceRole(async (c) => {
    const r = await c.query(`SELECT public.location_pin_coverage_reserve_google_calls($1::int, $2::int) AS j`, [
      calls,
      limit,
    ]);
    const j = r.rows[0].j as { allowed: boolean; requestCount: number };
    return { allowed: j.allowed, requestCount: j.requestCount };
  });
}

async function cleanupScope(scopeKey: string): Promise<void> {
  await withPg(async (c) => {
    await c.query('DELETE FROM public.location_pin_coverage_generation WHERE scope_key = $1', [scopeKey]);
    await c.query('DELETE FROM public.location_pin_coverage_supplier WHERE scope_key = $1', [scopeKey]);
    await c.query('DELETE FROM public.location_pin_coverage_scope WHERE scope_key = $1', [scopeKey]);
  });
}

async function seedScopeFresh(scopeKey: string, ageDays: number): Promise<void> {
  await withPg(async (c) => {
    await c.query(
      `INSERT INTO public.location_pin_coverage_scope
        (scope_key, state, city, pincode, category, supplier_count, last_successful_discovery_at, updated_at)
       VALUES ($1, 'Karnataka', 'Bengaluru', '560001', 'general', 1,
         now() - ($2::int || ' days')::interval, now())
       ON CONFLICT (scope_key) DO UPDATE SET
         supplier_count = 1,
         last_successful_discovery_at = now() - ($2::int || ' days')::interval`,
      [scopeKey, ageDays],
    );
    await c.query(
      `INSERT INTO public.location_pin_coverage_supplier (scope_key, place_id, supplier_json)
       VALUES ($1, 'place-test-1', '{"placeId":"place-test-1"}'::jsonb)
       ON CONFLICT DO NOTHING`,
      [scopeKey],
    );
  });
}

function scopeKeyFor(suffix: string, pin = '560099', category = 'widgets'): string {
  return `karnataka:bengaluru:${pin}:${category}-gap01-${suffix}-${Date.now()}`;
}

describe('GAP-01 — 00224 postgres concurrency (LOCAL 127.0.0.1:54322)', () => {
  const scopesToClean: string[] = [];

  beforeAll(async () => {
    dbUp = await isLocalSupabaseReachable();
    if (!dbUp) return;
    const probe = await withPg(async (c) => {
      const r = await c.query(
        `SELECT 1 FROM pg_proc WHERE proname = 'location_pin_coverage_try_acquire_generation'`,
      );
      return r.rowCount === 1;
    });
    dbUp = probe;
  });

  beforeEach((ctx) => {
    if (!dbUp) ctx.skip();
  });

  afterEach(async () => {
    for (const sk of scopesToClean.splice(0)) {
      await cleanupScope(sk);
    }
  });

  it('GL-01: two workers same scope → one acquired, one wait', async () => {
    const sk = scopeKeyFor('gl01');
    scopesToClean.push(sk);
    const t1 = randomUUID();
    const t2 = randomUUID();
    const [a, b] = await Promise.all([rpcAcquire(sk, t1), rpcAcquire(sk, t2)]);
    const acquired = [a, b].filter((x) => x === 'acquired');
    const waits = [a, b].filter((x) => x === 'wait');
    expect(acquired).toHaveLength(1);
    expect(waits).toHaveLength(1);
    const rows = await withPg(async (c) => {
      const r = await c.query(
        `SELECT scope_key, lock_token::text, status FROM public.location_pin_coverage_generation WHERE scope_key = $1`,
        [sk],
      );
      return r.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('in_progress');
    expect([t1, t2]).toContain(rows[0].lock_token);
  });

  it('GL-02: five workers same scope → one acquired', async () => {
    const sk = scopeKeyFor('gl02');
    scopesToClean.push(sk);
    const tokens = Array.from({ length: 5 }, () => randomUUID());
    const results = await Promise.all(tokens.map((t) => rpcAcquire(sk, t)));
    expect(results.filter((x) => x === 'acquired')).toHaveLength(1);
    expect(results.filter((x) => x === 'wait')).toHaveLength(4);
  });

  it('GL-03: different PIN scopes do not block each other', async () => {
    const skA = scopeKeyFor('gl03a', '560101');
    const skB = scopeKeyFor('gl03b', '560102');
    scopesToClean.push(skA, skB);
    const [a, b] = await Promise.all([rpcAcquire(skA, randomUUID()), rpcAcquire(skB, randomUUID())]);
    expect(a).toBe('acquired');
    expect(b).toBe('acquired');
  });

  it('GL-04: same PIN different category → independent scopes', async () => {
    const pin = '560103';
    const skA = `karnataka:bengaluru:${pin}:category-a-gap01-${Date.now()}`;
    const skB = `karnataka:bengaluru:${pin}:category-b-gap01-${Date.now()}`;
    scopesToClean.push(skA, skB);
    const [a, b] = await Promise.all([rpcAcquire(skA, randomUUID()), rpcAcquire(skB, randomUUID())]);
    expect(a).toBe('acquired');
    expect(b).toBe('acquired');
  });

  it('BUD-01..03: sequential reserves to 1500 boundary', async () => {
    const limit = 1500;
    await withPg(async (c) => {
      await c.query('DELETE FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
      await c.query('INSERT INTO public.google_places_daily_budget (usage_date, request_count) VALUES (CURRENT_DATE, 0)');
    });
    const first = await rpcReserve(1499, limit);
    expect(first.allowed).toBe(true);
    expect(first.requestCount).toBe(1499);
    const second = await rpcReserve(1, limit);
    expect(second.allowed).toBe(true);
    expect(second.requestCount).toBe(1500);
    const third = await rpcReserve(1, limit);
    expect(third.allowed).toBe(false);
    await withPg(async (c) => {
      await c.query('DELETE FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
    });
  });

  it('BUD-04: concurrent reserves at boundary never exceed 1500', async () => {
    const limit = 1500;
    await withPg(async (c) => {
      await c.query('DELETE FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
      await c.query(
        'INSERT INTO public.google_places_daily_budget (usage_date, request_count) VALUES (CURRENT_DATE, 1495)',
      );
    });
    const racers = 20;
    const results = await Promise.all(Array.from({ length: racers }, () => rpcReserve(1, limit)));
    const allowed = results.filter((r) => r.allowed);
    expect(allowed.length).toBeLessThanOrEqual(5);
    const final = await withPg(async (c) => {
      const r = await c.query(
        'SELECT request_count FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE',
      );
      return r.rows[0]?.request_count as number;
    });
    expect(final).toBeLessThanOrEqual(1500);
    expect(final).toBe(1500);
    await withPg(async (c) => {
      await c.query('DELETE FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
    });
  });

  it('BUD-05: reserved budget is not released on failure path (no release RPC)', async () => {
    await withPg(async (c) => {
      await c.query('DELETE FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
      await c.query('INSERT INTO public.google_places_daily_budget (usage_date, request_count) VALUES (CURRENT_DATE, 0)');
    });
    const r = await rpcReserve(3, 1500);
    expect(r.allowed).toBe(true);
    const mid = await withPg(async (c) => {
      const q = await c.query('SELECT request_count FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
      return q.rows[0].request_count as number;
    });
    expect(mid).toBe(3);
    // Simulate failed generation after reserve — SQL has no decrement/release function
    const after = await withPg(async (c) => {
      const q = await c.query('SELECT request_count FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
      return q.rows[0].request_count as number;
    });
    expect(after).toBe(3);
    await withPg(async (c) => {
      await c.query('DELETE FROM public.google_places_daily_budget WHERE usage_date = CURRENT_DATE');
    });
  });

  it('STALE-01: fresh in_progress blocks immediate takeover', async () => {
    const sk = scopeKeyFor('stale01');
    scopesToClean.push(sk);
    const owner = randomUUID();
    expect(await rpcAcquire(sk, owner)).toBe('acquired');
    expect(await rpcAcquire(sk, randomUUID())).toBe('wait');
  });

  it('STALE-02/03: stale owner loses lock; assert denies old token', async () => {
    const sk = scopeKeyFor('stale02');
    scopesToClean.push(sk);
    const tokenA = randomUUID();
    expect(await rpcAcquire(sk, tokenA)).toBe('acquired');
    await withPg(async (c) => {
      await c.query(
        `UPDATE public.location_pin_coverage_generation
         SET started_at = now() - interval '20 minutes' WHERE scope_key = $1`,
        [sk],
      );
    });
    const tokenB = randomUUID();
    expect(await rpcAcquire(sk, tokenB)).toBe('acquired');
    expect(await rpcAssert(sk, tokenA)).toBe(false);
    expect(await rpcAssert(sk, tokenB)).toBe(true);
  });

  it('STALE-04: repeated stale takeover cycles (20)', async () => {
    const sk = scopeKeyFor('stale04');
    scopesToClean.push(sk);
    let current = randomUUID();
    expect(await rpcAcquire(sk, current)).toBe('acquired');
    for (let i = 0; i < 20; i++) {
      await withPg(async (c) => {
        await c.query(
          `UPDATE public.location_pin_coverage_generation SET started_at = now() - interval '20 minutes' WHERE scope_key = $1`,
          [sk],
        );
      });
      const next = randomUUID();
      expect(await rpcAcquire(sk, next)).toBe('acquired');
      expect(await rpcAssert(sk, current)).toBe(false);
      expect(await rpcAssert(sk, next)).toBe(true);
      current = next;
    }
  });

  it('REF-01..03: failed generation preserves prior coverage and freshness', async () => {
    const sk = scopeKeyFor('ref');
    scopesToClean.push(sk);
    await seedScopeFresh(sk, 5);
    const before = await withPg(async (c) => {
      const r = await c.query(
        `SELECT supplier_count, last_successful_discovery_at FROM public.location_pin_coverage_scope WHERE scope_key = $1`,
        [sk],
      );
      return r.rows[0];
    });
    const assessBefore = await withServiceRole(async (c) => {
      const r = await c.query(`SELECT public.location_pin_coverage_assess($1, 30) AS j`, [sk]);
      return r.rows[0].j as { status: string };
    });
    expect(assessBefore.status).toBe('FRESH');
    const tok = randomUUID();
    await rpcAcquire(sk, tok);
    await withServiceRole(async (c) => {
      await c.query(
        `SELECT public.location_pin_coverage_complete_generation($1, $2, 'failed', 'GEOCODE_FAILED')`,
        [sk, tok],
      );
    });
    const after = await withPg(async (c) => {
      const r = await c.query(
        `SELECT supplier_count, last_successful_discovery_at FROM public.location_pin_coverage_scope WHERE scope_key = $1`,
        [sk],
      );
      return r.rows[0];
    });
    expect(after.supplier_count).toBe(before.supplier_count);
    expect(new Date(after.last_successful_discovery_at).getTime()).toBe(
      new Date(before.last_successful_discovery_at).getTime(),
    );
    const assessAfter = await withServiceRole(async (c) => {
      const r = await c.query(`SELECT public.location_pin_coverage_assess($1, 30) AS j`, [sk]);
      return r.rows[0].j as { status: string };
    });
    expect(assessAfter.status).toBe('FRESH');
  });

  it('FRESH-1 / FRESH-2: assess boundary at 30 days', async () => {
    const skFresh = scopeKeyFor('fresh1', '560201');
    const skStale = scopeKeyFor('fresh2', '560202');
    scopesToClean.push(skFresh, skStale);
    await seedScopeFresh(skFresh, 29);
    await seedScopeFresh(skStale, 30);
    const a = await withServiceRole(async (c) => {
      const r = await c.query(`SELECT public.location_pin_coverage_assess($1, 30) AS j`, [skFresh]);
      return r.rows[0].j as { status: string };
    });
    const b = await withServiceRole(async (c) => {
      const r = await c.query(`SELECT public.location_pin_coverage_assess($1, 30) AS j`, [skStale]);
      return r.rows[0].j as { status: string };
    });
    expect(a.status).toBe('FRESH');
    expect(b.status).toBe('REFRESH_ELIGIBLE');
  });

  it('SECURITY SEC-01..04: anon/authenticated/PUBLIC denied; service_role allowed', async () => {
    const oids = await withPg(async (c) => {
      const r = await c.query(`
        SELECT p.oid,
          p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS label
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'location_pin_coverage%'
        ORDER BY p.proname
      `);
      return r.rows as { oid: number; label: string }[];
    });
    expect(oids.length).toBeGreaterThanOrEqual(9);
    for (const { oid, label } of oids) {
      const priv = await withPg(async (c) => {
        const r = await c.query(
          `SELECT has_function_privilege('anon', $1::oid, 'EXECUTE') AS anon_exec,
                  has_function_privilege('authenticated', $1::oid, 'EXECUTE') AS auth_exec,
                  has_function_privilege('service_role', $1::oid, 'EXECUTE') AS service_exec,
                  proacl::text AS proacl
           FROM pg_proc WHERE oid = $1`,
          [oid],
        );
        return r.rows[0] as { anon_exec: boolean; auth_exec: boolean; service_exec: boolean; proacl: string };
      });
      expect(priv.service_exec, label).toBe(true);
      expect(priv.anon_exec, label).toBe(false);
      expect(priv.auth_exec, label).toBe(false);
      expect(priv.proacl, label).not.toContain('anon=');
      expect(priv.proacl, label).not.toContain('authenticated=');
      expect(priv.proacl, label).not.toMatch(/^\{=|,\=/);
    }

    await expectRoleDenied(
      'anon',
      `SELECT public.location_pin_coverage_reserve_google_calls($1::int, $2::int)`,
      [1, 1500],
    );
    await expectRoleDenied(
      'authenticated',
      `SELECT public.location_pin_coverage_try_acquire_generation($1::text, $2::uuid, $3::int)`,
      ['karnataka:bengaluru:560099:test', randomUUID(), 15],
    );

    await withServiceRole(async (c) => {
      const sk = scopeKeyFor('sec-svc');
      scopesToClean.push(sk);
      const tok = randomUUID();
      const acquire = await c.query(
        `SELECT public.location_pin_coverage_try_acquire_generation($1::text, $2::uuid, 15) AS v`,
        [sk, tok],
      );
      expect(acquire.rows[0].v).toBe('acquired');
      const assert = await c.query(
        `SELECT public.location_pin_coverage_assert_generation_lock($1::text, $2::uuid) AS v`,
        [sk, tok],
      );
      expect(assert.rows[0].v).toBe(true);
      const budget = await c.query(`SELECT public.location_pin_coverage_reserve_google_calls(0, 1500) AS j`);
      expect((budget.rows[0].j as { allowed: boolean }).allowed).toBe(true);
    });
  });
});
