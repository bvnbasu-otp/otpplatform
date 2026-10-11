import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DRAFT = resolve(
  __dirname,
  '../../OTP Golden Reconstruction/MIGRATION_00263_GUARD_PROFILE_PRIVILEGES_EMPTY_ROLE_DRAFT.sql'
);
const FORMAL = resolve(
  __dirname,
  '../../supabase/migrations/00263_guard_profile_privileges_empty_role_bypass.sql'
);
const LIVE203 = resolve(
  __dirname,
  '../../supabase/migrations/00203_restrict_ops_metadata_guard_profile_privileges_and_one_live_tds.sql'
);
const LIVE205 = resolve(__dirname, '../../supabase/migrations/00205_force_default_profile_status_on_insert.sql');

function guardBodyFromMigration(sql: string): string {
  const marker = 'CREATE OR REPLACE FUNCTION private.guard_profile_privileges()';
  const start = sql.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const slice = sql.slice(start);
  const end = slice.indexOf('$$;');
  expect(end).toBeGreaterThan(-1);
  return slice.slice(0, end);
}

describe('00263 guard_profile_privileges empty-role (static)', () => {
  const sql = readFileSync(FORMAL, 'utf8');

  it('formal migration matches reviewed draft bytes', () => {
    expect(readFileSync(FORMAL)).toEqual(readFileSync(DRAFT));
  });
  const live203 = readFileSync(LIVE203, 'utf8');
  const live205 = readFileSync(LIVE205, 'utf8');
  const body = guardBodyFromMigration(sql);

  it('removes empty-string auth.role bypass present in 00203/00205', () => {
    expect(live203).toMatch(/IN\s*\(\s*'service_role',\s*''\s*\)/);
    expect(live205).toMatch(/IN\s*\(\s*'service_role',\s*''\s*\)/);
    expect(body).not.toMatch(/IN\s*\(\s*'service_role',\s*''\s*\)/);
    expect(body).toMatch(/COALESCE\(auth\.role\(\),\s*''\)\s*=\s*'service_role'/);
  });

  it('preserves platform-admin bypass and privilege checks', () => {
    expect(body).toContain('private.is_platform_admin()');
    expect(body).toContain('Only a platform admin can grant platform-admin access (PROFILE-PRIVILEGE)');
    expect(body).toContain('This email is reserved for platform administrators (PROFILE-PRIVILEGE)');
    expect(body).toContain('Only a platform admin can change account status (PROFILE-PRIVILEGE)');
  });

  it('preserves 00205 signup normalization on INSERT', () => {
    expect(body).toMatch(/IF TG_OP = 'INSERT' THEN[\s\S]*NEW\.status := 'ACTIVE'/);
    expect(body).toContain('NEW.deleted_at := NULL');
    expect(body).toContain('NEW.blocked_at := NULL');
    expect(body).toContain('NEW.blocked_reason := NULL');
    expect(body).toContain('NEW.blocked_by := NULL');
  });

  it('uses CREATE OR REPLACE only (trigger attachment unchanged)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION private.guard_profile_privileges()');
    expect(sql).not.toMatch(/CREATE TRIGGER trg_aa_guard_profile_privileges/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION private\.guard_profile_privileges\(\) FROM PUBLIC, anon, authenticated/
    );
  });

  it('documents is_platform_admin dependency in header comments', () => {
    expect(sql).toMatch(/private\.is_platform_admin\(\)/);
    expect(sql).toMatch(/00179/);
  });

  it('blocks non-admin UPDATE privilege and lifecycle mutations', () => {
    expect(body).toMatch(
      /NEW\.is_platform_admin IS DISTINCT FROM OLD\.is_platform_admin[\s\S]*Only a platform admin can grant or revoke/
    );
    expect(body).toMatch(
      /NEW\.status IS DISTINCT FROM OLD\.status[\s\S]*Only a platform admin can change account status/
    );
    expect(body).toContain('NEW.deleted_at IS DISTINCT FROM OLD.deleted_at');
    expect(body).toContain('NEW.blocked_at IS DISTINCT FROM OLD.blocked_at');
  });

  it('lists reserved platform-admin emails used with signup guard', () => {
    expect(body).toContain("'admin@otp.test'");
    expect(body).toContain("'bvnbasu@gmail.com'");
    expect(body).toMatch(/lower\(NEW\.email\) = ANY \(v_admin_emails\)/);
  });
});
