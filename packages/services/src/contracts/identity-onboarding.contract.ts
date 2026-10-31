/**
 * OTP Next — Identity, Profiles & Buyer Onboarding Contracts
 * Modules 01, 02, 03
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

export type BuyerPersonaType = 'INDIVIDUAL' | 'RWA' | 'MSME';

// ==========================================
// Module 01: Identity and Authentication
// ==========================================

export interface RequestPhoneOtpInput {
  phone: string; // e.g., '+919876543210'
}

export interface RequestPhoneOtpOutput {
  sessionId: string;
  expiresInSeconds: number;
}

export interface VerifyPhoneOtpInput {
  sessionId: string;
  phone: string;
  code: string; // 6-digit OTP
}

export interface AuthSessionOutput {
  token: string;
  profileId: string;
  isNewUser: boolean;
  phone: string;
  email?: string | null;
}

export interface RequestWhatsAppOtpInput {
  whatsappPhone: string;
}

export interface VerifyWhatsAppOtpInput {
  sessionId: string;
  whatsappPhone: string;
  code: string;
}

export interface LinkEmailInput {
  email: string;
}

export interface IdentityAuthContract {
  requestPhoneOtp(input: RequestPhoneOtpInput): Promise<Result<RequestPhoneOtpOutput, ServiceError>>;
  verifyPhoneOtp(input: VerifyPhoneOtpInput): Promise<Result<AuthSessionOutput, ServiceError>>;
  requestWhatsAppOtp(input: RequestWhatsAppOtpInput): Promise<Result<{ sessionId: string }, ServiceError>>;
  verifyWhatsAppOtp(input: VerifyWhatsAppOtpInput): Promise<Result<{ verified: boolean }, ServiceError>>;
  linkEmailAddress(actor: ActorContext, input: LinkEmailInput): Promise<Result<{ verified: boolean }, ServiceError>>;
  invalidateSession(actor: ActorContext): Promise<Result<{ success: boolean }, ServiceError>>;
}

// ==========================================
// Module 02: User Profiles & Account Management
// ==========================================

export interface UserProfileDto {
  profileId: string;
  fullName: string;
  email?: string | null;
  phone: string;
  whatsappPhone?: string | null;
  avatarUrl?: string | null;
  isAccountBlocked: boolean;
  blockedReason?: string | null;
  profileCompletionPercentage: number;
  statutoryPan?: string | null;
  statutoryAadhaarMasked?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfileInput {
  fullName?: string;
  avatarUrl?: string;
  whatsappPhone?: string;
}

export interface RecordStatutoryIdInput {
  statutoryPan?: string;
  statutoryAadhaarMasked?: string;
}

export interface UserProfileContract {
  getProfile(actor: ActorContext): Promise<Result<UserProfileDto, ServiceError>>;
  updateProfile(actor: ActorContext, input: UpdateProfileInput): Promise<Result<UserProfileDto, ServiceError>>;
  recordStatutoryIdentifiers(actor: ActorContext, input: RecordStatutoryIdInput): Promise<Result<UserProfileDto, ServiceError>>;
}

// ==========================================
// Module 03: Buyer Management & Onboarding
// ==========================================

export interface IndividualOnboardingInput {
  fullName: string;
  email: string;
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
    addressType: 'HOME' | 'WORK' | 'SITE' | 'OTHER';
  };
}

export interface RwaOnboardingInput {
  associationName: string;
  registrationNumber: string;
  totalUnits: number;
  occupiedUnits: number;
  role: 'RESIDENT_OWNER' | 'COMMITTEE_MEMBER' | 'ESTATE_FACILITY_MANAGER';
  committeeSeat?: 'PRESIDENT' | 'SECRETARY' | 'TREASURER' | 'MEMBER';
  address: {
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export interface MsmeOnboardingInput {
  legalEntityName: string;
  gstin: string;
  pan: string;
  authorizedSignatoryName: string;
  registeredAddress: {
    addressLine1: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export interface BuyerContextDto {
  profileId: string;
  persona: BuyerPersonaType;
  organizationId?: string | null;
  organizationName?: string | null;
  activeRole?: string | null;
  isOnboardingComplete: boolean;
  activeAddressCount: number;
  activeRfqCount: number;
}

export interface BuyerManagementContract {
  getBuyerContext(actor: ActorContext): Promise<Result<BuyerContextDto, ServiceError>>;
  completeIndividualOnboarding(actor: ActorContext, input: IndividualOnboardingInput): Promise<Result<BuyerContextDto, ServiceError>>;
  completeRwaOnboarding(actor: ActorContext, input: RwaOnboardingInput): Promise<Result<BuyerContextDto, ServiceError>>;
  completeMsmeOnboarding(actor: ActorContext, input: MsmeOnboardingInput): Promise<Result<BuyerContextDto, ServiceError>>;
}
