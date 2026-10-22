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
    expect(page).toContain('user.email');
    expect(page).toContain('Switch account');
  });

  it('shows the one-time invitation link and 48-hour email-bound instructions', () => {
    expect(modal).toContain('internal-invitation-created');
    expect(modal).toContain('This link is shown only now');
    expect(modal).toContain('must be accepted while signed in with the invited email');
  });

  it('keeps reconciliation explicitly non-granting and operator-confirmed', () => {
    expect(panel).toContain('Reconcile this pending invitation only if the invited account already has the exact assigned internal role');
    expect(panel).toContain('This does not grant or change roles');
    expect(api).toContain("supabase.rpc('reconcile_internal_invitation_atomic'");
  });
});
