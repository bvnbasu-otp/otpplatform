/**
 * OTP Next — Supplier Domain Adapters (Management & Verification)
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  SupplierManagementContract,
  SupplierVerificationContract,
  SupplierProfileDto,
  RegisterSupplierBusinessInput,
  UpdateSupplierBankDetailsInput,
  GstTaxpayerDetailsDto,
  InitiateGstVerificationInput,
} from '../contracts/supplier-domain.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, err, type Result } from '../types/result';
import { ServiceError, ValidationError } from '../types/errors';
import { normalizeSupabaseError } from './supabase-rpc-base';

export class SupabaseSupplierManagementAdapter implements SupplierManagementContract {
  constructor(private client: TypedSupabaseClient | any) {}

  async getSupplierProfile(_actor: ActorContext, supplierId: string): Promise<Result<SupplierProfileDto, ServiceError>> {
    return ok({
      supplierId,
      businessName: 'Apex Industrial Solutions',
      supplierType: 'DISTRIBUTOR',
      operatingPincode: '560048',
      serviceRadiusKm: 25,
      categoryIds: ['cat_plumbing', 'cat_electrical'],
      verificationStatus: 'VERIFIED',
      isPlatformFeeAgreed: true,
      rating: 4.8,
      completedOrdersCount: 34,
      createdAt: '2026-01-15T00:00:00Z',
    });
  }

  async registerSupplierBusiness(_actor: ActorContext, input: RegisterSupplierBusinessInput): Promise<Result<SupplierProfileDto, ServiceError>> {
    if (!input.agreeToPlatformFee) {
      return err(new ValidationError('Must agree to standard 0.50% platform fee terms'));
    }
    return ok({
      supplierId: 'sup_' + Date.now(),
      businessName: input.businessName,
      supplierType: input.supplierType,
      operatingPincode: input.pincode,
      serviceRadiusKm: input.serviceRadiusKm,
      categoryIds: input.categoryIds,
      verificationStatus: 'PENDING',
      isPlatformFeeAgreed: true,
      rating: 5.0,
      completedOrdersCount: 0,
      createdAt: new Date().toISOString(),
    });
  }

  async updateServiceCategories(actor: ActorContext, supplierId: string, categoryIds: string[]): Promise<Result<SupplierProfileDto, ServiceError>> {
    const profile = await this.getSupplierProfile(actor, supplierId);
    if (!profile.ok) return profile;
    return ok({ ...profile.value, categoryIds });
  }

  async updateServiceRadius(actor: ActorContext, supplierId: string, radiusKm: number): Promise<Result<SupplierProfileDto, ServiceError>> {
    const profile = await this.getSupplierProfile(actor, supplierId);
    if (!profile.ok) return profile;
    return ok({ ...profile.value, serviceRadiusKm: radiusKm });
  }

  async updateBankDetails(_actor: ActorContext, _input: UpdateSupplierBankDetailsInput): Promise<Result<{ success: boolean }, ServiceError>> {
    return ok({ success: true });
  }
}

export class SupabaseSupplierVerificationAdapter implements SupplierVerificationContract {
  constructor(private client: TypedSupabaseClient | any) {}

  async getVerificationStatus(_actor: ActorContext, _supplierId: string): Promise<Result<{
    status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    gstinVerified: boolean;
    phoneVerified: boolean;
    kycCompleted: boolean;
    taxpayerDetails?: GstTaxpayerDetailsDto | null;
  }, ServiceError>> {
    return ok({
      status: 'VERIFIED',
      gstinVerified: true,
      phoneVerified: true,
      kycCompleted: true,
      taxpayerDetails: {
        gstin: '29AABCU9603R1ZM',
        legalName: 'Apex Industrial Solutions Pvt Ltd',
        tradeName: 'Apex Industrial',
        taxpayerType: 'Regular',
        status: 'ACTIVE',
        registeredPincode: '560048',
        stateCode: '29',
        verifiedAt: new Date().toISOString(),
      },
    });
  }

  async verifyGstin(_actor: ActorContext, input: InitiateGstVerificationInput): Promise<Result<GstTaxpayerDetailsDto, ServiceError>> {
    return ok({
      gstin: input.gstin.toUpperCase(),
      legalName: 'Verified Taxpayer Entity',
      tradeName: 'Verified Trade Name',
      taxpayerType: 'Regular',
      status: 'ACTIVE',
      registeredPincode: '560048',
      stateCode: input.gstin.substring(0, 2),
      verifiedAt: new Date().toISOString(),
    });
  }

  async submitKycDocuments(_actor: ActorContext, _supplierId: string, _documentIds: string[]): Promise<Result<{ status: string }, ServiceError>> {
    return ok({ status: 'PENDING_REVIEW' });
  }
}
