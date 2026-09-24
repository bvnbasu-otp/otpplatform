import type { DatabaseClient } from '../client';
import {
  mapOrgRoleAssignmentRow,
  mapOrgGovernanceActionAuditRow,
  type OrgRoleAssignmentRow,
  type OrgGovernanceActionAuditRow,
} from '../mappers/org-role-lifecycle-mapper';
import type {
  OrgRoleAssignment,
  OrgGovernanceActionAudit,
  RoleSuccessionTransition,
  RoleAuthorityScope,
} from '@otp/domain';

export interface OrgRoleLifecycleRepository {
  findRoleAssignmentById(id: string): Promise<OrgRoleAssignment | null>;
  findActiveRoleHolder(organizationId: string, roleId: string, atTime?: Date): Promise<OrgRoleAssignment | null>;
  listRoleAssignments(organizationId: string, roleId?: string): Promise<OrgRoleAssignment[]>;
  listRoleHistory(organizationId: string, roleId?: string): Promise<OrgRoleAssignment[]>;
  saveRoleAssignment(assignment: OrgRoleAssignment): Promise<OrgRoleAssignment>;
  recordGovernanceAudit(audit: OrgGovernanceActionAudit): Promise<OrgGovernanceActionAudit>;
  listGovernanceAudits(organizationId: string, limit?: number): Promise<OrgGovernanceActionAudit[]>;
}

export class SupabaseOrgRoleLifecycleRepository implements OrgRoleLifecycleRepository {
  constructor(private readonly client: DatabaseClient) {}

  async findRoleAssignmentById(id: string): Promise<OrgRoleAssignment | null> {
    const { data, error } = await (this.client as any)
      .from('org_role_assignments')
      .select('*, profiles:person_id(full_name, email)')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;

    const row: OrgRoleAssignmentRow = {
      ...data,
      person_name: data.profiles?.full_name ?? null,
      person_email: data.profiles?.email ?? null,
    };
    return mapOrgRoleAssignmentRow(row);
  }

  async findActiveRoleHolder(
    organizationId: string,
    roleId: string,
    atTime: Date = new Date()
  ): Promise<OrgRoleAssignment | null> {
    const timeIso = atTime.toISOString();
    const { data, error } = await (this.client as any)
      .from('org_role_assignments')
      .select('*, profiles:person_id(full_name, email)')
      .eq('organization_id', organizationId)
      .eq('role_id', roleId)
      .eq('status', 'ACTIVE')
      .lte('effective_from', timeIso)
      .or(`effective_to.is.null,effective_to.gt.${timeIso}`)
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const row: OrgRoleAssignmentRow = {
      ...data,
      person_name: data.profiles?.full_name ?? null,
      person_email: data.profiles?.email ?? null,
    };
    return mapOrgRoleAssignmentRow(row);
  }

  async listRoleAssignments(
    organizationId: string,
    roleId?: string
  ): Promise<OrgRoleAssignment[]> {
    let query = (this.client as any)
      .from('org_role_assignments')
      .select('*, profiles:person_id(full_name, email)')
      .eq('organization_id', organizationId);

    if (roleId) {
      query = query.eq('role_id', roleId);
    }

    const { data, error } = await query.order('effective_from', { ascending: false });

    if (error || !data) return [];

    return (data as any[]).map((d) =>
      mapOrgRoleAssignmentRow({
        ...d,
        person_name: d.profiles?.full_name ?? null,
        person_email: d.profiles?.email ?? null,
      })
    );
  }

  async listRoleHistory(
    organizationId: string,
    roleId?: string
  ): Promise<OrgRoleAssignment[]> {
    return this.listRoleAssignments(organizationId, roleId);
  }

  async saveRoleAssignment(assignment: OrgRoleAssignment): Promise<OrgRoleAssignment> {
    const row: Record<string, unknown> = {
      id: assignment.id,
      organization_id: assignment.organizationId,
      person_id: assignment.personId ?? null,
      role_id: assignment.roleId,
      role_name: assignment.roleName,
      role_category: assignment.roleCategory,
      responsibility_scope: assignment.responsibilityScope,
      authority_scope: assignment.authorityScope,
      effective_from: assignment.effectiveFrom,
      effective_to: assignment.effectiveTo ?? null,
      status: assignment.status,
      appointed_by: assignment.appointedBy ?? null,
      appointment_event: assignment.appointmentEvent,
      predecessor_assignment_id: assignment.predecessorAssignmentId ?? null,
      removal_event: assignment.removalEvent ?? null,
      removal_reason: assignment.removalReason ?? null,
      created_at: assignment.createdAt,
      updated_at: assignment.updatedAt ?? new Date().toISOString(),
    };

    const { data, error } = await (this.client as any)
      .from('org_role_assignments')
      .upsert(row)
      .select('*, profiles:person_id(full_name, email)')
      .single();

    if (error) {
      throw new Error(`Failed to save role assignment: ${error.message}`);
    }

    return mapOrgRoleAssignmentRow({
      ...data,
      person_name: data.profiles?.full_name ?? null,
      person_email: data.profiles?.email ?? null,
    });
  }

  async recordGovernanceAudit(audit: OrgGovernanceActionAudit): Promise<OrgGovernanceActionAudit> {
    const row: Record<string, unknown> = {
      id: audit.id,
      actor_person_id: audit.actorPersonId,
      organization_id: audit.organizationId,
      role_assignment_id: audit.roleAssignmentId ?? null,
      role_at_time: audit.roleAtTime,
      responsibility_at_time: audit.responsibilityAtTime,
      authority_at_time: audit.authorityAtTime,
      action: audit.action,
      entity_type: audit.entityType,
      entity_id: audit.entityId,
      transaction_id: audit.transactionId ?? null,
      payload: audit.payload,
      timestamp: audit.timestamp,
    };

    const { data, error } = await (this.client as any)
      .from('org_governance_action_audits')
      .insert(row)
      .select('*, profiles:actor_person_id(full_name)')
      .single();

    if (error) {
      throw new Error(`Failed to record governance audit: ${error.message}`);
    }

    return mapOrgGovernanceActionAuditRow({
      ...data,
      actor_name: data.profiles?.full_name ?? null,
    });
  }

  async listGovernanceAudits(
    organizationId: string,
    limit = 50
  ): Promise<OrgGovernanceActionAudit[]> {
    const { data, error } = await (this.client as any)
      .from('org_governance_action_audits')
      .select('*, profiles:actor_person_id(full_name)')
      .eq('organization_id', organizationId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return (data as any[]).map((d) =>
      mapOrgGovernanceActionAuditRow({
        ...d,
        actor_name: d.profiles?.full_name ?? null,
      })
    );
  }
}
