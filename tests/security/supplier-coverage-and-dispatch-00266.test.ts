import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00266_remediate_supplier_coverage_and_dispatch.sql';
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

describe('00266 supplier coverage, dispatch & quorum remediation (static security & schema contract)', () => {
  it('exists as the contiguous migration after 00265 followed by 00267 through 00270', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const idx = files.indexOf(FILE);
    expect(files.slice(idx, idx + 9)).toEqual([
      FILE,
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
    const idx265 = files.indexOf('00265_remediate_buyer_taxonomy_and_rls_integrity.sql');
    expect(idx265).toBeGreaterThan(0);
    expect(files[idx265 + 1]).toBe(FILE);
  });

  it('proves public.infer_indian_state_from_pincode is immutable and secure', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.infer_indian_state_from_pincode(p_pincode text)');
    expect(SQL).toContain('RETURNS text');
    expect(SQL).toContain('IMMUTABLE');
  });

  it('updates coverage scope key to safely fall back to inferred state', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION private.rfq_requirement_coverage_scope_key(');
    expect(SQL).toContain('public.infer_indian_state_from_pincode(v_pincode)');
    expect(SQL).toContain('public.location_pin_coverage_build_scope_key(v_state, v_city, v_pincode, v_category)');
  });

  it('creates private.platform_secrets with strict security barriers', () => {
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS private.platform_secrets');
    expect(SQL).toContain('key text PRIMARY KEY');
    expect(SQL).toContain('value text NOT NULL');
  });

  it('secures dispatch_supplier_invitation_notification with phone fallback and hosted url', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION private.dispatch_supplier_invitation_notification(');
    expect(SQL).toContain('SECURITY DEFINER');
    expect(SQL).toContain('SET search_path = public, private');
    expect(SQL).toContain('SELECT contact_phone INTO v_supp_phone');
    expect(SQL).toContain('FROM suppliers');
  });

  it('ranks registered suppliers by category match even before capability ceiling declaration', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION private.rank_discovery_candidates(');
    expect(SQL).toContain('v_cat_code = ANY(s.categories)');
    expect(SQL).toContain('sc.declared_caps_count = 0 AND sc.category_match');
  });

  it('records the historical waiver implementation that 00325 disables', () => {
    expect(SQL).toContain('CREATE OR REPLACE FUNCTION public.waive_rfq_quote_quorum(');
    expect(SQL).toContain('SECURITY DEFINER');
    expect(SQL).toContain('SET search_path = public');
    expect(SQL).toContain("v_caller_role NOT IN ('SUPERADMIN', 'ADMIN', 'CEO')");
    expect(SQL).toContain("'RFQ_QUORUM_WAIVED'");
    // Verify canonical audit_events schema compliance: must NOT use deprecated actor_role
    expect(SQL).not.toMatch(/INSERT\s+INTO\s+public\.audit_events[^;]*\bactor_role\b/i);
    expect(SQL).toContain('GRANT EXECUTE ON FUNCTION public.waive_rfq_quote_quorum(uuid, text) TO authenticated;');

    const disabled = readFileSync(
      resolve(MIGRATIONS_DIR, '00325_disable_pilot_quote_quorum_waiver.sql'),
      'utf8',
    );
    expect(disabled).toContain('PILOT_QUORUM_WAIVER_DISABLED');
    expect(disabled).toMatch(
      /REVOKE ALL ON FUNCTION public\.waive_rfq_quote_quorum\(uuid, text\)\s+FROM PUBLIC, anon, authenticated, service_role;/,
    );
  });
});
