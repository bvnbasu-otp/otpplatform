/**
 * OTP Phase C8.1: Buyer Organization Governance, Delegation & Invitations Domain Model
 *
 * Provides domain models, types, and pure evaluation engines for:
 *   1. Tokenized single-use organization invitations with SHA-256 validation.
 *   2. Time and spend-bounded delegation proxies with anti-bypass invariants.
 *   3. Segregation of duties (SoD) verification matrix.
 *   4. Multi-tier effective authority resolution.
 */

export type OrgInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export type DelegationPermission =
  | 'APPROVE_TIER_1'
  | 'APPROVE_TIER_2'
  | 'APPROVE_TIER_3'
  | 'VOTE_COMMITTEE'
  | 'ISSUE_PO'
  | 'RELEASE_PAYMENT';

export const DELEGATION_PERMISSIONS: readonly DelegationPermission[] = [
  'APPROVE_TIER_1',
  'APPROVE_TIER_2',
  'APPROVE_TIER_3',
  'VOTE_COMMITTEE',
  'ISSUE_PO',
  'RELEASE_PAYMENT',
] as const;

export interface OrganizationInvitation {
  id: string;
  organizationId: string;
  invitedEmail: string;
  role: string;
  invitedBy: string;
  invitedByName?: string | null;
  status: OrgInvitationStatus;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  token?: string; // Only returned on creation
  inviteUrl?: string;
}

