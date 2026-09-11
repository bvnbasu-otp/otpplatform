/**
 * GST Domain Types & Verification Interfaces
 */

export interface GstValidationResult {
  valid: boolean;
  error?: string;
  stateCode?: string;
  stateName?: string;
  pan?: string;
  entityType?: string;
  checksumChar?: string;
}

export type GstTaxpayerStatus = 'ACTIVE' | 'CANCELLED' | 'SUSPENDED' | 'INACTIVE';

export interface GstTaxpayerInfo {
  gstin: string;
  legalName: string;
  tradeName?: string;
  pan: string;
  status: GstTaxpayerStatus;
  taxpayerType?: 'REGULAR' | 'COMPOSITION' | 'SEZ_DEVELOPER' | 'SEZ_UNIT' | 'CASUAL' | 'GOVERNMENT';
  registrationDate?: string;
  stateJurisdiction?: string;
  principalAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
  };
}

export interface GstVerificationResult {
  verified: boolean;
  verifiedAt: string;
  source: 'MOCK_SANDBOX' | 'LIVE_GSTN' | 'MANUAL_AUDIT';
  details?: GstTaxpayerInfo;
  error?: string;
}
