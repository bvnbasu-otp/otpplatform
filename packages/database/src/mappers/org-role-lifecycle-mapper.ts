import type { OrgRoleAssignment, OrgGovernanceActionAudit, RoleHistoryItem } from '@otp/domain';

export interface OrgRoleAssignmentRow {
  id: string;
  organization_id: string;
  person_id: string | null;
  role_id: string;
  role_name: string;
  role_category: string;
  responsibility_scope: string;
  authority_scope: Record<string, unknown>;
  effective_from: string;
  effective_to: string | null;
  status: string;
  appointed_by: string | null;
  appointment_event: string;
  predecessor_assignment_id: string | null;
  removal_event: string | null;
  removal_reason: string | null;
  created_at: string;
  updated_at?: string;
  // Joined profile fields
  person_name?: string | null;
  person_email?: string | null;
  appointed_by_name?: string | null;
}

export interface OrgGovernanceActionAuditRow {
  id: string;
  actor_person_id: string;
  organization_id: string;
  role_assignment_id: string | null;
  role_at_time: string;
  responsibility_at_time: string;
  authority_at_time: Record<string, unknown>;
  action: string;
  entity_type: string;
  entity_id: string;
  transaction_id: string | null;
  payload: Record<string, unknown>;
  timestamp: string;
  actor_name?: string | null;
}

export function mapOrgRoleAssignmentRow(row: OrgRoleAssignmentRow): OrgRoleAssignment {
  return {
    id: row.id,
    organizationId: row.organization_id,
    personId: row.person_id ?? null,
    personName: row.person_name ?? null,
    personEmail: row.person_email ?? null,
    roleId: row.role_id,
    roleName: row.role_name,
    roleCategory: row.role_category as any,
    responsibilityScope: row.responsibility_scope,
    authorityScope: (row.authority_scope as any) ?? { permissions: [] },
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null,
    status: row.status as any,
    appointedBy: row.appointed_by ?? null,
    appointedByName: row.appointed_by_name ?? null,
    appointmentEvent: row.appointment_event,
    predecessorAssignmentId: row.predecessor_assignment_id ?? null,
    removalEvent: row.removal_event ?? null,
    removalReason: row.removal_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOrgGovernanceActionAuditRow(row: OrgGovernanceActionAuditRow): OrgGovernanceActionAudit {
  return {
    id: row.id,
    actorPersonId: row.actor_person_id,
    actorPersonName: row.actor_name ?? null,
    organizationId: row.organization_id,
    roleAssignmentId: row.role_assignment_id ?? null,
    roleAtTime: row.role_at_time,
    responsibilityAtTime: row.responsibility_at_time,
    authorityAtTime: row.authority_at_time,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    transactionId: row.transaction_id ?? null,
    payload: row.payload ?? {},
    timestamp: row.timestamp,
  };
}
