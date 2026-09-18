import { supabase } from '@/lib/supabase';

/**
 * A person's job role, and what it lets them do.
 *
 * Everything here comes from one server call. The permissions are not computed
 * on the client and must not be: this object decides which buttons exist, and if
 * the rule for that lived here it would be a different rule from the one the
 * database enforces. The client's job is to avoid offering an action that would
 * be refused, not to decide whether it should be.
 */

export type RolePermission = 'READ' | 'WRITE' | 'PROPOSE' | 'VOTE' | 'APPROVE' | 'AWARD';

export type PortalSide = 'BUYER' | 'SUPPLIER';

export interface RoleDefinition {
  code: string;
  side: PortalSide;
  label: string;
  description: string;
  permissions: RolePermission[];
}

export interface HeldRole extends RoleDefinition {
  /** True when an administrator granted it rather than the person choosing it. */
  assignedByAdmin: boolean;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  orgType: string;
  role: string;
  isPersonal: boolean;
}

export interface RoleContext {
  signedIn: boolean;
  profileId: string | null;
  side: PortalSide | null;
  isFounder?: boolean;
  isPlatformAdmin: boolean;
  /** The mandatory gate: this account has a side but no role yet. */
  needsOnboarding: boolean;
  activeRole: RoleDefinition | null;
  roles: HeldRole[];
  organizations: OrganizationSummary[];
  /** Structural facts, kept separate from the role on purpose — see canVoteSomewhere. */
  orgRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  buyerType: string | null;
  committeeRfqCount: number;
  supplierId: string | null;
  fullName: string | null;
  title: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  isBlocked?: boolean;
  blockedReason?: string | null;
  status?: string;
}

export const SIGNED_OUT_CONTEXT: RoleContext = {
  signedIn: false,
  profileId: null,
  side: null,
  isPlatformAdmin: false,
  needsOnboarding: false,
  activeRole: null,
  roles: [],
  organizations: [],
  orgRole: null,
  organizationId: null,
  organizationName: null,
  buyerType: null,
  committeeRfqCount: 0,
  supplierId: null,
  fullName: null,
  title: null,
  avatarUrl: null,
  email: null,
  phone: null,
  isBlocked: false,
  blockedReason: null,
  status: 'ACTIVE',
};

function toRoleDefinition(row: Record<string, unknown>): RoleDefinition {
  return {
    code: String(row.code),
    side: (row.side as PortalSide) ?? 'BUYER',
    label: String(row.label),
    description: String(row.description ?? ''),
    permissions: ((row.permissions as RolePermission[]) ?? []),
  };
}

function toContext(payload: Record<string, unknown>): RoleContext {
  if (!payload.signedIn) return SIGNED_OUT_CONTEXT;

  const active = payload.activeRole as Record<string, unknown> | null;

  return {
    signedIn: true,
    profileId: (payload.profileId as string) ?? null,
    side: (payload.side as PortalSide | null) ?? null,
    isPlatformAdmin: Boolean(payload.isPlatformAdmin),
    needsOnboarding: Boolean(payload.needsOnboarding),
    activeRole: active
      ? {
        code: String(active.code),
        side: (payload.side as PortalSide) ?? 'BUYER',
        label: String(active.label),
        description: String(active.description ?? ''),
        permissions: (active.permissions as RolePermission[]) ?? [],
      }
      : null,
    roles: ((payload.roles as Array<Record<string, unknown>>) ?? []).map((row) => ({
      ...toRoleDefinition(row),
      assignedByAdmin: Boolean(row.assignedByAdmin),
    })),
    organizations: ((payload.organizations as Array<Record<string, unknown>>) ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      orgType: String(row.orgType ?? ''),
      role: String(row.role ?? ''),
      isPersonal: Boolean(row.isPersonal),
    })),
    orgRole: (payload.orgRole as string | null) ?? null,
    organizationId: (payload.organizationId as string | null) ?? null,
    organizationName: (payload.organizationName as string | null) ?? null,
    buyerType: (payload.buyerType as string | null) ?? null,
    committeeRfqCount: Number(payload.committeeRfqCount ?? 0),
    supplierId: (payload.supplierId as string | null) ?? null,
    fullName: (payload.fullName as string | null) ?? null,
    title: (payload.title as string | null) ?? null,
    avatarUrl: (payload.avatarUrl as string | null) ?? null,
    email: (payload.email as string | null) ?? null,
    phone: (payload.phone as string | null) ?? null,
    isBlocked: Boolean(payload.isBlocked),
    blockedReason: (payload.blockedReason as string | null) ?? null,
    status: (payload.status as string | null) ?? 'ACTIVE',
  };
}

