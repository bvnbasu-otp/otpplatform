import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00265_remediate_buyer_taxonomy_and_rls_integrity.sql';
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

describe('00265 buyer taxonomy and RLS integrity (static security & schema contract)', () => {
  it('exists as the contiguous migration after 00264 followed by 00266', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const idx = files.indexOf(FILE);
    expect(files.slice(idx, idx + 10)).toEqual([
      FILE,
      '00266_remediate_supplier_coverage_and_dispatch.sql',
      '00267_authoritative_founder_and_admin_claims.sql',
      '00268_complete_nationwide_pincode_resolution.sql',
      '00269_harden_sourcing_mode_identity_reveal.sql',
      '00270_unsuccessful_rfq_retention_purge.sql',
      '00271_fix_supplier_messaging_channels_unique_constraint.sql',
      '00272_add_waha_to_messaging_provider_and_isolate_operator_phone.sql',
      '00273_persist_pin_coverage_in_canonical_suppliers.sql',
      '00274_location_pin_coverage_durable_recovery.sql',
    ]);
    expect(files.at(-1)).toBe('00330_authoritative_pricing_and_supplier_fee_gate.sql');
    const idx264 = files.indexOf('00264_remediate_privileged_lifecycle_and_audit_contracts.sql');
    expect(idx264).toBeGreaterThan(0);
    expect(files[idx264 + 1]).toBe(FILE);
  });

  it('ensures all taxonomy inserts are idempotent with ON CONFLICT', () => {
    expect(SQL).toContain('INSERT INTO requirement_categories');
    expect(SQL).toContain('ON CONFLICT (code) DO NOTHING');
    expect(SQL).toContain('INSERT INTO capabilities');
    expect(SQL).toContain('INSERT INTO requirement_subcategories');
    expect(SQL).toContain('INSERT INTO subcategory_capabilities');
    expect(SQL).toContain('ON CONFLICT (subcategory_id, capability_id) DO NOTHING');
    expect(SQL).toContain('INSERT INTO category_attribute_definitions');
    expect(SQL).toContain('INSERT INTO evaluation_criteria');
    expect(SQL).toContain('INSERT INTO subcategory_evaluation_suggestions');
  });

  it('restores public and anonymous RLS access for all taxonomy tables', () => {
    expect(SQL).toContain('GRANT SELECT ON requirement_categories, requirement_subcategories, capabilities');
    expect(SQL).toContain('TO anon, authenticated');
    expect(SQL).toContain('CREATE POLICY requirement_categories_select ON public.requirement_categories');
    expect(SQL).toContain('FOR SELECT TO authenticated, anon');
    expect(SQL).toContain('CREATE POLICY requirement_subcategories_select ON public.requirement_subcategories');
    expect(SQL).toContain('FOR SELECT TO authenticated, anon');
    expect(SQL).toContain('CREATE POLICY capabilities_select ON public.capabilities');
    expect(SQL).toContain('FOR SELECT TO authenticated, anon');
    expect(SQL).toContain('CREATE POLICY category_attribute_definitions_select ON public.category_attribute_definitions');
    expect(SQL).toContain('FOR SELECT TO authenticated, anon');
    expect(SQL).toContain('CREATE POLICY evaluation_criteria_select ON public.evaluation_criteria');
    expect(SQL).toContain('FOR SELECT TO authenticated, anon');
    expect(SQL).toContain('CREATE POLICY subcategory_evaluation_suggestions_select ON public.subcategory_evaluation_suggestions');
    expect(SQL).toContain('FOR SELECT TO authenticated, anon');
  });

  it('authorizes anon and authenticated users to call classify_requirement_text RPC', () => {
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.classify_requirement_text(text) TO anon, authenticated, service_role;');
  });

  it('augments HVAC and chiller maintenance keywords on amc_facility', () => {
    expect(SQL).toContain("UPDATE requirement_subcategories");
    expect(SQL).toContain("WHERE code = 'amc_facility'");
    expect(SQL).toContain("'hvac'");
    expect(SQL).toContain("'air conditioning'");
    expect(SQL).toContain("'ac maintenance'");
    expect(SQL).toContain("'chiller'");
    expect(SQL).toContain("'ahu'");
  });

  it('includes custom_requirement and unlisted intake subcategories', () => {
    expect(SQL).toContain("'custom_requirement'");
    expect(SQL).toContain("'general_other'");
  });
});
