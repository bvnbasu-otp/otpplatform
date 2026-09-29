/**
 * Persona-bound OTP Wallet entitlement (buyer vs supplier domains).
 * Wallet queries must follow reconciled portal side, not stale buyer org fallbacks.
 */

export type WalletPersona = 'BUYER' | 'SUPPLIER';

export type ReferredProfileKind = 'INDIVIDUAL' | 'RWA' | 'MSME' | 'SUPPLIER';

/** Golden referral matrix — application layer; production SQL ceiling 00220 credits flat ₹100 for supplier referral events only. */
export const REFERRAL_BONUS_INR_BY_REFERRED_PROFILE: Readonly<Record<ReferredProfileKind, number>> = {
  INDIVIDUAL: 10,
  RWA: 25,
  MSME: 50,
  SUPPLIER: 100,
};

export function referralBonusInrForReferredProfile(
  kind: ReferredProfileKind | string | null | undefined,
): number {
  const normalized = String(kind ?? 'INDIVIDUAL').toUpperCase();
  if (normalized === 'RWA') return REFERRAL_BONUS_INR_BY_REFERRED_PROFILE.RWA;
  if (normalized === 'MSME') return REFERRAL_BONUS_INR_BY_REFERRED_PROFILE.MSME;
  if (normalized === 'SUPPLIER') return REFERRAL_BONUS_INR_BY_REFERRED_PROFILE.SUPPLIER;
  return REFERRAL_BONUS_INR_BY_REFERRED_PROFILE.INDIVIDUAL;
}

export interface WalletOrgCandidate {
  id: string;
  orgType?: string | null;
  isPersonal?: boolean;
}

export interface WalletEntitlementInput {
  portalSide: WalletPersona | null;
  organizationId: string | null;
  supplierId?: string | null;
  organizations?: WalletOrgCandidate[];
}

/**
 * Picks the organization wallet row to read for the active persona.
 * Suppliers must not load a personal INDIVIDUAL buyer org left over from auto-provision.
 */
export function resolveWalletOrganizationId(input: WalletEntitlementInput): string | null {
  const side = input.portalSide;
  const orgs = input.organizations ?? [];

  if (side === 'SUPPLIER') {
    const nonPersonal = orgs.find(
      (o) => o.orgType && o.orgType.toUpperCase() !== 'INDIVIDUAL' && !o.isPersonal,
    );
    if (nonPersonal?.id) return nonPersonal.id;

    const anyNonIndividual = orgs.find((o) => o.orgType && o.orgType.toUpperCase() !== 'INDIVIDUAL');
    if (anyNonIndividual?.id) return anyNonIndividual.id;

    if (input.organizationId) {
      const active = orgs.find((o) => o.id === input.organizationId);
      if (active && active.orgType?.toUpperCase() !== 'INDIVIDUAL' && !active.isPersonal) {
        return input.organizationId;
      }
    }

    return null;
  }

  return input.organizationId;
}

export function walletPersonaFromPortalSide(
  side: WalletPersona | 'BUYER' | 'SUPPLIER' | null | undefined,
): WalletPersona {
  return side === 'SUPPLIER' ? 'SUPPLIER' : 'BUYER';
}
