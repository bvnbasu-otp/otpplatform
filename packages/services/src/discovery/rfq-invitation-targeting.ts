import { PIN_ONLY_WARMING_CATEGORY, normalizeCategoryKey } from '@otp/domain';

/**
 * Eligibility for an RFQ invitation inside the existing supplier-network engine.
 * A PIN match, an empty category list, or PIN-only warming is not an invitation.
 * A supplier must also declare service coverage (PINs or cities) that includes
 * the delivery location; matching taxonomy alone is not eligibility.
 * External discovery, OTP registration, and GST verification stay separate.
 * Creating an invitation does not mean it was dispatched or answered.
 */

export type SupplierTrustClass = 'EXTERNAL_DISCOVERY' | 'OTP_REGISTERED' | 'GST_VERIFIED';

export interface RfqTargetingRequest {
  category: string;
  subcategory?: string | null;
  organizationId?: string | null;
  location?: { pinCode?: string | null; city?: string | null } | null;
}

export interface RfqTargetSupplier {
  tenantId?: string | null;
  capability?: {
    categories?: string[] | null;
    subcategories?: string[] | null;
    serviceArea?: { city?: string | null; pinCode?: string | null; pins?: string[] | null } | null;
    verificationStatus?: string | null;
  } | null;
  categories?: string[] | null;
  categoryCode?: string | null;
  subcategory?: string | null;
  subcategories?: string[] | null;
  servicePins?: string[] | null;
  serviceCities?: string[] | null;
  claimedTier?: string | null;
  gstinVerified?: boolean | null;
  otpRegistered?: boolean | null;
}

export interface InvitationPlan {
  supplierKey: string;
  invitationStatus: 'CREATED';
  deliveryStatus: 'NOT_DISPATCHED';
}

function tokens(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(tokens);
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  return trimmed ? [normalizeCategoryKey(trimmed)] : [];
}

export function supplierTaxonomyLabels(supplier: RfqTargetSupplier): string[] {
  return [
    ...new Set([
      ...tokens(supplier.capability?.categories),
      ...tokens(supplier.capability?.subcategories),
      ...tokens(supplier.categories),
      ...tokens(supplier.categoryCode),
      ...tokens(supplier.subcategory),
      ...tokens(supplier.subcategories),
    ]),
  ];
}

function declaredCoverage(supplier: RfqTargetSupplier): { pins: string[]; cities: string[] } {
  const pins = new Set<string>();
  const cities = new Set<string>();
  const area = supplier.capability?.serviceArea;
  if (area?.pinCode?.trim()) pins.add(area.pinCode.trim());
  for (const pin of area?.pins ?? []) {
    if (pin?.trim()) pins.add(pin.trim());
  }
  for (const pin of supplier.servicePins ?? []) {
    if (pin?.trim()) pins.add(pin.trim());
  }
  if (area?.city?.trim()) cities.add(normalizeCategoryKey(area.city));
  for (const city of supplier.serviceCities ?? []) {
    if (city?.trim()) cities.add(normalizeCategoryKey(city));
  }
  return { pins: [...pins], cities: [...cities] };
}

export function classifySupplierTrust(supplier: RfqTargetSupplier): SupplierTrustClass {
  const claimed = `${supplier.claimedTier ?? ''} ${supplier.capability?.verificationStatus ?? ''}`.toUpperCase();
  if (supplier.gstinVerified === true || claimed.includes('GST_VERIFIED')) return 'GST_VERIFIED';
  if (supplier.otpRegistered === true || claimed.includes('OTP_REGISTERED')) return 'OTP_REGISTERED';
  return 'EXTERNAL_DISCOVERY';
}

export function isEligibleRfqInvitationTarget(
  supplier: RfqTargetSupplier,
  request: RfqTargetingRequest,
): { eligible: boolean; reason: string } {
  const requestedCategory = normalizeCategoryKey(request.category ?? '');
  if (!requestedCategory || requestedCategory === normalizeCategoryKey(PIN_ONLY_WARMING_CATEGORY)) {
    return { eligible: false, reason: 'pin_only_warming_is_not_an_invitation' };
  }

  const labels = supplierTaxonomyLabels(supplier);
  if (labels.length === 0 || labels.includes(normalizeCategoryKey(PIN_ONLY_WARMING_CATEGORY))) {
    return { eligible: false, reason: 'missing_or_pin_only_taxonomy' };
  }

  const requestedSubcategory = request.subcategory ? normalizeCategoryKey(request.subcategory) : '';
  if (requestedSubcategory) {
    if (!labels.includes(requestedSubcategory)) {
      return { eligible: false, reason: 'subcategory_mismatch' };
    }
  } else if (!labels.includes(requestedCategory)) {
    return { eligible: false, reason: 'category_mismatch' };
  }

  const coverage = declaredCoverage(supplier);
  if (coverage.pins.length === 0 && coverage.cities.length === 0) {
    return { eligible: false, reason: 'no_declared_coverage' };
  }
  const pin = request.location?.pinCode?.trim() ?? '';
  const city = request.location?.city ? normalizeCategoryKey(request.location.city) : '';
  const pinOk = Boolean(pin) && coverage.pins.includes(pin);
  const cityOk = Boolean(city) && coverage.cities.includes(city);
  if (!pinOk && !cityOk) return { eligible: false, reason: 'coverage_mismatch' };

  const tenantId = supplier.tenantId?.trim() ?? '';
  const organizationId = request.organizationId?.trim() ?? '';
  if (tenantId && organizationId && tenantId !== organizationId) {
    return { eligible: false, reason: 'cross_tenant' };
  }

  return { eligible: true, reason: 'category_subcategory_and_coverage' };
}

/**
 * New invitation rows only. An existing supplier key is not inserted again.
 * CREATED never means the invitation was dispatched, delivered, or answered.
 */
export function planRfqInvitations(
  eligibleSupplierKeys: string[],
  existingSupplierKeys: string[],
  quota: number,
): InvitationPlan[] {
  const seen = new Set(existingSupplierKeys);
  const planned: InvitationPlan[] = [];
  const limit = Number.isFinite(quota) ? Math.max(0, Math.floor(quota)) : 0;
  for (const key of eligibleSupplierKeys) {
    if (!key || seen.has(key)) continue;
    if (planned.length >= limit) break;
    seen.add(key);
    planned.push({
      supplierKey: key,
      invitationStatus: 'CREATED',
      deliveryStatus: 'NOT_DISPATCHED',
    });
  }
  return planned;
}
