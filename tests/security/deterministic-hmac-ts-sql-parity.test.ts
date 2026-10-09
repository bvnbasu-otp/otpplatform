/**
 * Cross-platform parity: domain computeDeterministicHmac vs Postgres private.otp_deterministic_hmac.
 * Local Docker Postgres only (127.0.0.1:54322). Never hosted.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeDeterministicHmac } from '../../packages/domain/src/types/procurement-communications';
import {
  DETERMINISTIC_HMAC_PARITY_SECRET,
  DETERMINISTIC_HMAC_PARITY_VECTORS,
} from '../../packages/domain/src/types/deterministic-hmac-parity-vectors';
import {
  LOCAL_POSTGRES_CONFIG,
  assertSqlParityInfrastructure,
  skipSqlParityCaseUnlessReady,
} from '../helpers/local-postgres-sql-parity';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LOCAL_PG = LOCAL_POSTGRES_CONFIG;

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

describe('deterministic HMAC — TypeScript golden vectors', () => {
  it.each(DETERMINISTIC_HMAC_PARITY_VECTORS.map((v) => [v.label, v] as const))(
    '%s matches frozen digest',
    (_label, vector) => {
      const digest = computeDeterministicHmac(vector.message, DETERMINISTIC_HMAC_PARITY_SECRET);
      expect(digest).toBe(vector.expectedDigest);
      expect(digest).toHaveLength(64);
    },
  );

  it('documents UTF-16 length vs Unicode code-point count for supplementary-plane emoji', () => {
    const emoji = '\uD83D\uDE00';
    expect(emoji.length).toBe(2);
    expect([...emoji].length).toBe(1);
  });
});

describe('deterministic HMAC — Postgres private.otp_deterministic_hmac (local)', () => {
  beforeAll(async () => {
    try {
      migrationApplied = await withPg(async (c) => {
        const addr = await c.query(`SELECT inet_server_addr()::text AS addr`);
        const host = String(addr.rows[0]?.addr ?? '');
        if (host && !host.startsWith('127.') && host !== '::1' && !host.includes('172.') && !host.includes('192.168.')) {
          skipReason = 'refusing non-local postgres address';
          return false;
        }
        dbUp = true;
        const reg = await c.query(
          `SELECT to_regprocedure('private.js_string_utf16_length(text)') AS reg`,
        );
        return Boolean(reg.rows[0]?.reg);
      });
      if (dbUp && !migrationApplied) {
        skipReason = '00260 UTF-16 helpers are not applied on local postgres';
      }
    } catch {
      dbUp = false;
      migrationApplied = false;
    }
  });

  it('documents SQL parity infrastructure (skip locally, required in CI)', () => {
    assertSqlParityInfrastructure(dbUp, migrationApplied, skipReason);
    if (dbUp && migrationApplied) {
      expect(migrationApplied).toBe(true);
    }
  });

  it.each(DETERMINISTIC_HMAC_PARITY_VECTORS.map((v) => [v.label, v] as const))(
    'SQL parity — %s',
    async (_label, vector) => {
      if (skipSqlParityCaseUnlessReady(dbUp, migrationApplied, skipReason, `SQL parity — ${vector.label}`)) {
        return;
      }
      await withPg(async (c) => {
        const { rows } = await c.query<{ digest: string }>(
          `SELECT private.otp_deterministic_hmac($1, $2) AS digest`,
          [vector.message, DETERMINISTIC_HMAC_PARITY_SECRET],
        );
        expect(rows[0]?.digest).toBe(vector.expectedDigest);
      });
    },
  );
});

describe('00260 migration chain', () => {
  it('follows 00259 in the migration directory', async () => {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(resolve(ROOT, 'supabase/migrations'))
      .filter((f) => /^\d{5}_.*\.sql$/.test(f))
      .sort();
    const idx = files.indexOf('00259_document_reveal_integrity_digest_hmac_parity.sql');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(files[idx + 1]).toBe('00260_otp_deterministic_hmac_utf16_code_units.sql');
  });
});
