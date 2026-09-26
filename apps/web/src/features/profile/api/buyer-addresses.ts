import { supabase } from '@/lib/supabase';
import {
  type AddressClassification,
  type BuyerAddress,
  type BuyerPersona,
  getDefaultLocationType,
  isAddressValid,
} from '@otp/domain';

/**
 * Buyer address book persistence.
 *
 * Every read and write goes through the SECURITY DEFINER RPCs, which resolve
 * the owner from auth.uid() on the server. There is deliberately no direct
 * table fallback: a client-built insert would carry a client-chosen
 * profile_id / organization_id and, because buyer_addresses has no locality,
 * recipient or delivery-instructions columns, would also silently drop fields.
 *
 * Column mapping (see migration 00196):
 *   Sub-locality / Area              -> address_line2 (p_line2)
 *   Landmark / Delivery Instructions -> landmark      (p_landmark)
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export interface BuyerAddressFormInput {
  addressId?: string | null;
  organizationId?: string | null;
  persona: BuyerPersona;
  label: string;
  line1: string;
  /** Sub-locality / Area. */
  line2?: string | null;
  /** Landmark / delivery instructions. */
  landmark?: string | null;
  city: string;
  state: string;
  stateCode?: string | null;
  pincode: string;
  country?: string | null;
  addressType: AddressClassification;
  recipientName?: string | null;
  contactPerson?: string | null;
  contactPhone?: string | null;
  isPrimary: boolean;
  /** The first saved address always becomes primary. */
  isFirstAddress?: boolean;
}

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

export function defaultAddressLabel(persona: BuyerPersona): string {
  if (persona === 'RWA') return 'Society Premises';
  if (persona === 'MSME') return 'Operational Site';
  return 'Home Delivery';
}

export function mapBuyerAddressRow(row: any, persona: BuyerPersona): BuyerAddress {
  return {
    id: row.id,
    profileId: row.profile_id,
    organizationId: row.organization_id,
    label: row.label,
    locationType: row.location_type || getDefaultLocationType(persona),
    recipientName: row.recipient_name ?? null,
    line1: row.address_line1,
    line2: row.address_line2 ?? null,
    locality: row.locality ?? null,
    landmark: row.landmark ?? null,
    city: row.city,
    district: row.district ?? null,
    state: row.state,
    stateCode: row.state_code ?? null,
    pincode: row.pincode,
    country: row.country || 'India',
    contactPerson: row.contact_person ?? null,
    contactPhone: row.contact_phone ?? null,
    isPrimary: Boolean(row.is_primary),
    addressType: row.address_type || 'DELIVERY',
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateBuyerAddressInput(input: BuyerAddressFormInput): string[] {
  return isAddressValid({
    line1: input.line1,
    city: input.city,
    state: input.state,
    pincode: input.pincode?.trim(),
  }).errors;
}

/** Parameters for public.upsert_buyer_address_atomic. Owner is never sent. */
export function buildUpsertBuyerAddressParams(input: BuyerAddressFormInput): Record<string, unknown> {
  return {
    p_label: blankToNull(input.label) ?? defaultAddressLabel(input.persona),
    p_line1: input.line1.trim(),
    p_line2: blankToNull(input.line2),
    p_landmark: blankToNull(input.landmark),
    p_city: input.city.trim(),
    p_state: input.state.trim(),
    p_state_code: blankToNull(input.stateCode),
    p_pincode: input.pincode.trim(),
    p_country: blankToNull(input.country) ?? 'India',
    p_is_primary: input.isPrimary || Boolean(input.isFirstAddress),
    p_address_type: input.addressType,
    p_org_id: input.organizationId || null,
    p_address_id: input.addressId || null,
    p_contact_person: blankToNull(input.contactPerson) ?? blankToNull(input.recipientName),
    p_contact_phone: blankToNull(input.contactPhone),
  };
}

export async function fetchBuyerAddresses(
  organizationId: string | null | undefined,
  persona: BuyerPersona,
): Promise<Result<{ addresses: BuyerAddress[] }>> {
  const { data, error } = await supabase.rpc('get_buyer_addresses', {
    p_org_id: organizationId || null,
  });
  if (error) return { ok: false, error: error.message || 'Failed to load address book' };
  const res = (data ?? {}) as { ok?: boolean; error?: string; addresses?: unknown[] };
  if (!res.ok) return { ok: false, error: res.error || 'Failed to load address book' };
  return {
    ok: true,
    addresses: (res.addresses ?? []).map((row) => mapBuyerAddressRow(row, persona)),
  };
}

export async function saveBuyerAddress(
  input: BuyerAddressFormInput,
): Promise<Result<{ addressId: string | null }>> {
  const errors = validateBuyerAddressInput(input);
  if (errors.length > 0) return { ok: false, error: errors.join(' ') };

  const { data, error } = await supabase.rpc(
    'upsert_buyer_address_atomic',
    buildUpsertBuyerAddressParams(input),
  );
  if (error) return { ok: false, error: error.message || 'Error saving address' };
  const res = (data ?? {}) as { ok?: boolean; error?: string; address_id?: string };
  if (!res.ok) return { ok: false, error: res.error || 'Failed to save address' };
  return { ok: true, addressId: res.address_id ?? null };
}

/**
 * Re-sends the stored address with is_primary = true. Every stored field is
 * passed back, because the RPC overwrites line2 / landmark / state_code with
 * whatever it receives.
 */
export async function setPrimaryBuyerAddress(
  target: BuyerAddress,
  organizationId: string | null | undefined,
  persona: BuyerPersona,
): Promise<Result<{ addressId: string | null }>> {
  return saveBuyerAddress({
    addressId: target.id,
    organizationId,
    persona,
    label: target.label,
    line1: target.line1,
    line2: target.line2,
    landmark: target.landmark,
    city: target.city,
    state: target.state,
    stateCode: target.stateCode,
    pincode: target.pincode,
    country: target.country,
    addressType: target.addressType || 'DELIVERY',
    contactPerson: target.contactPerson,
    contactPhone: target.contactPhone,
    isPrimary: true,
  });
}

/**
 * Soft-deactivates an address. There is no RPC for this; the update is scoped
 * by id only and the buyer_addresses UPDATE policy decides whether the caller
 * owns the row. RLS filters silently, so zero returned rows means refused.
 */
export async function deactivateBuyerAddress(addressId: string): Promise<Result<object>> {
  const { data, error } = await supabase
    .from('buyer_addresses')
    .update({ is_active: false })
    .eq('id', addressId)
    .select('id');
  if (error) return { ok: false, error: error.message || 'Error deleting address' };
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, error: 'Address not found or you do not have access to it.' };
  }
  return { ok: true };
}