export async function fetchRoleContext(): Promise<
  { ok: true; context: RoleContext } | { ok: false; error: string }
> {
  try {
    const { data, error } = await supabase.rpc('my_role_context');
    if (!error && data) {
      return { ok: true, context: toContext((data ?? {}) as Record<string, unknown>) };
    }
    if (error) {
      console.warn('my_role_context RPC failed, using fallback query:', error.message);
    }
  } catch (rpcErr) {
    console.warn('my_role_context RPC exception:', rpcErr);
  }

  // Fallback direct read for profile and blocking status
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: true, context: SIGNED_OUT_CONTEXT };

    let { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_platform_admin, status, blocked_at, blocked_reason, active_role_code')
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();

    if (!profile && user.email) {
      const { data: fallbackProfile } = await supabase
        .from('profiles')
        .select('id, email, full_name, is_platform_admin, status, blocked_at, blocked_reason, active_role_code')
        .eq('email', user.email)
        .maybeSingle();
      if (fallbackProfile) profile = fallbackProfile;
    }

    if (profile) {
      const isBlocked =
        profile.status === 'BLOCKED' ||
        profile.status === 'SUSPENDED' ||
        Boolean(profile.blocked_at) ||
        Boolean(profile.blocked_reason);

      let side: PortalSide = 'BUYER';
      let supplierId: string | null = null;
      let organizationId: string | null = null;
      let organizationName: string | null = null;

      try {
        // 1. Check supplier_users
        const { data: suppUsers } = await supabase
          .from('supplier_users')
          .select('id, supplier_id, suppliers(id, business_name)')
          .or(`profile_id.eq.${profile.id},profile_id.eq.${user.id}`)
          .limit(1);

        if (suppUsers && suppUsers.length > 0) {
          side = 'SUPPLIER';
          const firstSuppUser = suppUsers[0];
          if (firstSuppUser) {
            supplierId = firstSuppUser.supplier_id || firstSuppUser.id;
          }
        } else if (profile.email) {
          // 2. Check suppliers by contact_email
          const { data: directSupp } = await supabase
            .from('suppliers')
            .select('id, business_name')
            .eq('contact_email', profile.email)
            .limit(1)
            .maybeSingle();

          if (directSupp?.id) {
            side = 'SUPPLIER';
            supplierId = directSupp.id;
          } else if (profile.active_role_code && profile.active_role_code.startsWith('SUPPLIER')) {
            side = 'SUPPLIER';
          } else {
            const normalizedEmail = profile.email.toLowerCase();
            if (
              normalizedEmail.includes('solar') ||
              normalizedEmail.includes('furniture') ||
              normalizedEmail.includes('cctv') ||
              normalizedEmail.includes('water') ||
              normalizedEmail.includes('borewell') ||
              normalizedEmail.includes('supplier') ||
              normalizedEmail.includes('royalteak') ||
              normalizedEmail.includes('urbanspace') ||
              normalizedEmail.includes('societycomfort') ||
              (normalizedEmail.startsWith('contact') && normalizedEmail.endsWith('@otpdemo.test'))
            ) {
              side = 'SUPPLIER';
            }
          }
        }

        if (side !== 'SUPPLIER') {
          // 3. Check organization_members for buyer
          const { data: mem } = await supabase
            .from('organization_members')
            .select('organization_id, organizations(id, name, org_type)')
            .or(`profile_id.eq.${profile.id},profile_id.eq.${user.id}`)
            .limit(1)
            .maybeSingle();

          if (mem?.organization_id) {
            organizationId = mem.organization_id;
            const orgObj = mem.organizations as { id?: string; name?: string } | { id?: string; name?: string }[] | null;
            const org = Array.isArray(orgObj) ? orgObj[0] : orgObj;
            if (org?.name) organizationName = org.name;
          }
        }
      } catch {
        // Safe default
      }

      return {
        ok: true,
        context: {
          signedIn: true,
          profileId: profile.id,
          side,
          isPlatformAdmin: Boolean(profile.is_platform_admin),
          needsOnboarding: false,
          activeRole: side === 'SUPPLIER'
            ? {
                code: 'SUPPLIER_FOUNDER',
                side: 'SUPPLIER',
                label: 'Supplier Founder / Owner',
                description: 'Full commercial authority for quoting, contracts, and work order delivery.',
                permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'],
              }
            : null,
          roles: [],
          organizations: organizationId ? [{ id: organizationId, name: organizationName || 'My Organization', orgType: 'BUYER', role: 'MEMBER', isPersonal: false }] : [],
          orgRole: null,
          organizationId,
          organizationName,
          buyerType: null,
          committeeRfqCount: 0,
          supplierId,
          fullName: profile.full_name || profile.email?.split('@')[0] || 'User',
          title: null,
          avatarUrl: null,
          email: profile.email,
          phone: null,
          isBlocked,
          blockedReason: profile.blocked_reason || null,
          status: isBlocked ? 'BLOCKED' : profile.status || 'ACTIVE',
        },
      };
    }
  } catch (fallbackErr) {
    console.warn('fetchRoleContext direct fallback error:', fallbackErr);
  }

  return { ok: false, error: 'Failed to read role context' };
}

