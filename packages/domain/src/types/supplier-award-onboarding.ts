import {
  SupplierLifecycleState,
  TruthfulVerificationStatus,
} from '../enums/supplier';
import { validateGstin } from '../gst/gstin-validator';
import { validatePan } from '../tax/tds-calculator';

export interface SupplierMatchingCriteria {
  gstin?: string | null;
  pan?: string | null;
  email?: string | null;
  phone?: string | null;
  profileId?: string | null;
}

export interface SupplierAwardEligibility {
  supplierId: string;
  isExisting: boolean;
  isVerified: boolean;
  lifecycleState: SupplierLifecycleState;
  verificationStatus: TruthfulVerificationStatus;
  onboardingRequired: boolean;
  canReveal: boolean;
  canExecuteDownstream: boolean;
  blockReason?: string;
}

export interface SupplierOnboardingProfileSubmission {
  supplierId: string;
  token: string;
  legalBusinessName: string;
  tradeName?: string | null;
  gstin?: string | null;
  pan?: string | null;
  registeredAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    pincode: string;
    country?: string;
  };
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    bankName?: string;
    beneficiaryName: string;
  } | null;
}

/**
 * Pure Domain Rule: Evaluates whether an awarded quote participant is eligible for
 * identity reveal and downstream purchase order issuance.
 */
export function evaluateSupplierAwardEligibility(params: {
  supplierId: string;
  lifecycleState: SupplierLifecycleState;
  verificationStatus: TruthfulVerificationStatus;
}): SupplierAwardEligibility {
  const { supplierId, lifecycleState, verificationStatus } = params;

  const isVerified =
    lifecycleState === SupplierLifecycleState.VERIFIED &&
    (verificationStatus === TruthfulVerificationStatus.VERIFIED ||
      verificationStatus === 'PLATFORM_VERIFIED');

  if (isVerified) {
    return {
      supplierId,
      isExisting: true,
      isVerified: true,
      lifecycleState,
      verificationStatus,
      onboardingRequired: false,
      canReveal: true,
      canExecuteDownstream: true,
    };
  }

  let blockReason = 'Supplier onboarding and identity verification required before award reveal or contract execution.';
  if (lifecycleState === SupplierLifecycleState.SUSPENDED) {
    blockReason = 'Supplier is suspended from platform transactions.';
  } else if (lifecycleState === SupplierLifecycleState.VERIFICATION_FAILED) {
    blockReason = 'Supplier identity verification failed statutory validation.';
  } else if (lifecycleState === SupplierLifecycleState.REQUIRES_REVERIFICATION) {
    blockReason = 'Supplier credentials were modified and require re-verification.';
  }

  return {
    supplierId,
    isExisting: lifecycleState !== SupplierLifecycleState.QUOTE_PARTICIPANT,
    isVerified: false,
    lifecycleState,
    verificationStatus,
    onboardingRequired: true,
    canReveal: false,
    canExecuteDownstream: false,
    blockReason,
  };
}

export interface SupplierProfileValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  resolvedVerificationStatus: TruthfulVerificationStatus;
}

/**
 * Validates supplier onboarding profile inputs for truthfulness & statutory compliance.
 */
export function validateSupplierOnboardingProfile(
  input: Partial<SupplierOnboardingProfileSubmission>,
): SupplierProfileValidationResult {
  const errors: Record<string, string> = {};

  if (!input.legalBusinessName || input.legalBusinessName.trim().length < 2) {
    errors.legalBusinessName = 'Legal business name must be at least 2 characters.';
  }

  if (!input.contactPerson || input.contactPerson.trim().length < 2) {
    errors.contactPerson = 'Authorized contact person name is required.';
  }

  if (!input.contactPhone || !/^[0-9+\s-]{10,15}$/.test(input.contactPhone.trim())) {
    errors.contactPhone = 'A valid contact phone number is required.';
  }

  if (!input.contactEmail || !input.contactEmail.includes('@') || !input.contactEmail.includes('.')) {
    errors.contactEmail = 'A valid business contact email is required.';
  }

  if (!input.registeredAddress?.line1?.trim()) {
    errors.addressLine1 = 'Registered address line 1 is mandatory.';
  }
  if (!input.registeredAddress?.city?.trim()) {
    errors.city = 'Registered city is mandatory.';
  }
  if (!input.registeredAddress?.state?.trim()) {
    errors.state = 'Registered state is mandatory.';
  }
  if (!input.registeredAddress?.pincode || !/^[0-9]{6}$/.test(input.registeredAddress.pincode.trim())) {
    errors.pincode = 'Valid 6-digit PIN code is mandatory.';
  }

  // GSTIN Validation (if provided)
  const cleanGstin = input.gstin?.trim().toUpperCase();
  if (cleanGstin) {
    const gstinCheck = validateGstin(cleanGstin);
    if (!gstinCheck.valid) {
      errors.gstin = `Invalid GSTIN: ${gstinCheck.error}`;
    }
  }

  // PAN Validation (if provided)
  const cleanPan = input.pan?.trim().toUpperCase();
  if (cleanPan) {
    const panCheck = validatePan(cleanPan);
    if (!panCheck.isValid) {
      errors.pan = `Invalid PAN: ${panCheck.error}`;
    }
  }

  // Cross-check PAN against GSTIN if both provided
  if (cleanGstin && cleanPan && cleanGstin.length === 15) {
    const panInGst = cleanGstin.substring(2, 12);
    if (panInGst !== cleanPan) {
      errors.pan = `PAN (${cleanPan}) does not match the PAN embedded in GSTIN (${panInGst}).`;
    }
  }

  let resolvedVerificationStatus: TruthfulVerificationStatus = TruthfulVerificationStatus.PENDING;
  if (Object.keys(errors).length === 0) {
    if (cleanGstin && validateGstin(cleanGstin).valid) {
      resolvedVerificationStatus = TruthfulVerificationStatus.VERIFIED;
    } else if (cleanPan && validatePan(cleanPan).isValid) {
      resolvedVerificationStatus = TruthfulVerificationStatus.VERIFIED;
    } else {
      resolvedVerificationStatus = TruthfulVerificationStatus.NOT_PROVIDED;
    }
  } else {
    resolvedVerificationStatus = TruthfulVerificationStatus.FAILED;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    resolvedVerificationStatus,
  };
}

/**
 * Gate check for downstream operations (PO acceptance, WO, Delivery, Milestones, Invoice, Settlement).
 */
export function checkSupplierExecutionGate(supplier: {
  id: string;
  lifecycleState?: SupplierLifecycleState | string;
  verificationStatus?: TruthfulVerificationStatus | string;
  status?: string;
}): { allowed: boolean; error?: string } {
  const isVerified =
    (supplier.lifecycleState === SupplierLifecycleState.VERIFIED ||
      supplier.lifecycleState === 'ACTIVE' ||
      supplier.status === 'ACTIVE') &&
    (supplier.verificationStatus === TruthfulVerificationStatus.VERIFIED ||
      supplier.verificationStatus === 'PLATFORM_VERIFIED' ||
      supplier.verificationStatus === 'VERIFIED');

  if (!isVerified) {
    return {
      allowed: false,
      error: `Downstream transaction blocked: Supplier ${supplier.id} has not completed OTP onboarding and verification (Current: ${supplier.lifecycleState ?? 'UNVERIFIED'}).`,
    };
  }

  return { allowed: true };
}
