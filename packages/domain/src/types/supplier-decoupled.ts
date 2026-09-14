import { SupplierSource } from '../enums/supplier';

export interface SupplierIdentity {
  id: string;
  alias: string;
  gstin?: string | null;
  legalName?: string | null;
  isRevealed: boolean;
}

export interface SupplierSourceData {
  source: SupplierSource;
  externalNetworkId?: string | null;
  ondcSubscriberId?: string | null;
}

export type SupplierVerificationBadge =
  | 'VERIFIED_GST'
  | 'ONDC_ACTIVE'
  | 'SELF_REGISTERED'
  | 'UNVERIFIED';

export type SupplierAuditStatus = 'PASSED' | 'PENDING' | 'FLAGGED';

export interface SupplierVerification {
  badge: SupplierVerificationBadge;
  auditStatus: SupplierAuditStatus;
}

export interface SupplierCapability {
  taxonomy: string[];
  domainSpecs: Record<string, any>;
  maxCapacityHp?: number | null;
  maxOrderValueInr?: number | null;
}

export interface SupplierLocation {
  centerLat?: number | null;
  centerLng?: number | null;
  radiusKm?: number | null;
  pinCodes?: string[];
  city?: string | null;
  state?: string | null;
}

export interface SupplierPerformance {
  fulfillmentRating: number;
  onTimeSlaPercent: number;
  disputesCount: number;
  completedOrdersCount: number;
}

export interface DecoupledSupplier {
  identity: SupplierIdentity;
  sourceData: SupplierSourceData;
  verification: SupplierVerification;
  capability: SupplierCapability;
  location: SupplierLocation;
  performance: SupplierPerformance;
}
