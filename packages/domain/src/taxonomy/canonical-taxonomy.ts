/**
 * =============================================================================
 * OTP Platform — Canonical Sourcing Taxonomy & Classification Engine
 * =============================================================================
 * Supreme Specification: docs/RECONSTRUCT-PRODUCT-CONSTITUTION-v1.0.md
 * Stage R2-13: Canonical Taxonomy & Classification Engine
 *
 * Core Architecture & Invariants:
 * 1. Positioning: "OTP does the procurement work. The customer makes the decision."
 *    Taxonomy is internal intelligence and discovery mechanism — NOT a rigid form.
 * 2. 3 Canonical Buyer Contexts: INDIVIDUAL, RWA, MSME. (Enterprise strictly purged).
 * 3. 5 Procurement Types: PRODUCT, SERVICE, PROJECT (Works/Civil), FUNCTION (Events), RENTAL (Hire).
 * 4. Context-Scoped Hierarchy:
 *    Buyer Context -> Regional Context -> Procurement Type -> Domain -> Category -> Subcategory -> Discovery Classification
 * 5. Composite / Bundled Requirements: Multi-part requirements identified without splitting into separate transactions.
 * 6. Recurring Procurement: ONE_TIME, AMC_ANNUAL, PERIODIC_MONTHLY, PERIODIC_QUARTERLY, RECURRING_CONTRACT, RENTAL_PERIOD.
 * 7. Seed Taxonomies for Individual, RWA, and MSME Regional Clusters (Erode, Bhavani, Tiruppur, Coimbatore, Hosur).
 * 8. Provenance & Confidence: Explicit provenance ladder; zero fabricated knowledge.
 * 9. Universal Fallback: "Not listed? Tell OTP what you need" free-text intent capture.
 * =============================================================================
 */

export const CanonicalBuyerContext = {
  INDIVIDUAL: 'INDIVIDUAL',
  RWA: 'RWA',
  MSME: 'MSME',
} as const;

export type CanonicalBuyerContext =
  (typeof CanonicalBuyerContext)[keyof typeof CanonicalBuyerContext];

export const ProcurementType = {
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
  PROJECT: 'PROJECT',
  FUNCTION: 'FUNCTION',
  RENTAL: 'RENTAL',
} as const;

export type ProcurementType =
  (typeof ProcurementType)[keyof typeof ProcurementType];

export const RecurringFrequency = {
  ONE_TIME: 'ONE_TIME',
  AMC_ANNUAL: 'AMC_ANNUAL',
  PERIODIC_MONTHLY: 'PERIODIC_MONTHLY',
  PERIODIC_QUARTERLY: 'PERIODIC_QUARTERLY',
  RECURRING_CONTRACT: 'RECURRING_CONTRACT',
  RENTAL_PERIOD: 'RENTAL_PERIOD',
} as const;

export type RecurringFrequency =
  (typeof RecurringFrequency)[keyof typeof RecurringFrequency];

export const TaxonomyNodeStatus = {
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  MERGED: 'MERGED',
  PENDING_REVIEW: 'PENDING_REVIEW',
} as const;

export type TaxonomyNodeStatus =
  (typeof TaxonomyNodeStatus)[keyof typeof TaxonomyNodeStatus];

export const ClassificationConfidence = {
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
  MEDIUM_CONFIDENCE: 'MEDIUM_CONFIDENCE',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  UNCLASSIFIED: 'UNCLASSIFIED',
} as const;

export type ClassificationConfidence =
  (typeof ClassificationConfidence)[keyof typeof ClassificationConfidence];

export const ClassificationSource = {
  EXACT_MATCH: 'EXACT_MATCH',
  RULE_MATCH: 'RULE_MATCH',
  TAXONOMY_MATCH: 'TAXONOMY_MATCH',
  REGIONAL_MATCH: 'REGIONAL_MATCH',
  MULTI_SIGNAL_MATCH: 'MULTI_SIGNAL_MATCH',
  BUYER_CONFIRMED: 'BUYER_CONFIRMED',
  FREE_TEXT_FALLBACK: 'FREE_TEXT_FALLBACK',
} as const;

export type ClassificationSource =
  (typeof ClassificationSource)[keyof typeof ClassificationSource];

export const ClusterProvenance = {
  VERIFIED_CLUSTER: 'VERIFIED_CLUSTER',
  PROVEN_INDUSTRY_ZONE: 'PROVEN_INDUSTRY_ZONE',
  INFERRED_GEOGRAPHY: 'INFERRED_GEOGRAPHY',
  COMMUNITY_REPORTED: 'COMMUNITY_REPORTED',
} as const;

export type ClusterProvenance =
  (typeof ClusterProvenance)[keyof typeof ClusterProvenance];

export interface RegionalClusterDef {
  id: string;
  code: string;
  name: string;
  state: string;
  district: string;
  city: string;
  towns: string[];
  pincodes: string[];
  primaryDomains: string[];
  specialties: string[];
  provenance: ClusterProvenance;
  confidenceScore: number;
  verifiedSupplierCount?: number;
}

export interface CanonicalTaxonomyNode {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  buyerContexts: CanonicalBuyerContext[];
  procurementType: ProcurementType;
  domainCode: string;
  domainName: string;
  categoryCode: string;
  categoryName: string;
  subcategoryCode: string;
  subcategoryName: string;
  regionalClusters?: string[];
  matchKeywords: string[];
  synonyms: string[];
  prohibitedTerms?: string[];
  requiredAttributeCodes: string[];
  defaultRecurringFrequency: RecurringFrequency;
  status: TaxonomyNodeStatus;
  deprecatedInFavorOf?: string | null;
  mergedIntoNodeId?: string | null;
  version: string;
  sortOrder: number;
}

export interface CompositeRequirementPart {
  id: string;
  title: string;
  procurementType: ProcurementType;
  categoryCode: string;
  subcategoryCode: string;
  quantity?: number | null;
  unit?: string | null;
  estimatedProportion?: number;
  notes?: string;
}

export interface RequirementClassification {
  rawIntent: string;
  normalizedRequirement: string;
  buyerContext: CanonicalBuyerContext;
  procurementType: ProcurementType;
  recurringFrequency: RecurringFrequency;
  categoryCode: string | null;
  subcategoryCode: string | null;
  domainCode: string | null;
  regionalClusterCode: string | null;
  confidence: ClassificationConfidence;
  confidenceScore: number;
  source: ClassificationSource;
  taxonomyVersion: string;
  matchedKeywords: string[];
  compositeParts?: CompositeRequirementPart[];
  isBundled: boolean;
  unclassifiedReason?: string | null;
  suggestedActions?: string[];
}

export interface DiscoveryClassificationPayload {
  categoryCode: string;
  subcategoryCode: string;
  procurementType: ProcurementType;
  buyerContext: CanonicalBuyerContext;
  regionalClusterCode?: string | null;
  targetAttributes: Record<string, unknown>;
  deliveryLocation: {
    pincode?: string | null;
    city?: string | null;
    radiusKm: number;
  };
  confidence: ClassificationConfidence;
  confidenceScore: number;
  source: ClassificationSource;
  taxonomyVersion: string;
  isBundled: boolean;
  recurringFrequency: RecurringFrequency;
}

export interface UnclassifiedRequirementRecord {
  id: string;
  rawIntent: string;
  buyerContext: CanonicalBuyerContext;
  buyerProfileId?: string | null;
  organizationId?: string | null;
  capturedAt: string;
  city?: string | null;
  pincode?: string | null;
  suggestedKeywords: string[];
  reviewStatus: 'PENDING' | 'TRIAGED' | 'NODE_CREATED' | 'DISMISSED';
  reviewedBy?: string | null;
  targetSubcategoryCode?: string | null;
  reviewNotes?: string | null;
}

