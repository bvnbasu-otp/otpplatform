/**
 * OTP: Universal RWA + MSME Role Lifecycle, Succession, Term Expiry & Annual Renewal
 *
 * Core Governance Principles & Invariants:
 *   1. "Role ≠ Person" and "Current Role Holder ≠ Historical Role Holder"
 *   2. "Role continuity without person continuity":
 *      - Organization and role continue; authority follows current authorized role holder.
 *      - Person remains immutable historical actor for past actions.
 *   3. Universal across ALL roles without hard-coding specific roles:
 *      - RWA: President, Vice President, Secretary, Joint Secretary, Treasurer, Estate Manager, Committee Member.
 *      - MSME: Primary MSME / Owner, Manager, Member, Delegate, etc.
 *   4. Universal Effective-Dated Role Assignment with default 1-year (365 days) term expiry.
 *   5. Universal Historical Audit Attribution with append-only immutable ledger.
 *   6. Expired / non-renewed roles strictly have all RWA voting, committee authority,
 *      spend approval, and PO/payment powers FORBIDDEN / REVOKED.
 *   7. Role Renewal & Rotation workflow (Continue? -> Retain vs Rotate vs Exit).
 *   8. Strict Scoping: No cross-role or cross-organization authority leakage.
 */

import type { OrganizationDelegation, DelegationPermission } from './buyer-governance';

export type UniversalRoleCategory = 'RWA_GOVERNANCE' | 'MSME_MANAGEMENT' | 'CUSTOM_GOVERNANCE';

export type UniversalRoleStatus =
  | 'ACTIVE'
  | 'REVOKED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'ROTATED'
  | 'RETIRED'
  | 'VACANT';

export type ResponsibilityScope =
  | 'EXECUTIVE'
  | 'FINANCIAL'
  | 'SECRETARIAL'
  | 'OPERATIONS'
  | 'GENERAL'
  | 'PROCUREMENT'
  | 'AUDIT';

export interface RoleAuthorityScope {
  permissions: string[];
  spendCapAmount?: number | null;
  maxApprovalTier?: 'TIER_1_MANAGER' | 'TIER_2_DEPT_HEAD' | 'TIER_3_EXECUTIVE' | null;
  canVote?: boolean;
  canIssuePo?: boolean;
  canReleasePayment?: boolean;
  canAppointRoles?: boolean;
  canDelegate?: boolean;
  [key: string]: unknown;
}

