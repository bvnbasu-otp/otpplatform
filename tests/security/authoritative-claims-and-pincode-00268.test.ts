import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE_267 = '00267_authoritative_founder_and_admin_claims.sql';
const FILE_268 = '00268_complete_nationwide_pincode_resolution.sql';
const SQL_267 = readFileSync(resolve(MIGRATIONS_DIR, FILE_267), 'utf8');
const SQL_268 = readFileSync(resolve(MIGRATIONS_DIR, FILE_268), 'utf8');

describe('00267 & 00268 authoritative claims and nationwide pincode resolution (static contract)', () => {
  it('exists as contiguous migrations immediately following 00266 and followed by 00269 and 00270', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const idx = files.indexOf(FILE_267);
    expect(files.slice(idx, idx + 8)).toEqual([
      FILE_267,
      FILE_268,
      '00269_harden_sourcing_mode_identity_reveal.sql',
      '00270_unsuccessful_rfq_retention_purge.sql',
      '00271_fix_supplier_messaging_channels_unique_constraint.sql',
      '00272_add_waha_to_messaging_provider_and_isolate_operator_phone.sql',
      '00273_persist_pin_coverage_in_canonical_suppliers.sql',
      '00274_location_pin_coverage_durable_recovery.sql',
    ]);
    expect(files.at(-1)).toBe('00313_quote_invitation_state_boundary.sql');
    const idx266 = files.indexOf('00266_remediate_supplier_coverage_and_dispatch.sql');
    expect(idx266).toBeGreaterThan(0);
    expect(files[idx266 + 1]).toBe(FILE_267);
    expect(files[idx266 + 2]).toBe(FILE_268);
    expect(files[idx266 + 3]).toBe('00269_harden_sourcing_mode_identity_reveal.sql');
    expect(files[idx266 + 4]).toBe('00270_unsuccessful_rfq_retention_purge.sql');
    expect(files[idx266 + 5]).toBe('00271_fix_supplier_messaging_channels_unique_constraint.sql');
    expect(files[idx266 + 6]).toBe('00272_add_waha_to_messaging_provider_and_isolate_operator_phone.sql');
    expect(files[idx266 + 7]).toBe('00273_persist_pin_coverage_in_canonical_suppliers.sql');
    expect(files[idx266 + 8]).toBe('00274_location_pin_coverage_durable_recovery.sql');
    expect(files[idx266 + 9]).toBe('00275_isolate_rfq_subcategory_recipients.sql');
  });

  it('proves 00267 adds authoritative claims to profiles and functions', () => {
    expect(SQL_267).toContain('ADD COLUMN IF NOT EXISTS is_founder boolean');
    expect(SQL_267).toContain('ADD COLUMN IF NOT EXISTS is_platform_admin boolean');
    expect(SQL_267).toContain('CREATE OR REPLACE FUNCTION private.is_founder()');
    expect(SQL_267).toContain('CREATE OR REPLACE FUNCTION private.is_platform_admin()');
    expect(SQL_267).toContain('is_founder = true');
    expect(SQL_267).toContain('is_platform_admin = true');
  });

  it('proves 00268 provides full nationwide state and union territory coverage', () => {
    expect(SQL_268).toContain('CREATE OR REPLACE FUNCTION public.infer_indian_state_from_pincode(p_pincode text)');
    expect(SQL_268).toContain('IMMUTABLE');
    expect(SQL_268).toContain("'Arunachal Pradesh'");
    expect(SQL_268).toContain("'Meghalaya'");
    expect(SQL_268).toContain("'Manipur'");
    expect(SQL_268).toContain("'Mizoram'");
    expect(SQL_268).toContain("'Nagaland'");
    expect(SQL_268).toContain("'Tripura'");
    expect(SQL_268).toContain("'Ladakh'");
    expect(SQL_268).toContain("'Sikkim'");
    expect(SQL_268).toContain("'Andaman and Nicobar Islands'");
    expect(SQL_268).toContain("'Lakshadweep'");
    expect(SQL_268).toContain("'Puducherry'");
    expect(SQL_268).toContain("'Dadra and Nagar Haveli and Daman and Diu'");
  });
});
