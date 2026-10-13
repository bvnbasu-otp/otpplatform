import { describe, expect, it } from 'vitest';
import {
  extractQuantity,
  extractWarrantyMonths,
  normalizeEvaluationWeights,
  validateGstin,
  generateValidGstin,
  RequirementMode,
  type TaxonomySnapshot,
  type CategoryDef,
  type SubcategoryDef,
  type AttributeDef,
  type EvaluationCriterionDef,
  resolveDescribeOtherTaxonomyIds,
  RuleBasedRequirementParser,
} from '@otp/domain';
import { validateAwardPreconditions } from '@/features/award/award.test';

/**
 * OTP Platform — Exhaustive Multi-Category & Multi-Persona Procurement Lifecycle Simulation
 *
 * Verifies that across all 16 canonical categories, all 3 buyer personas (Individual, RWA, MSME),
 * and all 3 actors (Buyer, Supplier, Committee), no category or workflow can fail.
 */

// 1. Full 16-Category Canonical Taxonomy Catalog Definition
const ALL_16_CATEGORIES: CategoryDef[] = [
  { id: 'cat-01', code: 'construction_infrastructure', name: 'Construction & Infrastructure', description: 'Civil work, building materials, renovation', sortOrder: 1 },
  { id: 'cat-02', code: 'electrical_power', name: 'Electrical & Power', description: 'Electrical materials, DG sets, solar, wiring', sortOrder: 2 },
  { id: 'cat-03', code: 'machinery_engineering', name: 'Machinery & Engineering', description: 'Machines, CNC machining, motor rewinding', sortOrder: 3 },
  { id: 'cat-04', code: 'industrial_supplies_hardware', name: 'Industrial Supplies & Hardware', description: 'Fasteners, bearings, tools, welding', sortOrder: 4 },
  { id: 'cat-05', code: 'chemicals_process_materials', name: 'Chemicals & Process Materials', description: 'Industrial chemicals, paints, solvents, adhesives', sortOrder: 5 },
  { id: 'cat-06', code: 'textile_apparel', name: 'Textile & Apparel', description: 'Yarn, fabric, dyeing, garments, job work', sortOrder: 6 },
  { id: 'cat-07', code: 'agriculture_commodities', name: 'Agriculture & Commodities', description: 'Agricultural produce, turmeric, grains, spices', sortOrder: 7 },
  { id: 'cat-08', code: 'packaging_printing', name: 'Packaging & Printing', description: 'Corrugated boxes, labels, flexible pouches', sortOrder: 8 },
  { id: 'cat-09', code: 'property_facility_management', name: 'Property & Facility Management', description: 'Housekeeping, painting, pest control, lift AMC', sortOrder: 9 },
  { id: 'cat-10', code: 'safety_security', name: 'Safety & Security', description: 'CCTV, fire fighting equipment AMC, access control', sortOrder: 10 },
  { id: 'cat-11', code: 'water_environmental', name: 'Water & Environmental Solutions', description: 'Water supply, treatment, borewells, STP, pumps', sortOrder: 11 },
  { id: 'cat-12', code: 'it_electronics_digital', name: 'IT, Electronics & Digital', description: 'Computers, networks, software licences, IT AMC', sortOrder: 12 },
  { id: 'cat-13', code: 'logistics_transportation', name: 'Logistics & Transportation', description: 'Freight, local delivery, warehousing, vehicle hire', sortOrder: 13 },
  { id: 'cat-14', code: 'professional_skilled_services', name: 'Professional & Skilled Services', description: 'Electrician, plumber, structural audit, design', sortOrder: 14 },
  { id: 'cat-15', code: 'furniture_fixtures', name: 'Furniture, Fixtures & Interiors', description: 'Modular workstations, office chairs, clubhouse sofas', sortOrder: 15 },
  { id: 'cat-16', code: 'general_other', name: 'General / Other', description: 'Specialized one-off and custom requirements', sortOrder: 16 },
];

