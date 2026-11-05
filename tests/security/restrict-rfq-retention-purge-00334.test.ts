import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00334_restrict_rfq_retention_purge_to_service_role.sql';
const FN = 'public.purge_expired_unsuccessful_rfqs(integer)';

const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.+\.sql$/.test(f)).sort();
const code = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8').replace(/--.*$/gm, '');

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('00334 RFQ retention purge is service-role only (static review, no database)', () => {
  it('directly follows 00333 in the contiguous chain', () => {
    const index = migrations.indexOf(FILE);
    expect(index).toBe(333);
    expect(migrations[index - 1]).toBe('00333_greenfield_purge_all_demo_and_supplier_accounts.sql');
  });

  it('revokes execute from PUBLIC, anon and authenticated, and grants only service_role', () => {
    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(code).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${escape(FN)} FROM ${role};`));
    }
    expect(code).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${escape(FN)} TO service_role;`));
    expect(code).not.toMatch(/GRANT[^;]*TO[^;]*\b(anon|authenticated)\b/);
  });

  it('does not change data or the function body', () => {
    expect(code).not.toMatch(/\b(CREATE OR REPLACE FUNCTION|DELETE|TRUNCATE|UPDATE|INSERT|DROP)\b/i);
  });

  it('no later migration grants the purge back to client roles', () => {
    for (const later of migrations.slice(migrations.indexOf(FILE) + 1)) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, later), 'utf8').replace(/--.*$/gm, '');
      expect(sql).not.toMatch(/GRANT[^;]*purge_expired_unsuccessful_rfqs[^;]*\b(anon|authenticated|PUBLIC)\b/i);
    }
  });
});
