/**
 * OTP: Indian Procurement Standards, Taxonomies & Compliance Models
 *
 * Implements:
 * 1. Indian Standards Taxonomy Integration (BIS, FSSAI, CPWD, BEE, HSN/SAC).
 * 2. Deterministic Standard Compliance Scoring with explainability.
 * 3. 30-Day Configurable Supplier Data Refresh Policy Models.
 * 4. Quota-Aware & Budget-Aware Discovery Policies.
 * 5. 5-Tier Truthful Verification Lifecycles (No fake verification).
 * 6. Buyer-Demand Priority Engine definitions.
 * 7. Multi-Entity Relational Models for Discovery Observations & Provenance.
 */

import { STANDARD_PROCUREMENT_HSN_SAC_CATALOG, type HsnSacEntry } from '../tax/hsn-sac-catalog';

/* ========================================================================= */
/* 1. INDIAN PROCUREMENT STANDARDS (BIS, FSSAI, CPWD, BEE, HSN/SAC)           */
/* ========================================================================= */

export type IndianStandardAuthority =
  | 'BIS'      // Bureau of Indian Standards (IS codes)
  | 'FSSAI'    // Food Safety and Standards Authority of India
  | 'CPWD'     // Central Public Works Department (DSR / Specifications)
  | 'BEE'      // Bureau of Energy Efficiency (Star Ratings)
  | 'GST_HSN'  // Harmonized System of Nomenclature (Goods)
  | 'GST_SAC'; // Services Accounting Code (Services)

export interface IndianProcurementStandard {
  id: string;
  authority: IndianStandardAuthority;
  code: string; // e.g., 'IS 2062', 'IS 694', 'FSSAI-LIC-12', 'CPWD-SPEC-2023'
  title: string;
  category: string;
  applicableSectors: string[];
  mandatoryForTenders: boolean;
  minConfidenceBoost: number; // 0 - 20
  description: string;
}

export const CANONICAL_INDIAN_PROCUREMENT_STANDARDS: IndianProcurementStandard[] = [
  // Electrical & Power
  {
    id: 'std-bis-694',
    authority: 'BIS',
    code: 'IS 694',
    title: 'PVC Insulated Cables for Working Voltages up to and including 1100 V',
    category: 'Electrical & Automation',
    applicableSectors: ['Electrical', 'Wiring', 'Cables', 'Power Distribution'],
    mandatoryForTenders: true,
    minConfidenceBoost: 15,
    description: 'Mandatory standard for copper/aluminum industrial and residential electrical wiring.',
  },
  {
    id: 'std-bis-732',
    authority: 'BIS',
    code: 'IS 732',
    title: 'Code of Practice for Electrical Wiring Installations',
    category: 'Electrical & Automation',
    applicableSectors: ['Electrical', 'Contracting', 'Installation'],
    mandatoryForTenders: true,
    minConfidenceBoost: 10,
    description: 'Standard practice for building and facility electrification.',
  },
  {
    id: 'std-bee-star',
    authority: 'BEE',
    code: 'BEE Star Rating',
    title: 'BEE Energy Efficiency Certification (3-Star to 5-Star)',
    category: 'Electrical & Automation',
    applicableSectors: ['Pumps', 'Transformers', 'Motors', 'HVAC'],
    mandatoryForTenders: false,
    minConfidenceBoost: 10,
    description: 'Bureau of Energy Efficiency energy consumption benchmark.',
  },

  // Civil & Construction
  {
    id: 'std-bis-2062',
    authority: 'BIS',
    code: 'IS 2062',
    title: 'Hot Rolled Medium and High Tensile Structural Steel',
    category: 'Construction & Civil Works',
    applicableSectors: ['Structural Steel', 'Fabrication', 'Construction', 'Piping'],
    mandatoryForTenders: true,
    minConfidenceBoost: 15,
    description: 'Supreme Indian standard for industrial and infrastructure grade structural steel.',
  },
  {
    id: 'std-bis-456',
    authority: 'BIS',
    code: 'IS 456',
    title: 'Plain and Reinforced Concrete - Code of Practice',
    category: 'Construction & Civil Works',
    applicableSectors: ['Concrete', 'Civil Engineering', 'RMC'],
    mandatoryForTenders: true,
    minConfidenceBoost: 15,
    description: 'Indian standard benchmark for all civil structural RCC works.',
  },
  {
    id: 'std-cpwd-dsr',
    authority: 'CPWD',
    code: 'CPWD DSR 2023',
    title: 'Delhi Schedule of Rates & Works Specifications',
    category: 'Construction & Civil Works',
    applicableSectors: ['Civil', 'Plumbing', 'Roads', 'Flooring', 'Finishing'],
    mandatoryForTenders: true,
    minConfidenceBoost: 12,
    description: 'Central Public Works Department standardized specifications and unit rate index.',
  },

  // Plumbing, Water & Piping
  {
    id: 'std-bis-1239',
    authority: 'BIS',
    code: 'IS 1239',
    title: 'Mild Steel Tubes, Tubulars and Other Wrought Steel Fittings',
    category: 'Plumbing & Water Systems',
    applicableSectors: ['Plumbing', 'Pipes', 'Firefighting', 'Water Supply'],
    mandatoryForTenders: true,
    minConfidenceBoost: 15,
    description: 'Standard specification for GI/MS piping systems in housing societies and commercial assets.',
  },
  {
    id: 'std-bis-4985',
    authority: 'BIS',
    code: 'IS 4985',
    title: 'Unplasticized PVC Pipes for Potable Water Supplies',
    category: 'Plumbing & Water Systems',
    applicableSectors: ['uPVC Pipes', 'Sanitary', 'Drainage'],
    mandatoryForTenders: true,
    minConfidenceBoost: 10,
    description: 'Quality specification for drinking water and domestic distribution pipes.',
  },

  // Food & Hospitality Sourcing
  {
    id: 'std-fssai-lic',
    authority: 'FSSAI',
    code: 'FSSAI License / Registration',
    title: 'Food Safety and Standards Authority of India 14-Digit License',
    category: 'Food, Catering & Hospitality',
    applicableSectors: ['Catering', 'Cafeteria', 'Pantry', 'Food Supplies'],
    mandatoryForTenders: true,
    minConfidenceBoost: 20,
    description: 'Statutory compliance license required under the Food Safety and Standards Act, 2006.',
  },
];

