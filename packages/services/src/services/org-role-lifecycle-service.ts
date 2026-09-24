import type { Repositories } from '../repositories/interfaces';
import type { AuditAppService } from './audit-service';
import type { ActorContext } from '../types/actor-context';
import {
  type OrgRoleAssignment,
  type OrgGovernanceActionAudit,
  type RoleSuccessionTransition,
  type RoleRenewalParams,
  type RoleRenewalResult,
  type UniversalRoleCategory,
  type UniversalRoleStatus,
  type ResponsibilityScope,
  type RoleAuthorityScope,
  STANDARD_GOVERNANCE_ROLE_TEMPLATES,
  verifyPersonAuthorityAtTime,
  isRoleAssignmentActiveAt,
  isRoleExpiringSoon,
  calculateRoleDefaultTermExpiry,
  evaluateRoleRenewalTransition,
  createGovernanceAuditSnapshot,
} from '@otp/domain';

export interface AppointRoleParams {
  organizationId: string;
  personId?: string | null;
  personName?: string | null;
  personEmail?: string | null;
  roleId: string;
  roleName?: string;
  roleCategory?: UniversalRoleCategory;
  responsibilityScope?: ResponsibilityScope | string;
  authorityScope?: RoleAuthorityScope;
  effectiveFrom?: string;
  effectiveTo?: string | null;
  termDurationDays?: number;
  appointmentEvent?: string;
}

export interface ExecuteSuccessionParams {
  organizationId: string;
  roleId: string;
  roleName?: string;
  predecessorPersonId?: string | null;
  successorPersonId?: string | null;
  successorPersonName?: string | null;
  effectiveDate?: string;
  termDurationDays?: number;
  successionEvent?: string;
  reason?: string;
  predecessorNewRole?: string | null;
  responsibilityScope?: ResponsibilityScope | string;
  authorityScope?: RoleAuthorityScope;
}

export interface RevokeRoleParams {
  assignmentId: string;
  removalEvent?: string;
  removalReason?: string;
  effectiveTo?: string;
}

