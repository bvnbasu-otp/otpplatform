import type { SupplierDiscoverySourceKind, OndcIntegrationState } from '../enums/supplier-discovery-source';

export interface SupplierDiscoveryRequest {
  category: string;
  location?: { city?: string; pinCode?: string };
  structuredSpecs?: Record<string, unknown>;
  /** OTP requirement subcategory code — when set, ONDC domain uses allow-list only. */
  subcategoryCode?: string;
  requirementMode?: string;
}

export interface ExplainableMatchFactor {
  code: string;
  label: string;
  weight?: number;
}

export interface NormalizedDiscoverySupplier {
  sourceKind: SupplierDiscoverySourceKind;
  externalRef: string;
  displayAliasSeed: string;
  businessName: string;
  matchFactors: ExplainableMatchFactor[];
  canReceiveRfq: boolean;
  canSubmitQuote: boolean;
  /** Never upgrade lifecycle — discovery sources stay below OTP_VERIFIED unless OTP registry says so. */
  lifecycleTier:
    | 'DISCOVERED_IN_AREA'
    | 'DETAILS_AVAILABLE'
    | 'OTP_REGISTERED'
    | 'OTP_VERIFIED'
    | 'GST_VERIFIED'
    | 'ONDC_DISCOVERED';
  provenanceLabel: string;
  gstin?: string;
  phone?: string;
  placeId?: string;
  ondcProviderId?: string;
  otpSupplierId?: string;
  domain?: string;
}

export interface SupplierNetworkProviderResult {
  sourceKind: SupplierDiscoverySourceKind;
  integrationState?: OndcIntegrationState;
  candidates: NormalizedDiscoverySupplier[];
  errorMessage?: string;
}

export interface SupplierNetworkProvider {
  readonly sourceKind: SupplierDiscoverySourceKind;
  discover(request: SupplierDiscoveryRequest): Promise<SupplierNetworkProviderResult>;
}

export type SupplierDedupStrongIdKind =
  | 'GSTIN'
  | 'PHONE'
  | 'DOMAIN'
  | 'PLACE_ID'
  | 'ONDC_PROVIDER_ID'
  | 'OTP_SUPPLIER_ID';

export interface PossibleSupplierMatch {
  leftRef: string;
  rightRef: string;
  factors: ExplainableMatchFactor[];
  verdict: 'POSSIBLE_MATCH';
}

export function mapSourceKindToBuyerCountBucket(
  kind: SupplierDiscoverySourceKind,
): 'otpVerified' | 'network' | 'local' {
  switch (kind) {
    case 'OTP_SUPPLIER':
      return 'otpVerified';
    case 'ONDC_SELLER':
      return 'network';
    case 'GOOGLE_DISCOVERY':
    default:
      return 'local';
  }
}
