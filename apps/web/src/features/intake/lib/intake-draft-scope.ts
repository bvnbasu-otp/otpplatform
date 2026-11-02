import { resolveBuyerPersonaFromContext } from '@otp/domain';
import type { RoleContext } from '@/features/roles/api/roles';
import type { IntakeDraftStorageScope } from './intake-storage';

export function resolveIntakeDraftStorageScope(
  authUserId: string | null | undefined,
  context: RoleContext,
): IntakeDraftStorageScope | null {
  if (
    !authUserId ||
    !context.signedIn ||
    context.side !== 'BUYER' ||
    !context.profileId
  ) {
    return null;
  }

  const persona = resolveBuyerPersonaFromContext({
    buyerType: context.buyerType,
    organizationId: context.organizationId,
    organizations: context.organizations,
  });
  if (!context.organizationId && persona !== 'INDIVIDUAL') return null;

  return {
    authUserId,
    profileId: context.profileId,
    organizationId: context.organizationId,
    persona,
  };
}
