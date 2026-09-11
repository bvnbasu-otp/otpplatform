import { describe, expect, it } from 'vitest';

export interface ProfileRecord {
  id: string;
  email: string;
  is_platform_admin: boolean;
  status: 'ACTIVE' | 'BLOCKED' | 'SUSPENDED' | 'DELETED' | 'PENDING';
  deleted_at: string | null;
}

const SUPERADMIN_WHITELIST = new Set([
  'bvnbasu@gmail.com',
  'admin@otp.test',
  'ops@otp.test',
]);

/**
 * Client and API invariant mirroring the PostgreSQL immutable role trigger.
 */
export function validateProfileMutation(
  oldProfile: ProfileRecord,
  newProfile: Partial<ProfileRecord>,
): { allowed: boolean; error?: string } {
  if (SUPERADMIN_WHITELIST.has(oldProfile.email.toLowerCase())) {
    if (newProfile.is_platform_admin === false) {
      return { allowed: false, error: 'SECURITY VIOLATION: Cannot revoke is_platform_admin from root SuperAdmin' };
    }
    if (newProfile.status && ['BLOCKED', 'SUSPENDED', 'DELETED'].includes(newProfile.status)) {
      return { allowed: false, error: 'SECURITY VIOLATION: Cannot block or suspend root SuperAdmin' };
    }
    if (newProfile.deleted_at !== undefined && newProfile.deleted_at !== null) {
      return { allowed: false, error: 'SECURITY VIOLATION: Cannot soft-delete root SuperAdmin' };
    }
    if (newProfile.email && newProfile.email.toLowerCase() !== oldProfile.email.toLowerCase()) {
      return { allowed: false, error: 'SECURITY VIOLATION: Cannot modify email of root SuperAdmin' };
    }
  }

  return { allowed: true };
}

describe('SuperAdmin Whitelist & Immutable Role Protections', () => {
  const rootAdmin: ProfileRecord = {
    id: 'admin-root-uuid',
    email: 'bvnbasu@gmail.com',
    is_platform_admin: true,
    status: 'ACTIVE',
    deleted_at: null,
  };

  const normalBuyer: ProfileRecord = {
    id: 'buyer-uuid',
    email: 'buyer@example.com',
    is_platform_admin: false,
    status: 'ACTIVE',
    deleted_at: null,
  };

  it('prohibits blocking or suspending root SuperAdmin', () => {
    const res = validateProfileMutation(rootAdmin, { status: 'BLOCKED' });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('Cannot block or suspend root SuperAdmin');
  });

  it('prohibits revoking is_platform_admin from root SuperAdmin', () => {
    const res = validateProfileMutation(rootAdmin, { is_platform_admin: false });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('Cannot revoke is_platform_admin');
  });

  it('prohibits soft-deleting root SuperAdmin', () => {
    const res = validateProfileMutation(rootAdmin, { deleted_at: new Date().toISOString() });
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('Cannot soft-delete root SuperAdmin');
  });

  it('allows administrative status updates on normal users', () => {
    const res = validateProfileMutation(normalBuyer, { status: 'BLOCKED' });
    expect(res.allowed).toBe(true);
  });
});