export interface OrganizationDelegation {
  id: string;
  organizationId: string;
  delegatorId: string;
  delegatorName?: string | null;
  delegatorEmail?: string | null;
  delegateeId: string;
  delegateeName?: string | null;
  delegateeEmail?: string | null;
  permissions: DelegationPermission[];
  spendCapAmount?: number | null;
  startsAt: string;
  expiresAt: string;
  isActive: boolean;
  revokedAt?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface EffectiveAuthority {
  hasAuthority: boolean;
  organizationId: string;
  profileId: string;
  baseRole: string;
  effectivePermissions: string[];
  activeDelegations: Array<{
    delegationId: string;
    delegatorId: string;
    permissions: DelegationPermission[];
    spendCapAmount?: number | null;
    startsAt: string;
    expiresAt: string;
    notes?: string | null;
  }>;
}

/**
 * Validates if an organization invitation token is currently valid and usable.
 */
export function isInvitationValid(invitation: OrganizationInvitation, currentTime = new Date()): {
  valid: boolean;
  reason?: string;
} {
  if (invitation.status === 'ACCEPTED') {
    return { valid: false, reason: 'This invitation has already been accepted.' };
  }
  if (invitation.status === 'REVOKED') {
    return { valid: false, reason: 'This invitation has been revoked.' };
  }
  const expiry = new Date(invitation.expiresAt);
  if (expiry.getTime() <= currentTime.getTime() || invitation.status === 'EXPIRED') {
    return { valid: false, reason: 'This invitation has expired.' };
  }
  return { valid: true };
}

/**
 * Validates whether a delegation proxy is currently active for a specific permission and spend amount.
 */
export function isDelegationActiveForAction(params: {
  delegation: OrganizationDelegation;
  permission: DelegationPermission;
  amount?: number | null;
  currentTime?: Date;
}): { active: boolean; reason?: string } {
  const { delegation, permission, amount, currentTime = new Date() } = params;

  if (!delegation.isActive) {
    return { active: false, reason: 'Delegation is not marked active.' };
  }

  if (delegation.revokedAt) {
    return { active: false, reason: 'Delegation has been revoked.' };
  }

  const starts = new Date(delegation.startsAt);
  const expires = new Date(delegation.expiresAt);
  const nowTime = currentTime.getTime();

  if (nowTime < starts.getTime()) {
    return { active: false, reason: 'Delegation validity period has not started yet.' };
  }

  if (nowTime > expires.getTime()) {
    return { active: false, reason: 'Delegation validity period has expired.' };
  }

  if (!delegation.permissions.includes(permission)) {
    return {
      active: false,
      reason: `Delegation does not grant permission ${permission}. Granted: [${delegation.permissions.join(', ')}]`,
    };
  }

  if (amount != null && delegation.spendCapAmount != null && amount > delegation.spendCapAmount) {
    return {
      active: false,
      reason: `Procurement amount ₹${amount.toLocaleString('en-IN')} exceeds delegation spend cap of ₹${delegation.spendCapAmount.toLocaleString('en-IN')}.`,
    };
  }

  return { active: true };
}

/**
 * Pure Segregation of Duties (SoD) Validator:
 * Prevents operational conflicts (e.g. Requester cannot approve, Approver cannot settle, Auditor is strictly read-only).
 */
export function checkSegregationOfDuties(params: {
  action: 'PROPOSE' | 'APPROVE' | 'VOTE' | 'ISSUE_PO' | 'SETTLE_PAYMENT';
  actorProfileId: string;
  rfqCreatorProfileId: string;
  poIssuerProfileId?: string | null;
  assignedApproverProfileIds?: string[];
}): { allowed: boolean; violation?: string } {
  const { action, actorProfileId, rfqCreatorProfileId, poIssuerProfileId } = params;

  // 1. Anti-Self-Approval: Requester cannot approve or issue PO for their own RFQ
  if (action === 'APPROVE' || action === 'ISSUE_PO') {
    if (actorProfileId === rfqCreatorProfileId) {
      return {
        allowed: false,
        violation: `Segregation of Duties Violation: Requester (${actorProfileId}) cannot self-approve or issue PO for RFQ.`,
      };
    }
  }

  // 2. Anti-Self-Settlement: PO Issuer cannot execute settlement release for their own issued PO
  if (action === 'SETTLE_PAYMENT' && poIssuerProfileId && actorProfileId === poIssuerProfileId) {
    return {
      allowed: false,
      violation: `Segregation of Duties Violation: PO Issuer (${actorProfileId}) cannot execute settlement payment release.`,
    };
  }

  return { allowed: true };
}

/**
 * Resolves combined authority for a user by merging base role and active delegation proxies.
 */
export function computeEffectiveAuthority(params: {
  organizationId: string;
  profileId: string;
  baseRole: string;
  delegations: OrganizationDelegation[];
  amount?: number | null;
  currentTime?: Date;
}): EffectiveAuthority {
  const { organizationId, profileId, baseRole, delegations, amount, currentTime = new Date() } = params;

  let basePerms: string[] = ['READ'];
  if (baseRole === 'OWNER') {
    basePerms = ['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE_TIER_1', 'APPROVE_TIER_2', 'APPROVE_TIER_3', 'ISSUE_PO', 'RELEASE_PAYMENT', 'MANAGE_MEMBERS', 'DELEGATE_AUTHORITY'];
  } else if (baseRole === 'MANAGER') {
    basePerms = ['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE_TIER_1', 'APPROVE_TIER_2', 'ISSUE_PO', 'RELEASE_PAYMENT', 'MANAGE_MEMBERS', 'DELEGATE_AUTHORITY'];
  } else if (baseRole === 'BUYER') {
    basePerms = ['READ', 'WRITE', 'PROPOSE', 'APPROVE_TIER_1'];
  } else if (baseRole === 'APPROVER') {
    basePerms = ['READ', 'APPROVE_TIER_1', 'APPROVE_TIER_2'];
  } else if (baseRole === 'COMMITTEE_MEMBER') {
    basePerms = ['READ', 'VOTE'];
  }

  const effectivePermsSet = new Set<string>(basePerms);
  const activeDelegationsList: EffectiveAuthority['activeDelegations'] = [];

  for (const del of delegations) {
    if (del.delegateeId === profileId && del.organizationId === organizationId) {
      const activeCheck = isDelegationActiveForAction({
        delegation: del,
        permission: del.permissions[0] ?? 'APPROVE_TIER_1',
        amount,
        currentTime,
      });

      // Check each permission in delegation against spend cap and time bounds
      const isTimeActive = del.isActive && !del.revokedAt &&
        currentTime.getTime() >= new Date(del.startsAt).getTime() &&
        currentTime.getTime() <= new Date(del.expiresAt).getTime();

      const isSpendWithinCap = amount == null || del.spendCapAmount == null || amount <= del.spendCapAmount;

      if (isTimeActive && isSpendWithinCap) {
        for (const p of del.permissions) {
          effectivePermsSet.add(p);
        }
        activeDelegationsList.push({
          delegationId: del.id,
          delegatorId: del.delegatorId,
          permissions: del.permissions,
          spendCapAmount: del.spendCapAmount,
          startsAt: del.startsAt,
          expiresAt: del.expiresAt,
          notes: del.notes,
        });
      }
    }
  }

  return {
    hasAuthority: true,
    organizationId,
    profileId,
    baseRole,
    effectivePermissions: Array.from(effectivePermsSet),
    activeDelegations: activeDelegationsList,
  };
}