/* ========================================================================= */
/* 2. TRUTHFUL 5-TIER SUPPLIER VERIFICATION LIFECYCLE (NO FAKE VERIFIED)      */
/* ========================================================================= */

/**
 * Distinct lifecycle states for truthful supplier representation.
 * External discovery (Google / ONDC / BNI) NEVER equals "Verified OTP Supplier".
 */
export const SupplierTruthfulVerificationStage = {
  DISCOVERED_IN_AREA: 'DISCOVERED_IN_AREA',       // "Discovered by OTP" / "Found in your area"
  DETAILS_AVAILABLE: 'DETAILS_AVAILABLE',         // "Business Details Available" (catalog/address known)
  OTP_REGISTERED: 'OTP_REGISTERED',               // "OTP Registered" (account created / claimed)
  OTP_VERIFIED: 'OTP_VERIFIED',                   // "OTP Verified" (identity + operational credentials vetted)
  GST_VERIFIED: 'GST_VERIFIED',                   // "GST Verified" (statutory Luhn + active GST portal match)
} as const;

export type SupplierTruthfulVerificationStage =
  (typeof SupplierTruthfulVerificationStage)[keyof typeof SupplierTruthfulVerificationStage];

export interface VerificationStageDetails {
  stage: SupplierTruthfulVerificationStage;
  badgeLabel: string;
  badgeVariant: 'neutral' | 'blue' | 'indigo' | 'emerald' | 'amber';
  description: string;
  isExternallySourced: boolean;
  canQuoteWithoutClaim: boolean;
}

export const VERIFICATION_STAGE_DESCRIPTIONS: Record<
  SupplierTruthfulVerificationStage,
  VerificationStageDetails
