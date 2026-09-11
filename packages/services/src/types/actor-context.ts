import type { OrganizationMemberRole } from '@otp/domain';

export interface ActorContext {
  profileId: string;
  organizationId?: string;
  orgRole?: OrganizationMemberRole;
  supplierIds?: string[];
  isPlatformAdmin?: boolean;
}

export function hasOrgRole(
  actor: ActorContext,
  roles: OrganizationMemberRole[],
): boolean {
  return actor.orgRole !== undefined && roles.includes(actor.orgRole);
}

export function isSupplierFor(actor: ActorContext, supplierId: string): boolean {
  return actor.supplierIds?.includes(supplierId) ?? false;
}
