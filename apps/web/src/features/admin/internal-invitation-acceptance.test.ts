import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(__dirname, relativePath), 'utf8');

describe('internal invitation acceptance module contract', () => {
  const api = read('./api/internal-ops.ts');
  const panel = read('./components/InternalUsersPanel.tsx');
  const modal = read('./components/InviteInternalUserModal.tsx');
  const page = read('./pages/InternalInviteAcceptancePage.tsx');

  it('creates invitations only through the server-authoritative RPC', () => {
    const createFn = api.slice(api.indexOf('export async function createInternalInvitation'), api.indexOf('export async function acceptInternalInvitation'));
    expect(createFn).toContain("supabase.rpc('create_internal_invitation_atomic'");
    expect(createFn).not.toContain(".from('internal_invitations')");
    expect(createFn).toContain('inviteUrl');
  });

  it('accepts the invitation through the atomic RPC and refreshes role context', () => {
    expect(api).toContain("supabase.rpc('accept_internal_invitation_atomic'");
    expect(page).toContain('await acceptInternalInvitation(token)');
    expect(page).toContain('await refresh()');
    expect(page).toContain('data-testid="signed-in-email"');
    expect(page).toContain('user.email');
    expect(page).toContain('Switch account');
    expect(page).toContain("role={message.ok ? 'status' : 'alert'}");
    expect(page).toContain('result.error');
    expect(page).not.toContain('useEffect');
    expect(page).not.toContain('invitation_token_hash');
  });

  it('shows the one-time invitation link and 48-hour email-bound instructions', () => {
    expect(modal).toContain('internal-invitation-created');
    expect(modal).toContain('This link is shown only now');
    expect(modal).toContain('must be accepted while signed in with the invited email');
    expect(modal).toContain('SUPER_ADMIN access requires the separate two-person recovery workflow');
    expect(modal).toContain('if (!isOpen)');
    expect(modal).toContain('setInviteUrl(null)');
  });

  it('keeps reconciliation explicitly non-granting and operator-confirmed', () => {
    expect(panel).toContain('Reconcile this pending invitation only if the invited account already has the exact assigned internal role');
    expect(panel).toContain('This does not grant or change roles');
    expect(api).toContain("supabase.rpc('reconcile_internal_invitation_atomic'");
    expect(api).toContain("supabase.rpc('revoke_internal_invitation_atomic'");
    expect(api).toContain('accepted_profile_id,revoked_at,revocation_reason,internal_roles(code,name)');
    expect(api).not.toContain('invitation_token_hash');
    expect(api).not.toContain('invitation_token');
    expect(api).not.toContain(".select('*, internal_roles(code, name)')");
    expect(api).not.toContain(".from('internal_invitations')\n    .update(");
    expect(panel).toContain('data-testid="invitation-status"');
    expect(panel).toContain('inv.revocation_reason');
    expect(panel).toContain("{displayStatus}");
  });
});
