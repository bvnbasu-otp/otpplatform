/**
 * OTP GOLDEN RECONSTRUCTION — CANONICAL AUTHORIZATION SERVICE
 *
 * Consolidates all disparate permission, persona, role, and context checks
 * across the platform into an authoritative, 13-stage deterministic service.
 *
 * Enforces:
 * 1. 13-Stage Authorization Chain evaluation (Person -> Context -> Org -> ... -> Audit Attribution).
 * 2. Individual Buyer Model: organizationId = NULL, zero committee/quorum overhead.
 * 3. RWA Governance Model: 7 Canonical Roles, Estate Manager ZERO voting authority, Resident Owner != Committee.
 * 4. MSME Spend Governance: Primary 1-click authority, spend-capped delegation, anti-self-approval (PA-09).
 * 5. Universal Role Lifecycle: 365-day term expiry, immutable audit preservation (PA-03).
 * 6. Multi-Context Independence: Zero authority bleed between distinct contexts.
 */

import {
  type AuthorizationContext,
  type AuthorizationActionRequest,
  type AuthorizationChainEvaluation,
  type AuthorizationPersona,
  type ContextSwitchResult,
  type ProcurementActionType,
  evaluateAuthorizationChain,
  validateContextSwitch,
  CANONICAL_RWA_ROLES,
  CANONICAL_MSME_ROLES,
} from '@otp/domain';
import type { ActorContext } from '../types/actor-context';
import { toAuthorizationContext } from '../types/actor-context';
import { ForbiddenError, ValidationError } from '../types/errors';

export interface AuthorizeActionResult {
  authorized: boolean;
  reason?: string;
  evaluation: AuthorizationChainEvaluation;
}

export interface VoteAuthorizationCheck {
  allowed: boolean;
  reason: string;
}

export interface SpendApprovalCheck {
  allowed: boolean;
  reason: string;
}

export interface ContextSwitchExecutionResult {
  valid: boolean;
  nextActor?: ActorContext;
  reason?: string;
}

export class CanonicalAuthorizationService {
  /**
   * Evaluates the full 13-stage authorization chain for an actor and action.
   */
  public evaluate(
    actor: ActorContext,
    action: AuthorizationActionRequest
  ): AuthorizationChainEvaluation {
    const authContext = toAuthorizationContext(actor);
    return evaluateAuthorizationChain(authContext, action);
  }

  /**
   * Asserts that an actor is authorized to perform an action, throwing ForbiddenError if not.
   */
  public assertAuthorized(
    actor: ActorContext,
    action: AuthorizationActionRequest
  ): AuthorizationChainEvaluation {
    const evaluation = this.evaluate(actor, action);
    if (!evaluation.authorized) {
      throw new ForbiddenError(
        evaluation.failureReason ?? `Unauthorized: Action '${action.action}' is not permitted.`
      );
    }
    return evaluation;
  }

  /**
   * Authorizes RWA Committee voting.
   * Invariants:
   * 1. Estate Manager strictly cannot vote (canVote = false).
   * 2. Resident Owner without committee role cannot vote.
   * 3. Expired role assignments cannot vote.
   * 4. Conflict of Interest (COI) recuses the voter.
   */
  public canVoteInRwa(
    actor: ActorContext,
    orgId: string,
    options?: {
      rfqId?: string;
      coiDeclared?: boolean;
      atTime?: Date;
    }
  ): VoteAuthorizationCheck {
    if (actor.persona && actor.persona !== 'RWA') {
      return {
        allowed: false,
        reason: `Cannot cast RWA committee vote from non-RWA context '${actor.persona}'. Switch context to RWA first.`,
      };
    }

    const actionReq: AuthorizationActionRequest = {
      action: 'CAST_COMMITTEE_VOTE',
      organizationId: orgId,
      targetEntityId: options?.rfqId,
      targetEntityType: 'RFQ',
      coiDeclared: options?.coiDeclared,
      atTime: options?.atTime,
    };

    const evalRes = this.evaluate(
      {
        ...actor,
        persona: 'RWA',
        organizationId: orgId,
      },
      actionReq
    );

    return {
      allowed: evalRes.authorized,
      reason: evalRes.authorized
        ? `Authorized to cast committee vote as ${evalRes.effectiveRole}.`
        : evalRes.failureReason ?? 'Unauthorized to cast committee vote.',
    };
  }

  /**
   * Authorizes MSME Spend Approval.
   * Invariants:
   * 1. Primary Owner has 1-click authority for any transaction amount.
   * 2. Delegated members can approve up to their spend cap amount.
   * 3. Anti-self-approval rule prevents the creator of an RFQ from approving their own delegated request.
   * 4. Expired delegations or roles are forbidden.
   */
  public canApproveMsmeSpend(
    actor: ActorContext,
    orgId: string,
    amount: number,
    options?: {
      creatorPersonId?: string;
      rfqId?: string;
      atTime?: Date;
    }
  ): SpendApprovalCheck {
    if (actor.persona && actor.persona !== 'MSME') {
      return {
        allowed: false,
        reason: `Cannot approve MSME spend from non-MSME context '${actor.persona}'. Switch context to MSME first.`,
      };
    }

    const actionReq: AuthorizationActionRequest = {
      action: 'APPROVE_SPEND',
      organizationId: orgId,
      targetEntityId: options?.rfqId,
      targetEntityType: 'RFQ',
      spendAmount: amount,
      creatorPersonId: options?.creatorPersonId,
      atTime: options?.atTime,
    };

    const evalRes = this.evaluate(
      {
        ...actor,
        persona: 'MSME',
        organizationId: orgId,
      },
      actionReq
    );

    return {
      allowed: evalRes.authorized,
      reason: evalRes.authorized
        ? `Authorized to approve spend of ₹${amount.toLocaleString('en-IN')} as ${evalRes.effectiveRole}.`
        : evalRes.failureReason ?? 'Unauthorized to approve spend.',
    };
  }