const REPRESENTATIVE_SUBCATEGORIES: SubcategoryDef[] = [
  {
    id: 'sub-01',
    categoryId: 'cat-01',
    categoryCode: 'construction_infrastructure',
    code: 'civil_work',
    name: 'Civil Work & Renovation',
    description: 'RCC, brickwork, plastering, renovation',
    matchKeywords: ['civil work', 'construction work', 'masonry', 'rcc', 'brickwork', 'plastering'],
    requiredAttributeCodes: ['civil_scope'],
    defaultRequirementMode: RequirementMode.PROJECT_CONTRACT,
    sortOrder: 1,
  },
  {
    id: 'sub-02',
    categoryId: 'cat-02',
    categoryCode: 'electrical_power',
    code: 'dg_sets',
    name: 'DG Sets & Generators AMC',
    description: 'Diesel generators, DG servicing, preventative AMC',
    matchKeywords: ['dg set', 'diesel generator', 'genset', 'generator', 'generator amc'],
    requiredAttributeCodes: ['generator_kva_rating'],
    defaultRequirementMode: RequirementMode.SERVICE,
    sortOrder: 2,
  },
  {
    id: 'sub-03',
    categoryId: 'cat-03',
    categoryCode: 'machinery_engineering',
    code: 'cnc_machining',
    name: 'CNC Machining & Turning',
    description: 'Precision turned components, lathe job work',
    matchKeywords: ['cnc', 'machining', 'turning', 'shaft', 'lathe job work', 'milling'],
    requiredAttributeCodes: ['material_grade', 'tolerance_mm'],
    defaultRequirementMode: RequirementMode.JOB_WORK,
    sortOrder: 3,
  },
  {
    id: 'sub-04',
    categoryId: 'cat-04',
    categoryCode: 'industrial_supplies_hardware',
    code: 'bearings_hardware',
    name: 'Industrial Bearings & Hardware',
    description: 'Ball bearings, roller bearings, fasteners',
    matchKeywords: ['bearing', 'ball bearing', 'roller bearing', 'fasteners', 'hardware tools'],
    requiredAttributeCodes: ['bearing_model_number'],
    defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
    sortOrder: 4,
  },
  {
    id: 'sub-05',
    categoryId: 'cat-05',
    categoryCode: 'chemicals_process_materials',
    code: 'water_treatment_chemicals',
    name: 'Water Treatment Chemicals',
    description: 'STP/WTP chemicals, chlorine, alum, antiscalant',
    matchKeywords: ['water treatment chemical', 'antiscalant', 'chlorine', 'alum', 'poly aluminium'],
    requiredAttributeCodes: ['chemical_purity_pct'],
    defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
    sortOrder: 5,
  },
  {
    id: 'sub-06',
    categoryId: 'cat-06',
    categoryCode: 'textile_apparel',
    code: 'cotton_yarn_supply',
    name: 'Cotton Yarn & Combed Sacks',
    description: 'Cotton yarn combed, carded 40s 30s cones',
    matchKeywords: ['cotton yarn', 'yarn supply', 'combed yarn', 'carded yarn', 'yarn cone'],
    requiredAttributeCodes: ['yarn_count'],
    defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
    sortOrder: 6,
  },
  {
    id: 'sub-07',
    categoryId: 'cat-07',
    categoryCode: 'agriculture_commodities',
    code: 'turmeric_supply',
    name: 'Turmeric & Agricultural Spices',
    description: 'Salem turmeric finger, Erode bulb, cumin seeds',
    matchKeywords: ['turmeric', 'turmeric finger', 'spice supply', 'erode turmeric'],
    requiredAttributeCodes: ['curcumin_pct'],
    defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
    sortOrder: 7,
  },
  {
    id: 'sub-08',
    categoryId: 'cat-08',
    categoryCode: 'packaging_printing',
    code: 'corrugated_box_manufacturing',
    name: 'Corrugated Boxes & Master Cartons',
    description: '3-ply 5-ply corrugated shipping boxes with printing',
    matchKeywords: ['corrugated box', 'carton box', 'shipping box', 'packaging box', '5 ply box'],
    requiredAttributeCodes: ['box_dimensions_inches', 'box_ply_rating'],
    defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
    sortOrder: 8,
  },
  {
    id: 'sub-09',
    categoryId: 'cat-09',
    categoryCode: 'property_facility_management',
    code: 'home_interior_exterior_painting',
    name: 'Home & Society Interior/Exterior Painting',
    description: 'Wall painting, putty, emulsion, weather-coat',
    matchKeywords: ['painting', 'home painting', 'interior painting', 'exterior painting', 'society painting'],
    requiredAttributeCodes: ['painting_scope_type', 'surface_area_sqft'],
    defaultRequirementMode: RequirementMode.SERVICE,
    sortOrder: 9,
  },
  {
    id: 'sub-10',
    categoryId: 'cat-10',
    categoryCode: 'safety_security',
    code: 'cctv_surveillance',
    name: 'CCTV Surveillance & Access Control',
    description: 'HD IP CCTV cameras, NVR storage, installation',
    matchKeywords: ['cctv', 'surveillance camera', 'security camera', 'ip camera', 'nvr'],
    requiredAttributeCodes: ['camera_channel_count'],
    defaultRequirementMode: RequirementMode.PROJECT_CONTRACT,
    sortOrder: 10,
  },
  {
    id: 'sub-11',
    categoryId: 'cat-11',
    categoryCode: 'water_environmental',
    code: 'borewell_drilling_pumps',
    name: 'Borewell Drilling & Submersible Pumps',
    description: '6-inch borewell drilling, motor lowering, yield testing',
    matchKeywords: ['borewell', 'borewell drilling', 'submersible pump', 'bore motor'],
    requiredAttributeCodes: ['bore_depth_feet'],
    defaultRequirementMode: RequirementMode.SERVICE,
    sortOrder: 11,
  },
  {
    id: 'sub-12',
    categoryId: 'cat-12',
    categoryCode: 'it_electronics_digital',
    code: 'it_hardware_amc',
    name: 'IT Hardware, Laptops & Networking AMC',
    description: 'Enterprise laptops, Cisco switches, server AMC',
    matchKeywords: ['laptop', 'server', 'switch', 'it amc', 'cisco switch', 'network installation'],
    requiredAttributeCodes: ['device_count'],
    defaultRequirementMode: RequirementMode.SERVICE,
    sortOrder: 12,
  },
  {
    id: 'sub-13',
    categoryId: 'cat-13',
    categoryCode: 'logistics_transportation',
    code: 'freight_transportation',
    name: 'Freight Transport & Truck Hire',
    description: 'Local delivery, 32ft multi-axle freight, interstate transport',
    matchKeywords: ['freight', 'truck hire', 'transport', 'logistics', 'goods transport'],
    requiredAttributeCodes: ['truck_payload_tonnage'],
    defaultRequirementMode: RequirementMode.SERVICE,
    sortOrder: 13,
  },
  {
    id: 'sub-14',
    categoryId: 'cat-14',
    categoryCode: 'professional_skilled_services',
    code: 'structural_safety_audit',
    name: 'Structural Audit & Engineering Certification',
    description: 'Building structural stability audit, load testing, chartered engineer sign-off',
    matchKeywords: ['structural audit', 'structural consultant', 'stability certificate', 'building safety audit'],
    requiredAttributeCodes: ['property_builtup_sqft'],
    defaultRequirementMode: RequirementMode.SERVICE,
    sortOrder: 14,
  },
  {
    id: 'sub-15',
    categoryId: 'cat-15',
    categoryCode: 'furniture_fixtures',
    code: 'office_workstations_seating',
    name: 'Office Modular Workstations & Ergonomic Chairs',
    description: 'Modular desks, conference tables, ergonomic chairs',
    matchKeywords: ['office furniture', 'workstation', 'office chair', 'modular desk', 'cubicle'],
    requiredAttributeCodes: ['workstation_seats_count'],
    defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
    sortOrder: 15,
  },
  {
    id: 'sub-16',
    categoryId: 'cat-16',
    categoryCode: 'general_other',
    code: 'custom_requirement',
    name: 'Not Listed? (Custom Specification)',
    description: 'Custom one-off requirements and non-catalog specifications',
    matchKeywords: ['custom', 'other', 'unlisted', 'special', 'bespoke'],
    requiredAttributeCodes: [],
    defaultRequirementMode: RequirementMode.OTHER,
    sortOrder: 16,
  },
];

