import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');
const FILE = '00264_remediate_privileged_lifecycle_and_audit_contracts.sql';
const SQL = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');

describe('00264 privileged lifecycle and audit contracts (static security & schema integrity)', () => {
  it('exists as the contiguous migration after 00263 followed by 00265', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    const idx = files.indexOf(FILE);
    expect(files.slice(idx, idx + 11)).toEqual([
      FILE,
      '00265_remediate_buyer_taxonomy_and_rls_integrity.sql',
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
    expect(files.at(-1)).toBe('00296_platform_admin_operator_context_alignment.sql');
    const idx263 = files.indexOf('00263_guard_profile_privileges_empty_role_bypass.sql');
    expect(idx263).toBeGreaterThan(0);
    expect(files[idx263 + 1]).toBe(FILE);
  });

  describe('admin_bulk_block_users & admin_bulk_unblock_users', () => {
    it('writes canonical audit_events columns without legacy actor_role or action', () => {
      expect(SQL).toContain("'admin.bulk_block_users'");
      expect(SQL).toContain("'admin.bulk_unblock_users'");
      // Must not contain invalid audit columns in any insert statement
      const auditInserts = SQL.match(/INSERT\s+INTO\s+public\.audit_events\s*\([^)]+\)/gi) || [];
      expect(auditInserts.length).toBeGreaterThanOrEqual(15);
      for (const stmt of auditInserts) {
        expect(stmt).not.toMatch(/\bactor_role\b/);
        expect(stmt).not.toMatch(/\(\s*action\s*,/);
        expect(stmt).toMatch(/event_type/);
      }
    });

    it('enforces true session revocation via auth.users.banned_until and auth.sessions purge', () => {
      expect(SQL).toContain("UPDATE auth.users");
      expect(SQL).toContain("SET banned_until = '2099-12-31 23:59:59+00'");
      expect(SQL).toContain("DELETE FROM auth.sessions");
      expect(SQL).toContain("UPDATE auth.refresh_tokens");
      expect(SQL).toContain("SET revoked = true");
      // Unblock clears the ban
      expect(SQL).toContain("SET banned_until = NULL");
    });

    it('preserves superadmin immunity filters', () => {
      expect(SQL).toContain("'bvnbasu@gmail.com'");
      expect(SQL).toContain("'admin@otp.test'");
      expect(SQL).toContain("COALESCE(p.is_platform_admin, false) = false");
    });
  });

  describe('admin_bulk_block_organizations & admin_bulk_delete_organizations', () => {
    it('uses canonical audit columns and disables hard deletion', () => {
      expect(SQL).toContain("'admin.bulk_block_organizations'");
      expect(SQL).toContain("'admin.bulk_unblock_organizations'");
      expect(SQL).toContain("'admin.bulk_delete_organizations'");
      expect(SQL).toContain("'hardDeleteRefused', (p_soft_delete IS FALSE)");
      expect(SQL).toContain("'appliedMode', 'DEACTIVATED'");
    });

    it('cascades lockout to linked member sessions when blocking organization', () => {
      expect(SQL).toContain("SELECT profile_id FROM public.organization_members WHERE organization_id = ANY(p_org_ids)");
      expect(SQL).toContain("SELECT profile_id FROM public.supplier_users WHERE supplier_id = ANY(p_org_ids)");
    });
  });

  describe('admin_get_users_and_organizations', () => {
    it('casts supplier status to text to prevent enum comparison crashes', () => {
      expect(SQL).toContain("s.status::text = 'BLOCKED'");
      expect(SQL).not.toMatch(/s\.status\s*=\s*'BLOCKED'/);
    });

    it('uses robust supplier contact person resolution', () => {
      expect(SQL).toContain("COALESCE(s.legal_name, s.business_name) AS contact_person");
      expect(SQL).not.toContain("s.contact_person");
    });
  });

  describe('PostgREST overload collision prevention', () => {
    it('drops ambiguous overloads that cause PGRST203', () => {
      expect(SQL).toContain("DROP FUNCTION IF EXISTS public.admin_get_system_health();");
      expect(SQL).toContain("DROP FUNCTION IF EXISTS public.admin_get_seller_orders(integer, integer, text, text);");
      expect(SQL).toContain("DROP FUNCTION IF EXISTS public.admin_get_live_transactions(integer, integer, text, boolean);");
    });
  });

  describe('Financial settlement audit alignment', () => {
    it('aligns all 14 settlement functions to event_type', () => {
      expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.allocate_advance_payment_atomic");
      expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.execute_settlement_reconciliation_atomic");
      expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.reconcile_bank_utr_atomic");
      expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.issue_credit_debit_note_atomic");
      expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.record_verified_payment");
      // Explicitly revokes public client execute on record_verified_payment
      expect(SQL).toContain("REVOKE ALL ON FUNCTION public.record_verified_payment");
      expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.record_verified_payment(text, uuid, uuid, numeric, text, text, text, text, text, text, jsonb) TO service_role");
    });
  });
});
