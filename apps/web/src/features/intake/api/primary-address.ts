import { supabase } from '@/lib/supabase';

/**
 * The buyer's primary address, used only to prefill empty location fields.
 * Nothing here invents a location: if there is no primary address the fields
 * stay empty and the buyer has to type them.
 */

export interface PrimaryDeliveryLocation {
  addressId: string;
  city: string | null;
  pincode: string | null;
  line1: string | null;
}

interface AddressRow {
  id?: string;
  is_primary?: boolean;
  city?: string | null;
  pincode?: string | null;
  address_line1?: string | null;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

export function pickPrimaryAddress(rows: unknown): PrimaryDeliveryLocation | null {
  if (!Array.isArray(rows)) return null;
  const primary = (rows as AddressRow[]).find((r) => r && r.is_primary === true);
  if (!primary || !primary.id) return null;
  return {
    addressId: primary.id,
    city: clean(primary.city),
    pincode: clean(primary.pincode),
    line1: clean(primary.address_line1),
  };
}

async function fetchPrimaryFor(orgId: string | null): Promise<PrimaryDeliveryLocation | null> {
  const { data, error } = await supabase.rpc('get_buyer_addresses', { p_org_id: orgId });
  if (error) return null;
  const res = (data ?? {}) as { ok?: boolean; addresses?: unknown };
  if (!res.ok) return null;
  return pickPrimaryAddress(res.addresses);
}

/** Organisation primary first (RWA / MSME sites), then the personal primary. */
export async function fetchPrimaryDeliveryLocation(
  organizationId?: string | null,
): Promise<PrimaryDeliveryLocation | null> {
  try {
    if (organizationId) {
      const orgPrimary = await fetchPrimaryFor(organizationId);
      if (orgPrimary) return orgPrimary;
    }
    return await fetchPrimaryFor(null);
  } catch {
    return null;
  }
}

export interface LocationFields {
  city: string;
  pincode: string;
}

/**
 * Values to prefill. A field is only filled when it is still empty, so a
 * value the buyer typed or a value saved on the draft always wins.
 */
export function resolveLocationPrefill(
  current: LocationFields,
  primary: PrimaryDeliveryLocation | null,
): Partial<LocationFields> {
  if (!primary) return {};
  const next: Partial<LocationFields> = {};
  if (!current.city.trim() && primary.city) next.city = primary.city;
  if (!current.pincode.trim() && primary.pincode) next.pincode = primary.pincode;
  return next;
}
