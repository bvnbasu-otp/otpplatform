import { supabase } from "@/lib/supabase";
import { switchActiveOrganization as switchOrgRpc } from "@/features/roles/api/roles";
import type { RoleContext } from "@/features/roles/api/roles";
import type {
  DelegationPermission,
  OrganizationInvitation,
  OrganizationDelegation,
  OrgInvitationStatus,
  OrgRoleAssignment,
  OrgGovernanceActionAudit,
  RoleRenewalParams,
  RoleRenewalResult,
} from "@otp/domain";

export interface OrgMember {
  profileId: string;
  fullName: string | null;
  email: string;
  role: string;
  joinedAt: string;
  isSelf: boolean;
}

export type OrgMembersResult =
  | { ok: true; members: OrgMember[] }
  | { ok: false; error: string };

export type InviteMemberResult =
  | { ok: true; message: string; token?: string; inviteUrl?: string; invitationId?: string }
  | { ok: false; error: string };

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: string };

export type UpdateMemberRoleResult =
  | { ok: true; message: string; newRole: string }
  | { ok: false; error: string };

export type SwitchOrgResult =
  | { ok: true; context: RoleContext }
  | { ok: false; error: string };

export type InvitationsListResult =
  | { ok: true; invitations: OrganizationInvitation[] }
  | { ok: false; error: string };

export type DelegationsListResult =
  | { ok: true; delegations: OrganizationDelegation[] }
  | { ok: false; error: string };

export type CreateDelegationResult =
  | { ok: true; delegationId: string; message: string }
  | { ok: false; error: string };

export async function listOrgMembers(
  organizationId: string,
  client = supabase
): Promise<OrgMembersResult> {
  const { data, error } = await client.rpc("list_org_members", {
    p_organization_id: organizationId,
  });
  if (error) return { ok: false, error: error.message };
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  return {
    ok: true,
    members: rows.map((r) => ({
      profileId: String(r.profile_id),
      fullName: (r.full_name as string | null) ?? null,
      email: String(r.email ?? ""),
      role: String(r.role ?? "MEMBER"),
      joinedAt: String(r.joined_at ?? ""),
      isSelf: Boolean(r.is_self),
    })),
  };
}

export async function inviteOrgMember(
  organizationId: string,
  email: string,
  role: string,
  client = supabase
): Promise<InviteMemberResult> {
  const { data, error } = await client.rpc("create_organization_invitation_atomic", {
    p_organization_id: organizationId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
    p_expires_days: 7,
  });

  if (error) {
    const { data: legacyData, error: legacyErr } = await client.rpc("invite_org_member", {
      p_organization_id: organizationId,
      p_email: email.trim().toLowerCase(),
      p_role: role,
    });
    if (legacyErr) return { ok: false, error: legacyErr.message };
    const res = legacyData as Record<string, unknown> | null;
    if (res && res.ok === false) {
      return { ok: false, error: String(res.error ?? "Failed to invite member") };
    }
    return { ok: true, message: String(res?.message ?? "Invite sent successfully") };
  }

  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to invite member") };
  }

  return {
    ok: true,
    message: String(result?.message ?? "Invite created successfully"),
    token: result?.token ? String(result.token) : undefined,
    inviteUrl: result?.inviteUrl ? String(result.inviteUrl) : undefined,
    invitationId: result?.invitationId ? String(result.invitationId) : undefined,
  };
}

export type AcceptInvitationResult =
  | { ok: true; organizationId: string; organizationName?: string; role?: string; message: string }
  | { ok: false; error: string };

