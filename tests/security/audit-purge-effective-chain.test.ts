import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const MIGRATIONS = resolve(ROOT, 'supabase/migrations');

function migration(prefix: string): string {
  const filename = readdirSync(MIGRATIONS).find((name) => name.startsWith(`${prefix}_`));
  if (!filename) throw new Error(`Migration ${prefix} not found`);
  return readFileSync(resolve(MIGRATIONS, filename), 'utf8');
}

const m00077 = migration('00077');
const m00134 = migration('00134');
const m00199 = migration('00199');
const m00201 = migration('00201');
const m00202 = migration('00202');
const after00202 = readdirSync(MIGRATIONS)
  .filter((name) => /^00(?:2(?:0[3-9]|[1-9]\d)|3\d{2})_/.test(name))
  .map((name) => readFileSync(resolve(MIGRATIONS, name), 'utf8'))
  .join('\n');

describe('final static audit and purge security chain', () => {
  it('records the irreversible 00077 migration-time purge', () => {
    expect(m00077).toContain('TRUNCATE TABLE public.payments');
    expect(m00077).toMatch(/-- Execute the purge immediately[\s\S]*SELECT public\.admin_purge_all_transactional_records\(\);/);
  });

  it('records the 00134 audit-mutation bypass and broad historical grants', () => {
    expect(m00134).toContain("current_setting('otp.allow_audit_purge', true) = 'on'");
    expect(m00134).toContain("PERFORM set_config('otp.allow_audit_purge', 'on', true)");
    expect(m00134).toContain(
      'GRANT EXECUTE ON FUNCTION public.admin_clear_audit_logs_and_notifications(text) TO anon, authenticated, service_role;',
    );
  });

  it('proves 00199 removes anonymous execution and always-true anon/authenticated guards', () => {
    expect(m00199).toContain("'admin_clear_audit_logs_and_notifications'");
    expect(m00199).toContain("'admin_purge_all_transactional_records'");
    expect(m00199).toContain("regexp_replace(v_def, '\\s+OR\\s+auth\\.role\\(\\)\\s*=\\s*''(authenticated|anon)''");
    expect(m00199).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon");
    expect(m00199).toContain("GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role");
  });

  it('proves 00201 limits direct audit deletion to authenticated platform admins', () => {
    expect(m00201).toMatch(
      /CREATE POLICY audit_events_delete ON public\.audit_events\s+FOR DELETE TO authenticated\s+USING \(private\.is_platform_admin\(\)\);/,
    );
  });

  it('proves 00202 closes direct client audit inserts', () => {
    expect(m00202).toContain('DROP POLICY IF EXISTS audit_events_insert ON public.audit_events;');
    expect(m00202).toContain('REVOKE INSERT ON public.audit_events FROM PUBLIC, anon, authenticated;');
  });

  it('finds no later replacement of the purge functions, mutation trigger, or audit delete policy', () => {
    expect(after00202).not.toMatch(
      /CREATE OR REPLACE FUNCTION (?:public\.(?:admin_clear_audit_logs_and_notifications|admin_purge_all_transactional_records)|private\.prevent_audit_mutation)/,
    );
    expect(after00202).not.toContain('CREATE POLICY audit_events_delete');
  });
});
