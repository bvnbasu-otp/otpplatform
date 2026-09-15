export interface MatchedSupplier {
  invitationId: string;
  anonymousLabel: string;
  status: 'INVITED' | 'VIEWED' | 'QUOTED' | 'DECLINED' | 'CANDIDATE' | string;
  matchScore: number;
  matchLevel: 'EXCELLENT' | 'STRONG' | 'RELEVANT' | 'CANDIDATE';
  matchReasons: string[];
  network: 'OTP_REGISTERED' | 'ONDC' | 'LOCAL_REGISTRY' | 'DIRECT' | 'INVITED' | 'BNI' | 'ASSOCIATION' | string;
  networkLabel: string;
  gstVerified: boolean;
  isLocal: boolean;
  distanceKm?: number;
  availabilityText: string;
  invitedAt?: string | null;
}

export interface CompactRequirementContext {
  requirementId: string;
  requirementTitle: string;
  requirementStatus: string;
  requirementMode?: string | null;
  categoryName?: string | null;
  deliveryCity?: string | null;
  deliveryPincode?: string | null;
  requiredByText?: string | null;
  budgetFormatted?: string | null;
  quantityText?: string | null;
  geographicReach?: string | null;
  rfqId: string | null;
  rfqStatus: string | null;
  minQuotesRequired: number;
  invitationCount: number;
}

export type DiscoveryFilterOption = 'ALL' | 'HIGH_MATCH' | 'GST_VERIFIED' | 'LOCAL' | 'ONDC' | 'OTP_NETWORK' | 'DIRECT';
