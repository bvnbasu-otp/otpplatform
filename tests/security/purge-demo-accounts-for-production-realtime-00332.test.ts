import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE_00332 = '00332_purge_demo_accounts_for_production_realtime.sql';

describe('Migration 00332: Real-time Demo Account Purge & Production Dual-Founder Protection', () => {
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.+\.sql$/.test(f)).sort();
  const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE_00332), 'utf8');

  it('is the newest contiguous migration in the repository chain', () => {
    expect(migrations.at(-1)).toBe(FILE_00332);
    const index = migrations.indexOf(FILE_00332);
    expect(index).toBe(331); // 332nd file (0-indexed)
    expect(migrations[index - 1]).toBe('00331_authoritative_17_category_taxonomy.sql');
  });

  it('enforces atomic transactional wrapper', () => {
    expect(sql.trimStart().startsWith('BEGIN;') || sql.includes('\nBEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('whitelists and protects both canonical Founders & SuperAdmins', () => {
    expect(sql).toContain("'bvnbasu@gmail.com'");
    expect(sql).toContain("'bvnbasu@yahoo.com'");
    expect(sql).toContain('private_security.founder_profile_protected');
    expect(sql).toContain('private_security.admin_whitelist');
    expect(sql).toContain('Baskar Loganathan');
  });

  it('sets authoritative internal roles including AUDITOR', () => {
    expect(sql).toContain("'SUPER_ADMIN'");
    expect(sql).toContain("'GENERAL_SUPPORT'");
    expect(sql).toContain("'OPERATIONS'");
    expect(sql).toContain("'SALES_MARKETING'");
    expect(sql).toContain("'LEGAL_PRIVACY'");
    expect(sql).toContain("'AUDITOR'");
  });

  it('purges synthetic demo accounts and demo suppliers', () => {
    expect(sql).toContain('DELETE FROM public.profiles');
    expect(sql).toContain('DELETE FROM auth.users');
    expect(sql).toContain('DELETE FROM public.suppliers');
    expect(sql).toContain('DELETE FROM public.demo_accounts');
  });
});
