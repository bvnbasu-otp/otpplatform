import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../..');
const scope = readFileSync(
  resolve(root, 'supabase/migrations/00273_persist_pin_coverage_in_canonical_suppliers.sql'),
  'utf8',
);
const subcategory = readFileSync(
  resolve(root, 'supabase/migrations/00275_isolate_rfq_subcategory_recipients.sql'),
  'utf8',
);
const invite = readFileSync(
  resolve(root, 'supabase/migrations/00251_fresh_pin_coverage_otp_registered_fallback.sql'),
  'utf8',
);
const categoryCoverageGuard = readFileSync(
  resolve(root, 'supabase/migrations/00317_rfq_category_service_coverage_guard.sql'),
  'utf8',
);

describe('current RFQ invitation SQL contract', () => {
  it('builds coverage scope from PIN plus category and does not assign a category to PIN-only warming', () => {
    expect(scope).toContain('location_pin_coverage_build_scope_key(v_state, v_city, v_pincode, v_category)');
    expect(scope).toContain("v_category || ' > ' || v_subcategory");
    expect(scope).toContain("upper(btrim(p_category)) <> '__PIN_ONLY_WARMING__'");
  });

  it('does not let a registered supplier through on subcategory-null PIN matching alone when a subcategory is set', () => {
    expect(subcategory).toContain('req.subcategory_id IS NULL');
    expect(subcategory).toContain('lower(sub.name), lower(sub.code)');
    expect(subcategory).toContain('required_capability.is_primary');
  });

  it('applies a fail-closed category and declared-service-coverage gate for the subcategory-null fallback', () => {
    expect(categoryCoverageGuard.startsWith('-- 00317: ')).toBe(true);
    expect(categoryCoverageGuard).not.toContain('UNAPPLIED');
    expect(categoryCoverageGuard).toContain('rank_discovery_candidates_pre_category_coverage_guard');
    expect(categoryCoverageGuard).toContain('req.subcategory_id IS NULL');
    expect(categoryCoverageGuard).toContain('required_capability.is_primary');
    expect(categoryCoverageGuard).toContain('public.supplier_service_areas');
    expect(categoryCoverageGuard).toContain('service_area.pincode');
    expect(categoryCoverageGuard).toContain('lower(btrim(service_area.city))');
    expect(categoryCoverageGuard).not.toContain('supplier.pincode');
    expect(categoryCoverageGuard).not.toContain('supplier.city');
    const executable = categoryCoverageGuard.replace(/--.*$/gm, '');
    expect(executable).toMatch(/\)\s*AND EXISTS \(\s*SELECT 1\s+FROM public\.supplier_service_areas service_area/);
    expect(executable).not.toMatch(/NOT EXISTS\s*\(\s*SELECT 1\s+FROM public\.supplier_service_areas/i);
    expect(executable).not.toMatch(/OR\s+NOT EXISTS/i);
  });

  it('refuses a rerun or partial apply instead of skipping the rename, and commits atomically with its ledger row', () => {
    const executable = categoryCoverageGuard.replace(/--.*$/gm, '');
    expect(executable).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    const precondition = executable.indexOf('DO $preconditions$');
    const rename = executable.indexOf('ALTER FUNCTION private.rank_discovery_candidates(uuid, uuid[])');
    const create = executable.indexOf('CREATE FUNCTION private.rank_discovery_candidates(');
    expect(precondition).toBeGreaterThan(-1);
    expect(rename).toBeGreaterThan(precondition);
    expect(create).toBeGreaterThan(rename);
    const guard = executable.slice(precondition, rename);
    expect(guard).toContain("to_regprocedure('private.rank_discovery_candidates(uuid,uuid[])') IS NULL");
    expect(guard).toContain("to_regprocedure('private.rank_discovery_candidates_pre_subcategory_isolation(uuid,uuid[])') IS NULL");
    expect(guard).toContain("to_regprocedure('private.rank_discovery_candidates_pre_category_coverage_guard(uuid,uuid[])') IS NOT NULL");
    expect(guard.match(/RAISE EXCEPTION 'RFQ_COVERAGE_GUARD_PRECONDITION_FAILED/g)).toHaveLength(2);
    expect(executable).not.toMatch(/CREATE OR REPLACE FUNCTION private\.rank_discovery_candidates\(/);
    expect(executable).not.toMatch(/IF NOT EXISTS|DROP FUNCTION/i);
    expect(executable).toContain('REVOKE ALL ON FUNCTION private.rank_discovery_candidates(uuid, uuid[]) FROM PUBLIC, anon, authenticated;');
    expect(executable).toContain('REVOKE ALL ON FUNCTION private.rank_discovery_candidates_pre_category_coverage_guard(uuid, uuid[]) FROM PUBLIC, anon, authenticated;');
    expect(executable).toContain('GRANT EXECUTE ON FUNCTION private.rank_discovery_candidates(uuid, uuid[]) TO service_role;');
  });

  it('keeps external discovery, OTP registration, and GST verification on separate invitation reasons', () => {
    expect(invite).toContain("v_reasons := ARRAY['pin_coverage', 'discovered_in_area']");
    expect(invite).toContain("IN ('OTP_REGISTERED', 'GST_VERIFIED')");
    expect(invite).toContain("AND u.reason IS DISTINCT FROM 'pin_coverage'");
    expect(invite).toContain("AND u.reason IS DISTINCT FROM 'discovered_in_area'");
  });

  it('does not insert a second invitation for the same supplier and does not treat the insert as delivery', () => {
    expect(invite).toContain('WHERE rfq_id = p_rfq_id AND supplier_id = v_supplier_id');
    expect(invite).toContain('WHERE rfq_id = p_rfq_id AND supplier_id = v_candidate.supplier_id');
    expect(invite).toContain("'INVITED'");
    expect(invite).not.toMatch(/delivery_status\s*=\s*'DELIVERED'/i);
    expect(invite).not.toMatch(/whatsapp_sent|waha/i);
  });
});
