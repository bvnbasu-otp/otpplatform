/**
 * Static contract tests for 00213 (invite_direct_supplier EMAIL channel) and
 * 00214 (demo_reset re-anchors demo deadlines). These read the SQL text; the
 * behaviour is exercised in tests/integration/direct-supplier-invite.test.ts
 * and tests/integration/demo-reset-deadlines.test.ts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');
const INVITE = '00213_fix_invite_direct_supplier_email_channel.sql';
const RESET = '00214_demo_reset_reanchors_demo_rfq_deadlines.sql';

const code = (file: string) =>
  readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8').replace(/--.*$/gm, '');

describe('Migrations 00213 and 00214', () => {
  it('follow 00212 contiguously and each run in one transaction', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{5}_.*\.sql$/.test(f)).sort();
    expect(files[212]).toBe(INVITE);
    expect(files[213]).toBe(RESET);
    for (const file of [INVITE, RESET]) {
      expect(code(file).trim().startsWith('BEGIN;')).toBe(true);
      expect(code(file).trim().endsWith('COMMIT;')).toBe(true);
    }
  });
});

describe('00213 invite_direct_supplier', () => {
  const sql = code(INVITE);

  it('does not extend messaging_channel, so no messaging path starts accepting EMAIL', () => {
    expect(sql).not.toMatch(/ALTER TYPE/i);
    expect(sql).not.toMatch(/'EMAIL'::messaging_channel/);
    expect(sql).toMatch(/v_channel := NULL;/);
    expect(sql).toMatch(/v_channel := 'WHATSAPP'::messaging_channel;/);
  });

  it('keeps the membership, role, status, expiry and masking guards', () => {
    expect(sql).toMatch(/IF NOT private\.is_org_member\(v_rfq\.organization_id\) THEN/);
    expect(sql).toMatch(/NOT IN \('OWNER', 'MANAGER', 'BUYER'\)\s+AND NOT private\.is_platform_admin\(\)/);
    expect(sql).toMatch(/v_rfq\.status NOT IN \('DRAFT', 'OPEN'\)/);
    expect(sql).toMatch(/now\(\) \+ interval '7 days'/);
    expect(sql).toMatch(/extensions\.digest\(v_token, 'sha256'\)/);
    expect(sql).toMatch(/'contact_value_masked'/);
  });
});

describe('00214 demo_reset', () => {
  const sql = code(RESET);

  it('is still refused outside demo mode and to non-demo callers', () => {
    expect(sql).toMatch(/IF NOT private\.demo_mode_enabled\(\) THEN\s+RAISE EXCEPTION/);
    expect(sql).toMatch(/private\.is_platform_admin\(\) OR EXISTS \(\s+SELECT 1 FROM profiles p WHERE p\.id = private\.get_profile_id\(\) AND p\.is_demo/);
  });

  it('moves deadlines only on the seeded demo RFQs', () => {
    const update = sql.match(/UPDATE rfqs r\s+SET quote_deadline[\s\S]*?;/)?.[0] ?? '';
    expect(update).toMatch(/WHERE r\.id = o\.id\s+AND r\.is_demo\s+AND r\.id = ANY\(v_rfqs\)/);
    expect(update.match(/'0d800000-0000-4000-8000-00000000000\d'::uuid/g)).toHaveLength(5);
  });

  it('does not touch the deadline enforcement triggers', () => {
    expect(sql).not.toMatch(/enforce_voting_window|enforce_quoting_window|sync_rfq_phase_window/);
    expect(sql).not.toMatch(/DROP TRIGGER|ALTER TABLE/i);
  });
});
