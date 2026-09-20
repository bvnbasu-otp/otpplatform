import { supabase } from "@/lib/supabase";
import { switchActiveOrganization as switchOrgRpc } from "@/features/roles/api/roles";
import type { RoleContext } from "@/features/roles/api/roles";
import type {
  DelegationPermission,
  OrganizationInvitation,
  OrganizationDelegation,
  OrgInvitationStatus,
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
  // Use atomic tokenized invitation RPC
  const { data, error } = await client.rpc("create_organization_invitation_atomic", {
    p_organization_id: organizationId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
    p_expires_days: 7,
  });

  if (error) {
    // Fallback to legacy RPC if atomic RPC is not yet available in current runtime
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

export async function switchActiveOrganization(
  organizationId: string,
  switchFn = switchOrgRpc
): Promise<SwitchOrgResult> {
  return switchFn(organizationId);
}