> = {
  DISCOVERED_IN_AREA: {
    stage: 'DISCOVERED_IN_AREA',
    badgeLabel: 'Discovered in Area',
    badgeVariant: 'neutral',
    description: 'Identified via public business registries / geospatial mapping. Not yet OTP vetted.',
    isExternallySourced: true,
    canQuoteWithoutClaim: false,
  },
  DETAILS_AVAILABLE: {
    stage: 'DETAILS_AVAILABLE',
    badgeLabel: 'Business Details Available',
    badgeVariant: 'blue',
    description: 'Verified operational category & geographic coverage details available.',
    isExternallySourced: true,
    canQuoteWithoutClaim: false,
  },
  OTP_REGISTERED: {
    stage: 'OTP_REGISTERED',
    badgeLabel: 'OTP Registered',
    badgeVariant: 'indigo',
    description: 'Supplier has actively claimed portal profile and accepted terms of trade.',
    isExternallySourced: false,
    canQuoteWithoutClaim: true,
  },
  OTP_VERIFIED: {
    stage: 'OTP_VERIFIED',
    badgeLabel: 'OTP Verified',
    badgeVariant: 'emerald',
    description: 'Physical/commercial vetting passed by OTP Operations or authorized association.',
    isExternallySourced: false,
    canQuoteWithoutClaim: true,
  },
  GST_VERIFIED: {
    stage: 'GST_VERIFIED',
    badgeLabel: 'GST Verified',
    badgeVariant: 'emerald',
    description: '15-character GSTIN verified active with matching trade name on GSTN portal.',
    isExternallySourced: false,
    canQuoteWithoutClaim: true,
  },
};

/* ========================================================================= */
/* 3. 30-DAY CONFIGURABLE SUPPLIER DATA REFRESH POLICY                        */
/* ========================================================================= */

export interface SupplierNetworkRefreshPolicyConfig {
  /** Freshness TTL window in days (default: 30 days) */
  freshnessWindowDays: number;
  /** Max suppliers per scope before refresh (default: 50) */
  maxSuppliersPerScope: number;
  /** Allow background pre-warming for zero-coverage onboarding pincodes */
  enableOnboardingPreWarm: boolean;
  /** Require superadmin manual approval when quota utilization exceeds threshold % */
  approvalThresholdPercent: number;
}

export const DEFAULT_SUPPLIER_REFRESH_POLICY: SupplierNetworkRefreshPolicyConfig = {
  freshnessWindowDays: 30,
  maxSuppliersPerScope: 50,
  enableOnboardingPreWarm: true,
  approvalThresholdPercent: 80,
};

export type ScopeFreshnessStatus =
  | 'FRESH'            // Discovered < 30 days ago: Reuse cached OTP Supplier Network
  | 'REFRESH_ELIGIBLE' // Discovered >= 30 days ago: Eligible for controlled external refresh
  | 'NEVER_DISCOVERED';// No suppliers known in scope: Priority discovery needed

export interface DiscoveryScopeDescriptor {
  state: string;
  city: string;
  pincode: string;
  category: string;
  discoveryContext?: 'BUYER_RFQ' | 'BUYER_ONBOARDING' | 'SUPERADMIN_PREPARE' | 'NETWORK_EXPANSION';
}

export interface DiscoveryScopeFreshnessAssessment {
  scope: DiscoveryScopeDescriptor;
  status: ScopeFreshnessStatus;
  lastDiscoveredAt: string | null;
  ageInDays: number | null;
  knownSupplierCount: number;
  stageBreakdown: Record<SupplierTruthfulVerificationStage, number>;
  canReuseCachedNetwork: boolean;
  requiresExternalDiscovery: boolean;
  explanation: string;
}

/* ========================================================================= */
/* 4. INTELLIGENT & QUOTA-AWARE DISCOVERY SAFEGUARDS                          */
/* ========================================================================= */

export type DiscoveryPriorityLevel =
  | 'P1_ACTIVE_BUYER_RFQ'         // 1) Active buyer RFQ needing discovery (Highest priority)
  | 'P2_NEW_BUYER_ONBOARDING'     // 2) New buyer onboarding location with no coverage
  | 'P3_STALE_HIGH_DEMAND_SCOPE'  // 3) Stale scope (>=30d) with pending or repeat buyer interest
  | 'P4_SUPERADMIN_PROACTIVE'     // 4) Superadmin-approved proactive location preparation
  | 'P5_BACKGROUND_EXPANSION';    // 5) Background network expansion (Lowest priority)