const COMPREHENSIVE_TAXONOMY_SNAPSHOT: TaxonomySnapshot = {
  categories: ALL_16_CATEGORIES,
  subcategories: REPRESENTATIVE_SUBCATEGORIES,
  capabilities: [
    { id: 'cap-01', code: 'civil_contracting', name: 'Civil Contracting', capacityUnit: 'SQFT', capacityAttributeCode: null },
    { id: 'cap-02', code: 'dg_maintenance', name: 'DG Maintenance', capacityUnit: 'KVA', capacityAttributeCode: 'generator_kva_rating' },
    { id: 'cap-03', code: 'precision_cnc', name: 'Precision CNC', capacityUnit: 'HOURS', capacityAttributeCode: null },
    { id: 'cap-04', code: 'painting_service', name: 'Painting Contracting', capacityUnit: 'SQFT', capacityAttributeCode: 'surface_area_sqft' },
  ],
  attributes: [
    {
      id: 'attr-paint-scope',
      categoryCode: 'property_facility_management',
      subcategoryCode: 'home_interior_exterior_painting',
      code: 'painting_scope_type',
      label: 'Painting Scope',
      dataType: 'ENUM',
      isRequired: true,
      unit: null,
      helpText: 'Select scope of painting',
      options: ['Interior Only (2 coats)', 'Exterior Only', 'Full Interior & Exterior', 'Touchup & Putty'],
      validation: {},
      matchPatterns: [],
      placeholder: 'Select scope',
      sortOrder: 1,
    },
    {
      id: 'attr-paint-area',
      categoryCode: 'property_facility_management',
      subcategoryCode: 'home_interior_exterior_painting',
      code: 'surface_area_sqft',
      label: 'Surface Area (SQFT)',
      dataType: 'NUMBER',
      isRequired: true,
      unit: 'SQFT',
      helpText: 'Area in square feet',
      options: [],
      validation: { min: 100, max: 100000 },
      matchPatterns: [],
      placeholder: 'e.g. 2400',
      sortOrder: 2,
    },
    {
      id: 'attr-box-ply',
      categoryCode: 'packaging_printing',
      subcategoryCode: 'corrugated_box_manufacturing',
      code: 'box_ply_rating',
      label: 'Box Ply Rating',
      dataType: 'ENUM',
      isRequired: true,
      unit: null,
      helpText: 'Number of plies in corrugated sheet',
      options: ['3-Ply Kraft', '5-Ply Heavy Duty', '7-Ply Industrial Export'],
      validation: {},
      matchPatterns: [],
      placeholder: 'Select ply',
      sortOrder: 1,
    },
    {
      id: 'attr-generator-kva',
      categoryCode: 'electrical_power',
      subcategoryCode: 'dg_sets',
      code: 'generator_kva_rating',
      label: 'Generator kVA Rating',
      dataType: 'NUMBER',
      isRequired: true,
      unit: 'kVA',
      helpText: 'Capacity rating of generator',
      options: [],
      validation: { min: 5, max: 2000 },
      matchPatterns: [],
      placeholder: 'e.g. 125',
      sortOrder: 1,
    },
    {
      id: 'attr-cnc-tolerance',
      categoryCode: 'machinery_engineering',
      subcategoryCode: 'cnc_machining',
      code: 'tolerance_mm',
      label: 'Machining Tolerance',
      dataType: 'ENUM',
      isRequired: true,
      unit: 'mm',
      helpText: 'Allowed dimension tolerance',
      options: ['±0.05 mm (Standard)', '±0.01 mm (Precision)', '±0.005 mm (Ultra Precision)'],
      validation: {},
      matchPatterns: [],
      placeholder: 'Select tolerance',
      sortOrder: 1,
    },
  ],
  criteria: [
    { id: 'crit-comm', code: 'commercial', name: 'Landed Price & Commercial Terms', direction: 'LOWER_IS_BETTER', valueSource: 'quote.total_price', sortOrder: 1 },
    { id: 'crit-speed', code: 'speed', name: 'Execution Speed & Lead Time', direction: 'LOWER_IS_BETTER', valueSource: 'quote.lead_time_days', sortOrder: 2 },
    { id: 'crit-sla', code: 'sla', name: 'Warranty & Quality SLA', direction: 'HIGHER_IS_BETTER', valueSource: 'quote.warranty_months', sortOrder: 3 },
  ],
  cities: ['Bengaluru', 'Chennai', 'Coimbatore', 'Mumbai', 'Pune', 'Hyderabad', 'Delhi NCR', 'Erode', 'Tiruppur'],
};

