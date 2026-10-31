/**
 * OTP Next — Supplier Domain Contracts (Management & Verification)
 * Modules 06, 07
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 06: Supplier Management
// ==========================================

export type SupplierType = 'MANUFACTURER' | 'DISTRIBUTOR' | 'WHOLESALER' | 'RETAILER' | 'CONTRACTOR' | 'SERVICE_PROVIDER';

export interface SupplierProfileDto {
  supplierId: string;
  businessName: string;
  supplierType: SupplierType;
  operatingPincode: string;
  serviceRadiusKm: number;
  categoryIds: string[];
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  isPlatformFeeAgreed: boolean; // 0.50% fee term
  rating: number;
  completedOrdersCount: number;
  createdAt: string;
}

export interface RegisterSupplierBusinessInput {
  businessName: string;
  supplierType: SupplierType;
  pincode: string;
  serviceRadiusKm: number;
  categoryIds: string[];
  agreeToPlatformFee: boolean;
}

export interface UpdateSupplierBankDetailsInput {
  supplierId: string;
  accountHolderName: string;
  bankAccountNumber: string;
  ifscCode: string;
  bankName: string;
}

export interface SupplierManagementContract {
  getSupplierProfile(actor: ActorContext, supplierId: string): Promise<Result<SupplierProfileDto, ServiceError>>;
  registerSupplierBusiness(actor: ActorContext, input: RegisterSupplierBusinessInput): Promise<Result<SupplierProfileDto, ServiceError>>;
  updateServiceCategories(actor: ActorContext, supplierId: string, categoryIds: string[]): Promise<Result<SupplierProfileDto, ServiceError>>;
  updateServiceRadius(actor: ActorContext, supplierId: string, radiusKm: number): Promise<Result<SupplierProfileDto, ServiceError>>;
  updateBankDetails(actor: ActorContext, input: UpdateSupplierBankDetailsInput): Promise<Result<{ success: boolean }, ServiceError>>;
}

// ==========================================
// Module 07: Supplier Verification
// ==========================================

export interface GstTaxpayerDetailsDto {
  gstin: string;
  legalName: string;
  tradeName?: string;
  taxpayerType: string;
  status: 'ACTIVE' | 'INACTIVE' | 'CANCELLED';
  registeredPincode: string;
  stateCode: string;
  verifiedAt: string;
}

export interface InitiateGstVerificationInput {
  supplierId: string;
  gstin: string;
}

export interface SupplierVerificationContract {
  getVerificationStatus(actor: ActorContext, supplierId: string): Promise<Result<{
    status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    gstinVerified: boolean;
    phoneVerified: boolean;
    kycCompleted: boolean;
    taxpayerDetails?: GstTaxpayerDetailsDto | null;
  }, ServiceError>>;
  verifyGstin(actor: ActorContext, input: InitiateGstVerificationInput): Promise<Result<GstTaxpayerDetailsDto, ServiceError>>;
  submitKycDocuments(actor: ActorContext, supplierId: string, documentIds: string[]): Promise<Result<{ status: string }, ServiceError>>;
}
