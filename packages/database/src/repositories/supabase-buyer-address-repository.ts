import type { DatabaseClient } from '../client';
import { mapBuyerAddressRow, type BuyerAddressRow } from '../mappers/buyer-address-mapper';
import type { BuyerAddress } from '@otp/domain';

export interface BuyerAddressRepository {
  findById(id: string): Promise<BuyerAddress | null>;
  findByOrganizationId(organizationId: string): Promise<BuyerAddress[]>;
  findByProfileId(profileId: string): Promise<BuyerAddress[]>;
  findPrimary(profileId?: string, organizationId?: string): Promise<BuyerAddress | null>;
  save(address: BuyerAddress): Promise<BuyerAddress>;
  delete(id: string): Promise<void>;
}

export class SupabaseBuyerAddressRepository implements BuyerAddressRepository {
  constructor(private readonly client: DatabaseClient) {}

  async findById(id: string): Promise<BuyerAddress | null> {
    const { data, error } = await (this.client as any)
      .from('buyer_addresses')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !data) return null;
    return mapBuyerAddressRow(data as BuyerAddressRow);
  }

  async findByOrganizationId(organizationId: string): Promise<BuyerAddress[]> {
    const { data, error } = await (this.client as any)
      .from('buyer_addresses')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return (data as BuyerAddressRow[]).map(mapBuyerAddressRow);
  }

  async findByProfileId(profileId: string): Promise<BuyerAddress[]> {
    const { data, error } = await (this.client as any)
      .from('buyer_addresses')
      .select('*')
      .eq('profile_id', profileId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return (data as BuyerAddressRow[]).map(mapBuyerAddressRow);
  }

  async findPrimary(profileId?: string, organizationId?: string): Promise<BuyerAddress | null> {
    let query = (this.client as any)
      .from('buyer_addresses')
      .select('*')
      .eq('is_primary', true)
      .eq('is_active', true);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    } else if (profileId) {
      query = query.eq('profile_id', profileId);
    } else {
      return null;
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return mapBuyerAddressRow(data as BuyerAddressRow);
  }

  async save(address: BuyerAddress): Promise<BuyerAddress> {
    const row: Record<string, unknown> = {
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

    const { data, error } = await (this.client as any)
      .from('buyer_addresses')
      .upsert(row)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to save buyer address: ${error.message}`);
    }

    return mapBuyerAddressRow(data as BuyerAddressRow);
  }

  async delete(id: string): Promise<void> {
    const { error } = await (this.client as any)
      .from('buyer_addresses')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to deactivate buyer address: ${error.message}`);
    }
  }
}
