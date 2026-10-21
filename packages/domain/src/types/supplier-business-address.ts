/**
 * Supplier operating / business-office address.
 *
 * Stored in suppliers.address. It is not the statutory GST registered address
 * (suppliers.registered_address) and must not be copied from or written over it.
 * A supplier has one primary business address: the single address object.
 */

export interface SupplierBusinessAddress {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

export interface SupplierBusinessAddressValidation {
  isValid: boolean;
  errors: Record<string, string>;
}

const PINCODE = /^[1-9][0-9]{5}$/;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Reads an operating address. Accepts the legacy postalCode key used by seeds.
 * Returns null when the operating address is missing or incomplete.
 * A registered-address object is not accepted as a substitute.
 */
export function parseSupplierBusinessAddress(raw: unknown): SupplierBusinessAddress | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (row.kind === 'REGISTERED' || row.addressKind === 'REGISTERED') return null;
  const line1 = text(row.line1 ?? row.addressLine1);
  const city = text(row.city);
  const state = text(row.state);
  const pincode = text(row.pincode ?? row.postalCode ?? row.pinCode);
  if (!line1 || !city || !state || !PINCODE.test(pincode)) return null;
  const line2 = text(row.line2 ?? row.addressLine2);
  const country = text(row.country) || 'India';
  return { line1, line2: line2 || null, city, state, pincode, country };
}

export function isSupplierBusinessAddressComplete(raw: unknown): boolean {
  return parseSupplierBusinessAddress(raw) !== null;
}

export function validateSupplierBusinessAddress(
  input: Partial<SupplierBusinessAddress> | null | undefined,
): SupplierBusinessAddressValidation {
  const errors: Record<string, string> = {};
  const line1 = text(input?.line1);
  const city = text(input?.city);
  const state = text(input?.state);
  const pincode = text(input?.pincode);

  if (line1.length < 3) {
    errors.line1 = 'Enter the business or office address line.';
  }
  if (!city) errors.city = 'Enter the city or town.';
  if (!state) errors.state = 'Enter the state.';
  if (!PINCODE.test(pincode)) {
    errors.pincode = 'Enter a valid 6-digit PIN code.';
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

/**
 * Canonical jsonb written to suppliers.address.
 * postalCode is duplicated for readers that still use the legacy key.
 * registered_address is not included.
 */
export function toSupplierBusinessAddressRecord(
  input: SupplierBusinessAddress,
): Record<string, string | null> {
  const pincode = input.pincode.trim();
  return {
    kind: 'BUSINESS_OFFICE',
    line1: input.line1.trim(),
    line2: input.line2?.trim() || null,
    city: input.city.trim(),
    state: input.state.trim(),
    pincode,
    postalCode: pincode,
    country: input.country.trim() || 'India',
  };
}
