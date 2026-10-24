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
const isDefined = (name: string) => new RegExp(`FUNCTION\\s+(?:public\\.)?"?${name}"?\\s*\\(`, 'i').test(migrationSql);

describe('notifications RPC contract', () => {
  it('calls only RPCs that a migration defines', () => {
    expect(calledRpcs.filter((name) => !isDefined(name))).toEqual([]);
  });

  it('does not call the undefined process_notification_dispatch_queue_batch RPC', () => {
    expect(featureSource).not.toContain('process_notification_dispatch_queue_batch');
    expect(featureSource).not.toContain('processDispatchQueue');
    expect(isDefined('process_notification_dispatch_queue_batch')).toBe(false);
  });
});
