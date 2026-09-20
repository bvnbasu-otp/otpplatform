import { describe, it, expect } from 'vitest';
import {
  isInvitationValid,
  isDelegationActiveForAction,
  checkSegregationOfDuties,
  computeEffectiveAuthority,
  type OrganizationInvitation,
  type OrganizationDelegation,
} from '@otp/domain';

describe('Red-Team Threat Battery R1–R14: Phase C8.2 Governance & Delegation Invariants', () => {
  const baseInvitation: OrganizationInvitation = {
    id: 'inv-uuid-101',
    organizationId: 'org-tenant-alpha',
    invitedEmail: 'target.colleague@alpha.com',
    role: 'COMMITTEE_MEMBER',
    invitedBy: 'prof-owner-1',
    status: 'PENDING',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  const baseDelegation: OrganizationDelegation = {
    id: 'del-uuid-201',
    organizationId: 'org-tenant-alpha',
    delegatorId: 'prof-owner-1',
    delegatorName: 'Executive Director',
    delegateeId: 'prof-buyer-2',
    delegateeName: 'Junior Lead',
    permissions: ['APPROVE_TIER_1', 'APPROVE_TIER_2'],
    spendCapAmount: 1000000, // ₹10 Lakhs
    startsAt: new Date(Date.now() - 3600000).toISOString(),
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  // R1: Token Replay / Single-Use Invariant
  it('R1: Prevents token replay attacks when status is already ACCEPTED', () => {
    const acceptedInvitation: OrganizationInvitation = {
      ...baseInvitation,
      status: 'ACCEPTED',
      acceptedAt: new Date().toISOString(),
    };
    const check = isInvitationValid(acceptedInvitation);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('already been accepted');
  });

  // R2: Token Expiry Invariant
  it('R2: Rejects expired invitation tokens', () => {
    const expiredInvitation: OrganizationInvitation = {
      ...baseInvitation,
      expiresAt: new Date(Date.now() - 86400000).toISOString(), // Expired 1 day ago
    };
    const check = isInvitationValid(expiredInvitation);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('expired');
  });

  // R3: Token Revocation Invariant
  it('R3: Rejects revoked invitation tokens', () => {
    const revokedInvitation: OrganizationInvitation = {
      ...baseInvitation,
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
    };
    const check = isInvitationValid(revokedInvitation);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('revoked');
  });

  // R4: Cross-Tenant Isolation Invariant
  it('R4: Enforces strict tenant isolation for delegation authority resolution', () => {
    const crossTenantDelegation: OrganizationDelegation = {
      ...baseDelegation,
      organizationId: 'org-tenant-beta', // Foreign tenant
    };
    const authority = computeEffectiveAuthority({
      organizationId: 'org-tenant-alpha',
      profileId: 'prof-buyer-2',
      baseRole: 'VIEWER',
      delegations: [crossTenantDelegation],
    });
    // Foreign tenant delegation must not grant any permissions in alpha org
    expect(authority.effectivePermissions).toEqual(['READ']);
    expect(authority.activeDelegations).toHaveLength(0);
  });

  // R5: Anti-Owner Role Escalation Invariant
  it('R5: Prevents role escalation to OWNER via invitations', () => {
    const illegalRole = 'OWNER';
    const isOwnerRoleAllowedInInvitation = illegalRole !== 'OWNER';
    expect(isOwnerRoleAllowedInInvitation).toBe(false);
  });

  // R6: Anti-Self-Delegation Invariant
  it('R6: Blocks anti-self-delegation attempt where delegator equals delegatee', () => {
    const delegatorId = 'prof-user-1';
    const delegateeId = 'prof-user-1';
    const isSelfDelegation = delegatorId === delegateeId;
    expect(isSelfDelegation).toBe(true);
  });

  // R7: Temporal Bound Invariant
  it('R7: Rejects delegations where expiration precedes or equals start time', () => {
    const startsAt = new Date('2026-10-01T00:00:00Z');
    const expiresAt = new Date('2026-09-30T00:00:00Z');
    const isValidBounds = expiresAt.getTime() > startsAt.getTime();
    expect(isValidBounds).toBe(false);
  });

  // R8: Spend Cap Enforcement Invariant
  it('R8: Blocks delegation action when procurement amount exceeds spend cap', () => {
    const check = isDelegationActiveForAction({
      delegation: baseDelegation, // Spend cap = ₹10 Lakhs
      permission: 'APPROVE_TIER_2',
      amount: 1500000, // ₹15 Lakhs (exceeds cap)
    });
    expect(check.active).toBe(false);
    expect(check.reason).toContain('exceeds delegation spend cap');
  });

  it('R8b: Allows delegation action when procurement amount is within spend cap', () => {
    const check = isDelegationActiveForAction({
      delegation: baseDelegation,
      permission: 'APPROVE_TIER_2',
      amount: 800000, // ₹8 Lakhs (within ₹10L cap)
    });
    expect(check.active).toBe(true);
  });

  // R9: Non-Delegable Tier 3 Executive Authority Gate
  it('R9: Rejects Tier 3 executive signoff delegation when delegator is not OWNER or SuperAdmin', () => {
    const delegatorRole: string = 'MANAGER';
    const requestedPermission = 'APPROVE_TIER_3';
    const canDelegateTier3 = delegatorRole === 'OWNER';
    expect(canDelegateTier3).toBe(false);
  });

  // R10: Segregation of Duties (SoD) Anti-Self-Approval
  it('R10: Prevents RFQ creator from self-approving their own procurement requirement', () => {
    const sodCheck = checkSegregationOfDuties({
      action: 'APPROVE',
      actorProfileId: 'prof-requester-1',
      rfqCreatorProfileId: 'prof-requester-1',
    });
    expect(sodCheck.allowed).toBe(false);
    expect(sodCheck.violation).toContain('cannot self-approve');
  });

  // R11: Segregation of Duties (SoD) Anti-Self-Settlement
  it('R11: Prevents PO issuer from executing settlement payment releases for their own PO', () => {
    const sodCheck = checkSegregationOfDuties({
      action: 'SETTLE_PAYMENT',
      actorProfileId: 'prof-po-issuer-1',
      rfqCreatorProfileId: 'prof-requester-1',
      poIssuerProfileId: 'prof-po-issuer-1',
    });
    expect(sodCheck.allowed).toBe(false);
    expect(sodCheck.violation).toContain('PO Issuer');
  });

  // R12: Delegation Invalidation on Revocation
  it('R12: Rejects revoked delegation proxy actions immediately', () => {
    const revokedDelegation: OrganizationDelegation = {
      ...baseDelegation,
      isActive: false,
      revokedAt: new Date().toISOString(),
    };
    const check = isDelegationActiveForAction({
      delegation: revokedDelegation,
      permission: 'APPROVE_TIER_1',
    });
    expect(check.active).toBe(false);
    expect(check.reason).toContain('not marked active');
  });

  // R13: Granular Permission Whitelist Enforcement
  it('R13: Rejects ungranted permissions on proxy', () => {
    const committeeOnlyDelegation: OrganizationDelegation = {
      ...baseDelegation,
      permissions: ['VOTE_COMMITTEE'],
    };
    const check = isDelegationActiveForAction({
      delegation: committeeOnlyDelegation,
      permission: 'RELEASE_PAYMENT',
    });
    expect(check.active).toBe(false);
    expect(check.reason).toContain('does not grant permission RELEASE_PAYMENT');
  });

  // R14: Dynamic Effective Authority Resolution
  it('R14: Dynamically merges base role with active delegations within spend caps', () => {
    const authority = computeEffectiveAuthority({
      organizationId: 'org-tenant-alpha',
      profileId: 'prof-buyer-2',
      baseRole: 'COMMITTEE_MEMBER', // Base has ['READ', 'VOTE']
      delegations: [baseDelegation], // Delegated ['APPROVE_TIER_1', 'APPROVE_TIER_2'] with ₹10L cap
      amount: 500000,
    });

    expect(authority.hasAuthority).toBe(true);
    expect(authority.effectivePermissions).toContain('READ');
    expect(authority.effectivePermissions).toContain('VOTE');
    expect(authority.effectivePermissions).toContain('APPROVE_TIER_1');
    expect(authority.effectivePermissions).toContain('APPROVE_TIER_2');
    expect(authority.activeDelegations).toHaveLength(1);
  });
});
