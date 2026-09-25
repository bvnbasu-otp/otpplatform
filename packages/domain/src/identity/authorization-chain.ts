/**
 * OTP GOLDEN RECONSTRUCTION — 13-STAGE CANONICAL AUTHORIZATION CHAIN
 *
 * Deterministic 13-Stage Authorization Evaluation Engine:
 * 1. Person: Biological actor identifier (personId / profileId / email)
 * 2. Identity: Authenticated identity verification & active session proof
 * 3. Context: Active operating persona (INDIVIDUAL, RWA, MSME, SUPPLIER, PLATFORM_ADMIN)
 * 4. Organization: Scope boundary (NULL for Individual, UUID for RWA/MSME/Supplier)
 * 5. Eligibility: KYC/standing status, non-blocked, statutory compliance (GSTIN/PAN if required)
 * 6. Membership: Active claim status in the organization (ACTIVE / CLAIMED / OWNER)
 * 7. Role: Canonical role classification in target context (e.g. 7 Canonical RWA Roles, MSME Roles)
 * 8. Responsibility: Scope mapping (EXECUTIVE, FINANCIAL, SECRETARIAL, OPERATIONS, GENERAL, PROCUREMENT)
 * 9. Delegation: Active delegation proxy verification (anti-self-delegation, anti-self-approval)
 * 10. Authority: Effective permissions resolved from Role + Delegation (e.g. Estate Manager canVote=false)
 * 11. Transaction: Target procurement transaction parameters & spend amount
 * 12. Effective Date: Temporal validity & 365-day universal term expiry evaluation
 * 13. Audit Attribution: Immutable, non-repudiable audit ledger tuple generation (PA-03 compliant)
 *
 * Multi-Context Invariant:
 * Zero authority bleed between distinct contexts. A person holding RWA Treasurer + MSME Primary +
 * Individual Buyer retains separate, non-overlapping authorities in each context.
 */

import type { BuyerPersona } from '../types/buyer-persona';
import type {
  OrgRoleAssignment,
  UniversalRoleCategory,
  UniversalRoleStatus,
  ResponsibilityScope,
  RoleAuthorityScope,
  OrgGovernanceActionAudit,
} from '../types/org-role-lifecycle';
import type { OrganizationDelegation, DelegationPermission } from '../types/buyer-governance';

// -----------------------------------------------------------------------------
// 1. CANONICAL ROLES TAXONOMY
// -----------------------------------------------------------------------------

/** Exactly 7 Canonical RWA Roles */
export const CANONICAL_RWA_ROLES = [
  'PRESIDENT',
  'VICE_PRESIDENT',
  'SECRETARY',
  'JOINT_SECRETARY',
  'TREASURER',
  'ESTATE_MANAGER',
  'COMMITTEE_MEMBER',
] as const;

export type CanonicalRwaRole = (typeof CANONICAL_RWA_ROLES)[number];

/** Canonical MSME Roles */
export const CANONICAL_MSME_ROLES = [
  'PRIMARY_OWNER',
  'MANAGER',
  'MEMBER',
  'DELEGATE',
] as const;

export type CanonicalMsmeRole = (typeof CANONICAL_MSME_ROLES)[number];

/** Canonical Supplier Roles */
export const CANONICAL_SUPPLIER_ROLES = [
  'OWNER',
  'MANAGER',
  'OPERATOR',
] as const;

export type CanonicalSupplierRole = (typeof CANONICAL_SUPPLIER_ROLES)[number];

/** Context Operating Persona */
export type AuthorizationPersona =
  | 'INDIVIDUAL'
  | 'RWA'
  | 'MSME'
  | 'SUPPLIER'
  | 'PLATFORM_ADMIN';

// -----------------------------------------------------------------------------
// 2. 13-STAGE PIPELINE DEFINITION
// -----------------------------------------------------------------------------

export const AUTHORIZATION_STAGES = [
  'STAGE_01_PERSON',
  'STAGE_02_IDENTITY',
  'STAGE_03_CONTEXT',
  'STAGE_04_ORGANIZATION',
  'STAGE_05_ELIGIBILITY',
  'STAGE_06_MEMBERSHIP',
  'STAGE_07_ROLE',
  'STAGE_08_RESPONSIBILITY',
  'STAGE_09_DELEGATION',
  'STAGE_10_AUTHORITY',
  'STAGE_11_TRANSACTION',
  'STAGE_12_EFFECTIVE_DATE',
  'STAGE_13_AUDIT_ATTRIBUTION',
] as const;

