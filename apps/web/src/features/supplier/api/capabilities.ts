import { supabase } from '@/lib/supabase';

/**
 * What a supplier can do, and where.
 *
 * This is the data capability discovery runs on: without it a business is
 * invisible to every enquiry, however good they are. Capabilities are chosen
 * from the platform catalog rather than typed freely, because matching a
 * requirement against free text is how you end up with a keyword search
 * pretending to be a marketplace.
 */

export interface CapabilityOption {
  capabilityId: string;
  code: string;
  name: string;
  description: string | null;
  /** e.g. HP, tonne, sq ft — what a declared ceiling would be measured in. */
  capacityUnit: string | null;
}

export interface DeclaredCapability {
  id: string;
  capabilityId: string;
  code: string;
  name: string;
  /** The largest job they will take on; null means undeclared, not unlimited. */
  maxCapacityValue: number | null;
  capacityUnit: string | null;
  notes: string | null;
}

export interface ServiceArea {
  id: string;
  city: string | null;
  pincode: string | null;
  radiusKm: number | null;
  isPrimary: boolean;
}

export type CatalogResult =
  | { ok: true; options: CapabilityOption[] }
  | { ok: false; error: string };

export async function fetchCapabilityCatalog(): Promise<CatalogResult> {
  const { data, error } = await supabase
    .from('capabilities')
    .select('id, code, name, description, capacity_unit, sort_order')
    .eq('is_active', true)
    .order('sort_order')
    .order('name');

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    options: (data ?? []).map((row) => ({
      capabilityId: row.id as string,
      code: row.code as string,
      name: row.name as string,
      description: (row.description as string | null) ?? null,
      capacityUnit: (row.capacity_unit as string | null) ?? null,
    })),
  };
}

export type DeclaredResult =
  | { ok: true; capabilities: DeclaredCapability[] }
  | { ok: false; error: string };

export async function fetchMyCapabilities(supplierId: string): Promise<DeclaredResult> {
  const { data, error } = await supabase
    .from('supplier_capabilities')
    .select(
      'id, capability_id, max_capacity_value, capacity_unit, notes, capabilities(code, name)',
    )
    .eq('supplier_id', supplierId);

  if (error) return { ok: false, error: error.message };

  const capabilities = ((data ?? []) as unknown as {
    id: string;
    capability_id: string;
    max_capacity_value: number | string | null;
    capacity_unit: string | null;
    notes: string | null;
    capabilities: { code: string; name: string } | null;
  }[]).map((row) => ({
    id: row.id,
    capabilityId: row.capability_id,
    code: row.capabilities?.code ?? '',
    name: row.capabilities?.name ?? 'Capability',
    maxCapacityValue:
      row.max_capacity_value === null ? null : Number(row.max_capacity_value),
    capacityUnit: row.capacity_unit,
    notes: row.notes,
  }));

  capabilities.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, capabilities };
}

export type WriteResult = { ok: true } | { ok: false; error: string };

export async function declareCapability(
  supplierId: string,
  capabilityId: string,
  maxCapacityValue: number | null,
  capacityUnit: string | null,
): Promise<WriteResult> {
  const { error } = await supabase.from('supplier_capabilities').insert({
    supplier_id: supplierId,
    capability_id: capabilityId,
    max_capacity_value: maxCapacityValue,
    capacity_unit: capacityUnit,
  });

  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'You already offer that.' : error.message,
    };
  }
  return { ok: true };
}

export async function updateCapacity(
  id: string,
  maxCapacityValue: number | null,
): Promise<WriteResult> {
  const { error } = await supabase
    .from('supplier_capabilities')
    .update({ max_capacity_value: maxCapacityValue })
    .eq('id', id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function withdrawCapability(id: string): Promise<WriteResult> {
  const { error } = await supabase.from('supplier_capabilities').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type ServiceAreaResult =
  | { ok: true; areas: ServiceArea[] }
  | { ok: false; error: string };

export async function fetchMyServiceAreas(
  supplierId: string,
): Promise<ServiceAreaResult> {
  const { data, error } = await supabase
    .from('supplier_service_areas')
    .select('id, city, pincode, radius_km, is_primary')
    .eq('supplier_id', supplierId)
    .order('is_primary', { ascending: false });

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    areas: (data ?? []).map((row) => ({
      id: row.id as string,
      city: (row.city as string | null) ?? null,
      pincode: (row.pincode as string | null) ?? null,
      radiusKm: row.radius_km === null ? null : Number(row.radius_km),
      isPrimary: Boolean(row.is_primary),
    })),
  };
}

export async function addServiceArea(
  supplierId: string,
  area: { city: string | null; pincode: string | null; radiusKm: number | null },
): Promise<WriteResult> {
  if (!area.city && !area.pincode) {
    return { ok: false, error: 'Give a city or a pin code.' };
  }
  if (area.pincode && !/^\d{6}$/.test(area.pincode)) {
    return { ok: false, error: 'A pin code is six digits.' };
  }

  const { error } = await supabase.from('supplier_service_areas').insert({
    supplier_id: supplierId,
    city: area.city,
    pincode: area.pincode,
    radius_km: area.radiusKm,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeServiceArea(id: string): Promise<WriteResult> {
  const { error } = await supabase.from('supplier_service_areas').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface SupplierGstProfile {
  id: string;
  businessName: string;
  legalName: string | null;
  tradeName: string | null;
  gstin: string | null;
  pan: string | null;
  gstStatus: string | null;
  gstVerified: boolean;
  verificationStatus: string | null;
}

export async function fetchSupplierGstProfile(
  supplierId: string,
): Promise<{ ok: true; profile: SupplierGstProfile } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('suppliers')
    .select(
      'id, business_name, legal_name, trade_name, gstin, pan, gst_status, gst_verified, verification_status',
    )
    .eq('id', supplierId)
    .single();

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    profile: {
      id: data.id,
      businessName: data.business_name,
      legalName: data.legal_name,
      tradeName: data.trade_name,
      gstin: data.gstin,
      pan: data.pan,
      gstStatus: data.gst_status,
      gstVerified: Boolean(data.gst_verified),
      verificationStatus: data.verification_status,
    },
  };
}

export async function verifySupplierGstinRpc(
  supplierId: string,
  gstin: string,
  details: Record<string, unknown> = {},
): Promise<WriteResult> {
  const { error } = await supabase.rpc('verify_supplier_gstin', {
    p_supplier_id: supplierId,
    p_gstin: gstin,
    p_details: details,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

