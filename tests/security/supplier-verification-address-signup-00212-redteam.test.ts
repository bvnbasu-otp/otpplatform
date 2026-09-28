/**
 * Static contract tests for migration 00212 (supplier verification vocabulary,
 * buyer address book, self-service signup) and the 00196 correction it
 * depends on. These read the SQL text; they do not execute it against Postgres.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const FILE = '00212_reconcile_supplier_verification_buyer_addresses_and_self_service_signup.sql';
const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8');
const sql00196 = readFileSync(
  resolve(MIGRATIONS_DIR, '00196_buyer_identity_address_rwa_msme_and_supplier_award_onboarding.sql'),
  'utf8',
);

function stripComments(s: string): string {
  return s.replace(/--.*$/gm, '');
}

/** Body of the last `CREATE OR REPLACE FUNCTION <name>(` in `src`, up to its closing `$$;`. */
function functionBody(src: string, name: string): string {
  const start = src.lastIndexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, `${name} must be defined`).toBeGreaterThanOrEqual(0);
  const open = src.indexOf('$$', start);
  const close = src.indexOf('$$;', open + 2);
  return src.slice(start, close + 3);
}

const code = stripComments(sql);

describe('Migration 00196 correction', () => {
  const code196 = stripComments(sql00196);

  it('adds every organizations / organization_invitations / suppliers column with ADD COLUMN IF NOT EXISTS', () => {
    for (const table of ['organizations', 'organization_invitations', 'suppliers']) {
      const stmts = code196.match(new RegExp(`ALTER TABLE public\\.${table}\\b[^;]*;`, 'g')) ?? [];
      expect(stmts.length, table).toBeGreaterThan(0);
      for (const stmt of stmts) {
        expect(stmt.match(/\bADD COLUMN\b(?! IF NOT EXISTS)/g) ?? [], `${table}: ${stmt}`).toEqual([]);
      }
    }
  });

  it('no longer re-adds columns that earlier migrations already own', () => {
    expect(code196).not.toMatch(/ADD COLUMN IF NOT EXISTS verification_status\b/);
    expect(code196).not.toMatch(/ALTER TABLE public\.organization_invitations[\s\S]*?ADD COLUMN IF NOT EXISTS role\b[^;]*;/);
  });
});

