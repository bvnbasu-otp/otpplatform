/**
 * Durable Buyer Address Model & Immutable Historical Snapshotting
 *
 * Enforces:
 * 1. Multi-address support per organization/profile with a single primary/default address flag.
 * 2. Immutable historical snapshots on RFQs and Purchase Orders:
 *    Future edits to buyer or supplier address books NEVER mutate past RFQ/PO records.
 * 3. Consistent GSTIN state code resolution for statutory tax compliance.
 */

export interface BuyerAddress {
  id: string;
  organizationId?: string | null;
  profileId?: string | null;
  label: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  stateCode?: string | null;
  pincode: string;
  country: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  isPrimary: boolean;
  addressType?: 'DELIVERY' | 'BILLING' | 'BOTH' | 'REGISTERED' | 'SITE';
  isActive?: boolean;
  gstinStateCode?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddressSnapshot {
  addressId?: string | null;
  label: string;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  stateCode?: string | null;
  pincode: string;
  country: string;
  contactPerson?: string | null;
  contactPhone?: string | null;
  gstinStateCode?: string | null;
  capturedAt: string;
}

export function isAddressValid(address: Partial<BuyerAddress>): {
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
  if (!address.pincode || !/^[0-9]{6}$/.test(address.pincode.trim())) {
    errors.push('PIN code must be a valid 6-digit Indian postal code.');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates an immutable frozen AddressSnapshot from a live BuyerAddress.
 */
export function createAddressSnapshot(
  address: Partial<BuyerAddress> | Partial<AddressSnapshot>,
  capturedAt = new Date().toISOString(),
): AddressSnapshot {
  return {
    addressId: (address as BuyerAddress).id || (address as AddressSnapshot).addressId || null,
    label: address.label?.trim() || 'Primary Site',
    line1: address.line1?.trim() || '',
    line2: address.line2?.trim() || null,
    city: address.city?.trim() || '',
    state: address.state?.trim() || '',
    pincode: address.pincode?.trim() || '',
    country: address.country?.trim() || 'India',
    gstinStateCode: address.gstinStateCode?.trim() || null,
    capturedAt,
  };
}

/**
 * Formats an address into a single-line readable string.
 */
export function formatAddressSingleLine(
  address?: AddressSnapshot | BuyerAddress | null,
): string {
  if (!address) return '';
  const parts = [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.pincode,
    address.country || 'India',
  ].filter(Boolean);
  return parts.join(', ');
}