  /**
   * Authorizes Requirement or RFQ Creation.
   * Invariants:
   * 1. Individual buyer operates with organization_id = NULL with zero committee overhead.
   * 2. RWA/MSME requires active membership in target organization.
   */
  public canCreateRequirementOrRfq(
    actor: ActorContext,
    targetOrgId?: string | null
  ): { allowed: boolean; reason: string } {
    const isIndividual = !targetOrgId && (!actor.organizationId || actor.persona === 'INDIVIDUAL');

    const actionReq: AuthorizationActionRequest = {
      action: 'CREATE_RFQ',
      organizationId: isIndividual ? null : (targetOrgId ?? actor.organizationId),
      targetEntityType: 'RFQ',
    };

    const evalRes = this.evaluate(
      {
        ...actor,
        persona: isIndividual ? 'INDIVIDUAL' : (actor.persona ?? 'MSME'),
        organizationId: isIndividual ? undefined : (targetOrgId ?? actor.organizationId),
      },
      actionReq
    );

    return {
      allowed: evalRes.authorized,
      reason: evalRes.authorized
        ? isIndividual
          ? 'Authorized as Individual Buyer (Personal fast-track, zero committee overhead).'
          : `Authorized within organization ${targetOrgId ?? actor.organizationId}.`
        : evalRes.failureReason ?? 'Unauthorized to create requirement or RFQ.',
    };
  }

  /**
   * Authorizes Purchase Order issuance.
   */
  public canIssuePurchaseOrder(
    actor: ActorContext,
    orgId?: string | null,
    amount?: number,
    options?: { atTime?: Date }
  ): { allowed: boolean; reason: string } {
    const isIndividual = !orgId && (!actor.organizationId || actor.persona === 'INDIVIDUAL');

    const actionReq: AuthorizationActionRequest = {
      action: 'ISSUE_PO',
      organizationId: isIndividual ? null : (orgId ?? actor.organizationId),
      targetEntityType: 'PURCHASE_ORDER',
      spendAmount: amount,
      atTime: options?.atTime,
    };

    const evalRes = this.evaluate(
      {
        ...actor,
        persona: isIndividual ? 'INDIVIDUAL' : (actor.persona ?? 'MSME'),
        organizationId: isIndividual ? undefined : (orgId ?? actor.organizationId),
      },
      actionReq
    );

    return {
      allowed: evalRes.authorized,
      reason: evalRes.authorized
        ? `Authorized to issue purchase order as ${evalRes.effectiveRole}.`
        : evalRes.failureReason ?? 'Unauthorized to issue purchase order.',
    };
  }

  /**
   * Deterministic, lightweight context switching between multiple legitimate contexts.
   * Enforces zero authority bleed between contexts.
   */
  public switchContext(
    currentActor: ActorContext,
    target: {
      persona: AuthorizationPersona;
      organizationId?: string | null;
      roleAssignment?: ActorContext['roleAssignment'];
      activeDelegation?: ActorContext['activeDelegation'];
      supplierIds?: string[];
    }
  ): ContextSwitchExecutionResult {
    const currentAuth = toAuthorizationContext(currentActor);
    const targetAuth: AuthorizationContext = {
      personId: currentActor.profileId,
      email: currentActor.email,
      fullName: currentActor.fullName,
      isAuthenticated: currentAuth.isAuthenticated,
      persona: target.persona,
      organizationId: target.persona === 'INDIVIDUAL' ? null : (target.organizationId ?? null),
      isPlatformAdmin: currentActor.isPlatformAdmin,
      isFounder: currentActor.isFounder,
      roleAssignment: target.roleAssignment ?? null,
      activeDelegation: target.activeDelegation ?? null,
      supplierIds: target.supplierIds ?? currentActor.supplierIds,
    };

    const validation = validateContextSwitch(currentAuth, targetAuth);
    if (!validation.valid) {
      return {
        valid: false,
        reason: validation.reason,
      };
    }

    const nextActor: ActorContext = {
      profileId: currentActor.profileId,
      email: currentActor.email,
      fullName: currentActor.fullName,
      isPlatformAdmin: currentActor.isPlatformAdmin,
      isFounder: currentActor.isFounder,
      persona: target.persona,
      organizationId: target.persona === 'INDIVIDUAL' ? undefined : (target.organizationId ?? undefined),
      roleAssignment: target.roleAssignment ?? null,
      activeDelegation: target.activeDelegation ?? null,
      orgRole: target.roleAssignment?.roleId ?? (target.persona === 'INDIVIDUAL' ? 'OWNER' : undefined),
      supplierIds: target.persona === 'SUPPLIER' ? (target.supplierIds ?? currentActor.supplierIds) : undefined,
    };

    return {
      valid: true,
      nextActor,
    };
  }
}

/** Global singleton instance */
export const canonicalAuthService = new CanonicalAuthorizationService();
