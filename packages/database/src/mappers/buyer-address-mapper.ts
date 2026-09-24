import type { BuyerAddress } from '@otp/domain';

export interface BuyerAddressRow {
  id: string;
  profile_id?: string | null;
  organization_id?: string | null;
  label: string;
  address_line1: string;
  address_line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  state_code?: string | null;
  pincode: string;
  country: string;
  contact_person?: string | null;
  contact_phone?: string | null;
  is_primary: boolean;
  address_type: 'DELIVERY' | 'BILLING' | 'BOTH' | 'REGISTERED' | 'SITE';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function mapBuyerAddressRow(row: BuyerAddressRow): BuyerAddress {
  return {
    id: row.id,
    profileId: row.profile_id ?? undefined,
    organizationId: row.organization_id ?? undefined,
    label: row.label,
    line1: row.address_line1,
    line2: row.address_line2 ?? undefined,
    landmark: row.landmark ?? undefined,
    city: row.city,
    state: row.state,
    stateCode: row.state_code ?? undefined,
    pincode: row.pincode,
    country: row.country || 'India',
    contactPerson: row.contact_person ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    isPrimary: Boolean(row.is_primary),
    addressType: row.address_type || 'DELIVERY',
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function buyerAddressToRecord(address: BuyerAddress): BuyerAddressRow {
  return {
    id: address.id,
    profile_id: address.profileId ?? null,
    organization_id: address.organizationId ?? null,
    label: address.label,
    address_line1: address.line1,
    address_line2: address.line2 ?? null,
    landmark: address.landmark ?? null,
    city: address.city,
    state: address.state,
    state_code: address.stateCode ?? null,
    pincode: address.pincode,
    country: address.country,
    contact_person: address.contactPerson ?? null,
    contact_phone: address.contactPhone ?? null,
    is_primary: address.isPrimary,
    address_type: address.addressType || 'DELIVERY',
    is_active: address.isActive !== false,
    created_at: address.createdAt,
    updated_at: address.updatedAt,
  };
}
