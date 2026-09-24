import type {
  OrganizationMemberRole,
  AuthorizationPersona,
  AuthorizationContext,
  OrgRoleAssignment,
  OrganizationDelegation,
  resolveBuyerPersona,
} from '@otp/domain';

export interface ActorContext {
  profileId: string;
  organizationId?: string;
  orgRole?: OrganizationMemberRole | string;
  supplierIds?: string[];
  isPlatformAdmin?: boolean;
  isFounder?: boolean;
  email?: string | null;
  fullName?: string | null;
  persona?: AuthorizationPersona;
  isAccountBlocked?: boolean;
  blockedReason?: string | null;
  statutoryGstin?: string | null;
  statutoryPan?: string | null;
  roleAssignment?: OrgRoleAssignment | null;
  activeDelegation?: OrganizationDelegation | null;
}

export function hasOrgRole(
  actor: ActorContext,
  roles: (OrganizationMemberRole | string)[],
): boolean {
  return actor.orgRole !== undefined && roles.includes(actor.orgRole);
}

export function isSupplierFor(actor: ActorContext, supplierId: string): boolean {
  return actor.supplierIds?.includes(supplierId) ?? false;
}

/**
 * Converts ActorContext to full 13-Stage AuthorizationContext.
 */
export function toAuthorizationContext(actor: ActorContext): AuthorizationContext {
  let persona: AuthorizationPersona = actor.persona ?? 'INDIVIDUAL';
  if (!actor.persona) {
    if (actor.isPlatformAdmin || actor.isFounder) {
      persona = 'PLATFORM_ADMIN';
    } else if (actor.supplierIds && actor.supplierIds.length > 0 && !actor.organizationId) {
      persona = 'SUPPLIER';
    } else if (actor.organizationId) {
      // Default fallback if org is present
      persona = 'MSME';
    } else {
      persona = 'INDIVIDUAL';
    }
  }

  return {
    personId: actor.profileId,
    email: actor.email,
    fullName: actor.fullName,
    isAuthenticated: Boolean(actor.profileId && actor.profileId.trim() !== ''),
    persona,
    organizationId: actor.organizationId ?? null,
    isPlatformAdmin: actor.isPlatformAdmin,
    isFounder: actor.isFounder,
    isAccountBlocked: actor.isAccountBlocked,
    blockedReason: actor.blockedReason,
    statutoryGstin: actor.statutoryGstin,
    statutoryPan: actor.statutoryPan,
    membershipStatus: 'ACTIVE',
    roleAssignment: actor.roleAssignment ?? null,
    activeDelegation: actor.activeDelegation ?? null,
    supplierIds: actor.supplierIds,
  };
}