export interface TaxonomyHealthMetrics {
  totalNodes: number;
  activeNodes: number;
  deprecatedNodes: number;
  mergedNodes: number;
  pendingReviewNodes: number;
  nodesByContext: Record<CanonicalBuyerContext, number>;
  nodesByProcurementType: Record<ProcurementType, number>;
  regionalClusterCount: number;
  unclassifiedCount: number;
  taxonomyVersion: string;
}

// -----------------------------------------------------------------------------
// 1. AUTHORITATIVE REGIONAL INDUSTRIAL CLUSTERS (MSME)
// -----------------------------------------------------------------------------

export const CANONICAL_REGIONAL_CLUSTERS: readonly RegionalClusterDef[] = [
  {
    id: 'cluster_erode_agro_textile',
    code: 'erode_agro_textile',
    name: 'Erode Agro-Processing & Textile Hub',
    state: 'Tamil Nadu',
    district: 'Erode',
    city: 'Erode',
    towns: ['Erode', 'Perundurai', 'Gobichettipalayam', 'Sathyamangalam'],
    pincodes: ['638001', '638002', '638009', '638052', '638452'],
    primaryDomains: ['AGRO_PROCESSING', 'TEXTILES', 'COLD_CHAIN'],
    specialties: ['Turmeric Polishing & Grading', 'Turmeric Steam Sterilization', 'Rayon Sizing', 'Food Grains Packaging'],
    provenance: ClusterProvenance.VERIFIED_CLUSTER,
    confidenceScore: 0.98,
    verifiedSupplierCount: 42,
  },
  {
    id: 'cluster_bhavani_weaving',
    code: 'bhavani_weaving',
    name: 'Bhavani Jamakkalam & Home Textiles Cluster',
    state: 'Tamil Nadu',
    district: 'Erode',
    city: 'Bhavani',
    towns: ['Bhavani', 'Komarapalayam', 'Anthiyur'],
    pincodes: ['638301', '638183', '638501'],
    primaryDomains: ['HANDLOOM_WEAVING', 'HOME_TEXTILES', 'BLEACHING_DYEING'],
    specialties: ['Bhavani Jamakkalam', 'Jacquard Bedsheets', 'Floor Mats', 'Yarn Dyeing'],
    provenance: ClusterProvenance.VERIFIED_CLUSTER,
    confidenceScore: 0.96,
    verifiedSupplierCount: 28,
  },
  {
    id: 'cluster_tiruppur_knitwear',
    code: 'tiruppur_knitwear',
    name: 'Tiruppur Knitwear & Apparel Capital',
    state: 'Tamil Nadu',
    district: 'Tiruppur',
    city: 'Tiruppur',
    towns: ['Tiruppur', 'Avinashi', 'Palladam', 'Uthukuli'],
    pincodes: ['641601', '641602', '641603', '641604', '641654', '641664'],
    primaryDomains: ['GARMENT_MANUFACTURING', 'KNITTING', 'DYEING_PRINTING', 'TEXTILE_MACHINERY'],
    specialties: ['Circular & Flat Knitting', 'CMT Garment Stitching', 'Eco-Friendly Zero Liquid Discharge Dyeing', 'Garment Trims & Spares'],
    provenance: ClusterProvenance.VERIFIED_CLUSTER,
    confidenceScore: 0.99,
    verifiedSupplierCount: 86,
  },
  {
    id: 'cluster_coimbatore_engineering',
    code: 'coimbatore_engineering',
    name: 'Coimbatore Pumps, Motors & Engineering Foundries',
    state: 'Tamil Nadu',
    district: 'Coimbatore',
    city: 'Coimbatore',
    towns: ['Coimbatore', 'Peelamedu', 'Ganapathy', 'Kurichi', 'Singanallur', 'Sulur'],
    pincodes: ['641001', '641004', '641006', '641018', '641021', '641045'],
    primaryDomains: ['FOUNDRIES', 'PUMPS_MOTORS', 'PRECISION_MACHINING', 'HEAVY_FABRICATION'],
    specialties: ['Submersible Borewell Pumps', 'Electric Motors', 'Cast Iron & Ductile Iron Castings', 'CNC Machining & VMC Works'],
    provenance: ClusterProvenance.VERIFIED_CLUSTER,
    confidenceScore: 0.99,
    verifiedSupplierCount: 114,
  },
  {
    id: 'cluster_hosur_automotive',
    code: 'hosur_automotive',
    name: 'Hosur Precision Auto-Components & Industrial Manufacturing',
    state: 'Tamil Nadu',
    district: 'Krishnagiri',
    city: 'Hosur',
    towns: ['Hosur', 'Mookandapalli', 'Sipcot Phase 1', 'Sipcot Phase 2', 'Denkanikottai'],
    pincodes: ['635109', '635126', '635103', '635114'],
    primaryDomains: ['AUTOMOTIVE_COMPONENTS', 'PRECISION_ENGINEERING', 'TOOL_AND_DIE', 'SURFACE_TREATMENT'],
    specialties: ['Automotive Press Components', 'Aerospace CNC Machining', 'Plastic Injection Moulding', 'Industrial Electroplating'],
    provenance: ClusterProvenance.VERIFIED_CLUSTER,
    confidenceScore: 0.97,
    verifiedSupplierCount: 56,
  },
];

// -----------------------------------------------------------------------------
// 2. AUTHORITATIVE SEED TAXONOMY NODES (INDIVIDUAL, RWA, MSME)
// -----------------------------------------------------------------------------

export const CURRENT_TAXONOMY_VERSION = '1.3.0';

