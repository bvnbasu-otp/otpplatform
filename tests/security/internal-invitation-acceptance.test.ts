import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/00314_internal_invitation_acceptance.sql'),
  'utf8',
);

describe('00314 internal invitation acceptance security contract', () => {
  it('hashes existing tokens before removing plaintext token storage', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS invitation_token_hash text');
    expect(migration).toContain('private.hash_invitation_token(invitation_token)');
    expect(migration).toContain('ALTER COLUMN invitation_token_hash SET NOT NULL');
    expect(migration).toContain('DROP COLUMN IF EXISTS invitation_token');
  });

  it('creates invitations through authenticated platform-admin authority and limits expiry', () => {
    expect(migration).toContain('private.is_platform_admin()');
    expect(migration).toContain("interval '48 hours'");
    expect(migration).toContain('SUPER_ADMIN cannot be granted through ordinary invitations');
    expect(migration).toContain('create_internal_invitation_atomic');
  });

  it('locks the invitation and verifies status, expiry, and the authenticated email before acceptance', () => {
    expect(migration).toContain('WHERE invitation_token_hash = private.hash_invitation_token(p_token)');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("IF v_inv.status = 'ACCEPTED' THEN");
    expect(migration).toContain("IF v_inv.status = 'REVOKED' THEN");
    expect(migration).toContain('v_inv.expires_at <= clock_timestamp()');
    expect(migration).toContain('IF lower(v_inv.email) <> v_email THEN');
    expect(migration).toContain('accepted_profile_id = v_profile');
  });

  it('never elevates a profile to platform admin through ordinary invitation acceptance', () => {
    expect(migration).toContain('SUPER_ADMIN access must be established through the two-person recovery workflow');
    expect(migration).not.toMatch(/SET\s+is_platform_admin\s*=\s*true/i);
    expect(migration).not.toMatch(/SET\s+active_role_code\s*=\s*'SUPER_ADMIN'/i);
  });

  it('restricts RPC execution to authenticated callers and reconciliation never grants roles', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.accept_internal_invitation_atomic(text) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.accept_internal_invitation_atomic(text) TO authenticated');
    const reconcile = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.reconcile_internal_invitation_atomic'));
    expect(reconcile).toContain('IF NOT EXISTS (');
    expect(reconcile).toContain('internal_user_assignments');
    expect(reconcile).not.toContain('INSERT INTO public.internal_user_assignments');
  });
});
