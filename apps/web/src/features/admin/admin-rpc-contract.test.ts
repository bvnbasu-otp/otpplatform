import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../../../../supabase/migrations');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

const featureSource = sourceFiles(__dirname).map((file) => readFileSync(file, 'utf8')).join('\n');
const migrationSql = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith('.sql'))
  .map((file) => readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
  .join('\n');

const calledRpcs = [...new Set([...featureSource.matchAll(/\.rpc\(\s*['"`]([a-z0-9_]+)['"`]/g)].flatMap((m) => (m[1] ? [m[1]] : [])))];
const definitionPattern = (name: string) => new RegExp(`FUNCTION\\s+(?:public\\.)?"?${name}"?\\s*\\(`, 'i');
const isDefined = (name: string) => definitionPattern(name).test(migrationSql);

describe('admin RPC contract', () => {
  it('calls only RPCs that a migration defines', () => {
    expect(calledRpcs.length).toBeGreaterThan(0);
    const undefinedRpcs = calledRpcs.filter((name) => !isDefined(name));
    expect(undefinedRpcs).toEqual([]);
  });

  it('defines both server-authorized demo-deletion RPCs in the chain', () => {
    expect(isDefined('preview_demo_user_deletion')).toBe(true);
    expect(isDefined('execute_demo_user_deletion')).toBe(true);
  });

  it('does not call an arbitrary-SQL admin_run_sql RPC', () => {
    expect(featureSource).not.toContain('admin_run_sql');
    expect(featureSource).not.toContain('fetchStalledOrderAlerts');
    expect(isDefined('admin_run_sql')).toBe(false);
  });
});
