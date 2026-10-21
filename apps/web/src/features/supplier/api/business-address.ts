import { supabase } from '@/lib/supabase';
import {
  isSupplierBusinessAddressComplete,
  parseSupplierBusinessAddress,
  toSupplierBusinessAddressRecord,
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
 * Writes suppliers.address only. The update payload does not include
 * registered_address, verification, or lifecycle columns.
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

  const record = toSupplierBusinessAddressRecord({
    ...input,
    country: input.country?.trim() || 'India',
  });

  const { error } = await supabase
    .from('suppliers')
    .update({ address: record })
    .eq('id', supplierId);

  if (error) return { ok: false, error: error.message || 'Could not save the business address.' };

  const parsed = parseSupplierBusinessAddress(record);
  if (!parsed) return { ok: false, error: 'The business address could not be confirmed after saving.' };
  return { ok: true, address: parsed };
}
