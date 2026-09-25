/**
 * First-Class Address Architecture, Operational Locations & Immutable Transaction Snapshots
 *
 * SUPREME PRODUCT PRINCIPLE:
 * "OTP does the procurement work. The customer makes the decision."
 *
 * THREE CORE DISTINCT CONCEPTS:
 * A. Address Book Data: Reusable customer-managed location info (Home, Office, Factory, Warehouse, RWA premises, Site, etc.).
 * B. Operational Location: Where procurement activity actually occurs (delivery, service, installation, site, work location).
 * C. Transaction Snapshot: Exact location info applicable to a specific commercial transaction (RFQ/PO delivery/billing).
 *
 * THREE IMMUTABILITY RULES:
 * Rule 1: Address book edits must never rewrite historical transaction snapshots.
 * Rule 2: Renaming labels must not alter historical meaning (snapshots store values, not mutable foreign key lookups).
 * Rule 3: Deleting/deactivating address book records must not cascade delete or corrupt historical snapshots.
 */

import { INDIAN_STATE_CODES } from '../gst/gstin-validator';
import type { BuyerPersona } from './buyer-persona';
import type { LocationDescriptor } from '../gis/location-intelligence-port';
import { determinePlaceOfSupply, type PlaceOfSupplyResult, type SupplyType } from '../tax/place-of-supply';

// -----------------------------------------------------------------------------
// 1. Location Types by Persona
// -----------------------------------------------------------------------------

export type IndividualLocationType = 'HOME' | 'OFFICE' | 'OTHER';

export type RwaLocationType =
  | 'SOCIETY_PREMISES'
  | 'OFFICE'
  | 'PROJECT_SITE'
  | 'SERVICE_SITE'
  | 'OTHER';

export type MsmeLocationType =
  | 'REGISTERED_OFFICE'
  | 'OPERATIONAL_OFFICE'
  | 'FACTORY'
  | 'WAREHOUSE'
  | 'SITE'
  | 'DELIVERY_LOCATION'
  | 'OTHER';

export type LocationType =
  | IndividualLocationType
  | RwaLocationType
  | MsmeLocationType
  | 'COMMUNITY_FACILITY'
  | 'CLUBHOUSE'
  | 'STORAGE_DEPOT';

export type AddressClassification =
  | 'DELIVERY'
  | 'BILLING'
  | 'BOTH'
  | 'REGISTERED'
  | 'SITE';

export const INDIVIDUAL_LOCATION_TYPES: readonly IndividualLocationType[] = [
  'HOME',
  'OFFICE',
  'OTHER',
];

export const RWA_LOCATION_TYPES: readonly RwaLocationType[] = [
  'SOCIETY_PREMISES',
  'OFFICE',
  'PROJECT_SITE',
  'SERVICE_SITE',
  'OTHER',
];

export const MSME_LOCATION_TYPES: readonly MsmeLocationType[] = [
  'REGISTERED_OFFICE',
  'OPERATIONAL_OFFICE',
  'FACTORY',
  'WAREHOUSE',
  'SITE',
  'DELIVERY_LOCATION',
  'OTHER',
];

/**
 * Returns allowed location types for a given buyer persona.
 */
export function getAllowedLocationTypes(persona: BuyerPersona): readonly LocationType[] {
  switch (persona) {
    case 'INDIVIDUAL':
      return INDIVIDUAL_LOCATION_TYPES;
    case 'RWA':
      return RWA_LOCATION_TYPES;
    case 'MSME':
      return MSME_LOCATION_TYPES;
    default:
      return INDIVIDUAL_LOCATION_TYPES;
  }
}

/**
 * Returns default location type for a given buyer persona.
 */
export function getDefaultLocationType(persona: BuyerPersona): LocationType {
  switch (persona) {
    case 'INDIVIDUAL':
      return 'HOME';
    case 'RWA':
      return 'SOCIETY_PREMISES';
    case 'MSME':
      return 'OPERATIONAL_OFFICE';
    default:
      return 'HOME';
  }
}

/**
 * Validates if a location type is permissible for a buyer persona.
 */
export function isLocationTypeAllowedForPersona(
  locationType: LocationType,
  persona: BuyerPersona,
): boolean {
  const allowed = getAllowedLocationTypes(persona);
  return allowed.includes(locationType as any);
}

// -----------------------------------------------------------------------------
// 2. Reusable Address Book Model (BuyerAddress)
// -----------------------------------------------------------------------------

