import { supabase } from '@/lib/supabase';
import {
  isSupplierBusinessAddressComplete,
  parseSupplierBusinessAddress,
  validateSupplierBusinessAddress,
  type SupplierBusinessAddress,
} from '@otp/domain';

export interface SupplierBusinessAddressSnapshot {
  supplierId: string;
  address: SupplierBusinessAddress | null;
  complete: boolean;
  /** Present only so the UI can show that the statutory address was not used as the business address. */
  hasRegisteredAddress: boolean;
}

type Result<T> = { ok: true } & T | { ok: false; error: string };

/**
 * Reads suppliers.address only. registered_address is inspected for presence
 * and is never returned as the operating address.
 */
export async function fetchSupplierBusinessAddress(
  supplierId: string,
): Promise<Result<{ snapshot: SupplierBusinessAddressSnapshot }>> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, address, registered_address')
    .eq('id', supplierId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message || 'Could not load the business address.' };
  if (!data) return { ok: false, error: 'Supplier profile was not found.' };

  const address = parseSupplierBusinessAddress(data.address);
  return {
    ok: true,
    snapshot: {
      supplierId,
      address,
      complete: address !== null && isSupplierBusinessAddressComplete(data.address),
      hasRegisteredAddress: data.registered_address != null && data.registered_address !== '',
    },
  };
}

/**
 * Uses the database-authorized address RPC. Direct supplier-table writes would
 * bypass the operating-address validation and trust-field write boundary.
 */
export async function saveSupplierBusinessAddress(
  supplierId: string,
  input: SupplierBusinessAddress,
): Promise<Result<{ address: SupplierBusinessAddress }>> {
  const validation = validateSupplierBusinessAddress(input);
  if (!validation.isValid) {
    const message = Object.values(validation.errors)[0] || 'Enter a complete business address.';
    return { ok: false, error: message };
  }

  const { data, error } = await (supabase.rpc as any)('upsert_supplier_business_address', {
    p_supplier_id: supplierId,
    p_line1: input.line1.trim(),
    p_line2: input.line2?.trim() || null,
    p_city: input.city.trim(),
    p_state: input.state.trim(),
    p_pincode: input.pincode.trim(),
    p_country: input.country?.trim() || 'India',
  });

  if (error) return { ok: false, error: error.message || 'Could not save the business address.' };

  const parsed = parseSupplierBusinessAddress(data?.address);
  if (!parsed) return { ok: false, error: 'The business address could not be confirmed after saving.' };
  return { ok: true, address: parsed };
}
