import { useMemo } from 'react';
import { useRoleContext, type RoleContext } from '@/features/roles';
import {
  resolveWalletOrganizationId,
  walletPersonaFromPortalSide,
  type WalletPersona,
} from '@otp/domain';

export type ReferAndEarnSide = 'buyer' | 'supplier';

export interface WalletEntitlement {
  walletPersona: WalletPersona;
  isSupplierPersona: boolean;
  customerWalletAllowed: boolean;
  entitledWalletOrgId: string | null;
  referSide: ReferAndEarnSide;
  referIdentifier: string | null;
  referOrgName: string | null;
}

/**
 * Binds wallet RPC org id and refer-and-earn side to reconciled portal persona
 * (Person → Identity → Persona → Context → Org → Wallet), not buyer org fallbacks.
 */
export function walletEntitlementFromContext(context: RoleContext): WalletEntitlement {
  const platformRole = Boolean(context.isPlatformAdmin || context.isFounder);
  const walletPersona = walletPersonaFromPortalSide(context.side);
  const isSupplierPersona = !platformRole && walletPersona === 'SUPPLIER';
  const customerWalletAllowed = !platformRole;
  const entitledWalletOrgId = customerWalletAllowed
    ? resolveWalletOrganizationId({
        portalSide: isSupplierPersona ? 'SUPPLIER' : 'BUYER',
        organizationId: context.organizationId,
        supplierId: context.supplierId,
        organizations: context.organizations.map((o) => ({
          id: o.id,
          orgType: o.orgType,
          isPersonal: o.isPersonal,
        })),
      })
    : null;

  const referSide: ReferAndEarnSide = isSupplierPersona ? 'supplier' : 'buyer';
  const referIdentifier = platformRole
    ? context.email || context.profileId
    : isSupplierPersona
      ? entitledWalletOrgId || context.supplierId || context.email || null
      : entitledWalletOrgId || context.organizationId || context.email || null;
  const referOrgName = platformRole ? null : context.organizationName || null;

  return {
    walletPersona: platformRole ? 'BUYER' : walletPersona,
    isSupplierPersona,
    customerWalletAllowed,
    entitledWalletOrgId,
    referSide,
    referIdentifier,
    referOrgName,
  };
}

export function useWalletEntitlement(): WalletEntitlement {
  const { context } = useRoleContext();
  return useMemo(() => walletEntitlementFromContext(context), [context]);
}