export interface ProviderQuotaBudgetConfig {
  provider: string; // e.g., 'GOOGLE_PLACES', 'ONDC_GATEWAY', 'JUSTDIAL_SCRAPER'
  dailyRequestLimit: number;
  monthlyRequestLimit: number;
  emergencyReserveBuffer: number;   // Requests reserved strictly for P1 Active RFQs
  buyerDemandReserveBuffer: number; // Requests reserved for P1 + P2
  proactiveDiscoveryBudget: number; // Max requests allowed per day for Superadmin proactive prep
  maxCallsPerLocationCategory: number; // Max queries per scope per refresh cycle (e.g. 3)
}

export const DEFAULT_PROVIDER_BUDGET_CONFIGS: Record<string, ProviderQuotaBudgetConfig> = {
  GOOGLE_PLACES: {
    provider: 'GOOGLE_PLACES',
    dailyRequestLimit: 1500,
    monthlyRequestLimit: 45000,
    emergencyReserveBuffer: 200,
    buyerDemandReserveBuffer: 300,
    proactiveDiscoveryBudget: 500,
    maxCallsPerLocationCategory: 3,
  },
  ONDC_GATEWAY: {
    provider: 'ONDC_GATEWAY',
    dailyRequestLimit: 5000,
    monthlyRequestLimit: 150000,
    emergencyReserveBuffer: 500,
    buyerDemandReserveBuffer: 1000,
    proactiveDiscoveryBudget: 2000,
    maxCallsPerLocationCategory: 5,
  },
};

export interface QuotaEvaluationResult {
  allowed: boolean;
  priority: DiscoveryPriorityLevel;
  estimatedCalls: number;
  currentDailyUsage: number;
  dailyLimit: number;
  remainingDailyBudget: number;
  requiresSuperadminApproval: boolean;
  rejectionReason?: string;
  reserveTierApplied?: 'NORMAL' | 'BUYER_DEMAND_RESERVE' | 'EMERGENCY_RESERVE';
}

/* ========================================================================= */
/* 5. RELATIONAL DATA MODELS (IN-MEMORY / CONTRACT)                           */
/* ========================================================================= */

export interface NetworkSupplierLocation {
  id: string;
  supplierId: string;
  state: string;
  city: string;
  pincode: string;
  addressLine?: string;
  isPrimary: boolean;
  latitude?: number;
  longitude?: number;
  serviceRadiusKm: number;
}

export interface NetworkSupplierCategory {
  id: string;
  supplierId: string;
  categoryCode: string;
  categoryName: string;
  isPrimary: boolean;
  standardCodes?: string[]; // BIS, FSSAI, CPWD, HSN/SAC tags
  confidenceScore: number;
}

export interface NetworkDiscoveryObservation {
  id: string;
  supplierId: string;
  scopeKey: string; // state:city:pincode:category
  provider: string;
  externalRef?: string;
  observedAt: string;
  rawPayloadHash: string;
  discoveryContext: string;
  observedData: {
    businessName?: string;
    phone?: string;
    address?: string;
    rating?: number;
    userRatingsTotal?: number;
    placeId?: string;
  };
}

export interface NetworkSupplierEntity {
  id: string;
  canonicalId?: string;
  businessName: string;
  legalName?: string;
  gstin?: string;
  pan?: string;
  contactEmail?: string;
  contactPhone?: string;
  verificationStage: SupplierTruthfulVerificationStage;
  firstDiscoveredAt: string;
  lastSeenAt: string;
  lastRefreshedAt: string;
  provenanceProviders: string[];
  locations: NetworkSupplierLocation[];
  categories: NetworkSupplierCategory[];
  observationsCount: number;
  isOtpRegistered: boolean;
  isGstVerified: boolean;
  complianceStandards: IndianProcurementStandard[];
}

export interface ScopeCoverageReport {
  scope: DiscoveryScopeDescriptor;
  freshness: DiscoveryScopeFreshnessAssessment;
  suppliers: NetworkSupplierEntity[];
  summary: {
    totalKnown: number;
    discoveredInArea: number;
    detailsAvailable: number;
    otpRegistered: number;
    otpVerified: number;
    gstVerified: number;
    standardCompliantCount: number;
  };
}
