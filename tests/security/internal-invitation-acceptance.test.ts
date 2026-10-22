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
    expect(migration).toContain("RETURN jsonb_build_object('ok', false, 'error', 'This invitation has already been accepted.')");
    expect(migration).not.toContain("'alreadyAccepted', true");
    expect(migration).toContain("IF v_inv.status = 'REVOKED' THEN");
    expect(migration).toContain('v_inv.expires_at <= clock_timestamp()');
    expect(migration).toContain('IF lower(v_inv.email) <> v_auth_email THEN');
    expect(migration).toContain('u.email_confirmed_at');
    expect(migration).toContain("event_type = 'profile.email_verified'");
    expect(migration).toContain('accepted_profile_id = v_profile');
    expect(migration).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT');
    expect(migration).toContain('pg_advisory_xact_lock(hashtext(v_email)::bigint)');
    expect(migration).toContain('idx_internal_invitations_one_pending_email');
  });

  it('never elevates a profile to platform admin through ordinary invitation acceptance', () => {
    expect(migration).toContain('SUPER_ADMIN access must be established through the two-person recovery workflow');
    expect(migration).toContain('NOT COALESCE(v_is_platform_admin, false)');
    expect(migration).toContain('IF v_role_code IS DISTINCT FROM \'SUPER_ADMIN\' THEN');
    expect(migration).toContain('private.guard_internal_invitation_role');
    expect(migration).not.toMatch(/SET\s+is_platform_admin\s*=\s*true/i);
    expect(migration).not.toMatch(/SET\s+active_role_code\s*=\s*'SUPER_ADMIN'/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.profiles/i);
    expect(migration).not.toContain('my_role_context');
    expect(migration).not.toMatch(/CREATE TRIGGER[\s\S]*ON auth\.users/i);
  });

  it('restricts RPC execution to authenticated callers and reconciliation never grants roles', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.accept_internal_invitation_atomic(text) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.accept_internal_invitation_atomic(text) TO authenticated');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.revoke_internal_invitation_atomic(uuid, text) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.revoke_internal_invitation_atomic(uuid, text) TO authenticated');
    const revoke = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.revoke_internal_invitation_atomic'));
    expect(revoke).toContain('v_reason = \'\'');
    expect(revoke).toContain('revoked_by = v_caller');
    expect(revoke).toContain('revocation_reason = v_reason');
    const reconcile = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.reconcile_internal_invitation_atomic'));
    expect(reconcile).toContain('IF NOT EXISTS (');
    expect(reconcile).toContain('internal_user_assignments');
    expect(reconcile).not.toContain('INSERT INTO public.internal_user_assignments');
    expect(reconcile).toContain("'granted_role', false");
    expect(migration).toContain("'internal_invitation.created'");
    expect(migration).toContain("'internal_invitation.accepted'");
    expect(migration).toContain("'internal_invitation.revoked'");
    expect(migration).toContain("'internal_invitation.reconciled'");
    expect(migration).toContain('REVOKE ALL ON TABLE public.internal_invitations FROM PUBLIC, anon, authenticated');
    const grant = migration.slice(migration.indexOf('GRANT SELECT ('));
    expect(grant).not.toContain('invitation_token_hash');
    expect(grant).not.toContain('invitation_token,');
    const createdAudit = migration.slice(
      migration.indexOf("'internal_invitation.created'"),
      migration.indexOf("'token', v_token"),
    );
    expect(createdAudit).not.toContain('v_token');
  });
});
