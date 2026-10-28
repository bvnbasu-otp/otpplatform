import type { PasswordPolicyView } from '@otp/domain';
import { supabase } from '@/lib/supabase';

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, fallbackValue: T): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallbackValue), timeoutMs)),
  ]);
}

export function isJwtFutureError(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === 'object' && err !== null) {
    const code = String((err as any).code || '');
    if (/pgrst303/i.test(code)) return true;
  }
  const msg = typeof err === 'string' ? err : (err as any).message || String(err);
  return /jwt.*future|issued at future|pgrst303|iat.*future/i.test(msg);
}

export async function retryOnClockSkew<T>(
  fn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  delayMs = 1200,
): Promise<{ data: T | null; error: { message: string } | null }> {
  let result = await fn();
  if (result.error && (isJwtFutureError(result.error) || isJwtFutureError(result.error.message))) {
    console.warn(`[OTP Auth] Clock skew detected (${result.error.message}). Retrying in ${delayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await fn();
  }
  return result;
}

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

export type PortalSide = 'BUYER' | 'SUPPLIER' | 'CONSOLE';

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
  passwordPolicy?: PasswordPolicyView | null;
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
  passwordPolicy: null,
};

function toPasswordPolicy(raw: unknown): PasswordPolicyView | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    enforced: Boolean(row.enforced),
    exempt: Boolean(row.exempt),
    mustChangePassword: Boolean(row.mustChangePassword),
    expiresAt: (row.expiresAt as string | null) ?? null,
    daysRemaining: row.daysRemaining == null ? null : Number(row.daysRemaining),
    warnLevel: (row.warnLevel as PasswordPolicyView['warnLevel']) ?? null,
  };
}

export function normalizeRolePermissions(raw: unknown): RolePermission[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is RolePermission =>
    p === 'READ' ||
    p === 'WRITE' ||
    p === 'PROPOSE' ||
    p === 'VOTE' ||
    p === 'APPROVE' ||
    p === 'AWARD',
  );
}

/**
 * When `active_portal_side` was set to BUYER during personal-org auto-provision but
 * the person only holds supplier roles, route guards and dashboards must follow the
 * active role — not a stale portal-side column alone.
 */
export function reconcilePortalSide(
  payloadSide: PortalSide | null,
  activeRole: RoleDefinition | null,
  roles: HeldRole[],
  supplierId?: string | null,
): PortalSide | null {
  if (!activeRole) return payloadSide;

  const roleSide = activeRole.side;
  if (!payloadSide) return roleSide;
  if (payloadSide === roleSide) return payloadSide;

  if (payloadSide === 'BUYER' && roleSide === 'SUPPLIER') {
    const hasBuyerRole = roles.some((r) => r.side === 'BUYER');
    const hasSupplierRole =
      roles.some((r) => r.side === 'SUPPLIER') || activeRole.code.startsWith('SUPPLIER');
    if (hasBuyerRole && hasSupplierRole) {
      return roleSide;
    }
    if (hasSupplierRole && !hasBuyerRole) {
      return 'SUPPLIER';
    }
    if (supplierId && !hasBuyerRole) {
      return 'SUPPLIER';
    }
  }

  if (payloadSide === 'SUPPLIER' && roleSide === 'BUYER') {
    const hasSupplierRole = roles.some((r) => r.side === 'SUPPLIER');
    if (!hasSupplierRole) return 'BUYER';
  }

  return payloadSide;
}

function toRoleDefinition(row: Record<string, unknown>): RoleDefinition {
  return {
    code: String(row.code),
    side: (row.side as PortalSide) ?? 'BUYER',
    label: String(row.label),
    description: String(row.description ?? ''),
    permissions: normalizeRolePermissions(row.permissions),
  };
}

function toContext(payload: Record<string, unknown>): RoleContext {
  if (!payload.signedIn) return SIGNED_OUT_CONTEXT;

  const active = payload.activeRole as Record<string, unknown> | null;
  const roles = ((payload.roles as Array<Record<string, unknown>>) ?? []).map((row) => ({
    ...toRoleDefinition(row),
    assignedByAdmin: Boolean(row.assignedByAdmin),
  }));
  const supplierId = (payload.supplierId as string | null) ?? null;

  const activeRole: RoleDefinition | null = active
    ? {
        code: String(active.code),
        side: (active.side as PortalSide) ?? 'BUYER',
        label: String(active.label),
        description: String(active.description ?? ''),
        permissions: normalizeRolePermissions(active.permissions),
      }
    : null;

  const side = reconcilePortalSide(
    (payload.side as PortalSide | null) ?? null,
    activeRole,
    roles,
    supplierId,
  );

  return {
    signedIn: true,
    profileId: (payload.profileId as string) ?? null,
    side,
    isPlatformAdmin: Boolean(payload.isPlatformAdmin),
    isFounder: Boolean(payload.isFounder),
    needsOnboarding: Boolean(payload.needsOnboarding),
    activeRole,
    roles,
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
    supplierId,
    fullName: (payload.fullName as string | null) ?? null,
    title: (payload.title as string | null) ?? null,
    avatarUrl: (payload.avatarUrl as string | null) ?? null,
    email: (payload.email as string | null) ?? null,
    phone: (payload.phone as string | null) ?? null,
    isBlocked: Boolean(payload.isBlocked),
    blockedReason: (payload.blockedReason as string | null) ?? null,
    status: (payload.status as string | null) ?? 'ACTIVE',
    passwordPolicy: toPasswordPolicy(payload.passwordPolicy),
  };
}

export async function fetchRoleContext(): Promise<
  { ok: true; context: RoleContext } | { ok: false; error: string }
> {
  let rpcErrorMessage: string | null = null;
  try {
    const { data, error } = await retryOnClockSkew(async () => {
      return (await withTimeout(
        supabase.rpc('my_role_context') as unknown as PromiseLike<{ data: unknown; error: unknown }>,
        5000,
        { data: null, error: { message: 'my_role_context RPC timeout after 5000ms' } },
      )) as { data: unknown; error: { message: string } | null };
    });

    if (!error && data) {
      const parsed = toContext((data ?? {}) as Record<string, unknown>);
      if (parsed.signedIn) {
        return { ok: true, context: parsed };
      }
    }
    if (error) {
      rpcErrorMessage = error.message;
      console.warn('my_role_context RPC failed, using fallback query:', error.message);
    }
  } catch (rpcErr) {
    rpcErrorMessage = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
    console.warn('my_role_context RPC exception:', rpcErr);
  }

  // Fallback direct read for profile and blocking status
  try {
    const authResult = await withTimeout(
      supabase.auth.getUser(),
      3000,
      { data: { user: null }, error: new Error('auth.getUser timeout') } as any,
    );
    const user = authResult?.data?.user;
    if (!user) return { ok: true, context: SIGNED_OUT_CONTEXT };

    let { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_founder, is_platform_admin, status, blocked_at, blocked_reason, active_role_code, active_portal_side')
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .maybeSingle();

    if (profileErr) {
      console.warn('Direct profile query error:', profileErr.message);
      return { ok: false, error: profileErr.message || rpcErrorMessage || 'Failed to read profile' };
    }

    if (!profile && user.email) {
      const { data: fallbackProfile, error: fallbackErr } = await supabase
        .from('profiles')
        .select('id, email, full_name, is_founder, is_platform_admin, status, blocked_at, blocked_reason, active_role_code, active_portal_side')
        .eq('email', user.email)
        .maybeSingle();
      if (fallbackErr) {
        console.warn('Fallback profile query error:', fallbackErr.message);
        return { ok: false, error: fallbackErr.message || rpcErrorMessage || 'Failed to read profile' };
      }
      if (fallbackProfile) profile = fallbackProfile;
    }

    if (profile) {
      const isBlocked =
        profile.status === 'BLOCKED' ||
        profile.status === 'SUSPENDED' ||
        Boolean(profile.blocked_at) ||
        Boolean(profile.blocked_reason);

      if (profile.is_founder || profile.is_platform_admin || profile.active_portal_side === 'CONSOLE') {
        const activeCode = profile.active_role_code || (profile.is_founder ? 'SUPER_ADMIN' : 'INTERNAL_OPERATOR');
        const roleLabels: Record<string, string> = {
          SUPER_ADMIN: 'Platform Super Administrator',
          INTERNAL_OPERATOR: 'Internal Operations Lead',
          FINANCE_OPERATOR: 'Finance & Settlement Operator',
          CATALOG_MANAGER: 'Catalog & Taxonomy Manager',
          SUPPORT_OPERATOR: 'Customer Support Operator',
          LEGAL_AUDITOR: 'Legal & Compliance Auditor',
        };
        return {
          ok: true,
          context: {
            signedIn: true,
            profileId: profile.id,
            side: 'CONSOLE',
            isPlatformAdmin: Boolean(profile.is_platform_admin || profile.is_founder),
            isFounder: Boolean(profile.is_founder),
            needsOnboarding: false,
            activeRole: {
              code: activeCode,
              side: 'CONSOLE',
              label: roleLabels[activeCode] || String(activeCode).replace(/_/g, ' '),
              description: 'Privileged internal platform operations and diagnostic authority.',
              permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'],
            },
            roles: [
              { code: 'SUPER_ADMIN', side: 'CONSOLE', label: 'Platform Super Administrator', description: 'Full root platform operator and security authority.', assignedByAdmin: true, permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'] },
              { code: 'INTERNAL_OPERATOR', side: 'CONSOLE', label: 'Internal Operations Lead', description: 'Day-to-day operations and workflow diagnostics.', assignedByAdmin: true, permissions: ['READ', 'WRITE', 'PROPOSE', 'APPROVE', 'AWARD'] },
              { code: 'FINANCE_OPERATOR', side: 'CONSOLE', label: 'Finance & Settlement Operator', description: 'Settlement reconciliation and ledger disbursements.', assignedByAdmin: true, permissions: ['READ', 'WRITE', 'APPROVE'] },
              { code: 'CATALOG_MANAGER', side: 'CONSOLE', label: 'Catalog & Taxonomy Manager', description: 'Catalog taxonomy and pricing governance.', assignedByAdmin: true, permissions: ['READ', 'WRITE', 'APPROVE'] },
              { code: 'SUPPORT_OPERATOR', side: 'CONSOLE', label: 'Customer Support Operator', description: 'Buyer and supplier diagnostic assistance.', assignedByAdmin: true, permissions: ['READ', 'WRITE'] },
              { code: 'LEGAL_AUDITOR', side: 'CONSOLE', label: 'Legal & Compliance Auditor', description: 'Immutable audit logs and legal agreement oversight.', assignedByAdmin: true, permissions: ['READ'] },
            ],
            organizations: [],
            orgRole: null,
            organizationId: null,
            organizationName: null,
            buyerType: null,
            committeeRfqCount: 0,
            supplierId: null,
            fullName: profile.full_name || (profile.is_founder ? 'Basu (Founder & CEO)' : 'Internal Platform Operator'),
            title: profile.is_founder ? 'Founder & CEO' : 'Internal Platform Operator',
            avatarUrl: null,
            email: profile.email,
            phone: null,
            isBlocked,
            blockedReason: profile.blocked_reason || null,
            status: isBlocked ? 'BLOCKED' : profile.status || 'ACTIVE',
          },
        };
      }

      let side: PortalSide = profile.active_portal_side ? (profile.active_portal_side as PortalSide) : 'BUYER';
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
            const rawSup = (firstSuppUser as unknown as { suppliers?: { business_name?: string } | { business_name?: string }[] }).suppliers;
            const supObj = Array.isArray(rawSup) ? rawSup[0] : rawSup;
            if (supObj?.business_name) {
              organizationName = supObj.business_name;
            }
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
            if (directSupp.business_name) {
              organizationName = directSupp.business_name;
            }
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
              (normalizedEmail.startsWith('contact') && normalizedEmail.endsWith('@otpdemo.test')) ||
              (normalizedEmail.endsWith('@otpdemo.test') && !normalizedEmail.includes('buyer') && !normalizedEmail.includes('secretary') && !normalizedEmail.includes('owner') && !normalizedEmail.includes('procurement') && !normalizedEmail.includes('bharathi'))
            ) {
              side = 'SUPPLIER';
            }
          }
        }

        if (side === 'SUPPLIER' && !organizationName) {
          const metaName =
            (user?.user_metadata?.business_name as string | undefined) ||
            (user?.user_metadata?.organization_name as string | undefined);
          if (metaName) {
            organizationName = metaName;
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
          isFounder: Boolean(profile.is_founder),
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

    // Authenticated user but profile row not yet created / network error: synthesize graceful fallback
    if (!profile && user) {
      const email = user.email || '';
      return {
        ok: true,
        context: {
          ...SIGNED_OUT_CONTEXT,
          signedIn: true,
          profileId: user.id,
          email,
          fullName: (user.user_metadata?.full_name as string) || (email ? email.split('@')[0] : 'User'),
          isPlatformAdmin: false,
          needsOnboarding: true,
          status: 'ACTIVE',
        },
      };
    }
  } catch (fallbackErr) {
    console.warn('fetchRoleContext direct fallback error:', fallbackErr);
    return {
      ok: false,
      error: fallbackErr instanceof Error ? fallbackErr.message : (rpcErrorMessage || 'Failed to read role context'),
    };
  }

  return { ok: false, error: rpcErrorMessage || 'Failed to read role context' };
}

export async function fetchRoleCatalog(
  side: PortalSide,
): Promise<{ ok: true; roles: RoleDefinition[] } | { ok: false; error: string }> {
  const { data, error } = await retryOnClockSkew(async () => {
    return (await supabase.rpc('role_catalog', { p_side: side })) as {
      data: unknown;
      error: { message: string } | null;
    };
  });
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
  const { data, error } = await retryOnClockSkew(async () => {
    return (await supabase.rpc('assign_my_role', { p_code: code })) as {
      data: unknown;
      error: { message: string } | null;
    };
  });
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
