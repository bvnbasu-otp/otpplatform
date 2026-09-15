import { supabase } from "@/lib/supabase";
import { switchActiveOrganization as switchOrgRpc } from "@/features/roles/api/roles";
import type { RoleContext } from "@/features/roles/api/roles";

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
  | { ok: true; message: string }
  | { ok: false; error: string };

export type RemoveMemberResult =
  | { ok: true }
  | { ok: false; error: string };

export type SwitchOrgResult =
  | { ok: true; context: RoleContext }
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
  const { data, error } = await client.rpc("invite_org_member", {
    p_organization_id: organizationId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as Record<string, unknown> | null;
  if (result && result.ok === false) {
    return { ok: false, error: String(result.error ?? "Failed to invite member") };
  }
  return { ok: true, message: String(result?.message ?? "Invite sent successfully") };
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

export async function switchActiveOrganization(
  organizationId: string,
  switchFn = switchOrgRpc
): Promise<SwitchOrgResult> {
  return switchFn(organizationId);
}