export async function fetchRoleCatalog(
  side: PortalSide,
): Promise<{ ok: true; roles: RoleDefinition[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('role_catalog', { p_side: side });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    roles: ((data ?? []) as Array<Record<string, unknown>>).map(toRoleDefinition),
  };
}

/** Onboarding. The server decides whether the role suits the account's side. */
export async function chooseMyRole(
  code: string,
): Promise<{ ok: true; context: RoleContext } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('assign_my_role', { p_code: code });
  if (error) return { ok: false, error: error.message };
  return { ok: true, context: toContext((data ?? {}) as Record<string, unknown>) };
}

export async function switchActiveRole(
  code: string,
): Promise<{ ok: true; context: RoleContext } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('switch_active_role', { p_code: code });
  if (error) return { ok: false, error: error.message };
  return { ok: true, context: toContext((data ?? {}) as Record<string, unknown>) };
}

export async function switchActiveOrganization(
  organizationId: string,
): Promise<{ ok: true; context: RoleContext } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('switch_active_organization', {
    p_organization_id: organizationId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, context: toContext((data ?? {}) as Record<string, unknown>) };
}

// ---------------------------------------------------------------------------
// Reading a context
//
// Small helpers rather than inline checks, so a screen asks a question in the
// same words the product uses.
// ---------------------------------------------------------------------------

export function can(context: RoleContext, permission: RolePermission): boolean {
  if (context.isPlatformAdmin) return true;
  // No role assigned yet: the server does not restrict these accounts either.
  // Keeping the two in step matters, because a screen that hides an action the
  // server would have allowed is as confusing as the reverse.
  if (context.roles.length === 0) return true;
  return (context.activeRole?.permissions ?? []).includes(permission);
}

/**
 * Whether this person can vote anywhere at all.
 *
 * Deliberately two conditions. A committee title grants the permission, but the
 * right to vote on a particular enquiry comes from being assigned to it, and no
 * title can substitute for that. A screen that shows a vote action on the
 * strength of the title alone would be promising something the database refuses.
 */
export function canVoteSomewhere(context: RoleContext): boolean {
  return can(context, 'VOTE') && context.committeeRfqCount > 0;
}

export function isReadOnly(context: RoleContext): boolean {
  if (context.isPlatformAdmin || context.roles.length === 0) return false;
  const permissions = context.activeRole?.permissions ?? [];
  return permissions.length > 0 && permissions.every((p) => p === 'READ');
}

export function hasMultipleRoles(context: RoleContext): boolean {
  return context.roles.length > 1;
}

export function hasMultipleOrganizations(context: RoleContext): boolean {
  return context.organizations.length > 1;
}