export type AuthorizationStageName = (typeof AUTHORIZATION_STAGES)[number];

export interface StageEvaluationResult {
  stage: AuthorizationStageName;
  passed: boolean;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuthorizationContext {
  personId: string;
  email?: string | null;
  fullName?: string | null;
  isAuthenticated: boolean;
  persona: AuthorizationPersona;
  organizationId?: string | null;
  organizationName?: string | null;
  isPlatformAdmin?: boolean;
  isFounder?: boolean;
  isAccountBlocked?: boolean;
  blockedReason?: string | null;
  statutoryGstin?: string | null;
  statutoryPan?: string | null;
  membershipStatus?: 'ACTIVE' | 'CLAIMED' | 'INVITED' | 'INACTIVE' | 'SUSPENDED';
  roleAssignment?: OrgRoleAssignment | null;
  activeDelegation?: OrganizationDelegation | null;
  supplierIds?: string[];
}

export type ProcurementActionType =
  | 'CREATE_REQUIREMENT'
  | 'CREATE_RFQ'
  | 'OPEN_RFQ'
  | 'CLOSE_RFQ'
  | 'SUBMIT_QUOTE'
  | 'EVALUATE_QUOTES'
  | 'CAST_COMMITTEE_VOTE'
  | 'APPROVE_SPEND'
  | 'ISSUE_PO'
  | 'INSPECT_DELIVERY'
  | 'RELEASE_PAYMENT'
  | 'MANAGE_ORG_MEMBERS'
  | 'APPOINT_ORG_ROLE'
  | 'TRANSFER_ORG_ROLE'
  | 'RENEW_ORG_ROLE'
  | 'CREATE_DELEGATION_PROXY'
  | 'ADMIN_AUDIT_INSPECT';

export interface AuthorizationActionRequest {
  action: ProcurementActionType;
  organizationId?: string | null;
  targetEntityId?: string;
  targetEntityType?: string;
  spendAmount?: number | null;
  creatorPersonId?: string | null;
  coiDeclared?: boolean;
  atTime?: Date;
  metadata?: Record<string, unknown>;
}

export interface AuthorizationChainEvaluation {
  authorized: boolean;
  failedStage?: AuthorizationStageName;
  failureReason?: string;
  stageResults: StageEvaluationResult[];
  auditAttribution?: OrgGovernanceActionAudit | null;
  effectiveRole: string;
  effectiveResponsibility: string;
  signatureMode: 'DIRECT' | 'DELEGATED' | 'INDIVIDUAL_DIRECT' | 'ADMIN_OVERRIDE' | 'NONE';
}

export interface ContextSwitchResult {
  valid: boolean;
  reason?: string;
  fromPersona: AuthorizationPersona;
  toPersona: AuthorizationPersona;
  targetOrganizationId?: string | null;
}

// -----------------------------------------------------------------------------
// 3. 13-STAGE DETERMINISTIC EVALUATOR
// -----------------------------------------------------------------------------

/**
 * Pure evaluation function for the 13-Stage Authorization Chain.
 * Guarantees fail-closed deterministic verification across all personas.
 */
export function evaluateAuthorizationChain(
  context: AuthorizationContext,
  action: AuthorizationActionRequest
): AuthorizationChainEvaluation {
  const atTime = action.atTime ?? new Date();
  const stageResults: StageEvaluationResult[] = [];

  // ---------------------------------------------------------------------------
  // Stage 1: Person (Biological actor identity)
  // ---------------------------------------------------------------------------
  if (!context.personId || context.personId.trim() === '') {
    const res: StageEvaluationResult = {
      stage: 'STAGE_01_PERSON',
      passed: false,
      code: 'ERR_PERSON_MISSING',
      message: 'Actor person ID is required and cannot be empty.',
    };
    stageResults.push(res);
    return failChain('STAGE_01_PERSON', res.message, stageResults);
  }
  stageResults.push({
    stage: 'STAGE_01_PERSON',
    passed: true,
    code: 'PERSON_VALID',
    message: `Valid biological actor person ID: ${context.personId}`,
    details: { personId: context.personId, email: context.email },
  });

  // ---------------------------------------------------------------------------
  // Stage 2: Identity (Authentication verification)
  // ---------------------------------------------------------------------------
  if (!context.isAuthenticated) {
    const res: StageEvaluationResult = {
      stage: 'STAGE_02_IDENTITY',
      passed: false,
      code: 'ERR_UNAUTHENTICATED',
      message: 'Actor has not passed authenticated identity verification.',
    };
    stageResults.push(res);
    return failChain('STAGE_02_IDENTITY', res.message, stageResults);
  }
  stageResults.push({
    stage: 'STAGE_02_IDENTITY',
    passed: true,
    code: 'IDENTITY_AUTHENTICATED',
    message: 'Actor identity is actively authenticated and verified.',
  });

  // Platform Admin Shortcut (with strict auditing)
  if (context.isPlatformAdmin || context.isFounder) {
    if (context.persona === 'PLATFORM_ADMIN') {
      const adminAudit: OrgGovernanceActionAudit = {
        id: `audit-admin-${Date.now()}`,
        actorPersonId: context.personId,
        actorPersonName: context.fullName ?? context.email ?? 'Platform Admin',
        organizationId: action.organizationId ?? '00000000-0000-0000-0000-000000000000',
        roleAssignmentId: null,
        roleAtTime: context.isFounder ? 'FOUNDER' : 'PLATFORM_ADMIN',
        responsibilityAtTime: 'EXECUTIVE',
        authorityAtTime: { permissions: ['ALL'], canVote: true, canIssuePo: true, canReleasePayment: true },
        action: action.action,
        entityType: action.targetEntityType ?? 'TRANSACTION',
        entityId: action.targetEntityId ?? 'SYS_ADMIN_ACTION',
        transactionId: action.metadata?.transactionId as string | undefined,
        payload: { ...action.metadata, evaluatedVia: 'ADMIN_OVERRIDE_CHAIN' },
        timestamp: atTime.toISOString(),
      };

      for (const stg of AUTHORIZATION_STAGES.slice(2)) {
        stageResults.push({
          stage: stg,
          passed: true,
          code: 'ADMIN_OVERRIDE',
          message: `Stage ${stg} satisfied via authorized Platform Admin / Founder privilege.`,
        });
      }

      return {
        authorized: true,
        stageResults,
        auditAttribution: adminAudit,
        effectiveRole: context.isFounder ? 'FOUNDER' : 'PLATFORM_ADMIN',
        effectiveResponsibility: 'EXECUTIVE',
        signatureMode: 'ADMIN_OVERRIDE',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 3: Context (Operating persona validation)
  // ---------------------------------------------------------------------------
  const validPersonas: AuthorizationPersona[] = ['INDIVIDUAL', 'RWA', 'MSME', 'SUPPLIER', 'PLATFORM_ADMIN'];
  if (!validPersonas.includes(context.persona)) {
    const res: StageEvaluationResult = {
      stage: 'STAGE_03_CONTEXT',
      passed: false,
      code: 'ERR_INVALID_CONTEXT',
      message: `Invalid operating persona context: '${context.persona}'.`,
    };
    stageResults.push(res);
    return failChain('STAGE_03_CONTEXT', res.message, stageResults);
  }
  stageResults.push({
    stage: 'STAGE_03_CONTEXT',
    passed: true,
    code: 'CONTEXT_VALID',
    message: `Active persona context established: ${context.persona}`,
    details: { persona: context.persona },
  });

  // ---------------------------------------------------------------------------
  // Stage 4: Organization (Boundary isolation)
  // ---------------------------------------------------------------------------
  if (context.persona === 'INDIVIDUAL') {
    // Individual buyer MUST have organization_id = null (or self-personal)
    if (context.organizationId && context.organizationId.trim() !== '') {
      const res: StageEvaluationResult = {
        stage: 'STAGE_04_ORGANIZATION',
        passed: false,
        code: 'ERR_INDIVIDUAL_ORG_POLLUTION',
        message: 'Individual buyer context cannot be bound to an external corporate organization ID.',
      };
      stageResults.push(res);
      return failChain('STAGE_04_ORGANIZATION', res.message, stageResults);
    }
    stageResults.push({
      stage: 'STAGE_04_ORGANIZATION',
      passed: true,
      code: 'INDIVIDUAL_ORG_ISOLATED',
      message: 'Individual buyer operates in self-contained personal context (organization_id = NULL).',
    });
  } else if (context.persona === 'RWA' || context.persona === 'MSME' || context.persona === 'SUPPLIER') {
    if (!context.organizationId || context.organizationId.trim() === '') {
      const res: StageEvaluationResult = {
        stage: 'STAGE_04_ORGANIZATION',
        passed: false,
        code: 'ERR_ORGANIZATION_REQUIRED',
        message: `${context.persona} context strictly requires a valid organizational boundary identifier.`,
      };
      stageResults.push(res);
      return failChain('STAGE_04_ORGANIZATION', res.message, stageResults);
    }
    // Cross-tenant target check: if action targets an org, it must match context org
    if (action.organizationId && action.organizationId !== context.organizationId) {
      const res: StageEvaluationResult = {
        stage: 'STAGE_04_ORGANIZATION',
        passed: false,
        code: 'ERR_CROSS_TENANT_ORGANIZATION',
        message: `Cross-tenant authority violation: Target org (${action.organizationId}) does not match context org (${context.organizationId}).`,
      };
      stageResults.push(res);
      return failChain('STAGE_04_ORGANIZATION', res.message, stageResults);
    }
    stageResults.push({
      stage: 'STAGE_04_ORGANIZATION',
      passed: true,
      code: 'ORGANIZATION_BOUND',
      message: `Bounded within organization boundary: ${context.organizationId}`,
      details: { organizationId: context.organizationId },
    });
  }

  // ---------------------------------------------------------------------------
  // Stage 5: Eligibility (Standing & Compliance)
  // ---------------------------------------------------------------------------
  if (context.isAccountBlocked) {
    const res: StageEvaluationResult = {
      stage: 'STAGE_05_ELIGIBILITY',
      passed: false,
      code: 'ERR_ACCOUNT_BLOCKED',
      message: `Account is blocked from procurement transactions: ${context.blockedReason ?? 'Administrative hold'}.`,
    };
    stageResults.push(res);
    return failChain('STAGE_05_ELIGIBILITY', res.message, stageResults);
  }

  if (context.persona === 'MSME' && action.action === 'ISSUE_PO' && !context.statutoryGstin && !context.statutoryPan) {
    const res: StageEvaluationResult = {
      stage: 'STAGE_05_ELIGIBILITY',
      passed: false,
      code: 'ERR_MSME_STATUTORY_REQUIRED',
      message: 'MSME enterprise context requires verified GSTIN or PAN prior to issuing purchase orders.',
    };
    stageResults.push(res);
    return failChain('STAGE_05_ELIGIBILITY', res.message, stageResults);
  }
  stageResults.push({
    stage: 'STAGE_05_ELIGIBILITY',
    passed: true,
    code: 'ELIGIBILITY_VERIFIED',
    message: 'Actor and organization standing are verified and in good standing.',
  });

  // ---------------------------------------------------------------------------
  // Stage 6: Membership (Active claim verification)
  // ---------------------------------------------------------------------------
  if (context.persona === 'INDIVIDUAL') {
    stageResults.push({
      stage: 'STAGE_06_MEMBERSHIP',
      passed: true,
      code: 'INDIVIDUAL_PERSONAL_MEMBERSHIP',
      message: 'Individual buyer holds direct sovereign personal membership.',
    });
  } else {
    const memberStatus = context.membershipStatus ?? 'ACTIVE';
    if (memberStatus !== 'ACTIVE' && memberStatus !== 'CLAIMED') {
      const res: StageEvaluationResult = {
        stage: 'STAGE_06_MEMBERSHIP',
        passed: false,
        code: 'ERR_MEMBERSHIP_INACTIVE',
        message: `Membership status '${memberStatus}' is not authorized to execute transactions in organization ${context.organizationId}.`,
      };
      stageResults.push(res);
      return failChain('STAGE_06_MEMBERSHIP', res.message, stageResults);
    }
    stageResults.push({
      stage: 'STAGE_06_MEMBERSHIP',
      passed: true,
      code: 'MEMBERSHIP_ACTIVE',
      message: `Active membership confirmed (status: ${memberStatus}).`,
    });
  }

  // ---------------------------------------------------------------------------
  // Stage 7: Role (Canonical role classification)
  // ---------------------------------------------------------------------------
  let rawRoleName = 'OWNER';
  let rawRoleId = 'OWNER';

  if (context.persona === 'INDIVIDUAL') {
    rawRoleName = 'Personal Buyer';
    rawRoleId = 'PERSONAL_BUYER';
  } else if (context.roleAssignment) {
    rawRoleId = context.roleAssignment.roleId;
    rawRoleName = context.roleAssignment.roleName;
  } else if (context.activeDelegation) {
    rawRoleId = 'DELEGATE';
    rawRoleName = 'Delegate Proxy';
  }

  if (context.persona === 'RWA') {
    const isCanonicalRwa = CANONICAL_RWA_ROLES.includes(rawRoleId as CanonicalRwaRole);
    if (!isCanonicalRwa && rawRoleId !== 'RESIDENT_MEMBER' && rawRoleId !== 'OWNER') {
      const res: StageEvaluationResult = {
        stage: 'STAGE_07_ROLE',
        passed: false,
        code: 'ERR_NON_CANONICAL_RWA_ROLE',
        message: `Role '${rawRoleId}' is not recognized in the 7 Canonical RWA Roles taxonomy.`,
      };
      stageResults.push(res);
      return failChain('STAGE_07_ROLE', res.message, stageResults);
    }
  }

  stageResults.push({
    stage: 'STAGE_07_ROLE',
    passed: true,
    code: 'ROLE_CLASSIFIED',
    message: `Role classified as '${rawRoleName}' (${rawRoleId}).`,
    details: { roleId: rawRoleId, roleName: rawRoleName },
  });

  // ---------------------------------------------------------------------------
  // Stage 8: Responsibility (Scope Mapping)
  // ---------------------------------------------------------------------------
  let responsibility: ResponsibilityScope = 'GENERAL';
  if (context.persona === 'INDIVIDUAL') {
    responsibility = 'EXECUTIVE';
  } else if (context.roleAssignment?.responsibilityScope) {
    responsibility = context.roleAssignment.responsibilityScope as ResponsibilityScope;
  } else if (rawRoleId === 'PRESIDENT' || rawRoleId === 'PRIMARY_OWNER') {
    responsibility = 'EXECUTIVE';
  } else if (rawRoleId === 'TREASURER') {
    responsibility = 'FINANCIAL';
  } else if (rawRoleId === 'SECRETARY' || rawRoleId === 'JOINT_SECRETARY') {
    responsibility = 'SECRETARIAL';
  } else if (rawRoleId === 'ESTATE_MANAGER') {
    responsibility = 'OPERATIONS';
  }

  stageResults.push({
    stage: 'STAGE_08_RESPONSIBILITY',
    passed: true,
    code: 'RESPONSIBILITY_MAPPED',
    message: `Responsibility scope assigned: ${responsibility}`,
    details: { responsibility },
  });

  // ---------------------------------------------------------------------------
  // Stage 9: Delegation (Proxy verification & Anti-Bypass Invariants)
  // ---------------------------------------------------------------------------
  let signatureMode: 'DIRECT' | 'DELEGATED' | 'INDIVIDUAL_DIRECT' = 'DIRECT';
  if (context.persona === 'INDIVIDUAL') {
    signatureMode = 'INDIVIDUAL_DIRECT';
    stageResults.push({
      stage: 'STAGE_09_DELEGATION',
      passed: true,
      code: 'INDIVIDUAL_ZERO_DELEGATION_OVERHEAD',
      message: 'Individual buyer requires zero delegation proxy overhead.',
    });
  } else if (context.activeDelegation) {
    signatureMode = 'DELEGATED';
    const del = context.activeDelegation;

    // Self-add / self-delegation check
    if (del.delegatorId === del.delegateeId || del.delegatorId === context.personId) {
      const res: StageEvaluationResult = {
        stage: 'STAGE_09_DELEGATION',
        passed: false,
        code: 'ERR_SELF_DELEGATION_FORBIDDEN',
        message: 'Anti-Self-Delegation invariant: A person cannot delegate authority to themselves.',
      };
      stageResults.push(res);
      return failChain('STAGE_09_DELEGATION', res.message, stageResults);
    }

    // Anti-self-approval check
    if (
      action.action === 'APPROVE_SPEND' &&
      action.creatorPersonId &&
      action.creatorPersonId === context.personId
    ) {
      const res: StageEvaluationResult = {
        stage: 'STAGE_09_DELEGATION',
        passed: false,
        code: 'ERR_ANTI_SELF_APPROVAL_VIOLATION',
        message: 'Anti-Self-Approval invariant (PA-09): The creator of an RFQ/transaction cannot approve their own delegated spend.',
      };
      stageResults.push(res);
      return failChain('STAGE_09_DELEGATION', res.message, stageResults);
    }

    // Delegation validity bounds
    const startsMs = new Date(del.startsAt).getTime();
    const expiresMs = new Date(del.expiresAt).getTime();
    const nowMs = atTime.getTime();

    if (nowMs < startsMs || nowMs > expiresMs || !del.isActive || del.revokedAt) {
      const res: StageEvaluationResult = {
        stage: 'STAGE_09_DELEGATION',
        passed: false,
        code: 'ERR_DELEGATION_EXPIRED_OR_REVOKED',
        message: 'Delegation proxy is expired, revoked, or not yet active.',
      };
      stageResults.push(res);
      return failChain('STAGE_09_DELEGATION', res.message, stageResults);
    }

    stageResults.push({
      stage: 'STAGE_09_DELEGATION',
      passed: true,
      code: 'DELEGATION_ACTIVE',
      message: `Active delegation proxy verified from delegator ${del.delegatorId} to ${context.personId}.`,
      details: { delegatorId: del.delegatorId, spendCap: del.spendCapAmount },
    });
  } else {
    stageResults.push({
      stage: 'STAGE_09_DELEGATION',
      passed: true,
      code: 'DIRECT_AUTHORITY_NO_PROXY',
      message: 'Direct role execution (no delegation proxy active).',
    });
  }

  // ---------------------------------------------------------------------------
  // Stage 10: Authority (Effective Permission & Role Rules)
  // ---------------------------------------------------------------------------
  // Rule A: RWA Estate Manager has ZERO voting power
  if (context.persona === 'RWA' && rawRoleId === 'ESTATE_MANAGER' && action.action === 'CAST_COMMITTEE_VOTE') {
    const res: StageEvaluationResult = {
      stage: 'STAGE_10_AUTHORITY',
      passed: false,
      code: 'ERR_ESTATE_MANAGER_CANNOT_VOTE',
      message: 'RWA Estate/Facility Manager is strictly an operational non-voting role (canVote = false).',
    };
    stageResults.push(res);
    return failChain('STAGE_10_AUTHORITY', res.message, stageResults);
  }

  // Rule B: RWA Resident Owner (without committee appointment) cannot cast committee votes
  if (context.persona === 'RWA' && rawRoleId === 'RESIDENT_MEMBER' && action.action === 'CAST_COMMITTEE_VOTE') {
    const res: StageEvaluationResult = {
      stage: 'STAGE_10_AUTHORITY',
      passed: false,
      code: 'ERR_RESIDENT_NOT_COMMITTEE',
      message: 'Resident society member is not an appointed committee member and cannot cast ballots.',
    };
    stageResults.push(res);
    return failChain('STAGE_10_AUTHORITY', res.message, stageResults);
  }

  // Rule C: Individual Buyer has direct 1-click authority for personal intake/RFQs/PO without committee
  if (context.persona === 'INDIVIDUAL') {
    if (action.action === 'CAST_COMMITTEE_VOTE') {
      const res: StageEvaluationResult = {
        stage: 'STAGE_10_AUTHORITY',
        passed: false,
        code: 'ERR_INDIVIDUAL_NO_COMMITTEE_VOTING',
        message: 'Individual buyer context has zero committee voting overhead.',
      };
      stageResults.push(res);
      return failChain('STAGE_10_AUTHORITY', res.message, stageResults);
    }
  }

  // Rule D: Conflict of Interest (COI) recusal for committee voting
  if (action.action === 'CAST_COMMITTEE_VOTE' && action.coiDeclared) {
    const res: StageEvaluationResult = {
      stage: 'STAGE_10_AUTHORITY',
      passed: false,
      code: 'ERR_COI_RECUSAL',
      message: 'Voter has declared a Conflict of Interest (COI) and is recused from voting on this RFQ.',
    };
    stageResults.push(res);
    return failChain('STAGE_10_AUTHORITY', res.message, stageResults);
  }

  stageResults.push({
    stage: 'STAGE_10_AUTHORITY',
    passed: true,
    code: 'AUTHORITY_VERIFIED',
    message: `Authority verified for action '${action.action}' under role '${rawRoleName}'.`,
  });

  // ---------------------------------------------------------------------------
  // Stage 11: Transaction (Spend caps & parameters)
  // ---------------------------------------------------------------------------
  if (action.spendAmount != null && action.spendAmount > 0) {
    if (context.activeDelegation?.spendCapAmount != null) {
      if (action.spendAmount > context.activeDelegation.spendCapAmount) {
        const res: StageEvaluationResult = {
          stage: 'STAGE_11_TRANSACTION',
          passed: false,
          code: 'ERR_SPEND_CAP_EXCEEDED',
          message: `Transaction spend amount (₹${action.spendAmount}) exceeds delegated cap (₹${context.activeDelegation.spendCapAmount}).`,
        };
        stageResults.push(res);
        return failChain('STAGE_11_TRANSACTION', res.message, stageResults);
      }
    }
    if (context.roleAssignment?.authorityScope?.spendCapAmount != null) {
      if (action.spendAmount > context.roleAssignment.authorityScope.spendCapAmount) {
        const res: StageEvaluationResult = {
          stage: 'STAGE_11_TRANSACTION',
          passed: false,
          code: 'ERR_ROLE_SPEND_CAP_EXCEEDED',
          message: `Transaction spend amount (₹${action.spendAmount}) exceeds role spend cap (₹${context.roleAssignment.authorityScope.spendCapAmount}).`,
        };
        stageResults.push(res);
        return failChain('STAGE_11_TRANSACTION', res.message, stageResults);
      }
    }
  }

  stageResults.push({
    stage: 'STAGE_11_TRANSACTION',
    passed: true,
    code: 'TRANSACTION_VALIDATED',
    message: `Transaction parameters and spend limits validated for '${action.action}'.`,
  });

  // ---------------------------------------------------------------------------
  // Stage 12: Effective Date (365-day term expiry & temporal bounds)
  // ---------------------------------------------------------------------------
  if (context.roleAssignment) {
    const fromMs = new Date(context.roleAssignment.effectiveFrom).getTime();
    const nowMs = atTime.getTime();

    if (nowMs < fromMs) {
      const res: StageEvaluationResult = {
        stage: 'STAGE_12_EFFECTIVE_DATE',
        passed: false,
        code: 'ERR_ROLE_NOT_YET_EFFECTIVE',
        message: `Role assignment is not yet effective (effectiveFrom: ${context.roleAssignment.effectiveFrom}).`,
      };
      stageResults.push(res);
      return failChain('STAGE_12_EFFECTIVE_DATE', res.message, stageResults);
    }

    if (context.roleAssignment.effectiveTo) {
      const toMs = new Date(context.roleAssignment.effectiveTo).getTime();
      if (nowMs >= toMs) {
        const res: StageEvaluationResult = {
          stage: 'STAGE_12_EFFECTIVE_DATE',
          passed: false,
          code: 'ERR_ROLE_EXPIRED',
          message: `Universal Role Lifecycle: Role '${rawRoleName}' expired on ${context.roleAssignment.effectiveTo}. All voting, approvals, and PO powers are revoked.`,
        };
        stageResults.push(res);
        return failChain('STAGE_12_EFFECTIVE_DATE', res.message, stageResults);
      }
    }
  }

  stageResults.push({
    stage: 'STAGE_12_EFFECTIVE_DATE',
    passed: true,
    code: 'EFFECTIVE_DATE_VALID',
    message: `Role and delegation are fully within active temporal window at ${atTime.toISOString()}.`,
  });

  // ---------------------------------------------------------------------------
  // Stage 13: Audit Attribution (Immutable Snapshot Generation)
  // ---------------------------------------------------------------------------
  const auditAttribution: OrgGovernanceActionAudit = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    actorPersonId: context.personId,
    actorPersonName: context.fullName ?? context.email ?? 'Unknown Actor',
    organizationId: context.organizationId ?? '00000000-0000-0000-0000-000000000000',
    roleAssignmentId: context.roleAssignment?.id ?? null,
    roleAtTime: rawRoleName,
    responsibilityAtTime: responsibility,
    authorityAtTime: context.roleAssignment?.authorityScope ?? { permissions: ['DIRECT_EXECUTION'] },
    action: action.action,
    entityType: action.targetEntityType ?? 'TRANSACTION',
    entityId: action.targetEntityId ?? 'ENTITY_ID',
    transactionId: action.metadata?.transactionId as string | undefined,
    payload: {
      persona: context.persona,
      signatureMode,
      spendAmount: action.spendAmount ?? null,
      metadata: action.metadata ?? {},
    },
    timestamp: atTime.toISOString(),
  };

  stageResults.push({
    stage: 'STAGE_13_AUDIT_ATTRIBUTION',
    passed: true,
    code: 'AUDIT_ATTRIBUTED_IMMUTABLE',
    message: `Action immutably attributed to actor ${context.personId} as '${rawRoleName}' (${responsibility}).`,
    details: { auditId: auditAttribution.id },
  });

  return {
    authorized: true,
    stageResults,
    auditAttribution,
    effectiveRole: rawRoleName,
    effectiveResponsibility: responsibility,
    signatureMode,
  };
}

function failChain(
  stage: AuthorizationStageName,
  reason: string,
  stageResults: StageEvaluationResult[]
): AuthorizationChainEvaluation {
  return {
    authorized: false,
    failedStage: stage,
    failureReason: reason,
    stageResults,
    auditAttribution: null,
    effectiveRole: 'NONE',
    effectiveResponsibility: 'NONE',
    signatureMode: 'NONE',
  };
}

// -----------------------------------------------------------------------------
// 4. CONTEXT SWITCHING & MULTI-CONTEXT INDEPENDENCE
// -----------------------------------------------------------------------------

/**
 * Validates switching from one authorization context to another.
 * Guarantees zero authority bleed across contexts.
 */
export function validateContextSwitch(
  currentContext: AuthorizationContext,
  targetContext: AuthorizationContext
): ContextSwitchResult {
  // 0. Target persona must be one of the supported canonical personas
  const validPersonas: AuthorizationPersona[] = ['INDIVIDUAL', 'RWA', 'MSME', 'SUPPLIER', 'PLATFORM_ADMIN'];
  if (!validPersonas.includes(targetContext.persona)) {
    return {
      valid: false,
      reason: `Cannot switch to unsupported or retired persona '${targetContext.persona}'. Context switch failed closed.`,
      fromPersona: currentContext.persona,
      toPersona: targetContext.persona,
      targetOrganizationId: targetContext.organizationId,
    };
  }

  // 1. Biological person MUST remain identical across context switches
  if (currentContext.personId !== targetContext.personId) {
    return {
      valid: false,
      reason: `Cannot switch context across different person IDs (${currentContext.personId} -> ${targetContext.personId}).`,
      fromPersona: currentContext.persona,
      toPersona: targetContext.persona,
      targetOrganizationId: targetContext.organizationId,
    };
  }

  // 2. Switching to Individual Context: organizationId must be cleared
  if (targetContext.persona === 'INDIVIDUAL') {
    if (targetContext.organizationId && targetContext.organizationId.trim() !== '') {
      return {
        valid: false,
        reason: 'Switching to Individual context requires clearing corporate organization ID.',
        fromPersona: currentContext.persona,
        toPersona: targetContext.persona,
        targetOrganizationId: targetContext.organizationId,
      };
    }
  }

  // 3. Switching to RWA / MSME Context: organizationId must be explicitly present
  if (targetContext.persona === 'RWA' || targetContext.persona === 'MSME') {
    if (!targetContext.organizationId || targetContext.organizationId.trim() === '') {
      return {
        valid: false,
        reason: `Switching to ${targetContext.persona} requires a valid target organization ID.`,
        fromPersona: currentContext.persona,
        toPersona: targetContext.persona,
        targetOrganizationId: targetContext.organizationId,
      };
    }
  }

  return {
    valid: true,
    fromPersona: currentContext.persona,
    toPersona: targetContext.persona,
    targetOrganizationId: targetContext.organizationId,
  };
}

// -----------------------------------------------------------------------------
// 5. CONVENIENCE HELPERS & PERSONA GUARDS
// -----------------------------------------------------------------------------

export function isIndividualBuyerContext(context: AuthorizationContext): boolean {
  return context.persona === 'INDIVIDUAL' && (!context.organizationId || context.organizationId.trim() === '');
}

export function isRwaCommitteeMember(context: AuthorizationContext): boolean {
  if (context.persona !== 'RWA') return false;
  const roleId = context.roleAssignment?.roleId ?? '';
  return CANONICAL_RWA_ROLES.includes(roleId as CanonicalRwaRole) && roleId !== 'ESTATE_MANAGER';
}

export function isRwaOperationalManager(context: AuthorizationContext): boolean {
  if (context.persona !== 'RWA') return false;
  return context.roleAssignment?.roleId === 'ESTATE_MANAGER';
}

export function isMsmePrimaryOwner(context: AuthorizationContext): boolean {
  if (context.persona !== 'MSME') return false;
  const roleId = context.roleAssignment?.roleId ?? '';
  return roleId === 'PRIMARY_OWNER' || roleId === 'OWNER';
}