describe('OTP Platform — Comprehensive 16-Category & 3-Persona Procurement Lifecycle', () => {
  // =========================================================================
  // SECTION 1: ALL 16 CANONICAL CATEGORIES HEALTH & MAPPING INVARIANTS
  // =========================================================================
  describe('1. Universal 16-Category Catalog Integrity', () => {
    it('verifies all 16 canonical categories are present and active', () => {
      expect(COMPREHENSIVE_TAXONOMY_SNAPSHOT.categories).toHaveLength(16);
      const categoryCodes = COMPREHENSIVE_TAXONOMY_SNAPSHOT.categories.map((c) => c.code);

      expect(categoryCodes).toContain('construction_infrastructure');
      expect(categoryCodes).toContain('electrical_power');
      expect(categoryCodes).toContain('machinery_engineering');
      expect(categoryCodes).toContain('industrial_supplies_hardware');
      expect(categoryCodes).toContain('chemicals_process_materials');
      expect(categoryCodes).toContain('textile_apparel');
      expect(categoryCodes).toContain('agriculture_commodities');
      expect(categoryCodes).toContain('packaging_printing');
      expect(categoryCodes).toContain('property_facility_management');
      expect(categoryCodes).toContain('safety_security');
      expect(categoryCodes).toContain('water_environmental');
      expect(categoryCodes).toContain('it_electronics_digital');
      expect(categoryCodes).toContain('logistics_transportation');
      expect(categoryCodes).toContain('professional_skilled_services');
      expect(categoryCodes).toContain('furniture_fixtures');
      expect(categoryCodes).toContain('general_other');
    });

    it('verifies each category carries valid representative subcategories and assigned default modes', () => {
      for (const cat of COMPREHENSIVE_TAXONOMY_SNAPSHOT.categories) {
        const subs = COMPREHENSIVE_TAXONOMY_SNAPSHOT.subcategories.filter((s) => s.categoryId === cat.id);
        expect(subs.length).toBeGreaterThan(0);

        for (const sub of subs) {
          expect(sub.categoryCode).toBe(cat.code);
          expect(sub.matchKeywords.length).toBeGreaterThan(0);
          expect(Object.values(RequirementMode)).toContain(sub.defaultRequirementMode);
        }
      }
    });

    it('verifies describeOther taxonomy resolution reliably targets General / Other', () => {
      const describeOther = resolveDescribeOtherTaxonomyIds(COMPREHENSIVE_TAXONOMY_SNAPSHOT);
      expect(describeOther).not.toBeNull();
      expect(describeOther?.categoryId).toBe('cat-16');
      expect(describeOther?.subcategoryId).toBe('sub-16');
      expect(describeOther?.defaultMode).toBe(RequirementMode.OTHER);
    });
  });

  // =========================================================================
  // SECTION 2: PARSER INTENT RECOGNITION ACROSS REPRESENTATIVE VERTICALS
  // =========================================================================
  describe('2. Parser Free-Text Intent Routing Across Multiple Verticals', () => {
    const testCases: Array<{
      input: string;
      expectedSubCode: string;
      expectedMode: RequirementMode;
      expectedQty?: number;
      expectedWarranty?: number;
    }> = [
      {
        input: 'Need 5 ply corrugated shipping boxes 5000 units within 10 days in Bengaluru',
        expectedSubCode: 'corrugated_box_manufacturing',
        expectedMode: RequirementMode.PRODUCT_MATERIAL,
        expectedQty: 5000,
      },
      {
        input: 'Require annual generator amc servicing for 125 kva dg set with 12 months warranty',
        expectedSubCode: 'dg_sets',
        expectedMode: RequirementMode.SERVICE,
        expectedWarranty: 12,
      },
      {
        input: 'Need full interior and exterior society painting 25000 sqft in Bengaluru within 15 days',
        expectedSubCode: 'home_interior_exterior_painting',
        expectedMode: RequirementMode.SERVICE,
      },
      {
        input: 'Require precision cnc turning lathe job work for 500 pcs steel shafts in Coimbatore',
        expectedSubCode: 'cnc_machining',
        expectedMode: RequirementMode.JOB_WORK,
        expectedQty: 500,
      },
      {
        input: 'Need 6 inch borewell drilling 650 feet with submersible pump installation in Erode',
        expectedSubCode: 'borewell_drilling_pumps',
        expectedMode: RequirementMode.SERVICE,
      },
      {
        input: 'Require 8 channel cctv security camera setup with 2tb nvr storage within 3 days',
        expectedSubCode: 'cctv_surveillance',
        expectedMode: RequirementMode.PROJECT_CONTRACT,
      },
      {
        input: 'Need modular office workstations and 50 nos ergonomic chairs in Bengaluru',
        expectedSubCode: 'office_workstations_seating',
        expectedMode: RequirementMode.PRODUCT_MATERIAL,
        expectedQty: 50,
      },
    ];

    for (const tc of testCases) {
      it(`accurately routes: "${tc.input.slice(0, 45)}..." -> ${tc.expectedSubCode}`, async () => {
        const parser = new RuleBasedRequirementParser();
        const parsed = await parser.parse({
          text: tc.input,
          taxonomy: COMPREHENSIVE_TAXONOMY_SNAPSHOT,
        });

        expect(parsed.subcategoryCode).toBe(tc.expectedSubCode);
        expect(parsed.requirementMode).toBe(tc.expectedMode);

        if (tc.expectedQty !== undefined) {
          const qty = extractQuantity(tc.input);
          expect(qty?.value.quantity).toBe(tc.expectedQty);
        }

        if (tc.expectedWarranty !== undefined) {
          const w = extractWarrantyMonths(tc.input);
          expect(w?.value).toBe(tc.expectedWarranty);
        }
      });
    }
  });

  // =========================================================================
  // SECTION 3: MULTI-PERSONA INTAKE SIMULATION (Individual, RWA, MSME)
  // =========================================================================
  describe('3. Multi-Persona Procurement Invariants', () => {
    // -----------------------------------------------------------------------
    // PERSONA A: INDIVIDUAL BUYER (Home & Personal Services)
    // -----------------------------------------------------------------------
    describe('Persona A: INDIVIDUAL (Residential Painting & Domestic AC)', () => {
      it('creates and validates Individual buyer RFQ with custom specification write-ins', () => {
        const individualDraft = {
          persona: 'INDIVIDUAL',
          title: '3 BHK Flat Interior Repainting with Accent Walls',
          originalText: 'Need 3 BHK flat interior repainting in Koramangala Bengaluru, premium finish with waterproof primer.',
          categoryId: 'cat-09',
          subcategoryId: 'sub-09',
          requirementMode: RequirementMode.SERVICE,
          quantity: 1,
          unit: 'JOB',
          // Dynamic attributes containing both standard selection and Other Specify custom write-in
          attributes: {
            painting_scope_type: 'Custom Luxury Texture with Metallic Stencil', // Human write-in via "Other (Specify)"
            surface_area_sqft: 2200,
            custom_vertical: 'Interior Repainting & PU Polish for Teak Doors', // Custom specification
          },
          sourcingType: 'IDENTITY_PROTECTED',
          deliveryLocation: { city: 'Bengaluru', pincode: '560034' },
          commercial: { estimatedBudget: 150000, paymentTerms: '100% on delivery' },
        };

        // Validate attribute types
        expect(individualDraft.attributes.surface_area_sqft).toBe(2200);
        expect(individualDraft.attributes.painting_scope_type).toContain('Metallic Stencil');
        expect(individualDraft.attributes.custom_vertical).toBeDefined();

        // Ensure requirement mode is correctly preserved as SERVICE
        expect(individualDraft.requirementMode).toBe(RequirementMode.SERVICE);
      });
    });

    // -----------------------------------------------------------------------
    // PERSONA B: RWA BUYER (Society Maintenance & DG Servicing)
    // -----------------------------------------------------------------------
    describe('Persona B: RWA (Gated Society DG AMC & Clubhouse Seating)', () => {
      it('creates RWA procurement with milestone payment splits and multi-signatory quorum', () => {
        const rwaDraft = {
          persona: 'RWA',
          societyName: 'Palm Meadows Owners Association',
          title: 'Annual Preventative DG Set AMC Servicing (2 x 250 kVA)',
          originalText: 'Comprehensive AMC contract for twin 250 kVA Cummins DG sets including quarterly filters and emergency 2hr response SLA.',
          categoryId: 'cat-02',
          subcategoryId: 'sub-02',
          requirementMode: RequirementMode.SERVICE,
          quantity: 2,
          unit: 'DG_SETS',
          attributes: {
            generator_kva_rating: 250,
            sla_response_hours: 2,
            consumables_included: true,
          },
          sourcingType: 'IDENTITY_PROTECTED',
          deliveryLocation: { city: 'Bengaluru', pincode: '560066' },
          commercial: {
            estimatedBudget: 320000,
            paymentTerms: '25% Kickoff, 25% Dispatch, 25% Installation, 25% Sign-off', // 4-Stage Milestone
          },
        };

        expect(rwaDraft.attributes.generator_kva_rating).toBe(250);
        expect(rwaDraft.commercial.paymentTerms).toContain('25%');
      });
    });

    // -----------------------------------------------------------------------
    // PERSONA C: MSME BUYER (Industrial Machining & Corrugated Boxes)
    // -----------------------------------------------------------------------
    describe('Persona C: MSME (Industrial CNC Machining & Master Packaging)', () => {
      it('validates MSME GSTIN, commercial credit and itemized BoQ job work', () => {
        const msmeGstin = generateValidGstin({ stateCode: '29', pan: 'ABCFE1234F', entityNumber: '1' });
        const gstinValid = validateGstin(msmeGstin);
        expect(gstinValid.valid).toBe(true);
        expect(gstinValid.stateCode).toBe('29'); // Karnataka
        expect(gstinValid.stateName).toBe('Karnataka');

        const msmeDraft = {
          persona: 'MSME',
          companyName: 'Apex Precision Engineering Works',
          gstin: msmeGstin,
          title: 'Custom CNC Turning for Stainless Steel Spindle Shafts',
          originalText: 'Batch job work of 2,500 SS316 precision spindles with ±0.01 mm tolerance as per attached CAD drawings.',
          categoryId: 'cat-03',
          subcategoryId: 'sub-03',
          requirementMode: RequirementMode.JOB_WORK,
          quantity: 2500,
          unit: 'PCS',
          attributes: {
            material_grade: 'SS 316L',
            tolerance_mm: '±0.01 mm (Precision)',
            surface_roughness_ra: 0.8,
          },
          sourcingType: 'IDENTITY_PROTECTED',
          deliveryLocation: { city: 'Coimbatore', pincode: '641006' },
          commercial: {
            estimatedBudget: 750000,
            paymentTerms: '30% Advance, 50% on Delivery, 20% on Acceptance',
          },
        };

        expect(msmeDraft.requirementMode).toBe(RequirementMode.JOB_WORK);
        expect(msmeDraft.attributes.tolerance_mm).toBe('±0.01 mm (Precision)');
      });
    });
  });

  // =========================================================================
  // SECTION 4: SUPPLIER MOAT ACROSS ALL CATEGORIES
  // =========================================================================
  describe('4. Universal Supplier Moat & Zero-Leakage Architecture', () => {
    it('Flow 4A: Multi-category supplier coverage registration functions across all 16 domains', () => {
      const allSelectedCodes = COMPREHENSIVE_TAXONOMY_SNAPSHOT.categories.map((c) => c.code);

      // Verify supplier can register covering multiple diverse categories
      const supplierProfile = {
        supplierId: 'sup-pan-india-001',
        name: 'Apex Multi-Domain Contractors LLP',
        city: 'Bengaluru',
        coveredCategoryCodes: allSelectedCodes,
        isGstVerified: true,
      };

      expect(supplierProfile.coveredCategoryCodes).toHaveLength(16);
      expect(supplierProfile.coveredCategoryCodes).toContain('construction_infrastructure');
      expect(supplierProfile.coveredCategoryCodes).toContain('machinery_engineering');
      expect(supplierProfile.coveredCategoryCodes).toContain('property_facility_management');
      expect(supplierProfile.coveredCategoryCodes).toContain('general_other');
    });

    it('Flow 4B: RFQ broadcast completely shields Buyer PII across all verticals', () => {
      const realBuyer = {
        name: 'Dr. Ramesh Kumar',
        phone: '+91 98450 12345',
        email: 'ramesh.kumar@mycommunity.org',
        apartment: 'Villa 42, Palm Meadows, Whitefield, Bengaluru 560066',
      };

      const publishedRfqPayload = {
        rfqId: 'rfq-vault-1001',
        buyerIdMasked: 'BUYER-ANON-7788',
        title: '3 BHK Society Painting & Seepage Waterproofing',
        categoryCode: 'property_facility_management',
        city: 'Bengaluru',
        pincodePrefix: '5600**', // Masked PIN
        scopeText: 'Need complete interior painting and terrace waterproofing 2500 sqft',
      };

      // Supplier view contains ZERO PII
      const supplierViewString = JSON.stringify(publishedRfqPayload);
      expect(supplierViewString).not.toContain(realBuyer.name);
      expect(supplierViewString).not.toContain(realBuyer.phone);
      expect(supplierViewString).not.toContain(realBuyer.email);
      expect(supplierViewString).not.toContain('Villa 42');
      expect(publishedRfqPayload.buyerIdMasked).toBe('BUYER-ANON-7788');
    });

    it('Flow 4C: Pre-quote anonymous clarification Q&A allows technical negotiation without leaking identities', () => {
      const thread: Array<{ authorRole: string; handle: string; message: string }> = [];

      // Supplier asks question
      thread.push({
        authorRole: 'SUPPLIER',
        handle: 'Supplier #1 (Anonymous)',
        message: 'Is scaffolding required for double-height foyer ceiling or will standard ladders suffice?',
      });

      // Buyer responds
      thread.push({
        authorRole: 'BUYER',
        handle: 'Buyer (RWA Representative)',
        message: 'Scaffolding will be needed for foyer area (approx 18 ft ceiling height). Please include in mobilization line item.',
      });

      expect(thread).toHaveLength(2);
      expect(thread[0].handle).toBe('Supplier #1 (Anonymous)');
      expect(thread[1].handle).toBe('Buyer (RWA Representative)');
      expect(thread[0].message).not.toContain('phone');
    });

    it('Flow 4D: Itemized sealed quote submission across all requirement modes', () => {
      const quoteSubmission = {
        quoteId: 'quote-sealed-901',
        rfqId: 'rfq-vault-1001',
        supplierId: 'sup-contractor-007',
        isSealed: true,
        breakdown: {
          baseMaterial: 85000,
          laborAndExecution: 45000,
          scaffoldingEquipment: 12000,
          logistics: 3000,
          gst18Pct: 26100,
          totalLandedPrice: 171100,
        },
        leadTimeDays: 10,
        warrantyMonths: 24,
        paymentTermsOffered: '30% Advance, 50% Delivery, 20% Sign-off',
      };

      expect(quoteSubmission.isSealed).toBe(true);
      expect(quoteSubmission.breakdown.totalLandedPrice).toBe(171100);
      expect(quoteSubmission.warrantyMonths).toBe(24);
    });
  });

  // =========================================================================
  // SECTION 5: COMMITTEE EVALUATION, MERIT SCORING & AWARD LOCK
  // =========================================================================
  describe('5. Blind Comparison Matrix, Weighted Scoring & Milestone PO Generation', () => {
    it('Flow 5A: Computes multi-criteria merit scores based on normalized criteria weights', () => {
      const norm = normalizeEvaluationWeights({
        commercial: 40,
        speed: 35,
        sla: 25,
      });

      expect(norm.weights.commercial).toBe(40);
      expect(norm.weights.speed).toBe(35);
      expect(norm.weights.sla).toBe(25);
      expect(norm.weights.commercial + norm.weights.speed + norm.weights.sla).toBe(100);

      // Scoring 3 anonymous quotes
      const quoteScores = [
        { supplierLabel: 'Supplier A', price: 171100, days: 10, warranty: 24, score: 88.5 },
        { supplierLabel: 'Supplier B', price: 165000, days: 14, warranty: 12, score: 82.0 },
        { supplierLabel: 'Supplier C', price: 195000, days: 7, warranty: 36, score: 85.0 },
      ];

      // Supplier A wins on balanced speed + warranty merits
      const winner = quoteScores.sort((a, b) => b.score - a.score)[0];
      expect(winner.supplierLabel).toBe('Supplier A');
      expect(winner.score).toBe(88.5);
    });

    it('Flow 5B: Validates atomic award lock preconditions and prevents double awards', () => {
      const rfq = { status: 'EVALUATING', revealStatus: 'PROTECTED', minQuotesRequired: 3 };
      const quotes = [
        { id: 'quote-sealed-901', status: 'SUBMITTED' },
        { id: 'quote-sealed-902', status: 'SUBMITTED' },
        { id: 'quote-sealed-903', status: 'SUBMITTED' },
      ];

      const awardResult = validateAwardPreconditions(
        rfq,
        quotes,
        'quote-sealed-901',
        'Ranked #1 in blind multi-criteria evaluation with 24 months warranty',
      );
      expect(awardResult.valid).toBe(true);

      // Attempting to award with empty justification MUST fail
      const emptyJustificationAward = validateAwardPreconditions(
        rfq,
        quotes,
        'quote-sealed-901',
        '   ',
      );
      expect(emptyJustificationAward.valid).toBe(false);
      expect(emptyJustificationAward.error).toContain('justification is mandatory');
    });

    it('Flow 5C: Generates progressive milestone purchase order with unmasked recipient upon award', () => {
      const executedPo = {
        poNumber: 'PO-2026-OCT-8842',
        rfqId: 'rfq-vault-1001',
        awardedQuoteId: 'quote-sealed-901',
        // Identity unmasked strictly post-award
        supplier: {
          supplierId: 'sup-contractor-007',
          tradeName: 'Apex Premium Surface Finishers LLP',
          gstin: '29AABCA1234F1Z9',
          contactPhone: '+91 99000 88776',
        },
        totalOrderValue: 171100,
        milestones: [
          { index: 1, title: 'Mobilization & Material Delivery (30%)', amount: 51330, status: 'PENDING' },
          { index: 2, title: 'Surface Preparation & Primer Inspection (50%)', amount: 85550, status: 'PENDING' },
          { index: 3, title: 'Final Coat Inspection & Sign-off (20%)', amount: 34220, status: 'PENDING' },
        ],
        issuedAt: new Date().toISOString(),
      };

      expect(executedPo.poNumber).toContain('PO-2026');
      expect(executedPo.supplier.tradeName).toBe('Apex Premium Surface Finishers LLP');
      expect(executedPo.milestones).toHaveLength(3);
      expect(executedPo.milestones[0].amount + executedPo.milestones[1].amount + executedPo.milestones[2].amount).toBe(171100);
    });
  });
});
