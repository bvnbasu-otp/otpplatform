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
  const walletPersona = walletPersonaFromPortalSide(context.side);
  const isSupplierPersona = walletPersona === 'SUPPLIER';
  const entitledWalletOrgId = resolveWalletOrganizationId({
    portalSide: walletPersona,
    organizationId: context.organizationId,
    supplierId: context.supplierId,
    organizations: context.organizations.map((o) => ({
      id: o.id,
      orgType: o.orgType,
      isPersonal: o.isPersonal,
    })),
  });

  const referSide: ReferAndEarnSide = isSupplierPersona ? 'supplier' : 'buyer';
  const referIdentifier = isSupplierPersona
    ? entitledWalletOrgId || context.supplierId || context.email || null
    : entitledWalletOrgId || context.organizationId || context.email || null;
  const referOrgName = context.organizationName || null;

  return {
    walletPersona,
    isSupplierPersona,
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