export const ALL_CANONICAL_TAXONOMY_NODES: readonly CanonicalTaxonomyNode[] = [
  // ===========================================================================
  // A. INDIVIDUAL BUYER SEED TAXONOMY
  // ===========================================================================
  // 1. Home Appliances
  {
    id: 'node_ind_appliances_refrigerator',
    code: 'ind_home_refrigerator',
    name: 'Refrigerator & Fridge (Purchase / Replacement)',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'IND_APPLIANCES',
    domainName: 'Home Appliances',
    categoryCode: 'home_appliances',
    categoryName: 'Home Appliances',
    subcategoryCode: 'refrigerator_purchase',
    subcategoryName: 'Refrigerator',
    matchKeywords: ['refrigerator', 'fridge', 'double door fridge', 'single door fridge', 'frost free fridge', 'side by side fridge', 'deep freezer'],
    synonyms: ['refrigerator', 'fridge', 'freezer', 'cooling unit'],
    requiredAttributeCodes: ['capacity_litres', 'door_type', 'star_rating'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 10,
  },
  {
    id: 'node_ind_appliances_washing_machine',
    code: 'ind_home_washing_machine',
    name: 'Washing Machine (Purchase / Replacement)',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'IND_APPLIANCES',
    domainName: 'Home Appliances',
    categoryCode: 'home_appliances',
    categoryName: 'Home Appliances',
    subcategoryCode: 'washing_machine_purchase',
    subcategoryName: 'Washing Machine',
    matchKeywords: ['washing machine', 'front load', 'top load', 'automatic washing machine', 'semi automatic', 'dryer washer'],
    synonyms: ['washing machine', 'clothes washer', 'laundry machine'],
    requiredAttributeCodes: ['capacity_kg', 'loading_type', 'inverter_motor'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 11,
  },
  {
    id: 'node_ind_appliances_ac',
    code: 'ind_home_air_conditioner',
    name: 'Air Conditioner (Split / Inverter AC Purchase)',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'IND_APPLIANCES',
    domainName: 'Home Appliances',
    categoryCode: 'home_appliances',
    categoryName: 'Home Appliances',
    subcategoryCode: 'air_conditioner_purchase',
    subcategoryName: 'Air Conditioner',
    matchKeywords: ['ac', 'air conditioner', 'split ac', 'inverter ac', '1.5 ton ac', '1 ton ac', '2 ton ac', 'window ac'],
    synonyms: ['air conditioner', 'ac unit', 'room air conditioner'],
    requiredAttributeCodes: ['tonnage', 'star_rating', 'ac_type'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 12,
  },
  {
    id: 'node_ind_appliances_water_purifier',
    code: 'ind_home_water_purifier',
    name: 'Water Purifier (RO / UV Purchase)',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'IND_APPLIANCES',
    domainName: 'Home Appliances',
    categoryCode: 'home_appliances',
    categoryName: 'Home Appliances',
    subcategoryCode: 'water_purifier_purchase',
    subcategoryName: 'Water Purifier',
    matchKeywords: ['water purifier', 'ro purifier', 'uv water purifier', 'ro membrane', 'alkaline water filter', 'aquaguard', 'kent ro'],
    synonyms: ['water purifier', 'ro unit', 'water filter'],
    requiredAttributeCodes: ['purification_tech', 'storage_capacity_litres'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 13,
  },
  {
    id: 'node_ind_appliances_water_heater',
    code: 'ind_home_water_heater',
    name: 'Water Heater & Geyser',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'IND_APPLIANCES',
    domainName: 'Home Appliances',
    categoryCode: 'home_appliances',
    categoryName: 'Home Appliances',
    subcategoryCode: 'geyser_purchase',
    subcategoryName: 'Geyser / Water Heater',
    matchKeywords: ['geyser', 'water heater', 'instant geyser', 'storage geyser', '15 litre geyser', '25 litre geyser', 'solar water heater'],
    synonyms: ['geyser', 'water heater', 'boiler'],
    requiredAttributeCodes: ['capacity_litres', 'heating_type'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 14,
  },
  // 2. Home Repair & Maintenance
  {
    id: 'node_ind_repair_appliance_service',
    code: 'ind_repair_appliance_service',
    name: 'Appliance Repair & Servicing (AC / Fridge / RO / Geyser)',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'IND_REPAIR',
    domainName: 'Home Repair & Maintenance',
    categoryCode: 'home_repair_maintenance',
    categoryName: 'Home Repair & Maintenance',
    subcategoryCode: 'appliance_repair_service',
    subcategoryName: 'Appliance Repair',
    matchKeywords: ['ac repair', 'ac service', 'gas leak ac', 'fridge repair', 'washing machine repair', 'ro filter change', 'geyser repair', 'appliance servicing'],
    synonyms: ['appliance repair', 'ac service', 'technician visit', 'home maintenance'],
    requiredAttributeCodes: ['appliance_type', 'issue_description'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 20,
  },
  {
    id: 'node_ind_repair_plumbing',
    code: 'ind_repair_plumbing',
    name: 'Plumbing & Sanitary Repair Services',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'IND_REPAIR',
    domainName: 'Home Repair & Maintenance',
    categoryCode: 'home_repair_maintenance',
    categoryName: 'Home Repair & Maintenance',
    subcategoryCode: 'plumbing_service',
    subcategoryName: 'Plumbing Services',
    matchKeywords: ['plumber', 'plumbing', 'tap leak', 'pipe blockage', 'bathroom fittings', 'water tank connection', 'flush valve repair', 'drainage blockage'],
    synonyms: ['plumbing', 'sanitary work', 'plumber service'],
    requiredAttributeCodes: ['plumbing_work_type', 'urgency_level'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 21,
  },
  {
    id: 'node_ind_repair_electrical',
    code: 'ind_repair_electrical',
    name: 'Electrical Repair, Rewiring & Switchboard Work',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'IND_REPAIR',
    domainName: 'Home Repair & Maintenance',
    categoryCode: 'home_repair_maintenance',
    categoryName: 'Home Repair & Maintenance',
    subcategoryCode: 'electrical_service',
    subcategoryName: 'Electrical Services',
    matchKeywords: ['electrician', 'electrical repair', 'short circuit', 'mcb trip', 'switchboard installation', 'fan installation', 'house rewiring', 'inverter wiring'],
    synonyms: ['electrical', 'electrician service', 'wiring work'],
    requiredAttributeCodes: ['electrical_job_type', 'points_count'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 22,
  },
  {
    id: 'node_ind_repair_painting',
    code: 'ind_home_painting',
    name: 'Home Painting & Touch-up (Interior / Exterior)',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.PROJECT,
    domainCode: 'IND_REPAIR',
    domainName: 'Home Repair & Maintenance',
    categoryCode: 'home_repair_maintenance',
    categoryName: 'Home Repair & Maintenance',
    subcategoryCode: 'home_painting_project',
    subcategoryName: 'Home Painting',
    matchKeywords: ['home painting', 'house painting', 'interior painting', 'wall putty', 'emulsion paint', 'enamel paint', 'texture painting', 'waterproofing paint'],
    synonyms: ['painting', 'whitewash', 'wall painter'],
    requiredAttributeCodes: ['area_sqft', 'paint_type', 'bhk_type'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 23,
  },
  {
    id: 'node_ind_repair_carpentry',
    code: 'ind_repair_carpentry',
    name: 'Carpentry & Furniture Repair Services',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'IND_REPAIR',
    domainName: 'Home Repair & Maintenance',
    categoryCode: 'home_repair_maintenance',
    categoryName: 'Home Repair & Maintenance',
    subcategoryCode: 'carpentry_service',
    subcategoryName: 'Carpentry Services',
    matchKeywords: ['carpenter', 'carpentry', 'door lock repair', 'hinges repair', 'wardrobe repair', 'bed repair', 'modular cabinet fixing', 'wood polish'],
    synonyms: ['carpenter', 'woodwork', 'furniture repair'],
    requiredAttributeCodes: ['carpentry_work_type'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 24,
  },
  // 3. Cleaning & Domestic
  {
    id: 'node_ind_cleaning_deep_home',
    code: 'ind_cleaning_deep_home',
    name: 'Deep Home Cleaning & Sanitization',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'IND_CLEANING',
    domainName: 'Cleaning & Domestic Services',
    categoryCode: 'cleaning_domestic',
    categoryName: 'Cleaning & Domestic Services',
    subcategoryCode: 'deep_home_cleaning',
    subcategoryName: 'Deep Cleaning',
    matchKeywords: ['deep cleaning', 'home cleaning', 'house cleaning', 'bathroom deep clean', 'kitchen deep clean', 'post renovation cleaning', 'move in cleaning'],
    synonyms: ['deep clean', 'housekeeping', 'sanitization'],
    requiredAttributeCodes: ['bhk_size', 'cleaning_scope'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 30,
  },
  {
    id: 'node_ind_cleaning_pest_control',
    code: 'ind_cleaning_pest_control',
    name: 'Pest Control & Termite Treatment',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL, CanonicalBuyerContext.RWA, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'IND_CLEANING',
    domainName: 'Cleaning & Domestic Services',
    categoryCode: 'cleaning_domestic',
    categoryName: 'Cleaning & Domestic Services',
    subcategoryCode: 'pest_control_service',
    subcategoryName: 'Pest Control',
    matchKeywords: ['pest control', 'termite treatment', 'cockroach pest control', 'bedbug treatment', 'rodent control', 'anti termite piping'],
    synonyms: ['pest control', 'fumigation', 'termite control', 'pest management'],
    requiredAttributeCodes: ['pest_type', 'property_area_sqft', 'amc_required'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 31,
  },
  // 4. Vehicle Services
  {
    id: 'node_ind_vehicle_service',
    code: 'ind_vehicle_service',
    name: 'Vehicle Maintenance & Detailing (2W / 4W)',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'IND_VEHICLE',
    domainName: 'Vehicle Services',
    categoryCode: 'vehicle_services',
    categoryName: 'Vehicle Services',
    subcategoryCode: 'vehicle_maintenance',
    subcategoryName: 'Vehicle Service',
    matchKeywords: ['car service', 'car detailing', 'ceramic coating', 'car wash', 'bike service', 'two wheeler service', 'car battery replacement', 'car tyre replacement'],
    synonyms: ['vehicle service', 'car repair', 'auto service'],
    requiredAttributeCodes: ['vehicle_type', 'service_package'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 40,
  },
  // 5. Home Improvement
  {
    id: 'node_ind_home_nets_mesh',
    code: 'ind_home_nets_mesh',
    name: 'Balcony Safety Nets & Pigeon Mesh Installation',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL, CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.PROJECT,
    domainCode: 'IND_IMPROVEMENT',
    domainName: 'Home Improvement',
    categoryCode: 'home_improvement',
    categoryName: 'Home Improvement',
    subcategoryCode: 'safety_nets_installation',
    subcategoryName: 'Safety Nets & Pigeon Nets',
    matchKeywords: ['safety net', 'pigeon net', 'balcony net', 'bird netting', 'balcony safety mesh', 'anti bird spike', 'duct area netting'],
    synonyms: ['pigeon net', 'safety net', 'bird mesh'],
    requiredAttributeCodes: ['area_sqft', 'net_material_grade'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 50,
  },
  {
    id: 'node_ind_home_interiors',
    code: 'ind_home_interiors',
    name: 'Modular Interiors & Kitchen Wardrobe Work',
    buyerContexts: [CanonicalBuyerContext.INDIVIDUAL],
    procurementType: ProcurementType.PROJECT,
    domainCode: 'IND_IMPROVEMENT',
    domainName: 'Home Improvement',
    categoryCode: 'home_improvement',
    categoryName: 'Home Improvement',
    subcategoryCode: 'modular_interiors',
    subcategoryName: 'Modular Interiors',
    matchKeywords: ['modular kitchen', 'wardrobe', 'interior design', 'tv unit carpentry', 'false ceiling', 'gypsum ceiling', 'crockery unit'],
    synonyms: ['interiors', 'modular woodwork', 'kitchen design'],
    requiredAttributeCodes: ['property_type', 'interior_scope', 'material_ply_type'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 51,
  },

  // ===========================================================================
  // B. RWA (HOUSING SOCIETY) SEED TAXONOMY
  // ===========================================================================
  // 1. Water Management
  {
    id: 'node_rwa_water_tanker',
    code: 'rwa_water_bulk_tanker',
    name: 'Bulk Water Tanker Supply (RWA Facility Sump)',
    buyerContexts: [CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'RWA_WATER',
    domainName: 'Water Management & Utilities',
    categoryCode: 'water_management',
    categoryName: 'Water Management',
    subcategoryCode: 'bulk_water_tanker_supply',
    subcategoryName: 'Bulk Water Tanker',
    matchKeywords: ['water tanker', 'bulk water tanker', '12000 litre tanker', '24000 litre tanker', 'potable water tanker', 'sump filling', 'drinking water supply rwa'],
    synonyms: ['water tanker', 'sump water', 'commercial water tanker'],
    requiredAttributeCodes: ['tanker_capacity_litres', 'water_source_type', 'tds_certification_required'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 100,
  },
  {
    id: 'node_rwa_water_stp_amc',
    code: 'rwa_water_stp_amc',
    name: 'STP (Sewage Treatment Plant) Operation & AMC',
    buyerContexts: [CanonicalBuyerContext.RWA, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_WATER',
    domainName: 'Water Management & Utilities',
    categoryCode: 'water_management',
    categoryName: 'Water Management',
    subcategoryCode: 'stp_operation_amc',
    subcategoryName: 'STP Operation & AMC',
    matchKeywords: ['stp amc', 'sewage treatment plant', 'stp operator', 'stp maintenance', 'mbbr stp', 'mbr stp', 'effluent treatment', 'stp dosing chemicals'],
    synonyms: ['stp amc', 'sewage plant maintenance', 'stp operation'],
    requiredAttributeCodes: ['plant_capacity_kld', 'technology_type', 'manpower_scope'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 101,
  },
  {
    id: 'node_rwa_water_pump_amc',
    code: 'rwa_water_pump_borewell_amc',
    name: 'Hydro-Pneumatic Pumps & Borewell AMC',
    buyerContexts: [CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_WATER',
    domainName: 'Water Management & Utilities',
    categoryCode: 'water_management',
    categoryName: 'Water Management',
    subcategoryCode: 'pump_borewell_amc',
    subcategoryName: 'Pumps & Borewell AMC',
    matchKeywords: ['borewell motor', 'hydro pneumatic pump', 'booster pump amc', 'submersible pump repair', 'pump control panel', 'vfd panel pump'],
    synonyms: ['pump amc', 'borewell maintenance', 'water pump repair'],
    requiredAttributeCodes: ['motor_hp', 'pump_count', 'controller_type'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 102,
  },
  // 2. Civil / Infrastructure
  {
    id: 'node_rwa_civil_painting_waterproofing',
    code: 'rwa_civil_external_painting',
    name: 'Building External Painting, Texture Coating & Crack Sealing',
    buyerContexts: [CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.PROJECT,
    domainCode: 'RWA_CIVIL',
    domainName: 'Civil & Infrastructure',
    categoryCode: 'civil_infrastructure',
    categoryName: 'Civil Infrastructure',
    subcategoryCode: 'external_building_painting',
    subcategoryName: 'Building External Painting',
    matchKeywords: ['external painting', 'building repainting', 'society painting', 'crack sealing', 'terrace waterproofing', 'scaffolding painting', 'elastomeric paint'],
    synonyms: ['exterior painting', 'facade painting', 'building repaint project'],
    requiredAttributeCodes: ['total_surface_sqft', 'number_of_floors', 'warranty_years'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 110,
  },
  {
    id: 'node_rwa_civil_paver_roads',
    code: 'rwa_civil_paver_roads',
    name: 'Society Road, Pavement & Interlocking Paver Block Repair',
    buyerContexts: [CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.PROJECT,
    domainCode: 'RWA_CIVIL',
    domainName: 'Civil & Infrastructure',
    categoryCode: 'civil_infrastructure',
    categoryName: 'Civil Infrastructure',
    subcategoryCode: 'road_paver_repair',
    subcategoryName: 'Paver Block & Road Works',
    matchKeywords: ['paver block', 'interlocking tiles', 'society road repair', 'bitumen road', 'asphalt laying', 'concrete driveway', 'kerb stone painting'],
    synonyms: ['road repair', 'paver blocks', 'driveway civil work'],
    requiredAttributeCodes: ['road_area_sqft', 'paver_thickness_mm'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 111,
  },
  // 3. Fire & Safety
  {
    id: 'node_rwa_fire_safety_amc',
    code: 'rwa_fire_safety_amc',
    name: 'Fire Fighting System, Sprinkler & Extinguisher AMC',
    buyerContexts: [CanonicalBuyerContext.RWA, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_SAFETY',
    domainName: 'Fire & Safety Systems',
    categoryCode: 'fire_safety',
    categoryName: 'Fire & Safety',
    subcategoryCode: 'fire_fighting_amc',
    subcategoryName: 'Fire System AMC',
    matchKeywords: ['fire fighting', 'fire extinguisher', 'extinguisher refilling', 'fire hydrant', 'hydrant testing', 'fire amc', 'fire sprinkler system', 'fire alarm panel', 'smoke detector amc', 'fire noc compliance'],
    synonyms: ['fire safety', 'fire extinguisher maintenance', 'fire system inspection', 'firefighting system'],
    requiredAttributeCodes: ['extinguisher_count', 'hydrant_points', 'annual_audit_included'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 120,
  },
  {
    id: 'node_rwa_cctv_security_amc',
    code: 'rwa_cctv_security_amc',
    name: 'CCTV Surveillance, Boom Barrier & Access Control AMC',
    buyerContexts: [CanonicalBuyerContext.RWA, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_SAFETY',
    domainName: 'Fire & Safety Systems',
    categoryCode: 'fire_safety',
    categoryName: 'Fire & Safety',
    subcategoryCode: 'cctv_access_control_amc',
    subcategoryName: 'CCTV & Security Tech AMC',
    matchKeywords: ['cctv amc', 'cctv camera repair', 'boom barrier amc', 'rfid tag gate', 'biometric access control', 'nvr maintenance', 'dvr replacement'],
    synonyms: ['cctv maintenance', 'boom barrier service', 'surveillance amc'],
    requiredAttributeCodes: ['camera_count', 'barrier_count', 'storage_days'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 121,
  },
  // 4. Swimming Pool & Recreation
  {
    id: 'node_rwa_swimming_pool_amc',
    code: 'rwa_swimming_pool_amc',
    name: 'Swimming Pool Maintenance, Chemical Dosing & Filtration AMC',
    buyerContexts: [CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_RECREATION',
    domainName: 'Swimming Pool & Recreation',
    categoryCode: 'pool_recreation',
    categoryName: 'Pool & Recreation',
    subcategoryCode: 'swimming_pool_amc',
    subcategoryName: 'Swimming Pool AMC',
    matchKeywords: ['swimming pool amc', 'pool cleaning', 'pool chlorine chemical', 'pool filter sand change', 'pool pump repair', 'pool tiling repair'],
    synonyms: ['pool maintenance', 'swimming pool service', 'chlorination'],
    requiredAttributeCodes: ['pool_dimensions_ft', 'filtration_type', 'visit_frequency_per_week'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 130,
  },
  // 5. Gardening & Landscaping
  {
    id: 'node_rwa_gardening_amc',
    code: 'rwa_gardening_amc',
    name: 'Landscape Gardening & Tree Maintenance AMC',
    buyerContexts: [CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_GARDENING',
    domainName: 'Gardening & Landscaping',
    categoryCode: 'gardening_landscaping',
    categoryName: 'Gardening & Landscaping',
    subcategoryCode: 'landscape_gardening_amc',
    subcategoryName: 'Landscape Gardening AMC',
    matchKeywords: ['gardening amc', 'landscape maintenance', 'society garden', 'lawn mowing', 'tree pruning', 'gardener manpower', 'organic manure composting'],
    synonyms: ['garden maintenance', 'gardening contract', 'landscape service'],
    requiredAttributeCodes: ['garden_area_sqft', 'gardener_count', 'tools_scope'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 140,
  },
  // 6. EV Infrastructure & Energy
  {
    id: 'node_rwa_ev_charging',
    code: 'rwa_ev_charging_infrastructure',
    name: 'Community EV Charging Stations (2W / 4W AC Fast Chargers)',
    buyerContexts: [CanonicalBuyerContext.RWA, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.PROJECT,
    domainCode: 'RWA_ENERGY',
    domainName: 'EV Infrastructure & Energy',
    categoryCode: 'ev_infrastructure',
    categoryName: 'EV Infrastructure',
    subcategoryCode: 'community_ev_chargers',
    subcategoryName: 'Community EV Charging',
    matchKeywords: ['ev charger', 'ev charging station', 'ocpp charger', '7.4kw charger', '22kw ev charger', 'ev metering billing', 'electric vehicle parking'],
    synonyms: ['ev station', 'charging point', 'ev infrastructure'],
    requiredAttributeCodes: ['gun_count', 'power_kw', 'billing_software_integration'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 150,
  },
  {
    id: 'node_rwa_dg_amc',
    code: 'rwa_dg_set_amc',
    name: 'Diesel Generator (DG Set) Overhaul & Annual AMC',
    buyerContexts: [CanonicalBuyerContext.RWA, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_ENERGY',
    domainName: 'EV Infrastructure & Energy',
    categoryCode: 'power_backup',
    categoryName: 'Power Backup & Generators',
    subcategoryCode: 'dg_set_amc',
    subcategoryName: 'DG Set Maintenance AMC',
    matchKeywords: ['dg amc', 'diesel generator amc', 'cummins dg', 'kirloskar dg', 'dg b-check', 'dg servicing', 'amf panel dg', 'diesel supply'],
    synonyms: ['generator amc', 'dg service', 'diesel generator contract'],
    requiredAttributeCodes: ['dg_kva_rating', 'dg_make', 'check_level'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 151,
  },
  // 7. Facility Management (Elevators / Intercom)
  {
    id: 'node_rwa_elevator_lift_amc',
    code: 'rwa_elevator_lift_amc',
    name: 'Passenger Elevator / Lift Comprehensive AMC',
    buyerContexts: [CanonicalBuyerContext.RWA, CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'RWA_FACILITY',
    domainName: 'Facility Management',
    categoryCode: 'facility_management',
    categoryName: 'Facility Management',
    subcategoryCode: 'elevator_lift_amc',
    subcategoryName: 'Lift / Elevator AMC',
    matchKeywords: ['lift amc', 'elevator amc', 'passenger lift maintenance', 'otis lift', 'schindler lift', 'lift license renewal', 'ard device lift'],
    synonyms: ['elevator maintenance', 'lift contract', 'lift repair service'],
    requiredAttributeCodes: ['lift_count', 'floor_stops', 'contract_type_comprehensive'],
    defaultRecurringFrequency: RecurringFrequency.AMC_ANNUAL,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 160,
  },
  // 8. Community Events (Composite / Bundled)
  {
    id: 'node_rwa_events_composite',
    code: 'rwa_community_event_composite',
    name: 'Society AGM & Festival Event Setup (Shamiana, Sound, Catering)',
    buyerContexts: [CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.FUNCTION,
    domainCode: 'RWA_EVENTS',
    domainName: 'Community Events & Gatherings',
    categoryCode: 'community_events',
    categoryName: 'Community Events',
    subcategoryCode: 'society_event_setup',
    subcategoryName: 'Society Event Setup (Bundled)',
    matchKeywords: ['society agm', 'annual general meeting', 'diwali celebration society', 'shamiana tent', 'event sound system', 'event catering society', 'festival stage'],
    synonyms: ['society event', 'agm setup', 'community festival'],
    requiredAttributeCodes: ['attendees_count', 'event_duration_hours', 'bundled_services'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 170,
  },

  // ===========================================================================
  // C. MSME REGIONAL INDUSTRIAL CLUSTER SEED TAXONOMY
  // ===========================================================================
  // 1. Erode Cluster (Turmeric & Agro-Processing)
  {
    id: 'node_msme_erode_turmeric_processing',
    code: 'msme_erode_turmeric_processing',
    name: 'Turmeric Polishing, Grinding & Steam Sterilization Job Works',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'MSME_AGRO_PROCESSING',
    domainName: 'Agro-Processing & Commodity Processing',
    categoryCode: 'turmeric_processing',
    categoryName: 'Turmeric Processing',
    subcategoryCode: 'turmeric_polishing_sterilization',
    subcategoryName: 'Turmeric Processing Jobwork',
    regionalClusters: ['erode_agro_textile'],
    matchKeywords: ['turmeric polishing', 'turmeric finger grading', 'turmeric steam sterilization', 'curcumin extraction', 'turmeric grinding pulverizer', 'turmeric bulb sorting'],
    synonyms: ['turmeric job work', 'turmeric processing', 'manjal processing erode'],
    requiredAttributeCodes: ['batch_weight_mt', 'curcumin_percentage_target', 'packaging_type'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 200,
  },
  {
    id: 'node_msme_erode_textile_sizing',
    code: 'msme_erode_textile_sizing',
    name: 'Rayon & Cotton Yarn Sizing, Warping & Beam Loading',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'MSME_TEXTILES',
    domainName: 'Textiles & Weaving Support',
    categoryCode: 'textile_sizing',
    categoryName: 'Textile Sizing',
    subcategoryCode: 'yarn_sizing_warping',
    subcategoryName: 'Yarn Sizing & Warping',
    regionalClusters: ['erode_agro_textile'],
    matchKeywords: ['yarn sizing', 'rayon sizing', 'cotton warping', 'beam loading', 'sizing chemical paste', 'weaver beam supply'],
    synonyms: ['sizing jobwork', 'warping jobwork', 'textile beam'],
    requiredAttributeCodes: ['yarn_count', 'ends_count', 'beam_length_meters'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 201,
  },
  // 2. Bhavani Cluster (Bedsheets & Jamakkalam Weaving)
  {
    id: 'node_msme_bhavani_jamakkalam_weaving',
    code: 'msme_bhavani_jamakkalam_weaving',
    name: 'Bhavani Jamakkalam Handloom & Jacquard Bedsheets Weaving',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'MSME_HOME_TEXTILES',
    domainName: 'Home Textiles & Carpets',
    categoryCode: 'home_textiles_manufacturing',
    categoryName: 'Home Textiles',
    subcategoryCode: 'jamakkalam_bedsheets_production',
    subcategoryName: 'Bhavani Bedsheets & Jamakkalam',
    regionalClusters: ['bhavani_weaving'],
    matchKeywords: ['jamakkalam', 'bhavani bedsheet', 'jacquard floor mat', 'handloom carpet', 'cotton durrie', 'printed bedspread bulk'],
    synonyms: ['bhavani jamakkalam', 'cotton rugs', 'woven bedsheets'],
    requiredAttributeCodes: ['fabric_gsm', 'dimensions_inches', 'weave_pattern'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 210,
  },
  // 3. Tiruppur Cluster (Garments, Knitting, Dyeing)
  {
    id: 'node_msme_tiruppur_knitting_cmt',
    code: 'msme_tiruppur_knitting_cmt',
    name: 'Circular / Flat Knitting & Cut-Make-Trim (CMT) Garment Stitching',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'MSME_GARMENTS',
    domainName: 'Garment & Apparel Manufacturing',
    categoryCode: 'knitwear_manufacturing',
    categoryName: 'Knitwear & Apparel',
    subcategoryCode: 'knitting_cmt_jobwork',
    subcategoryName: 'Knitting & CMT Stitching',
    regionalClusters: ['tiruppur_knitwear'],
    matchKeywords: ['circular knitting', 'single jersey knitting', 'interlock fabric', 'cmt stitching', 't-shirt stitching', 'overlock flatlock jobwork', 'garment production'],
    synonyms: ['knitting jobwork', 'garment cmt', 'apparel stitching tiruppur'],
    requiredAttributeCodes: ['fabric_type', 'pieces_batch_size', 'gauge_diameter'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 220,
  },
  {
    id: 'node_msme_tiruppur_dyeing_printing',
    code: 'msme_tiruppur_dyeing_printing',
    name: 'Eco-Friendly Fabric Dyeing (ZLD) & Rotary / Screen Printing',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'MSME_GARMENTS',
    domainName: 'Garment & Apparel Manufacturing',
    categoryCode: 'textile_wet_processing',
    categoryName: 'Textile Wet Processing',
    subcategoryCode: 'fabric_dyeing_printing',
    subcategoryName: 'Fabric Dyeing & Printing (ZLD)',
    regionalClusters: ['tiruppur_knitwear'],
    matchKeywords: ['fabric dyeing', 'softflow dyeing', 'zld dyeing tiruppur', 'rotary printing', 'reactive dye', 'screen printing garments', 'bio polishing'],
    synonyms: ['dyeing jobwork', 'fabric printing', 'wet processing'],
    requiredAttributeCodes: ['fabric_weight_kg', 'pantone_shades_count', 'fastness_standard'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 221,
  },
  // 4. Coimbatore Cluster (Foundries, Pumps, Motors, CNC)
  {
    id: 'node_msme_coimbatore_foundry_castings',
    code: 'msme_coimbatore_foundry_castings',
    name: 'Grey Cast Iron & Ductile SG Iron Foundry Castings',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'MSME_ENGINEERING',
    domainName: 'Foundries & Heavy Engineering',
    categoryCode: 'foundry_castings',
    categoryName: 'Foundry & Castings',
    subcategoryCode: 'iron_castings_supply',
    subcategoryName: 'Cast Iron & SG Iron Castings',
    regionalClusters: ['coimbatore_engineering'],
    matchKeywords: ['cast iron casting', 'sg iron casting', 'ductile iron', 'foundry coimbatore', 'shell molding casting', 'pump body casting', 'motor casing casting'],
    synonyms: ['ci castings', 'sg iron foundry', 'engineered castings'],
    requiredAttributeCodes: ['grade_standard', 'pattern_provided', 'single_piece_weight_kg'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 230,
  },
  {
    id: 'node_msme_coimbatore_pumps_motors',
    code: 'msme_coimbatore_pumps_motors',
    name: 'Industrial Motors, Submersible Pumps & Precision CNC Machining',
    buyerContexts: [CanonicalBuyerContext.MSME, CanonicalBuyerContext.RWA],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'MSME_ENGINEERING',
    domainName: 'Foundries & Heavy Engineering',
    categoryCode: 'pumps_motors_machining',
    categoryName: 'Pumps & Industrial Motors',
    subcategoryCode: 'pumps_cnc_machining',
    subcategoryName: 'Submersible Pumps & CNC Jobworks',
    regionalClusters: ['coimbatore_engineering'],
    matchKeywords: ['submersible pump', 'borewell motor', 'industrial electric motor', '3 phase motor', 'cnc precision machining', 'vmc machining jobwork', 'lathe turning'],
    synonyms: ['pumps coimbatore', 'motor manufacturing', 'cnc job work'],
    requiredAttributeCodes: ['motor_power_hp', 'machining_tolerance_mm', 'batch_quantity'],
    defaultRecurringFrequency: RecurringFrequency.ONE_TIME,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 231,
  },
  // 5. Hosur Cluster (Automotive Components & Tool & Die)
  {
    id: 'node_msme_hosur_auto_components',
    code: 'msme_hosur_auto_components',
    name: 'Automotive Sheet Metal Pressing & Precision Turned Components',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.PRODUCT,
    domainCode: 'MSME_AUTOMOTIVE',
    domainName: 'Automotive & Precision Manufacturing',
    categoryCode: 'auto_components',
    categoryName: 'Automotive Components',
    subcategoryCode: 'sheet_metal_turned_components',
    subcategoryName: 'Sheet Metal & Turned Components',
    regionalClusters: ['hosur_automotive'],
    matchKeywords: ['sheet metal press', 'deep drawing press', 'precision turned parts', 'auto components hosur', 'tool and die making', 'stamping parts', 'chassis brackets'],
    synonyms: ['press components', 'automotive parts', 'turned pins'],
    requiredAttributeCodes: ['material_grade', 'press_tonnage_required', 'tolerance_micron'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 240,
  },
  {
    id: 'node_msme_hosur_surface_treatment',
    code: 'msme_hosur_surface_treatment',
    name: 'Industrial Electroplating, Anodizing & Powder Coating Services',
    buyerContexts: [CanonicalBuyerContext.MSME],
    procurementType: ProcurementType.SERVICE,
    domainCode: 'MSME_AUTOMOTIVE',
    domainName: 'Automotive & Precision Manufacturing',
    categoryCode: 'surface_treatment',
    categoryName: 'Surface Treatment',
    subcategoryCode: 'electroplating_powder_coating',
    subcategoryName: 'Electroplating & Powder Coating',
    regionalClusters: ['hosur_automotive'],
    matchKeywords: ['zinc plating', 'nickel chrome plating', 'hard anodizing', 'powder coating', 'ced coating', 'salt spray test hours', 'passivation'],
    synonyms: ['plating jobwork', 'powder coating service', 'anodizing'],
    requiredAttributeCodes: ['coating_type', 'micron_thickness', 'salt_spray_hours'],
    defaultRecurringFrequency: RecurringFrequency.RECURRING_CONTRACT,
    status: TaxonomyNodeStatus.ACTIVE,
    version: CURRENT_TAXONOMY_VERSION,
    sortOrder: 241,
  },
];

// -----------------------------------------------------------------------------
// 3. INTENT EXTRACTION & CLASSIFICATION ALGORITHMS
// -----------------------------------------------------------------------------

/**
 * Extracts the 5 primary procurement types from raw buyer text.
 */
export function extractProcurementType(text: string): ProcurementType {
  const lower = text.toLowerCase();

  // 1. RENTAL / Hire
  if (/\b(rent|rental|hire|hiring|leasing|lease|for rent|on rent)\b/i.test(lower)) {
    return ProcurementType.RENTAL;
  }

  // 2. FUNCTION / Events
  if (/\b(event|agm|celebration|festival|wedding|gathering|stage|shamiana|catering|conference|function)\b/i.test(lower)) {
    return ProcurementType.FUNCTION;
  }

  // 3. PROJECT / Civil / Turnkey
  if (/\b(project|installation|painting|waterproofing|civil work|construction|renovation|overhaul|fabrication|interior design|laying|setup)\b/i.test(lower)) {
    return ProcurementType.PROJECT;
  }

  // 4. SERVICE / AMC / Repair / Maintenance
  if (/\b(service|services|repair|amc|maintenance|cleaning|pest control|jobwork|job work|servicing|rewiring|inspection|testing|operator)\b/i.test(lower)) {
    return ProcurementType.SERVICE;
  }

  // 5. Default PRODUCT
  return ProcurementType.PRODUCT;
}

/**
 * Extracts recurring frequency model from text.
 */
export function extractRecurringFrequency(text: string): RecurringFrequency {
  const lower = text.toLowerCase();

  if (/\b(amc|annual maintenance|yearly maintenance|1 year contract|annual contract)\b/i.test(lower)) {
    return RecurringFrequency.AMC_ANNUAL;
  }
  if (/\b(monthly|per month|every month|each month|monthly supply)\b/i.test(lower)) {
    return RecurringFrequency.PERIODIC_MONTHLY;
  }
  if (/\b(quarterly|every 3 months|each quarter)\b/i.test(lower)) {
    return RecurringFrequency.PERIODIC_QUARTERLY;
  }
  if (/\b(recurring|regular supply|daily supply|weekly supply|contract basis|retainer)\b/i.test(lower)) {
    return RecurringFrequency.RECURRING_CONTRACT;
  }
  if (/\b(rent|rental|hire|for \d+ days rent)\b/i.test(lower)) {
    return RecurringFrequency.RENTAL_PERIOD;
  }

  return RecurringFrequency.ONE_TIME;
}

/**
 * Detects bundled / composite multi-part requirements without silently splitting transactions.
 */
export function detectBundledComponents(
  text: string,
  buyerContext: CanonicalBuyerContext,
): { isBundled: boolean; parts: CompositeRequirementPart[] } {
  const lower = text.toLowerCase();
  const parts: CompositeRequirementPart[] = [];

  // RWA Event Bundles (e.g. Society AGM / Festival setup)
  if (buyerContext === CanonicalBuyerContext.RWA && (lower.includes('agm') || lower.includes('event') || lower.includes('festival') || lower.includes('celebration'))) {
    if (lower.includes('shamiana') || lower.includes('tent') || lower.includes('stage') || lower.includes('chairs')) {
      parts.push({
        id: 'part_tent_stage',
        title: 'Shamiana, Stage & Chairs Infrastructure',
        procurementType: ProcurementType.RENTAL,
        categoryCode: 'community_events',
        subcategoryCode: 'shamiana_rental',
        estimatedProportion: 0.35,
      });
    }
    if (lower.includes('sound') || lower.includes('mic') || lower.includes('lighting') || lower.includes('av')) {
      parts.push({
        id: 'part_sound_lighting',
        title: 'Audio Visual, Microphones & Stage Lighting',
        procurementType: ProcurementType.RENTAL,
        categoryCode: 'community_events',
        subcategoryCode: 'av_sound_rental',
        estimatedProportion: 0.25,
      });
    }
    if (lower.includes('food') || lower.includes('catering') || lower.includes('snack') || lower.includes('dinner')) {
      parts.push({
        id: 'part_catering',
        title: 'Event Catering & Refreshment Services',
        procurementType: ProcurementType.SERVICE,
        categoryCode: 'community_events',
        subcategoryCode: 'event_catering',
        estimatedProportion: 0.40,
      });
    }
  }

  // Home Improvement Bundles (e.g. Painting + Deep Cleaning)
  if (buyerContext === CanonicalBuyerContext.INDIVIDUAL && (lower.includes('painting') && (lower.includes('cleaning') || lower.includes('pest control')))) {
    parts.push({
      id: 'part_ind_painting',
      title: 'Interior Painting Work',
      procurementType: ProcurementType.PROJECT,
      categoryCode: 'home_repair_maintenance',
      subcategoryCode: 'home_painting_project',
      estimatedProportion: 0.70,
    });
    parts.push({
      id: 'part_ind_cleaning',
      title: 'Post-Painting Deep Cleaning',
      procurementType: ProcurementType.SERVICE,
      categoryCode: 'cleaning_domestic',
      subcategoryCode: 'deep_home_cleaning',
      estimatedProportion: 0.30,
    });
  }

  // MSME Garment Package (e.g. Knitting + Dyeing + Trims)
  if (buyerContext === CanonicalBuyerContext.MSME && (lower.includes('garment') || lower.includes('t-shirt')) && (lower.includes('dyeing') || lower.includes('knitting'))) {
    parts.push({
      id: 'part_msme_knitting',
      title: 'Knitting & Garment Stitching (CMT)',
      procurementType: ProcurementType.SERVICE,
      categoryCode: 'knitwear_manufacturing',
      subcategoryCode: 'knitting_cmt_jobwork',
      estimatedProportion: 0.60,
    });
    parts.push({
      id: 'part_msme_dyeing',
      title: 'Zero Liquid Discharge (ZLD) Fabric Dyeing',
      procurementType: ProcurementType.SERVICE,
      categoryCode: 'textile_wet_processing',
      subcategoryCode: 'fabric_dyeing_printing',
      estimatedProportion: 0.40,
    });
  }

  return {
    isBundled: parts.length > 1,
    parts,
  };
}

/**
 * Detects regional cluster with explicit provenance ladder.
 */
export function detectRegionalCluster(
  text: string,
  city?: string | null,
  pincode?: string | null,
): RegionalClusterDef | null {
  const lowerText = text.toLowerCase();
  const lowerCity = (city ?? '').toLowerCase();
  const pin = (pincode ?? '').trim();

  for (const cluster of CANONICAL_REGIONAL_CLUSTERS) {
    // 1. PIN code match (Highest Provenance)
    if (pin && cluster.pincodes.includes(pin)) {
      return cluster;
    }

    // 2. City or Town match
    if (lowerCity && (cluster.city.toLowerCase() === lowerCity || cluster.towns.some((t) => t.toLowerCase() === lowerCity))) {
      return cluster;
    }

    // 3. Keyword / Town match in raw text
    if (lowerText.includes(cluster.city.toLowerCase()) || cluster.towns.some((t) => lowerText.includes(t.toLowerCase()))) {
      return cluster;
    }

    // 4. Specialty / domain match in raw text
    const matchedSpecialties = cluster.specialties.filter((s) => lowerText.includes(s.toLowerCase()));
    if (matchedSpecialties.length >= 2) {
      return cluster;
    }
  }

  return null;
}

/**
 * Normalizes raw requirement text.
 */
export function normalizeRequirementText(rawText: string): string {
  return rawText
    .replace(/[^\w\s.,!?:;/()'"-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsWholePhrase(haystack: string, phrase: string): boolean {
  const cleanHaystack = ` ${haystack.toLowerCase()} `;
  const cleanPhrase = phrase.toLowerCase().trim();
  if (cleanPhrase.length === 0) return false;

  // Single word keyword: check whole word boundary
  if (!cleanPhrase.includes(' ')) {
    const regex = new RegExp(`(?:^|[^a-z0-9])${cleanPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'i');
    return regex.test(cleanHaystack);
  }

  // Multi-word phrase: direct substring search
  return cleanHaystack.includes(` ${cleanPhrase} `) || cleanHaystack.includes(cleanPhrase);
}

/**
 * Classifies raw intent against the canonical taxonomy with context & regional awareness.
 */
export function classifyRawBuyerIntent(
  rawIntent: string,
  buyerContext: CanonicalBuyerContext,
  options?: {
    city?: string | null;
    pincode?: string | null;
    nodes?: readonly CanonicalTaxonomyNode[];
  },
): RequirementClassification {
  const trimmed = rawIntent.trim();
  const normalized = normalizeRequirementText(trimmed);
  const activeNodes = (options?.nodes ?? ALL_CANONICAL_TAXONOMY_NODES).filter(
    (n) => n.status === TaxonomyNodeStatus.ACTIVE,
  );

  // 1. Empty / Unclassifiable prompt
  if (trimmed.length === 0) {
    return {
      rawIntent,
      normalizedRequirement: '',
      buyerContext,
      procurementType: ProcurementType.PRODUCT,
      recurringFrequency: RecurringFrequency.ONE_TIME,
      categoryCode: null,
      subcategoryCode: null,
      domainCode: null,
      regionalClusterCode: null,
      confidence: ClassificationConfidence.UNCLASSIFIED,
      confidenceScore: 0.0,
      source: ClassificationSource.FREE_TEXT_FALLBACK,
      taxonomyVersion: CURRENT_TAXONOMY_VERSION,
      matchedKeywords: [],
      isBundled: false,
      unclassifiedReason: 'Empty buyer intent provided',
      suggestedActions: ['Please describe your requirement in free text or voice note.'],
    };
  }

  const detectedProcType = extractProcurementType(trimmed);
  const detectedFrequency = extractRecurringFrequency(trimmed);
  const detectedCluster = detectRegionalCluster(trimmed, options?.city, options?.pincode);
  const bundleResult = detectBundledComponents(trimmed, buyerContext);

  const lowerHaystack = trimmed.toLowerCase();

  // Filter nodes matching buyer context
  const contextNodes = activeNodes.filter((n) => n.buyerContexts.includes(buyerContext));

  // Score candidates
  interface ScoredCandidate {
    node: CanonicalTaxonomyNode;
    score: number;
    matchedKeywords: string[];
    isExactMatch: boolean;
    isRegionalMatch: boolean;
  }

  const scored: ScoredCandidate[] = [];

  for (const node of contextNodes) {
    let score = 0;
    const hits: string[] = [];
    let isExact = false;
    let isRegional = false;

    // A. Keyword matching
    for (const kw of node.matchKeywords) {
      if (containsWholePhrase(lowerHaystack, kw)) {
        hits.push(kw);
        score += kw.length * 2;
        if (lowerHaystack === kw.toLowerCase()) {
          isExact = true;
          score += 50;
        }
      }
    }

    // B. Synonym matching
    for (const syn of node.synonyms) {
      if (containsWholePhrase(lowerHaystack, syn)) {
        hits.push(syn);
        score += syn.length;
      }
    }

    // Keyword/synonym hits are mandatory before applying type/cluster bonuses
    if (hits.length === 0) {
      continue;
    }

    // C. Procurement type match bonus
    if (node.procurementType === detectedProcType) {
      score += 10;
    }

    // D. Regional cluster match bonus
    if (detectedCluster && node.regionalClusters?.includes(detectedCluster.code)) {
      score += 25;
      isRegional = true;
    }

    if (score > 0) {
      scored.push({
        node,
        score,
        matchedKeywords: Array.from(new Set(hits)),
        isExactMatch: isExact,
        isRegionalMatch: isRegional,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.node.sortOrder - b.node.sortOrder);

  const best = scored[0];
  const runnerUp = scored[1];

  // If no match found or below threshold -> Universal Free-Text Fallback
  if (!best || best.matchedKeywords.length === 0 || best.score < 14) {
    return {
      rawIntent,
      normalizedRequirement: normalized,
      buyerContext,
      procurementType: detectedProcType,
      recurringFrequency: detectedFrequency,
      categoryCode: null,
      subcategoryCode: null,
      domainCode: null,
      regionalClusterCode: detectedCluster?.code ?? null,
      confidence: ClassificationConfidence.UNCLASSIFIED,
      confidenceScore: 0.10,
      source: ClassificationSource.FREE_TEXT_FALLBACK,
      taxonomyVersion: CURRENT_TAXONOMY_VERSION,
      matchedKeywords: [],
      compositeParts: bundleResult.parts,
      isBundled: bundleResult.isBundled,
      unclassifiedReason: 'No existing taxonomy subcategory reached confidence threshold.',
      suggestedActions: [
        'Preserve raw buyer intent for discovery search.',
        'Route to unclassified requirements review queue.',
        'Allow buyer to proceed with fast-track intake without blocking.',
      ],
    };
  }

  // Calculate confidence score (0.00 to 1.00)
  const strength = Math.min(1.0, best.score / 40);
  const margin = runnerUp ? Math.max(0, (best.score - runnerUp.score) / best.score) : 1.0;
  const confidenceScore = Number((0.7 * strength + 0.3 * margin).toFixed(2));

  let confidence: ClassificationConfidence = ClassificationConfidence.LOW_CONFIDENCE;
  if (best.isExactMatch || (best.score >= 25 && confidenceScore >= 0.80)) {
    confidence = ClassificationConfidence.HIGH_CONFIDENCE;
  } else if (best.score >= 16 && confidenceScore >= 0.50) {
    confidence = ClassificationConfidence.MEDIUM_CONFIDENCE;
  }

  let source: ClassificationSource = ClassificationSource.RULE_MATCH;
  if (best.isExactMatch) {
    source = ClassificationSource.EXACT_MATCH;
  } else if (best.isRegionalMatch) {
    source = ClassificationSource.REGIONAL_MATCH;
  } else if (best.matchedKeywords.length > 2) {
    source = ClassificationSource.MULTI_SIGNAL_MATCH;
  } else {
    source = ClassificationSource.TAXONOMY_MATCH;
  }

  return {
    rawIntent,
    normalizedRequirement: normalized,
    buyerContext,
    procurementType: best.node.procurementType,
    recurringFrequency: detectedFrequency !== RecurringFrequency.ONE_TIME ? detectedFrequency : best.node.defaultRecurringFrequency,
    categoryCode: best.node.categoryCode,
    subcategoryCode: best.node.subcategoryCode,
    domainCode: best.node.domainCode,
    regionalClusterCode: detectedCluster?.code ?? null,
    confidence,
    confidenceScore,
    source,
    taxonomyVersion: best.node.version,
    matchedKeywords: best.matchedKeywords,
    compositeParts: bundleResult.parts,
    isBundled: bundleResult.isBundled,
    unclassifiedReason: null,
  };
}

/**
 * Builds discovery parameters payload for R2-07 SupplierNetworkEngine.
 */
export function buildDiscoveryPayload(
  classification: RequirementClassification,
  location: { pincode?: string | null; city?: string | null; radiusKm?: number },
  attributes: Record<string, unknown> = {},
): DiscoveryClassificationPayload {
  return {
    categoryCode: classification.categoryCode ?? 'general_sourcing',
    subcategoryCode: classification.subcategoryCode ?? 'unclassified_requirement',
    procurementType: classification.procurementType,
    buyerContext: classification.buyerContext,
    regionalClusterCode: classification.regionalClusterCode,
    targetAttributes: attributes,
    deliveryLocation: {
      pincode: location.pincode ?? null,
      city: location.city ?? null,
      radiusKm: location.radiusKm ?? 25,
    },
    confidence: classification.confidence,
    confidenceScore: classification.confidenceScore,
    source: classification.source,
    taxonomyVersion: classification.taxonomyVersion,
    isBundled: classification.isBundled,
    recurringFrequency: classification.recurringFrequency,
  };
}