describe('Migration 00212 — static SQL contract', () => {
  it('is the next contiguous migration after 00211', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    expect(files[211]).toBe(FILE);
    files.forEach((f, i) => expect(f.slice(0, 5)).toBe(String(i + 1).padStart(5, '0')));
  });

  it('runs in one transaction and reloads the PostgREST schema cache', () => {
    expect(code.trim().startsWith('BEGIN;')).toBe(true);
    expect(code.trim().endsWith('COMMIT;')).toBe(true);
    expect(code).toMatch(/NOTIFY pgrst, 'reload schema';/);
  });

  it('never adds values to the legacy enum and never deletes supplier data', () => {
    expect(code).not.toMatch(/ALTER TYPE[^;]*ADD VALUE/i);
    expect(code).not.toMatch(/DELETE FROM public\.suppliers/i);
    expect(code).not.toMatch(/TRUNCATE/i);
  });

  it('converts the legacy enum with an explicit, total mapping and keeps the original value', () => {
    expect(code).toMatch(/ALTER COLUMN verification_status TYPE text/);
    expect(code).toMatch(/WHEN 'PLATFORM_VERIFIED' THEN 'VERIFIED'/);
    expect(code).toMatch(/WHEN 'DOCUMENT_VERIFIED' THEN 'VERIFIED'/);
    expect(code).toMatch(/WHEN 'SELF_DECLARED'\s+THEN 'PENDING'/);
    expect(code).toMatch(/WHEN 'UNVERIFIED'\s+THEN 'NOT_PROVIDED'/);
    expect(code).toMatch(/legacy_verification_status/);
    expect(code).toMatch(/suppliers_verification_status_check/);
    expect(code).toMatch(/SET DEFAULT 'NOT_PROVIDED'/);
  });

  it('only converts while the column is still the legacy enum (idempotent)', () => {
    expect(code).toMatch(/IF v_type IS DISTINCT FROM 'supplier_verification_status' THEN\s+RETURN;/);
  });

  it('never writes a legacy label into the converted column', () => {
    for (const fn of [
      'private.provision_signup_request',
      'public.admin_review_signup_request',
      'public.submit_signup_request',
      'public.verify_supplier_gstin',
    ]) {
      const body = stripComments(functionBody(sql, fn));
      expect(body, fn).not.toMatch(/'PLATFORM_VERIFIED'|'DOCUMENT_VERIFIED'|'SELF_DECLARED'/);
    }
  });

  it('blocks signed-in users from changing their own supplier trust fields', () => {
    const guard = stripComments(functionBody(sql, 'private.guard_supplier_trust_fields'));
    for (const col of ['verification_status', 'lifecycle_state', 'verified_at', 'gst_verified', 'status']) {
      expect(guard).toMatch(new RegExp(`NEW\\.${col} IS DISTINCT FROM OLD\\.${col}`));
    }
    expect(guard).toMatch(/private\.is_platform_admin\(\)/);
    expect(guard).toMatch(/ERRCODE = '42501'/);
    expect(code).toMatch(/CREATE TRIGGER trg_aa_guard_supplier_trust_fields\s+BEFORE UPDATE ON public\.suppliers/);
  });

  it('verify_supplier_gstin checks the caller and never self-certifies', () => {
    const body = stripComments(functionBody(sql, 'public.verify_supplier_gstin'));
    expect(body).toMatch(/private\.is_supplier_user_for\(/);
    expect(body).toMatch(/'PENDING'/);
    expect(body).toMatch(/'REQUIRES_REVERIFICATION'/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.verify_supplier_gstin\(uuid, text, jsonb\) FROM PUBLIC, anon;/);
  });

  it('keeps provisioning server-only and approval admin-gated', () => {
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION private\.provision_signup_request\(uuid, uuid, text, boolean\) FROM PUBLIC, anon, authenticated;/,
    );
    const review = stripComments(functionBody(sql, 'public.admin_review_signup_request'));
    expect(review).toMatch(/private\.is_platform_admin\(\)/);
    expect(code).toMatch(/REVOKE EXECUTE ON FUNCTION public\.admin_review_signup_request\(uuid, text, text, text\) FROM PUBLIC, anon;/);
  });

  it('self-service provisioning never verifies GST or the supplier, and refuses existing accounts', () => {
    const prov = stripComments(functionBody(sql, 'private.provision_signup_request'));
    expect(prov).toMatch(/v_gst_verified := v_has_gst AND NOT p_self_service/);
    expect(prov).toMatch(/SELF_SERVICE_INELIGIBLE/);
    expect(prov).toMatch(/FROM auth\.users/);
  });

  it('a signup that cannot self-provision stays PENDING and is audited, not silently dropped', () => {
    const submit = stripComments(functionBody(sql, 'public.submit_signup_request'));
    expect(submit).toMatch(/PERFORM private\.provision_signup_request\(v_id, NULL, NULL, true\)/);
    expect(submit).toMatch(/EXCEPTION WHEN OTHERS THEN/);
    expect(submit).toMatch(/'signup\.review_required'/);
    expect(submit).toMatch(/'already_submitted', false/);
  });

  it('buyer address book: RLS is authenticated-only and owner-scoped; RPCs are not callable signed out', () => {
    expect(code).toMatch(/ALTER TABLE public\.buyer_addresses ENABLE ROW LEVEL SECURITY/);
    expect(code).toMatch(/REVOKE ALL ON public\.buyer_addresses FROM PUBLIC, anon;/);
    const policies = code.match(/CREATE POLICY "buyer_addresses_[a-z_]+" ON public\.buyer_addresses[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(4);
    for (const p of policies) {
      expect(p).toMatch(/TO authenticated/);
      expect(p).toMatch(/private\.get_profile_id\(\)|private\.is_org_member\(/);
    }
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.upsert_buyer_address_atomic\([^)]*\) FROM PUBLIC, anon;/);
    expect(code).toMatch(/REVOKE ALL ON FUNCTION public\.get_buyer_addresses\(uuid\) FROM PUBLIC, anon;/);
    expect(stripComments(functionBody(sql, 'public.upsert_buyer_address_atomic'))).toMatch(
      /v_caller_id\s*:=\s*private\.get_profile_id\(\)/,
    );
  });
});
