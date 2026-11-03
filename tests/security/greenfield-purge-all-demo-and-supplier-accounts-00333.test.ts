import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE_00333 = '00333_greenfield_purge_all_demo_and_supplier_accounts.sql';

describe('Migration 00333: Greenfield Purge of All Demo, Supplier Accounts & SNE Discovery', () => {
  const migrations = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.+\.sql$/.test(f)).sort();
  const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE_00333), 'utf8');

  it('is the newest contiguous migration in the repository chain', () => {
    expect(migrations.at(-1)).toBe(FILE_00333);
    const index = migrations.indexOf(FILE_00333);
    expect(index).toBe(332); // 333rd file (0-indexed)
    expect(migrations[index - 1]).toBe('00332_purge_demo_accounts_for_production_realtime.sql');
  });

  it('enforces atomic transactional wrapper', () => {
    expect(sql.trimStart().startsWith('BEGIN;') || sql.includes('\nBEGIN;')).toBe(true);
    expect(sql.trimEnd().endsWith('COMMIT;')).toBe(true);
  });

  it('whitelists and protects exclusively canonical Founders & SuperAdmins', () => {
    expect(sql).toContain("'bvnbasu@gmail.com'");
    expect(sql).toContain("'bvnbasu@yahoo.com'");
    expect(sql).toContain('Baskar Loganathan');
    expect(sql).toContain("'SUPER_ADMIN'");
  });

  it('cleans SNE & Google Places discovery authority tables', () => {
    expect(sql).toContain('location_pin_coverage_supplier');
    expect(sql).toContain('location_pin_coverage_scope');
    expect(sql).toContain('location_pin_coverage_generation');
    expect(sql).toContain('google_places_daily_budget');
    expect(sql).toContain('ondc_discovery_observations');
  });

  it('purges all RFQs, quotes, requirements, and transactional contracts', () => {
    expect(sql).toContain('quotes');
    expect(sql).toContain('rfqs');
    expect(sql).toContain('requirements');
    expect(sql).toContain('purchase_orders');
    expect(sql).toContain('work_orders');
    expect(sql).toContain('invoices');
    expect(sql).toContain('payments');
  });

  it('purges all suppliers, supplier users, capabilities, and organizations', () => {
    expect(sql).toContain('suppliers');
    expect(sql).toContain('supplier_users');
    expect(sql).toContain('organizations');
    expect(sql).toContain('organization_members');
  });

  it('resets demo mode to false in demo_settings', () => {
    expect(sql).toContain('demo_mode_enabled = false');
    expect(sql).toContain('supplier_network_stub_enabled = false');
  });
});
