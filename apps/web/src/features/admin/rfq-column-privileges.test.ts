import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// rfqs grants SELECT column-by-column (address snapshots excluded), so any
// `select('*')` on rfqs would be rejected by Postgres for every API role.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('rfqs column privileges', () => {
  it('the admin health fallback counts rfqs by id, not *', () => {
    const src = readFileSync(resolve(__dirname, 'api/admin-ops.ts'), 'utf8');
    expect(src).toContain("supabase.from('rfqs').select('id', { count: 'exact', head: true })");
    expect(src).not.toMatch(/from\('rfqs'\)\s*\.select\('\*'/);
  });

  it('no web source selects * or the address snapshots from rfqs', () => {
    const root = resolve(__dirname, '../..');
    for (const file of sourceFiles(root)) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/from\('rfqs'\)\s*\.select\(\s*'\*'/);
      expect(src, file).not.toMatch(/from\('rfqs'\)\s*\.(insert|update|upsert)\([^;]*?\.select\(\s*\)/s);
      expect(src, file).not.toMatch(/rfqs\s*\(\s*\*\s*\)/);
      expect(src, file).not.toMatch(/(delivery|billing)_address_snapshot/);
    }
  });
});