export interface OrgRoleAssignment {
  id: string;
  organizationId: string;
  personId?: string | null;
  personName?: string | null;
  personEmail?: string | null;
  roleId: string;
  roleName: string;
  roleCategory: UniversalRoleCategory;
  responsibilityScope: ResponsibilityScope | string;
  authorityScope: RoleAuthorityScope;
  effectiveFrom: string;
  effectiveTo?: string | null;
  termDurationDays?: number;
  status: UniversalRoleStatus;
  appointedBy?: string | null;
  appointedByName?: string | null;
  appointmentEvent: string;
  predecessorAssignmentId?: string | null;
  removalEvent?: string | null;
  removalReason?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface OrgGovernanceActionAudit {
  id: string;
  actorPersonId: string;
  actorPersonName?: string | null;
  organizationId: string;
  roleAssignmentId?: string | null;
  roleAtTime: string;
  responsibilityAtTime: string;
  authorityAtTime: RoleAuthorityScope | Record<string, unknown>;
  action: string;
  entityType: string;
  entityId: string;
  transactionId?: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface RoleSuccessionTransition {
  organizationId: string;
  roleId: string;
  roleName: string;
  predecessorAssignmentId?: string | null;
  predecessorPersonId?: string | null;
  predecessorPersonName?: string | null;
  successorAssignmentId: string;
  successorPersonId?: string | null;
  successorPersonName?: string | null;
  effectiveDate: string;
  effectiveTo?: string | null;
  termDurationDays?: number;
  successionEvent: string;
  reason: string;
  predecessorNewRole?: string | null;
}

export type RoleRenewalDecision = 'RENEW_SAME_ROLE' | 'ROTATE_NEW_ROLE' | 'EXIT_GOVERNANCE';

export interface RoleRenewalParams {
  assignmentId: string;
  continueInGovernance: boolean;
  renewalRoleId?: string;
  renewalRoleName?: string;
  termDurationDays?: number;
  effectiveDate?: string;
  notes?: string;
}

export interface RoleRenewalResult {
  ok: boolean;
  action: 'RENEWED' | 'ROTATED' | 'RETIRED';
  oldAssignmentId: string;
  newAssignmentId?: string | null;
  personId?: string | null;
  roleId: string;
  roleName: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  termDurationDays?: number;
  message: string;
}

export interface RoleHistoryItem {
  id: string;
  organizationId: string;
  personId?: string | null;
  personName?: string | null;
  personEmail?: string | null;
  roleId: string;
  roleName: string;
  roleCategory: UniversalRoleCategory;
  responsibilityScope: string;
  authorityScope: RoleAuthorityScope;
  effectiveFrom: string;
  effectiveTo?: string | null;
  termDurationDays?: number;
  status: UniversalRoleStatus;
  appointedBy?: string | null;
  appointedByName?: string | null;
  appointmentEvent: string;
  predecessorAssignmentId?: string | null;
  removalEvent?: string | null;
  removalReason?: string | null;
  createdAt: string;
}

/**
 * Standard Catalog Template definitions for RWA and MSME roles.
 * Includes explicit Estate Manager alongside President, VP, Secretary, Joint Secretary, Treasurer, Committee Member.
 */
export const STANDARD_GOVERNANCE_ROLE_TEMPLATES: Record<
  string,
  {
    roleId: string;
    roleName: string;
    roleCategory: UniversalRoleCategory;
    responsibilityScope: ResponsibilityScope;
    defaultTermDays: number;
    defaultAuthority: RoleAuthorityScope;
  }
> = {
  // RWA Roles
  PRESIDENT: {
    roleId: 'PRESIDENT',
    roleName: 'President',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'EXECUTIVE',
    defaultTermDays: 365,
    defaultAuthority: {
      permissions: [
        'READ',
        'WRITE',
        'PROPOSE',
        'VOTE',
        'APPROVE_TIER_1',
        'APPROVE_TIER_2',
        'APPROVE_TIER_3',
        'ISSUE_PO',
        'RELEASE_PAYMENT',
        'MANAGE_MEMBERS',
        'DELEGATE_AUTHORITY',
      ],
      maxApprovalTier: 'TIER_3_EXECUTIVE',
      canVote: true,
      canIssuePo: true,
      canReleasePayment: true,
      canAppointRoles: true,
      canDelegate: true,
    },
  },
  VICE_PRESIDENT: {
    roleId: 'VICE_PRESIDENT',
    roleName: 'Vice President',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'EXECUTIVE',
    defaultTermDays: 365,
    defaultAuthority: {
      permissions: [
        'READ',
        'WRITE',
        'PROPOSE',
        'VOTE',
        'APPROVE_TIER_1',
        'APPROVE_TIER_2',
        'MANAGE_MEMBERS',
        'DELEGATE_AUTHORITY',
      ],
      maxApprovalTier: 'TIER_2_DEPT_HEAD',
      canVote: true,
      canIssuePo: true,
      canReleasePayment: false,
      canAppointRoles: false,
      canDelegate: true,
    },
  },
  SECRETARY: {
    roleId: 'SECRETARY',
    roleName: 'Secretary',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'SECRETARIAL',
    defaultTermDays: 365,
    defaultAuthority: {
      permissions: [
        'READ',
        'WRITE',
        'PROPOSE',
        'VOTE',
        'APPROVE_TIER_1',
        'APPROVE_TIER_2',
        'MANAGE_MEMBERS',
      ],
      maxApprovalTier: 'TIER_2_DEPT_HEAD',
      canVote: true,
      canIssuePo: true,
      canReleasePayment: false,
      canAppointRoles: false,
      canDelegate: true,
    },
  },
  JOINT_SECRETARY: {
    roleId: 'JOINT_SECRETARY',
    roleName: 'Joint Secretary',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'SECRETARIAL',
    defaultTermDays: 365,
    defaultAuthority: {
      permissions: ['READ', 'WRITE', 'PROPOSE', 'VOTE', 'APPROVE_TIER_1'],
      maxApprovalTier: 'TIER_1_MANAGER',
      canVote: true,
      canIssuePo: false,
      canReleasePayment: false,
      canAppointRoles: false,
      canDelegate: false,
    },
  },
  TREASURER: {
    roleId: 'TREASURER',
    roleName: 'Treasurer',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'FINANCIAL',
    defaultTermDays: 365,
    defaultAuthority: {
      permissions: [
        'READ',
        'PROPOSE',
        'VOTE',
        'APPROVE_TIER_1',
        'APPROVE_TIER_2',
        'RELEASE_PAYMENT',
        'FINANCIAL_AUDIT',
      ],
      maxApprovalTier: 'TIER_2_DEPT_HEAD',
      canVote: true,
      canIssuePo: false,
      canReleasePayment: true,
      canAppointRoles: false,
      canDelegate: true,
    },
  },
  ESTATE_MANAGER: {
    roleId: 'ESTATE_MANAGER',
    roleName: 'Estate Manager',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'OPERATIONS',
    defaultTermDays: 365,
    defaultAuthority: {
      permissions: [
        'READ',
        'WRITE',
        'PROPOSE',
        'APPROVE_TIER_1',
        'ISSUE_PO',
        'VERIFY_DELIVERY',
        'FACILITIES_MANAGEMENT',
      ],
      maxApprovalTier: 'TIER_1_MANAGER',
      spendCapAmount: 500000,
      canVote: false, // Professional / Operational manager typically does not hold resident voting rights
      canIssuePo: true,
      canReleasePayment: false,
      canAppointRoles: false,
      canDelegate: false,
    },
  },
  COMMITTEE_MEMBER: {
    roleId: 'COMMITTEE_MEMBER',
    roleName: 'Committee Member',
    roleCategory: 'RWA_GOVERNANCE',
    responsibilityScope: 'GENERAL',
    defaultTermDays: 365,
    defaultAuthority: {
      permissions: ['READ', 'VOTE'],
      maxApprovalTier: null,
      canVote: true,
      canIssuePo: false,
      canReleasePayment: false,
      canAppointRoles: false,
      canDelegate: false,
    },
  },

  // MSME Roles
  PRIMARY_OWNER: {
    roleId: 'PRIMARY_OWNER',
    roleName: 'Primary MSME / Owner',
    roleCategory: 'MSME_MANAGEMENT',
    defaultTermDays: 365,
    responsibilityScope: 'EXECUTIVE',
    defaultAuthority: {
      permissions: [
        'READ',
        'WRITE',
        'PROPOSE',
        'VOTE',
        'APPROVE_TIER_1',
        'APPROVE_TIER_2',
        'APPROVE_TIER_3',
        'ISSUE_PO',
        'RELEASE_PAYMENT',
        'MANAGE_MEMBERS',
        'DELEGATE_AUTHORITY',
      ],
      maxApprovalTier: 'TIER_3_EXECUTIVE',
      canVote: true,
      canIssuePo: true,
      canReleasePayment: true,
      canAppointRoles: true,
      canDelegate: true,
    },
  },
  MANAGER: {
    roleId: 'MANAGER',
    roleName: 'Manager',
    roleCategory: 'MSME_MANAGEMENT',
    defaultTermDays: 365,
    responsibilityScope: 'OPERATIONS',
    defaultAuthority: {
      permissions: [
        'READ',
        'WRITE',
        'PROPOSE',
        'VOTE',
        'APPROVE_TIER_1',
        'APPROVE_TIER_2',
        'ISSUE_PO',
        'RELEASE_PAYMENT',
        'MANAGE_MEMBERS',
        'DELEGATE_AUTHORITY',
      ],
      maxApprovalTier: 'TIER_2_DEPT_HEAD',
      canVote: true,
      canIssuePo: true,
      canReleasePayment: true,
      canAppointRoles: false,
      canDelegate: true,
    },
  },
  MEMBER: {
    roleId: 'MEMBER',
    roleName: 'Member',
    roleCategory: 'MSME_MANAGEMENT',
    defaultTermDays: 365,
    responsibilityScope: 'GENERAL',
    defaultAuthority: {
      permissions: ['READ', 'WRITE', 'PROPOSE'],
      maxApprovalTier: null,
      canVote: false,
      canIssuePo: false,
      canReleasePayment: false,
      canAppointRoles: false,
      canDelegate: false,
    },
  },
  DELEGATE: {
    roleId: 'DELEGATE',
    roleName: 'Delegate',
    roleCategory: 'MSME_MANAGEMENT',
    defaultTermDays: 365,
    responsibilityScope: 'GENERAL',
    defaultAuthority: {
      permissions: ['READ', 'VOTE', 'APPROVE_TIER_1'],
      maxApprovalTier: 'TIER_1_MANAGER',
      spendCapAmount: 500000,
      canVote: true,
      canIssuePo: false,
      canReleasePayment: false,
      canAppointRoles: false,
      canDelegate: false,
    },
  },
};

/**
 * Calculates default 1-year (365 days) term expiry.
 */
export function calculateRoleDefaultTermExpiry(
  effectiveFrom: Date = new Date(),
  termDays = 365
): Date {
  const expiry = new Date(effectiveFrom.getTime() + termDays * 86400000);
  return expiry;
}

/**
 * Checks whether an active role assignment is expiring soon or already expired.
 */
export function isRoleExpiringSoon(
  assignment: OrgRoleAssignment,
  daysThreshold = 30,
  currentTime: Date = new Date()
): { expiring: boolean; daysLeft: number; isExpired: boolean } {
  if (!assignment.effectiveTo) {
    return { expiring: false, daysLeft: Infinity, isExpired: false };
  }

  const expTime = new Date(assignment.effectiveTo).getTime();
  const nowTime = currentTime.getTime();
  const diffDays = Math.ceil((expTime - nowTime) / 86400000);

  if (diffDays <= 0) {
    return { expiring: false, daysLeft: 0, isExpired: true };
  }

  return {
    expiring: diffDays <= daysThreshold,
    daysLeft: diffDays,
    isExpired: false,
  };
}

/**
 * Checks whether an OrgRoleAssignment is active at a specific point in time.
 * Automatically classifies expired roles as inactive.
 */
export function isRoleAssignmentActiveAt(
  assignment: OrgRoleAssignment,
  atTime: Date = new Date()
): boolean {
  if (assignment.status !== 'ACTIVE') {
    return false;
  }
  if (!assignment.personId) {
    return false; // Vacant role is not actively held
  }
  const from = new Date(assignment.effectiveFrom).getTime();
  const nowMs = atTime.getTime();

  if (nowMs < from) {
    return false;
  }

  if (assignment.effectiveTo) {
    const to = new Date(assignment.effectiveTo).getTime();
    if (nowMs >= to) {
      return false; // Automatically EXPIRED & forbidden
    }
  }

  return true;
}

/**
 * Pure verification of person authority within an organization at a given timestamp.
 * Evaluates direct role assignments and active delegations.
 * Expired roles are strictly forbidden from all voting, approvals, and PO releases.
 */
export function verifyPersonAuthorityAtTime(params: {
  organizationId: string;
  personId: string;
  permission: string;
  amount?: number | null;
  atTime?: Date;
  roleAssignments: OrgRoleAssignment[];
  delegations?: OrganizationDelegation[];
}): {
  authorized: boolean;
  roleAtTime: string;
  signatureMode: 'DIRECT' | 'DELEGATED' | 'NONE';
  assignmentId?: string | null;
  reason: string;
} {
  const {
    organizationId,
    personId,
    permission,
    amount,
    atTime = new Date(),
    roleAssignments,
    delegations = [],
  } = params;

  // 1. Direct role assignment check
  const activeAssignment = roleAssignments.find(
    (a) =>
      a.organizationId === organizationId &&
      a.personId === personId &&
      isRoleAssignmentActiveAt(a, atTime)
  );

  if (activeAssignment) {
    const hasPerm =
      activeAssignment.authorityScope.permissions.includes(permission) ||
      activeAssignment.authorityScope.permissions.includes('ALL') ||
      activeAssignment.authorityScope.permissions.includes('FULL_AUTHORITY');

    const spendCap = activeAssignment.authorityScope.spendCapAmount;
    const isAmountWithinCap = amount == null || spendCap == null || amount <= spendCap;

    if (hasPerm && isAmountWithinCap) {
      return {
        authorized: true,
        roleAtTime: activeAssignment.roleName,
        signatureMode: 'DIRECT',
        assignmentId: activeAssignment.id,
        reason: `Authorized directly via active role ${activeAssignment.roleName} (${activeAssignment.roleId}).`,
      };
    }
  }

  // 2. Active delegation check
  const activeDelegation = delegations.find((d) => {
    if (d.organizationId !== organizationId || d.delegateeId !== personId || !d.isActive || d.revokedAt) {
      return false;
    }
    const starts = new Date(d.startsAt).getTime();
    const expires = new Date(d.expiresAt).getTime();
    const nowMs = atTime.getTime();
    if (nowMs < starts || nowMs > expires) {
      return false;
    }
    const hasDelegatedPerm = d.permissions.includes(permission as DelegationPermission);
    const isSpendWithinCap = amount == null || d.spendCapAmount == null || amount <= d.spendCapAmount;
    return hasDelegatedPerm && isSpendWithinCap;
  });

  if (activeDelegation) {
    return {
      authorized: true,
      roleAtTime: 'DELEGATE',
      signatureMode: 'DELEGATED',
      assignmentId: null,
      reason: `Authorized via active delegation proxy from ${activeDelegation.delegatorName || activeDelegation.delegatorId} (Spend cap: ₹${activeDelegation.spendCapAmount?.toLocaleString('en-IN') ?? 'Uncapped'}).`,
    };
  }

  return {
    authorized: false,
    roleAtTime: activeAssignment?.roleName ?? 'NONE',
    signatureMode: 'NONE',
    assignmentId: activeAssignment?.id ?? null,
    reason: `Unauthorized: Person ${personId} does not possess permission '${permission}' in organization ${organizationId} at ${atTime.toISOString()} (role expired, vacant, or unassigned).`,
  };
}

/**
 * Validates role succession transition parameters.
 */
export function validateSuccessionTransition(params: {
  currentAssignment?: OrgRoleAssignment | null;
  successorPersonId?: string | null;
  effectiveDate?: Date;
  callerCanManage: boolean;
}): { valid: boolean; reason?: string } {
  const { currentAssignment, successorPersonId, callerCanManage } = params;

  if (!callerCanManage) {
    return {
      valid: false,
      reason: 'Unauthorized: Only an Organization Owner, Manager, or Platform Admin can execute a succession handover.',
    };
  }

  if (
    currentAssignment &&
    currentAssignment.personId &&
    successorPersonId &&
    currentAssignment.personId === successorPersonId
  ) {
    return {
      valid: false,
      reason: 'Redundant succession: Successor is already the active holder of this role.',
    };
  }

  return { valid: true };
}

/**
 * Evaluates annual renewal or role rotation pure transitions.
 */
export function evaluateRoleRenewalTransition(params: {
  currentAssignment: OrgRoleAssignment;
  continueInGovernance: boolean;
  renewalRoleId?: string;
  termDays?: number;
  effectiveDate?: Date;
}): {
  decision: RoleRenewalDecision;
  isRotation: boolean;
  targetRoleId: string;
  targetRoleName: string;
  newEffectiveFrom: string;
  newEffectiveTo: string | null;
} {
  const {
    currentAssignment,
    continueInGovernance,
    renewalRoleId,
    termDays = 365,
    effectiveDate = new Date(),
  } = params;

  if (!continueInGovernance) {
    return {
      decision: 'EXIT_GOVERNANCE',
      isRotation: false,
      targetRoleId: currentAssignment.roleId,
      targetRoleName: currentAssignment.roleName,
      newEffectiveFrom: currentAssignment.effectiveFrom,
      newEffectiveTo: effectiveDate.toISOString(),
    };
  }

  const targetRoleId = renewalRoleId || currentAssignment.roleId;
  const isRotation = targetRoleId !== currentAssignment.roleId;
  const template = STANDARD_GOVERNANCE_ROLE_TEMPLATES[targetRoleId];
  const targetRoleName = template?.roleName || targetRoleId;

  const expiry = new Date(effectiveDate.getTime() + termDays * 86400000);

  return {
    decision: isRotation ? 'ROTATE_NEW_ROLE' : 'RENEW_SAME_ROLE',
    isRotation,
    targetRoleId,
    targetRoleName,
    newEffectiveFrom: effectiveDate.toISOString(),
    newEffectiveTo: expiry.toISOString(),
  };
}

/**
 * Constructs an immutable Governance Action Audit Snapshot.
 */
export function createGovernanceAuditSnapshot(params: {
  id?: string;
  actorPersonId: string;
  actorPersonName?: string | null;
  organizationId: string;
  roleAssignment?: OrgRoleAssignment | null;
  roleAtTime?: string;
  responsibilityAtTime?: string;
  action: string;
  entityType: string;
  entityId: string;
  transactionId?: string | null;
  payload?: Record<string, unknown>;
  timestamp?: Date;
}): OrgGovernanceActionAudit {
  const {
    id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    actorPersonId,
    actorPersonName,
    organizationId,
    roleAssignment,
    roleAtTime,
    responsibilityAtTime,
    action,
    entityType,
    entityId,
    transactionId,
    payload = {},
    timestamp = new Date(),
  } = params;

  return {
    id,
    actorPersonId,
    actorPersonName: actorPersonName ?? null,
    organizationId,
    roleAssignmentId: roleAssignment?.id ?? null,
    roleAtTime: roleAtTime ?? roleAssignment?.roleName ?? 'MEMBER',
    responsibilityAtTime: responsibilityAtTime ?? roleAssignment?.responsibilityScope ?? 'GENERAL',
    authorityAtTime: roleAssignment?.authorityScope ?? {},
    action,
    entityType,
    entityId,
    transactionId: transactionId ?? null,
    payload,
    timestamp: timestamp.toISOString(),
  };
}