export class OrgRoleLifecycleService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditAppService
  ) {}

  /**
   * Appoints a person to an organizational role with effective dating and default 1-year (365 days) term.
   */
  async appointRole(actor: ActorContext, params: AppointRoleParams): Promise<OrgRoleAssignment> {
    const {
      organizationId,
      personId,
      personName,
      personEmail,
      roleId,
      appointmentEvent = 'DIRECT_APPOINTMENT',
      effectiveFrom = new Date().toISOString(),
      termDurationDays = 365,
    } = params;

    // Authorization check
    this.ensureCanManageOrg(actor, organizationId);

    const template = STANDARD_GOVERNANCE_ROLE_TEMPLATES[roleId];
    const roleName = params.roleName || template?.roleName || roleId;
    const roleCategory = params.roleCategory || template?.roleCategory || 'RWA_GOVERNANCE';
    const responsibilityScope = params.responsibilityScope || template?.responsibilityScope || 'GENERAL';
    const authorityScope = params.authorityScope || template?.defaultAuthority || { permissions: ['READ'] };

    let effectiveTo = params.effectiveTo;
    if (effectiveTo === undefined) {
      if (roleCategory === 'RWA_GOVERNANCE') {
        const fromDate = new Date(effectiveFrom);
        effectiveTo = calculateRoleDefaultTermExpiry(fromDate, termDurationDays).toISOString();
      } else {
        effectiveTo = null;
      }
    }

    const status: UniversalRoleStatus = personId ? 'ACTIVE' : 'VACANT';

    // If appointing an active role, supersede any existing active assignment for this specific role
    if (status === 'ACTIVE' && this.repos.orgRoleAssignments) {
      const existing = await this.repos.orgRoleAssignments.findByOrganizationId(organizationId, roleId);
      const activeExisting = existing.filter((a) => a.status === 'ACTIVE');

      for (const oldAssign of activeExisting) {
        await this.repos.orgRoleAssignments.save({
          ...oldAssign,
          status: 'SUPERSEDED',
          effectiveTo: effectiveFrom,
          removalEvent: 'SUPERSEDED_BY_NEW_APPOINTMENT',
          removalReason: `Superseded by appointment of ${roleName}`,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const assignmentId = `assign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newAssignment: OrgRoleAssignment = {
      id: assignmentId,
      organizationId,
      personId: personId ?? null,
      personName: personName ?? null,
      personEmail: personEmail ?? null,
      roleId,
      roleName,
      roleCategory,
      responsibilityScope,
      authorityScope,
      effectiveFrom,
      effectiveTo,
      termDurationDays,
      status,
      appointedBy: actor.profileId,
      appointmentEvent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.repos.orgRoleAssignments) {
      await this.repos.orgRoleAssignments.save(newAssignment as any);
    }

    // Record Immutable Governance Audit
    await this.recordGovernanceAudit(actor, {
      organizationId,
      roleAssignment: newAssignment,
      action: 'ROLE_APPOINTED',
      entityType: 'org_role_assignment',
      entityId: assignmentId,
      payload: {
        roleId,
        roleName,
        personId,
        status,
        effectiveFrom,
        effectiveTo,
        termDurationDays,
        appointmentEvent,
      },
    });

    return newAssignment;
  }

  /**
   * Executes atomic role succession handover from predecessor to successor.
   * Handles predecessor termination, successor activation, and immutable audit recording in a single transaction.
   */
  async executeRoleSuccession(
    actor: ActorContext,
    params: ExecuteSuccessionParams
  ): Promise<RoleSuccessionTransition> {
    const {
      organizationId,
      roleId,
      predecessorPersonId,
      successorPersonId,
      successorPersonName,
      effectiveDate = new Date().toISOString(),
      termDurationDays = 365,
      successionEvent = 'SUCCESSION_HANDOVER',
      reason = 'Role succession handover',
      predecessorNewRole = 'COMMITTEE_MEMBER',
    } = params;

    this.ensureCanManageOrg(actor, organizationId);

    let predecessorAssignment: OrgRoleAssignment | null = null;

    if (this.repos.orgRoleAssignments) {
      const allForRole = await this.repos.orgRoleAssignments.findByOrganizationId(organizationId, roleId);
      const activeForRole = allForRole.filter((a) => a.status === 'ACTIVE');

      if (predecessorPersonId) {
        predecessorAssignment = (activeForRole.find((a) => a.personId === predecessorPersonId) as any) ?? null;
      } else {
        predecessorAssignment = (activeForRole[0] as any) ?? null;
      }
    }

    const template = STANDARD_GOVERNANCE_ROLE_TEMPLATES[roleId];
    const roleName = params.roleName || predecessorAssignment?.roleName || template?.roleName || roleId;
    const roleCategory = predecessorAssignment?.roleCategory || template?.roleCategory || 'RWA_GOVERNANCE';
    const responsibilityScope = params.responsibilityScope || predecessorAssignment?.responsibilityScope || template?.responsibilityScope || 'GENERAL';
    const authorityScope = params.authorityScope || predecessorAssignment?.authorityScope || template?.defaultAuthority || { permissions: ['READ'] };

    const successorEffectiveTo =
      roleCategory === 'RWA_GOVERNANCE'
        ? calculateRoleDefaultTermExpiry(new Date(effectiveDate), termDurationDays).toISOString()
        : null;

    // 1. Terminate Predecessor Assignment
    if (predecessorAssignment && this.repos.orgRoleAssignments) {
      await this.repos.orgRoleAssignments.save({
        ...(predecessorAssignment as any),
        status: 'SUPERSEDED',
        effectiveTo: effectiveDate,
        removalEvent: successionEvent,
        removalReason: reason,
        updatedAt: new Date().toISOString(),
      });
    }

    // 2. Create Successor Assignment
    const successorStatus: UniversalRoleStatus = successorPersonId ? 'ACTIVE' : 'VACANT';
    const successorAssignmentId = `assign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const successorAssignment: OrgRoleAssignment = {
      id: successorAssignmentId,
      organizationId,
      personId: successorPersonId ?? null,
      personName: successorPersonName ?? null,
      roleId,
      roleName,
      roleCategory,
      responsibilityScope,
      authorityScope,
      effectiveFrom: effectiveDate,
      effectiveTo: successorEffectiveTo,
      termDurationDays,
      status: successorStatus,
      appointedBy: actor.profileId,
      appointmentEvent: successionEvent,
      predecessorAssignmentId: predecessorAssignment?.id ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.repos.orgRoleAssignments) {
      await this.repos.orgRoleAssignments.save(successorAssignment as any);
    }

    // 3. Record Immutable Governance Audit
    await this.recordGovernanceAudit(actor, {
      organizationId,
      roleAssignment: successorAssignment,
      action: 'ROLE_SUCCESSION_EXECUTED',
      entityType: 'org_role_assignment',
      entityId: successorAssignmentId,
      payload: {
        roleId,
        roleName,
        predecessorAssignmentId: predecessorAssignment?.id ?? null,
        predecessorPersonId: predecessorAssignment?.personId ?? predecessorPersonId ?? null,
        successorAssignmentId,
        successorPersonId,
        effectiveDate,
        effectiveTo: successorEffectiveTo,
        termDurationDays,
        successionEvent,
        reason,
        predecessorNewRole,
      },
    });

    return {
      organizationId,
      roleId,
      roleName,
      predecessorAssignmentId: predecessorAssignment?.id ?? null,
      predecessorPersonId: predecessorAssignment?.personId ?? predecessorPersonId ?? null,
      successorAssignmentId,
      successorPersonId: successorPersonId ?? null,
      successorPersonName: successorPersonName ?? null,
      effectiveDate,
      effectiveTo: successorEffectiveTo,
      termDurationDays,
      successionEvent,
      reason,
      predecessorNewRole,
    };
  }

  /**
   * Executes annual role renewal or rotation workflow:
   * 1. Continue in Governance? (Yes / No)
   * 2. If Yes: Retain same role OR Rotate into new role (e.g. Estate Manager -> Committee Member) with fresh 1-year term.
   * 3. If No: Retire from governance role; role marked RETIRED, authority revoked, buyer status preserved.
   */
  async renewOrRotateRole(actor: ActorContext, params: RoleRenewalParams): Promise<RoleRenewalResult> {
    const {
      assignmentId,
      continueInGovernance,
      renewalRoleId,
      renewalRoleName,
      termDurationDays = 365,
      effectiveDate = new Date().toISOString(),
      notes,
    } = params;

    if (!this.repos.orgRoleAssignments) {
      throw new Error('OrgRoleAssignments repository not configured');
    }

    const currentAssignment = await this.repos.orgRoleAssignments.findById(assignmentId);
    if (!currentAssignment) {
      throw new Error(`Role assignment ${assignmentId} not found`);
    }

    this.ensureCanManageOrg(actor, currentAssignment.organizationId);

    const effDate = new Date(effectiveDate);
    const transition = evaluateRoleRenewalTransition({
      currentAssignment: currentAssignment as any,
      continueInGovernance,
      renewalRoleId,
      termDays: termDurationDays,
      effectiveDate: effDate,
    });

    // Case 1: Member Exits Governance (Non-Renewal)
    if (transition.decision === 'EXIT_GOVERNANCE') {
      const retired: OrgRoleAssignment = {
        ...(currentAssignment as any),
        status: 'RETIRED',
        effectiveTo: effectiveDate,
        removalEvent: 'ANNUAL_TERM_EXIT',
        removalReason: notes || 'Member elected to exit governance at term conclusion',
        updatedAt: new Date().toISOString(),
      };

      await this.repos.orgRoleAssignments.save(retired as any);

      await this.recordGovernanceAudit(actor, {
        organizationId: currentAssignment.organizationId,
        roleAssignment: retired,
        action: 'ROLE_RETIRED_ON_EXPIRY',
        entityType: 'org_role_assignment',
        entityId: assignmentId,
        payload: {
          assignmentId,
          roleId: currentAssignment.roleId,
          personId: currentAssignment.personId,
          notes,
        },
      });

      return {
        ok: true,
        action: 'RETIRED',
        oldAssignmentId: assignmentId,
        newAssignmentId: null,
        personId: currentAssignment.personId,
        roleId: currentAssignment.roleId,
        roleName: currentAssignment.roleName,
        effectiveFrom: currentAssignment.effectiveFrom,
        effectiveTo: effectiveDate,
        message: `Role ${currentAssignment.roleName} retired. Member transitioned to standard resident buyer.`,
      };
    }

    // Case 2: Same Role Renewal or Role Rotation
    const oldStatus: UniversalRoleStatus = transition.isRotation ? 'ROTATED' : 'SUPERSEDED';
    await this.repos.orgRoleAssignments.save({
      ...(currentAssignment as any),
      status: oldStatus,
      effectiveTo: effectiveDate,
      removalEvent: transition.isRotation ? 'ROLE_ROTATION' : 'ANNUAL_RENEWAL',
      removalReason: notes || (transition.isRotation ? 'Rotated to new role' : 'Renewed for fresh term'),
      updatedAt: new Date().toISOString(),
    });

    const targetTemplate = STANDARD_GOVERNANCE_ROLE_TEMPLATES[transition.targetRoleId];
    const targetAuthority = targetTemplate?.defaultAuthority || currentAssignment.authorityScope;
    const targetCategory = targetTemplate?.roleCategory || currentAssignment.roleCategory;
    const targetResp = targetTemplate?.responsibilityScope || currentAssignment.responsibilityScope;

    const newAssignmentId = `assign-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newAssignment: OrgRoleAssignment = {
      id: newAssignmentId,
      organizationId: currentAssignment.organizationId,
      personId: currentAssignment.personId,
      personName: (currentAssignment as any).personName ?? null,
      personEmail: (currentAssignment as any).personEmail ?? null,
      roleId: transition.targetRoleId,
      roleName: renewalRoleName || transition.targetRoleName,
      roleCategory: targetCategory as any,
      responsibilityScope: targetResp,
      authorityScope: targetAuthority as any,
      effectiveFrom: effectiveDate,
      effectiveTo: transition.newEffectiveTo,
      termDurationDays,
      status: 'ACTIVE',
      appointedBy: actor.profileId,
      appointmentEvent: transition.isRotation ? 'ROLE_ROTATION' : 'ANNUAL_RENEWAL',
      predecessorAssignmentId: currentAssignment.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.repos.orgRoleAssignments.save(newAssignment as any);

    await this.recordGovernanceAudit(actor, {
      organizationId: currentAssignment.organizationId,
      roleAssignment: newAssignment,
      action: transition.isRotation ? 'ROLE_ROTATED' : 'ROLE_RENEWED',
      entityType: 'org_role_assignment',
      entityId: newAssignmentId,
      payload: {
        oldAssignmentId: assignmentId,
        newAssignmentId,
        personId: currentAssignment.personId,
        oldRoleId: currentAssignment.roleId,
        newRoleId: transition.targetRoleId,
        newRoleName: transition.targetRoleName,
        effectiveFrom: effectiveDate,
        effectiveTo: transition.newEffectiveTo,
        termDurationDays,
        isRotation: transition.isRotation,
      },
    });

    return {
      ok: true,
      action: transition.isRotation ? 'ROTATED' : 'RENEWED',
      oldAssignmentId: assignmentId,
      newAssignmentId,
      personId: currentAssignment.personId,
      roleId: transition.targetRoleId,
      roleName: transition.targetRoleName,
      effectiveFrom: effectiveDate,
      effectiveTo: transition.newEffectiveTo,
      termDurationDays,
      message: `Role ${transition.targetRoleName} ${transition.isRotation ? 'rotated' : 'renewed'} successfully for a ${termDurationDays}-day term.`,
    };
  }

  /**
   * Revokes an existing role assignment immediately or effective-dated.
   */
  async revokeRole(actor: ActorContext, params: RevokeRoleParams): Promise<OrgRoleAssignment> {
    const {
      assignmentId,
      removalEvent = 'REVOCATION',
      removalReason = 'Role authority revoked',
      effectiveTo = new Date().toISOString(),
    } = params;

    if (!this.repos.orgRoleAssignments) {
      throw new Error('OrgRoleAssignments repository not configured');
    }

    const assignment = await this.repos.orgRoleAssignments.findById(assignmentId);
    if (!assignment) {
      throw new Error(`Role assignment ${assignmentId} not found`);
    }

    this.ensureCanManageOrg(actor, assignment.organizationId);

    const updated: OrgRoleAssignment = {
      ...(assignment as any),
      status: 'REVOKED',
      effectiveTo,
      removalEvent,
      removalReason,
      updatedAt: new Date().toISOString(),
    };

    await this.repos.orgRoleAssignments.save(updated as any);

    await this.recordGovernanceAudit(actor, {
      organizationId: assignment.organizationId,
      roleAssignment: updated,
      action: 'ROLE_REVOKED',
      entityType: 'org_role_assignment',
      entityId: assignmentId,
      payload: {
        assignmentId,
        roleId: assignment.roleId,
        personId: assignment.personId,
        effectiveTo,
        removalEvent,
        removalReason,
      },
    });

    return updated;
  }

  /**
   * Verifies person authority in an organization at a specific timestamp.
   * Expired roles are strictly forbidden from all voting, approvals, and PO releases.
   */
  async verifyAuthorityAtTime(params: {
    organizationId: string;
    personId: string;
    permission: string;
    amount?: number | null;
    atTime?: Date;
  }): Promise<{
    authorized: boolean;
    roleAtTime: string;
    signatureMode: 'DIRECT' | 'DELEGATED' | 'NONE';
    assignmentId?: string | null;
    reason: string;
  }> {
    const { organizationId, personId, permission, amount, atTime = new Date() } = params;

    let assignments: OrgRoleAssignment[] = [];
    if (this.repos.orgRoleAssignments) {
      const rows = await this.repos.orgRoleAssignments.findByOrganizationId(organizationId);
      assignments = rows as any;
    }

    let delegations: any[] = [];
    if (this.repos.organizationDelegations) {
      delegations = await this.repos.organizationDelegations.findByOrganizationId(organizationId);
    }

    return verifyPersonAuthorityAtTime({
      organizationId,
      personId,
      permission,
      amount,
      atTime,
      roleAssignments: assignments,
      delegations,
    });
  }

  /**
   * Records an immutable Governance Action Audit log.
   */
  async recordGovernanceAudit(
    actor: ActorContext,
    params: {
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
    }
  ): Promise<OrgGovernanceActionAudit> {
    const auditSnapshot = createGovernanceAuditSnapshot({
      actorPersonId: actor.profileId,
      organizationId: params.organizationId,
      roleAssignment: params.roleAssignment,
      roleAtTime: params.roleAtTime,
      responsibilityAtTime: params.responsibilityAtTime,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      transactionId: params.transactionId,
      payload: params.payload,
      timestamp: params.timestamp,
    });

    if (this.repos.orgGovernanceAudits) {
      await this.repos.orgGovernanceAudits.save(auditSnapshot as any);
    }

    await this.audit.log({
      actorId: actor.profileId,
      entityType: params.entityType,
      entityId: params.entityId,
      action: `governance.${params.action.toLowerCase()}`,
      metadata: {
        organizationId: params.organizationId,
        roleAtTime: auditSnapshot.roleAtTime,
        responsibilityAtTime: auditSnapshot.responsibilityAtTime,
        transactionId: params.transactionId,
        ...params.payload,
      },
    });

    return auditSnapshot;
  }

  /**
   * Retrieves role history and timeline for an organization.
   */
  async getRoleHistory(organizationId: string, roleId?: string): Promise<OrgRoleAssignment[]> {
    if (!this.repos.orgRoleAssignments) return [];
    const rows = await this.repos.orgRoleAssignments.findByOrganizationId(organizationId, roleId);
    return (rows as any[]).sort(
      (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    );
  }

  /**
   * Retrieves active role holder for a given role.
   */
  async getActiveRoleHolder(
    organizationId: string,
    roleId: string,
    atTime = new Date()
  ): Promise<OrgRoleAssignment | null> {
    if (!this.repos.orgRoleAssignments) return null;
    const row = await this.repos.orgRoleAssignments.findActiveRoleHolder(organizationId, roleId, atTime);
    return (row as any) ?? null;
  }

  /**
   * Identifies roles expiring soon within an organization.
   */
  async getExpiringRoles(
    organizationId: string,
    daysThreshold = 30,
    currentTime = new Date()
  ): Promise<Array<{ assignment: OrgRoleAssignment; daysLeft: number; isExpired: boolean }>> {
    if (!this.repos.orgRoleAssignments) return [];
    const rows = await this.repos.orgRoleAssignments.findByOrganizationId(organizationId);
    const activeAssignments = (rows as any[]).filter((a) => a.status === 'ACTIVE');

    const results: Array<{ assignment: OrgRoleAssignment; daysLeft: number; isExpired: boolean }> = [];
    for (const a of activeAssignments) {
      const exp = isRoleExpiringSoon(a, daysThreshold, currentTime);
      if (exp.expiring || exp.isExpired) {
        results.push({
          assignment: a,
          daysLeft: exp.daysLeft,
          isExpired: exp.isExpired,
        });
      }
    }
    return results;
  }

  private ensureCanManageOrg(actor: ActorContext, organizationId: string): void {
    if (actor.isPlatformAdmin) return;
    if (actor.organizationId === organizationId && (actor.orgRole === 'OWNER' || actor.orgRole === 'MANAGER')) {
      return;
    }
    throw new Error(`Unauthorized: Caller lacks permission to manage roles in organization ${organizationId}`);
  }
}
