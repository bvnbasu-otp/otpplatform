/**
 * OTP Next — Address & Taxonomy Management Contracts
 * Modules 08, 09
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 08: Address Management
// ==========================================

export type AddressType = 'HOME' | 'WORK' | 'SITE' | 'OTHER';

export interface BuyerAddressDto {
  addressId: string;
  ownerId: string; // profileId or organizationId
  addressType: AddressType;
  label?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
}

export interface CreateAddressInput {
  addressType: AddressType;
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault?: boolean;
}

export interface UpdateAddressInput {
  addressId: string;
  addressType?: AddressType;
  label?: string;
  addressLine1?: string;
  addressLine2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface AddressManagementContract {
  listAddresses(actor: ActorContext): Promise<Result<BuyerAddressDto[], ServiceError>>;
  getAddressById(actor: ActorContext, addressId: string): Promise<Result<BuyerAddressDto, ServiceError>>;
  createAddress(actor: ActorContext, input: CreateAddressInput): Promise<Result<BuyerAddressDto, ServiceError>>;
  updateAddress(actor: ActorContext, input: UpdateAddressInput): Promise<Result<BuyerAddressDto, ServiceError>>;
  setDefaultAddress(actor: ActorContext, addressId: string): Promise<Result<{ success: boolean }, ServiceError>>;
  deleteAddress(actor: ActorContext, addressId: string): Promise<Result<{ success: boolean }, ServiceError>>;
}

// ==========================================
// Module 09: Taxonomy & Category Management
// ==========================================

export interface CategoryDto {
  categoryId: string;
  name: string;
  code: string;
  description: string;
  displayOrder: number;
  iconName?: string;
  subcategoriesCount: number;
}

export interface SubcategoryDto {
  subcategoryId: string;
  categoryId: string;
  name: string;
  code: string;
  description?: string;
  suggestedUnits: string[];
}

export interface CategoryTemplateDto {
  categoryId: string;
  subcategoryId?: string;
  defaultTitle: string;
  suggestedItems: Array<{
    itemDescription: string;
    defaultUom: string;
    sampleQuantity: number;
  }>;
}

export interface TaxonomyCategoryContract {
  listAuthoritativeCategories(): Promise<Result<CategoryDto[], ServiceError>>;
  getSubcategories(categoryId: string): Promise<Result<SubcategoryDto[], ServiceError>>;
  getCategoryTemplate(categoryId: string, subcategoryId?: string): Promise<Result<CategoryTemplateDto, ServiceError>>;
  listUnitsOfMeasurement(): Promise<Result<string[], ServiceError>>;
}