export async function acceptOrgInvitation(
  token: string,
  client = supabase
): Promise<AcceptInvitationResult> {
  const { data, error } = await client.rpc("accept_organization_invitation_atomic", {
    p_token: token.trim(),
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to accept invitation") };
  }
  return {
    ok: true,
    organizationId: String(result?.organizationId ?? ""),
    organizationName: result?.organizationName ? String(result.organizationName) : undefined,
    role: result?.role ? String(result.role) : undefined,
    message: String(result?.message ?? "Joined organization successfully"),
  };
}

export async function revokeOrgInvitation(
  invitationId: string,
  client = supabase
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("revoke_organization_invitation_atomic", {
    p_invitation_id: invitationId,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to revoke invitation") };
  }
  return { ok: true, message: String(result?.message ?? "Invitation revoked") };
}

export async function listOrgInvitations(
  organizationId: string,
  client = supabase
): Promise<InvitationsListResult> {
  const { data, error } = await client.rpc("list_org_invitations", {
    p_organization_id: organizationId,
  });
  if (error) return { ok: false, error: error.message };
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  return {
    ok: true,
    invitations: rows.map((r) => ({
      id: String(r.id),
      organizationId: String(r.organizationId ?? organizationId),
      invitedEmail: String(r.invitedEmail ?? ""),
      role: String(r.role ?? "COMMITTEE_MEMBER"),
      invitedBy: String(r.invitedBy ?? ""),
      invitedByName: (r.invitedByName as string | null) ?? null,
      status: (r.status as OrgInvitationStatus) ?? "PENDING",
      expiresAt: String(r.expiresAt ?? ""),
      acceptedAt: (r.acceptedAt as string | null) ?? null,
      revokedAt: (r.revokedAt as string | null) ?? null,
      createdAt: String(r.createdAt ?? ""),
    })),
  };
}

export async function removeOrgMember(
  organizationId: string,
  profileId: string,
  client = supabase
): Promise<RemoveMemberResult> {
  const { data, error } = await client.rpc("remove_org_member", {
    p_organization_id: organizationId,
    p_profile_id: profileId,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to remove member") };
  }
  return { ok: true };
}

export async function updateTeamMemberRole(
  organizationId: string,
  profileId: string,
  newRole: string,
  client = supabase
): Promise<UpdateMemberRoleResult> {
  const { data, error } = await client.rpc("update_team_member_role_atomic", {
    p_organization_id: organizationId,
    p_profile_id: profileId,
    p_new_role: newRole,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to update role") };
  }
  return {
    ok: true,
    newRole: String(result?.newRole ?? newRole),
    message: String(result?.message ?? "Role updated successfully"),
  };
}

export async function createDelegationProxy(
  params: {
    organizationId: string;
    delegateeId: string;
    permissions: DelegationPermission[];
    startsAt?: string;
    expiresAt?: string;
    spendCap?: number | null;
    notes?: string | null;
  },
  client = supabase
): Promise<CreateDelegationResult> {
  const { data, error } = await client.rpc("create_delegation_proxy_atomic", {
    p_organization_id: params.organizationId,
    p_delegatee_id: params.delegateeId,
    p_permissions: params.permissions,
    p_starts_at: params.startsAt ?? new Date().toISOString(),
    p_expires_at: params.expiresAt ?? new Date(Date.now() + 14 * 86400000).toISOString(),
    p_spend_cap: params.spendCap ?? null,
    p_notes: params.notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to create delegation proxy") };
  }
  return {
    ok: true,
    delegationId: String(result?.delegationId ?? ""),
    message: String(result?.message ?? "Delegation proxy created"),
  };
}

export async function revokeDelegationProxy(
  delegationId: string,
  client = supabase
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("revoke_delegation_proxy_atomic", {
    p_delegation_id: delegationId,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to revoke delegation") };
  }
  return { ok: true, message: String(result?.message ?? "Delegation revoked") };
}

export async function listOrgDelegations(
  organizationId: string,
  client = supabase
): Promise<DelegationsListResult> {
  const { data, error } = await client.rpc("list_org_delegations", {
    p_organization_id: organizationId,
  });
  if (error) return { ok: false, error: error.message };
  const rows = (data as Array<Record<string, unknown>>) ?? [];
  return {
    ok: true,
    delegations: rows.map((r) => ({
      id: String(r.id),
      organizationId: String(r.organizationId ?? organizationId),
      delegatorId: String(r.delegatorId ?? ""),
      delegatorName: (r.delegatorName as string | null) ?? null,
      delegatorEmail: (r.delegatorEmail as string | null) ?? null,
      delegateeId: String(r.delegateeId ?? ""),
      delegateeName: (r.delegateeName as string | null) ?? null,
      delegateeEmail: (r.delegateeEmail as string | null) ?? null,
      permissions: (r.permissions as DelegationPermission[]) ?? ["APPROVE_TIER_1"],
      spendCapAmount: r.spendCapAmount != null ? Number(r.spendCapAmount) : null,
      startsAt: String(r.startsAt ?? ""),
      expiresAt: String(r.expiresAt ?? ""),
      isActive: Boolean(r.isActive),
      revokedAt: (r.revokedAt as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      createdAt: String(r.createdAt ?? ""),
    })),
  };
}

// ---------------------------------------------------------------------------
// Universal Role Lifecycle, Succession & Renewal RPC API Clients
// ---------------------------------------------------------------------------

export async function appointOrgRole(
  params: {
    organizationId: string;
    personId: string | null;
    roleId: string;
    roleName: string;
    roleCategory?: string;
    responsibilityScope?: string;
    authorityScope?: Record<string, unknown>;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    termDurationDays?: number;
    appointmentEvent?: string;
  },
  client = supabase
): Promise<{ ok: true; assignmentId: string; message: string } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("appoint_org_role_atomic", {
    p_organization_id: params.organizationId,
    p_person_id: params.personId,
    p_role_id: params.roleId,
    p_role_name: params.roleName,
    p_role_category: params.roleCategory ?? "RWA_GOVERNANCE",
    p_responsibility_scope: params.responsibilityScope ?? "GENERAL",
    p_authority_scope: params.authorityScope ?? {},
    p_effective_from: params.effectiveFrom ?? new Date().toISOString(),
    p_effective_to: params.effectiveTo ?? null,
    p_appointment_event: params.appointmentEvent ?? "DIRECT_APPOINTMENT",
    p_term_duration_days: params.termDurationDays ?? 365,
  });

  if (error) return { ok: false, error: error.message };
  const res = data as Record<string, unknown> | null;
  if (res && res.ok === false) {
    return { ok: false, error: String(res.error ?? "Failed to appoint role") };
  }
  return {
    ok: true,
    assignmentId: String(res?.assignmentId ?? ""),
    message: String(res?.message ?? "Role appointed successfully"),
  };
}

export async function transferOrgRoleSuccession(
  params: {
    organizationId: string;
    roleId: string;
    roleName?: string;
    predecessorPersonId?: string | null;
    successorPersonId?: string | null;
    effectiveDate?: string;
    termDurationDays?: number;
    successionEvent?: string;
    reason?: string;
    predecessorNewRole?: string;
  },
  client = supabase
): Promise<{ ok: true; successorAssignmentId: string; message: string } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("transfer_org_role_succession_atomic", {
    p_organization_id: params.organizationId,
    p_role_id: params.roleId,
    p_role_name: params.roleName ?? null,
    p_predecessor_person_id: params.predecessorPersonId ?? null,
    p_successor_person_id: params.successorPersonId ?? null,
    p_effective_date: params.effectiveDate ?? new Date().toISOString(),
    p_succession_event: params.successionEvent ?? "SUCCESSION_HANDOVER",
    p_reason: params.reason ?? "Role succession handover",
    p_responsibility_scope: null,
    p_authority_scope: null,
    p_predecessor_new_role: params.predecessorNewRole ?? "COMMITTEE_MEMBER",
    p_term_duration_days: params.termDurationDays ?? 365,
  });

  if (error) return { ok: false, error: error.message };
  const res = data as Record<string, unknown> | null;
  if (res && res.ok === false) {
    return { ok: false, error: String(res.error ?? "Failed to execute succession") };
  }
  return {
    ok: true,
    successorAssignmentId: String(res?.successorAssignmentId ?? ""),
    message: String(res?.message ?? "Succession completed successfully"),
  };
}

export async function renewOrRotateOrgRole(
  params: RoleRenewalParams,
  client = supabase
): Promise<RoleRenewalResult | { ok: false; error: string }> {
  const { data, error } = await client.rpc("renew_or_rotate_org_role_atomic", {
    p_assignment_id: params.assignmentId,
    p_continue_in_governance: params.continueInGovernance,
    p_renewal_role_id: params.renewalRoleId ?? null,
    p_renewal_role_name: params.renewalRoleName ?? null,
    p_term_duration_days: params.termDurationDays ?? 365,
    p_effective_date: params.effectiveDate ?? new Date().toISOString(),
    p_notes: params.notes ?? null,
  });

  if (error) return { ok: false, error: error.message };
  const res = data as Record<string, unknown> | null;
  if (res && res.ok === false) {
    return { ok: false, error: String(res.error ?? "Failed to renew/rotate role") };
  }
  return {
    ok: true,
    action: (res?.action as any) ?? "RENEWED",
    oldAssignmentId: params.assignmentId,
    newAssignmentId: res?.newAssignmentId ? String(res.newAssignmentId) : null,
    personId: res?.personId ? String(res.personId) : null,
    roleId: String(res?.roleId ?? ""),
    roleName: String(res?.roleName ?? ""),
    effectiveFrom: String(res?.effectiveFrom ?? ""),
    effectiveTo: res?.effectiveTo ? String(res.effectiveTo) : null,
    termDurationDays: params.termDurationDays ?? 365,
    message: String(res?.message ?? "Role renewed/rotated successfully"),
  };
}

export async function listOrgRoleHistory(
  organizationId: string,
  roleId?: string,
  client = supabase
): Promise<{ ok: true; history: OrgRoleAssignment[] } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("get_org_role_history", {
    p_organization_id: organizationId,
    p_role_id: roleId ?? null,
  });

  if (error) {
    // Fallback direct table select
    const { data: rows, error: selectErr } = await (client as any)
      .from("org_role_assignments")
      .select("*, profiles:person_id(full_name, email), appointed_by_profile:appointed_by(full_name)")
      .eq("organization_id", organizationId)
      .order("effective_from", { ascending: false });

    if (selectErr) return { ok: false, error: selectErr.message };
    const items = (rows as any[]) ?? [];
    return {
      ok: true,
      history: items.map((r) => ({
        id: String(r.id),
        organizationId: String(r.organization_id),
        personId: r.person_id ? String(r.person_id) : null,
        personName: r.profiles?.full_name ?? null,
        personEmail: r.profiles?.email ?? null,
        roleId: String(r.role_id),
        roleName: String(r.role_name),
        roleCategory: r.role_category,
        responsibilityScope: r.responsibility_scope,
        authorityScope: r.authority_scope ?? { permissions: [] },
        effectiveFrom: String(r.effective_from),
        effectiveTo: r.effective_to ? String(r.effective_to) : null,
        termDurationDays: r.term_duration_days != null ? Number(r.term_duration_days) : 365,
        status: r.status,
        appointedBy: r.appointed_by ? String(r.appointed_by) : null,
        appointedByName: r.appointed_by_profile?.full_name ?? null,
        appointmentEvent: String(r.appointment_event ?? ""),
        predecessorAssignmentId: r.predecessor_assignment_id ? String(r.predecessor_assignment_id) : null,
        removalEvent: r.removal_event ? String(r.removal_event) : null,
        removalReason: r.removal_reason ? String(r.removal_reason) : null,
        createdAt: String(r.created_at),
      })),
    };
  }

  const items = (data as any[]) ?? [];
  return {
    ok: true,
    history: items.map((r) => ({
      id: String(r.id),
      organizationId: String(r.organizationId),
      personId: r.personId ? String(r.personId) : null,
      personName: r.personName ?? null,
      personEmail: r.personEmail ?? null,
      roleId: String(r.roleId),
      roleName: String(r.roleName),
      roleCategory: r.roleCategory,
      responsibilityScope: r.responsibilityScope,
      authorityScope: r.authorityScope ?? { permissions: [] },
      effectiveFrom: String(r.effectiveFrom),
      effectiveTo: r.effectiveTo ? String(r.effectiveTo) : null,
      termDurationDays: r.termDurationDays != null ? Number(r.termDurationDays) : 365,
      status: r.status,
      appointedBy: r.appointedBy ? String(r.appointedBy) : null,
      appointedByName: r.appointedByName ?? null,
      appointmentEvent: String(r.appointmentEvent ?? ""),
      predecessorAssignmentId: r.predecessorAssignmentId ? String(r.predecessorAssignmentId) : null,
      removalEvent: r.removalEvent ? String(r.removalEvent) : null,
      removalReason: r.removalReason ? String(r.removalReason) : null,
      createdAt: String(r.createdAt),
    })),
  };
}

export async function switchActiveOrganization(
  organizationId: string,
  switchFn = switchOrgRpc
): Promise<SwitchOrgResult> {
  return switchFn(organizationId);
}
