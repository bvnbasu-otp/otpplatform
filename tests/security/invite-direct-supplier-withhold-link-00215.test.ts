/**
 * Static contract tests for 00215 (invite_direct_supplier withholds the
 * quick-quote link when the contact belongs to a supplier the buyer did not
 * create). These read the SQL text; the behaviour is exercised in
 * tests/integration/direct-invite-existing-supplier.test.ts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const FILE = '00215_withhold_direct_invite_link_for_existing_suppliers.sql';

const sql = readFileSync(resolve(MIGRATIONS_DIR, FILE), 'utf8').replace(/--.*$/gm, '');

describe('00215 invite_direct_supplier', () => {
  it('follows 00214 contiguously and runs in one transaction', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    expect(files[213]).toBe('00214_demo_reset_reanchors_demo_rfq_deadlines.sql');
    expect(files[214]).toBe(FILE);
    expect(sql.trim().startsWith('BEGIN;')).toBe(true);
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
  });

  it('adds one private helper, redefines invite_direct_supplier, and widens no grant', () => {
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION private\.is_unclaimed_direct_placeholder\(/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.invite_direct_supplier\(/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.is_unclaimed_direct_placeholder\(uuid, text, text, uuid\) FROM PUBLIC;/,
    );
    expect(sql).not.toMatch(/ALTER TYPE|ALTER TABLE|DROP |CREATE POLICY|TO anon|TO public/i);
    expect(sql.match(/GRANT /g)).toHaveLength(1);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.invite_direct_supplier\(uuid, text, text\) TO authenticated, service_role;/,
    );
  });

  it('creates the magic link only inside the shareable branch, retiring older unused ones first', () => {
    const branch = sql.match(/IF v_shareable THEN([\s\S]*?)END IF;/)?.[1] ?? '';
    expect(branch).toMatch(
      /UPDATE supplier_magic_links\s+SET expires_at = now\(\)\s+WHERE supplier_id = v_supplier_id\s+AND rfq_id = p_rfq_id\s+AND used_at IS NULL/,
    );
    expect(branch).toMatch(/v_token := rtrim\(/);
    expect(branch).toMatch(/INSERT INTO supplier_magic_links/);
    expect(sql.match(/INSERT INTO supplier_magic_links/g)).toHaveLength(1);
    expect(sql.match(/v_token :=/g)).toHaveLength(1);
  });

  it('treats only an untouched placeholder of this organisation as shareable', () => {
    const helper =
      sql.match(/FUNCTION private\.is_unclaimed_direct_placeholder\([\s\S]*?\$\$([\s\S]*?)\$\$;/)?.[1] ?? '';
    expect(helper).toMatch(/s\.source = 'DIRECT'/);
    expect(helper).toMatch(/s\.source_ref = p_contact_kind \|\| ':' \|\| p_contact_value/);
    expect(helper).toMatch(/ORDER BY d\.created_at, d\.id\s+LIMIT 1\s+\) IS NOT DISTINCT FROM p_organization_id/);
    expect(helper).toMatch(/NOT EXISTS \(SELECT 1 FROM supplier_users su WHERE su\.supplier_id = p_supplier_id\)/);
    expect(helper).toMatch(/c\.status = 'VERIFIED'/);
    expect(helper).toMatch(/l\.used_at IS NOT NULL/);
    expect(sql).toMatch(
      /v_shareable := v_created OR private\.is_unclaimed_direct_placeholder\(\s+v_supplier_id, p_contact_kind, v_normalized, v_rfq\.organization_id\);/,
    );
    expect(sql).toMatch(/\) RETURNING id INTO v_supplier_id;\s+v_created := true;/);
  });

  it('expires, without marking used, links already handed to buyers for suppliers they do not own', () => {
    const containment = sql.match(/UPDATE supplier_magic_links l\s+SET([\s\S]*?);/)?.[0] ?? '';
    expect(containment).toMatch(/SET expires_at = now\(\)/);
    expect(containment).not.toMatch(/used_at =/);
    expect(containment).toMatch(/WHERE l\.used_at IS NULL\s+AND l\.expires_at > now\(\)/);
    expect(containment).toMatch(/d\.rfq_id = l\.rfq_id\s+AND d\.supplier_id = l\.supplier_id/);
    expect(containment).toMatch(
      /NOT private\.is_unclaimed_direct_placeholder\(\s+d\.supplier_id, d\.contact_kind, d\.contact_value, d\.organization_id\)/,
    );
  });

  it('returns no identifier or link for a non-shareable match', () => {
    const ret = sql.match(/RETURN jsonb_build_object\(([\s\S]*?)\);/)?.[1] ?? '';
    expect(ret).toMatch(/'invitationId', CASE WHEN v_shareable THEN v_invite_id END/);
    expect(ret).toMatch(/'supplierId', CASE WHEN v_shareable THEN v_supplier_id END/);
    expect(ret).toMatch(/'token', v_token/);
    expect(ret).toMatch(/'quickQuotePath', CASE WHEN v_shareable THEN '\/q\/' \|\| v_token END/);
    expect(ret).toMatch(/'shareLinkAvailable', v_shareable/);
  });

  it('keeps the membership, role, status, expiry, channel and masking guards', () => {
    expect(sql).toMatch(/IF NOT private\.is_org_member\(v_rfq\.organization_id\) THEN/);
    expect(sql).toMatch(/NOT IN \('OWNER', 'MANAGER', 'BUYER'\)\s+AND NOT private\.is_platform_admin\(\)/);
    expect(sql).toMatch(/v_rfq\.status NOT IN \('DRAFT', 'OPEN'\)/);
    expect(sql).toMatch(/now\(\) \+ interval '7 days'/);
    expect(sql).toMatch(/extensions\.digest\(v_token, 'sha256'\)/);
    expect(sql).toMatch(/v_channel := NULL;/);
    expect(sql).toMatch(/v_channel := 'WHATSAPP'::messaging_channel;/);
    expect(sql).toMatch(/'contact_value_masked'/);
    expect(sql).toMatch(/'magic_link_issued', v_shareable/);
    expect(sql).toMatch(/ON CONFLICT \(rfq_id, contact_kind, contact_value\) DO NOTHING/);
  });
});