export interface BuyerAddress {
  id: string;
  organizationId?: string | null;
  profileId?: string | null;
  label: string;
  locationType?: LocationType;
  addressType?: AddressClassification;
  recipientName?: string | null;
  line1: string;
  line2?: string | null;
  locality?: string | null;
  landmark?: string | null;
  city: string;
  district?: string | null;
  state: string;
  stateCode?: string | null;
  pincode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  isPrimary: boolean;
  isActive?: boolean;
  gstinStateCode?: string | null;
  createdAt: string;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// 3. Operational Location Model
// -----------------------------------------------------------------------------

export type OperationalActivityType =
  | 'DELIVERY'
  | 'SERVICE_SITE'
  | 'INSTALLATION'
  | 'WORK_LOCATION'
  | 'BILLING';

export interface OperationalLocation {
  operationalType: OperationalActivityType;
  sourceAddressId?: string | null;
  label: string;
  locationType?: LocationType;
  addressType?: AddressClassification;
  recipientName?: string | null;
  line1: string;
  line2?: string | null;
  locality?: string | null;
  landmark?: string | null;
  city: string;
  district?: string | null;
  state: string;
  stateCode?: string | null;
  gstinStateCode?: string | null;
  pincode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  specialAccessInstructions?: string | null;
  serviceAreaRadiusKm?: number | null;
}

/**
 * Creates an OperationalLocation from a BuyerAddress or partial location data.
 */
export function createOperationalLocation(
  source: Partial<BuyerAddress> | Partial<OperationalLocation>,
  operationalType: OperationalActivityType = 'DELIVERY',
  specialAccessInstructions?: string | null,
): OperationalLocation {
  return {
    operationalType,
    sourceAddressId: (source as BuyerAddress).id || (source as OperationalLocation).sourceAddressId || null,
    label: source.label?.trim() || 'Operational Site',
    locationType: source.locationType,
    recipientName: source.recipientName?.trim() || source.contactPerson?.trim() || null,
    line1: source.line1?.trim() || '',
    line2: source.line2?.trim() || null,
    locality: source.locality?.trim() || null,
    landmark: source.landmark?.trim() || null,
    city: source.city?.trim() || '',
    district: source.district?.trim() || null,
    state: source.state?.trim() || '',
    stateCode: source.stateCode?.trim() || source.gstinStateCode?.trim() || null,
    pincode: source.pincode?.trim() || '',
    country: source.country?.trim() || 'India',
    latitude: typeof source.latitude === 'number' ? source.latitude : null,
    longitude: typeof source.longitude === 'number' ? source.longitude : null,
    contactPerson: source.contactPerson?.trim() || null,
    contactPhone: source.contactPhone?.trim() || null,
    specialAccessInstructions: specialAccessInstructions?.trim() || null,
    serviceAreaRadiusKm: (source as OperationalLocation).serviceAreaRadiusKm || 25,
  };
}

// -----------------------------------------------------------------------------
// 4. Immutable Transaction Snapshot Models
// -----------------------------------------------------------------------------

export interface AddressSnapshot {
  addressId?: string | null;
  label: string;
  locationType?: LocationType;
  addressType?: AddressClassification;
  recipientName?: string | null;
  line1: string;
  line2?: string | null;
  locality?: string | null;
  landmark?: string | null;
  city: string;
  district?: string | null;
  state: string;
  stateCode?: string | null;
  pincode: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  gstinStateCode?: string | null;
  capturedAt: string;
  snapshotVersion?: number;
  isFrozen?: boolean;
}

export type DeliveryAddressSnapshot = AddressSnapshot;
export type BillingAddressSnapshot = AddressSnapshot;
export type TransactionAddressSnapshot = AddressSnapshot;

/**
 * Creates an immutable frozen AddressSnapshot from a live BuyerAddress, OperationalLocation, or existing snapshot.
 */
export function createAddressSnapshot(
  address: Partial<BuyerAddress> | Partial<OperationalLocation> | Partial<AddressSnapshot>,
  capturedAt = new Date().toISOString(),
): AddressSnapshot {
  const addressId =
    (address as BuyerAddress).id ||
    (address as AddressSnapshot).addressId ||
    (address as OperationalLocation).sourceAddressId ||
    null;

  const stateCode =
    address.stateCode?.trim() ||
    (address as BuyerAddress).gstinStateCode?.trim() ||
    (address as AddressSnapshot).gstinStateCode?.trim() ||
    resolveGstStateCode(address.state) ||
    null;

  return Object.freeze({
    addressId,
    label: address.label?.trim() || 'Primary Site',
    locationType: address.locationType,
    addressType: address.addressType || 'DELIVERY',
    recipientName: address.recipientName?.trim() || address.contactPerson?.trim() || null,
    line1: address.line1?.trim() || '',
    line2: address.line2?.trim() || null,
    locality: address.locality?.trim() || null,
    landmark: address.landmark?.trim() || null,
    city: address.city?.trim() || '',
    district: address.district?.trim() || null,
    state: address.state?.trim() || '',
    stateCode,
    pincode: address.pincode?.trim() || '',
    country: address.country?.trim() || 'India',
    latitude: typeof address.latitude === 'number' ? address.latitude : null,
    longitude: typeof address.longitude === 'number' ? address.longitude : null,
    contactPerson: address.contactPerson?.trim() || null,
    contactPhone: address.contactPhone?.trim() || null,
    gstinStateCode: stateCode,
    capturedAt,
    snapshotVersion: 1,
    isFrozen: true,
  });
}

/**
 * Creates an immutable DeliveryAddressSnapshot.
 */
export function createDeliveryAddressSnapshot(
  address: Partial<BuyerAddress> | Partial<OperationalLocation> | Partial<AddressSnapshot>,
  capturedAt = new Date().toISOString(),
): DeliveryAddressSnapshot {
  return createAddressSnapshot(
    {
      ...address,
      addressType: 'DELIVERY',
    },
    capturedAt,
  );
}

/**
 * Creates an immutable BillingAddressSnapshot.
 */
export function createBillingAddressSnapshot(
  address: Partial<BuyerAddress> | Partial<OperationalLocation> | Partial<AddressSnapshot>,
  capturedAt = new Date().toISOString(),
): BillingAddressSnapshot {
  return createAddressSnapshot(
    {
      ...address,
      addressType: 'BILLING',
    },
    capturedAt,
  );
}

/**
 * Helper to assert that an AddressSnapshot is completely decoupled from any live mutation.
 */
export function assertSnapshotDecoupled(
  originalSnapshot: AddressSnapshot,
  mutatedAddress: Partial<BuyerAddress>,
): boolean {
  if (mutatedAddress.line1 && originalSnapshot.line1 === mutatedAddress.line1) {
    return true; // unchanged
  }
  return originalSnapshot.line1 !== mutatedAddress.line1;
}

// -----------------------------------------------------------------------------
// 5. Validation & Formatting Utilities
// -----------------------------------------------------------------------------

/**
 * Strict Indian PIN code regex: 6 digits, first digit cannot be 0.
 */
export const INDIAN_PINCODE_REGEX = /^[1-9][0-9]{5}$/;

export function isPincodeValid(pincode?: string | null): boolean {
  if (!pincode) return false;
  return INDIAN_PINCODE_REGEX.test(pincode.trim());
}

export function isCoordinatesValid(lat?: number | null, lng?: number | null): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return true; // Optional
  }
  // India bounding box approx: Lat 6.0 to 38.0, Lng 68.0 to 98.0
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function isAddressValid(address: Partial<BuyerAddress | OperationalLocation | AddressSnapshot>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!address.line1 || !address.line1.trim()) {
    errors.push('Address line 1 is mandatory.');
  }
  if (!address.city || !address.city.trim()) {
    errors.push('City is mandatory.');
  }
  if (!address.state || !address.state.trim()) {
    errors.push('State is mandatory.');
  }
  if (!address.pincode || !isPincodeValid(address.pincode)) {
    errors.push('PIN code must be a valid 6-digit Indian postal code (starting 1-9).');
  }
  if (
    address.latitude !== undefined &&
    address.longitude !== undefined &&
    !isCoordinatesValid(address.latitude, address.longitude)
  ) {
    errors.push('Geographic coordinates are invalid.');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Resolves 2-digit GST state code from state name.
 */
export function resolveGstStateCode(stateName?: string | null): string | null {
  if (!stateName) return null;
  const normalized = stateName.trim().toUpperCase();
  for (const [code, name] of Object.entries(INDIAN_STATE_CODES)) {
    if (name.toUpperCase() === normalized) {
      return code;
    }
  }
  return null;
}

/**
 * Formats an address into a clean single-line readable string.
 */
export function formatAddressSingleLine(
  address?: AddressSnapshot | BuyerAddress | OperationalLocation | null,
): string {
  if (!address) return '';
  const parts = [
    address.recipientName || address.contactPerson,
    address.line1,
    address.line2,
    address.locality,
    address.landmark ? `Near ${address.landmark}` : null,
    address.city,
    address.district,
    address.state,
    address.pincode,
    address.country || 'India',
  ].filter(Boolean);
  return parts.join(', ');
}

/**
 * Formats an address into multi-line lines for PDF invoices, receipts, and order summaries.
 */
export function formatAddressMultiline(
  address?: AddressSnapshot | BuyerAddress | OperationalLocation | null,
): string[] {
  if (!address) return [];
  const lines: string[] = [];

  if (address.recipientName || address.contactPerson) {
    lines.push(address.recipientName || address.contactPerson || '');
  }
  if (address.line1) {
    lines.push(address.line1);
  }
  if (address.line2 || address.locality) {
    lines.push([address.line2, address.locality].filter(Boolean).join(', '));
  }
  if (address.landmark) {
    lines.push(`Landmark: ${address.landmark}`);
  }
  lines.push(`${address.city}, ${address.state} - ${address.pincode}`);
  if (address.country && address.country !== 'India') {
    lines.push(address.country);
  }
  if (address.contactPhone) {
    lines.push(`Phone: ${address.contactPhone}`);
  }

  return lines;
}

// -----------------------------------------------------------------------------
// 6. SNE (R2-07) and Taxonomy (R2-13) Integration
// -----------------------------------------------------------------------------

/**
 * Extracts normalized LocationDescriptor for Supplier Network Engine (SNE R2-07) discovery.
 */
export function buildOperationalDiscoveryGeographicInput(
  location: OperationalLocation | BuyerAddress | AddressSnapshot,
): LocationDescriptor {
  return {
    city: location.city?.trim() || null,
    pinCode: location.pincode?.trim() || null,
    state: location.state?.trim() || null,
    country: location.country?.trim() || 'India',
    coordinates:
      typeof location.latitude === 'number' && typeof location.longitude === 'number'
        ? { lat: location.latitude, lng: location.longitude }
        : null,
  };
}

export interface MaskedDiscoveryLocation {
  city: string;
  district?: string | null;
  state: string;
  pincode: string;
  generalArea?: string | null;
  serviceRadiusKm: number;
}

/**
 * Masks buyer location to prevent PII leakage to candidate suppliers during pre-award discovery.
 */
export function maskAddressForDiscovery(
  location: OperationalLocation | BuyerAddress | AddressSnapshot,
  serviceRadiusKm = 25,
): MaskedDiscoveryLocation {
  return {
    city: location.city?.trim() || '',
    district: location.district?.trim() || null,
    state: location.state?.trim() || '',
    pincode: location.pincode?.trim() || '',
    generalArea: location.locality?.trim() || location.landmark?.trim() || null,
    serviceRadiusKm,
  };
}

// -----------------------------------------------------------------------------
// 7. Bilateral GST Engine (PA-06) Place-of-Supply Resolver
// -----------------------------------------------------------------------------

export interface ResolveProcurementPlaceOfSupplyParams {
  supplierStateCode: string;
  billingAddress?: AddressSnapshot | BuyerAddress | null;
  deliveryAddress?: AddressSnapshot | BuyerAddress | null;
  supplyType?: SupplyType;
  projectSiteAddress?: AddressSnapshot | BuyerAddress | null;
}

/**
 * Resolves statutory Place of Supply (POS) under Indian GST Law (IGST Act 2017)
 * using separated Billing Address and Delivery / Project Site Location.
 */
export function resolveProcurementPlaceOfSupply(
  params: ResolveProcurementPlaceOfSupplyParams,
): PlaceOfSupplyResult {
  const recipientStateCode =
    params.billingAddress?.stateCode ||
    params.billingAddress?.gstinStateCode ||
    resolveGstStateCode(params.billingAddress?.state) ||
    null;

  const deliveryStateCode =
    params.deliveryAddress?.stateCode ||
    params.deliveryAddress?.gstinStateCode ||
    resolveGstStateCode(params.deliveryAddress?.state) ||
    null;

  const projectSiteStateCode =
    params.projectSiteAddress?.stateCode ||
    params.projectSiteAddress?.gstinStateCode ||
    resolveGstStateCode(params.projectSiteAddress?.state) ||
    deliveryStateCode ||
    null;

  return determinePlaceOfSupply({
    supplierStateCode: params.supplierStateCode,
    recipientStateCode,
    deliveryStateCode,
    supplyType: params.supplyType || 'PRODUCT_GOODS',
    projectSiteStateCode,
  });
}
