import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATION = '00303_password_policy_rotation_history_and_hook.sql';
const SQL = readFileSync(resolve(ROOT, 'supabase/migrations', MIGRATION), 'utf8');

describe('00303 password policy migration', () => {
  it('follows 00302 and precedes 00304 role context patch', () => {
    const list = readdirSync(resolve(ROOT, 'supabase/migrations'))
      .filter((f: string) => /^\d{5}_.*\.sql$/.test(f))
      .sort();
    const idx = list.indexOf(MIGRATION);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(list[idx - 1]).toBe('00302_demo_staging_procurement_isolation_parity.sql');
    expect(list[idx + 1]).toBe('00304_my_role_context_password_policy.sql');
  });

  it('defines rotation, history, secure RPCs, hook, and demo QA persona', () => {
    expect(SQL).toContain('password_changed_at');
    expect(SQL).toContain('private.password_history');
    expect(SQL).toContain('change_password_secure');
    expect(SQL).toContain('set_password_secure');
    expect(SQL).toContain('custom_access_token_hook');
    expect(SQL).toContain("'QA'");
    expect(SQL).toContain('private.password_policy_exempt');
    expect(SQL).toContain("interval '90 days'");
    expect(SQL).toMatch(/\[A-Z\]/);
    expect(SQL).toMatch(/\[0-9\]/);
  });

  it('does not grant read access to password history', () => {
    expect(SQL).toContain('REVOKE ALL ON TABLE private.password_history');
  });
});
