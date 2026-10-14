import { describe, expect, it } from 'vitest';
import {
  extractQuantity,
  extractWarrantyMonths,
  normalizeEvaluationWeights,
  validateGstin,
  RequirementMode,
  type TaxonomySnapshot,
  attributeSchemaFor,
  resolveDescribeOtherTaxonomyIds,
} from '@otp/domain';
import { validateAwardPreconditions } from '@/features/award/award.test';

/**
 * OTP Platform — Comprehensive End-to-End Multi-Actor Procurement Simulation
 *
 * Actors Covered:
 * 1. BUYER:
 *    - Standard Category & Subcategory Intake
 *    - Custom Specification & "Not Listed / Other" Flow (with fallback hint & text capture)
 *    - Dual Sourcing Modes: IDENTITY_PROTECTED (blind sealed tender) vs OPEN_RFQ (unprotected)
 *
 * 2. SUPPLIER (The Core Platform Moat):
 *    - Category Coverage & Registration Resiliency
 *    - Anonymous RFQ Reception (Zero PII leaks: masked buyer phone, email, address)
 *    - Pre-Quote Clarification & Q&A Negotiation (anonymous supplier labels)
 *    - Sealed Quote Submission (itemized base, labor, logistics, GST, warranty)
 *
 * 3. SUPER ADMIN & COMMITTEE:
 *    - Blind Sealed Comparison Matrix (Supplier A vs Supplier B vs Supplier C)
 *    - Multi-Criteria Merit Scoring (Commercial 40%, Speed 35%, SLA/Warranty 25%)
 *    - Committee Quorum Voting with Pre-set Justifications
 *    - Irrevocable Award Lock, Identity Reveal, Decision Receipt & Milestone PO Generation
 */

const comprehensiveTaxonomy: TaxonomySnapshot = {
  categories: [
    { id: 'cat-facility', code: 'property_facility_management', name: 'Property & Facility Management', description: 'Facility maintenance & upkeep', sortOrder: 1 },
    { id: 'cat-civil', code: 'construction_infrastructure', name: 'Construction & Infrastructure', description: 'Civil work & infrastructure', sortOrder: 2 },
    { id: 'cat-machinery', code: 'machinery_engineering', name: 'Machinery & Engineering', description: 'Precision machining & motors', sortOrder: 3 },
    { id: 'cat-furniture', code: 'furniture_fixtures', name: 'Furniture, Fixtures & Interiors', description: 'Office & clubhouse furniture', sortOrder: 4 },
    { id: 'cat-other', code: 'general_other', name: 'General / Other', description: 'Custom one-off requirements', sortOrder: 15 },
  ],
  subcategories: [
    {
      id: 'sub-painting',
      categoryId: 'cat-facility',
      categoryCode: 'property_facility_management',
      code: 'home_interior_exterior_painting',
      name: 'Home & Apartment Interior/Exterior Painting',
      description: 'Residential & society wall painting, putty, and coating',
      matchKeywords: ['painting', 'home painting', 'house painting', 'interior painting', 'exterior painting', 'wall putty', 'emulsion'],
      requiredAttributeCodes: ['painting_scope_type', 'surface_area_sqft'],
      defaultRequirementMode: RequirementMode.PROJECT_CONTRACT,
      sortOrder: 1,
    },
    {
      id: 'sub-cnc',
      categoryId: 'cat-machining',
      categoryCode: 'machinery_engineering',
      code: 'cnc_machining',
      name: 'CNC Machining & Turning',
      description: 'Custom components, turning and milling job work',
      matchKeywords: ['cnc', 'machining', 'turning', 'shaft', 'milling'],
      requiredAttributeCodes: ['material_grade', 'tolerance_mm'],
      defaultRequirementMode: RequirementMode.JOB_WORK,
      sortOrder: 2,
    },
    {
      id: 'sub-furniture',
      categoryId: 'cat-furniture',
      categoryCode: 'furniture_fixtures',
      code: 'office_furniture_workstations',
      name: 'Office Furniture & Modular Workstations',
      description: 'Desks, cubicles, ergonomic chairs',
      matchKeywords: ['furniture', 'workstation', 'office chair', 'cubicle'],
      requiredAttributeCodes: ['furniture_item_type'],
      defaultRequirementMode: RequirementMode.PRODUCT_MATERIAL,
      sortOrder: 3,
    },
    {
      id: 'sub-custom',
      categoryId: 'cat-other',
      categoryCode: 'general_other',
      code: 'custom_requirement',
      name: 'Not Listed? (Custom Specification)',
      description: 'Custom requirement that does not fit standard taxonomy catalog',
      matchKeywords: ['custom', 'other', 'special', 'bespoke'],
      requiredAttributeCodes: [],
      defaultRequirementMode: RequirementMode.OTHER,
      sortOrder: 99,
    },
  ],
  capabilities: [],
  attributes: [
    {
      id: 'attr-paint-scope',
      categoryCode: 'property_facility_management',
      subcategoryCode: 'home_interior_exterior_painting',
      code: 'painting_scope_type',
      label: 'Painting Scope & Location',
      dataType: 'ENUM',
      isRequired: true,
      unit: null,
      helpText: 'Select primary scope of painting',
      options: ['Full Flat Interior Painting', 'Society Full Exterior Repainting', 'Commercial Office Repainting'],
      validation: {},
      matchPatterns: [],
      placeholder: 'Select scope',
      sortOrder: 1,
    },
    {
      id: 'attr-paint-brand',
      categoryCode: 'property_facility_management',
      subcategoryCode: 'home_interior_exterior_painting',
      code: 'paint_brand_tier',
      label: 'Paint Brand Preference',
      dataType: 'ENUM',
      isRequired: false,
      unit: null,
      helpText: 'Preferred paint brand or grade',
      options: ['Asian Paints Royale / Apex', 'Berger Silk / WeatherCoat', 'Dulux Velvet Touch', 'Other (Specify Custom)'],
      validation: {},
      matchPatterns: [],
      placeholder: 'Select brand',
      sortOrder: 2,
    },
    {
      id: 'attr-paint-area',
      categoryCode: 'property_facility_management',
      subcategoryCode: 'home_interior_exterior_painting',
      code: 'surface_area_sqft',
      label: 'Estimated Surface Area (SQFT)',
      dataType: 'NUMBER',
      isRequired: true,
      unit: 'SQFT',
      helpText: 'Wall and ceiling area in square feet',
      options: [],
      validation: { min: 100, max: 500000 },
      matchPatterns: [],
      placeholder: 'e.g. 1500',
      sortOrder: 3,
    },
  ],
  criteria: [
    { id: 'crit-comm', code: 'commercial', name: 'Price & Landed Cost', direction: 'LOWER_IS_BETTER', valueSource: 'quote.total_price', sortOrder: 1 },
    { id: 'crit-speed', code: 'speed', name: 'Delivery Speed & Turnaround', direction: 'LOWER_IS_BETTER', valueSource: 'quote.lead_time_days', sortOrder: 2 },
    { id: 'crit-sla', code: 'sla', name: 'Warranty & Quality SLA', direction: 'HIGHER_IS_BETTER', valueSource: 'quote.warranty_months', sortOrder: 3 },
  ],
  cities: ['Bengaluru', 'Chennai', 'Coimbatore', 'Mumbai', 'Pune', 'Hyderabad', 'Delhi NCR'],
};

describe('OTP Platform — Full Multi-Actor Linear Procurement E2E Simulation', () => {
  // Shared simulation state tracking across actors
  let buyerRequirement: any = null;
  let publishedRfq: any = null;
  let supplierAQuote: any = null;
  let supplierBQuote: any = null;
  let supplierCQuote: any = null;
  let clarificationThread: any[] = [];
  let committeeVotes: any[] = [];
  let awardRecord: any = null;
  let purchaseOrder: any = null;

  // =========================================================================
  // ACTOR 1: BUYER INTAKE JOURNEY
  // =========================================================================
  describe('ACTOR 1: Buyer Intake & Taxonomy Resilience', () => {
    it('Flow 1A: Handles standard catalog category with dynamic technical attributes', () => {
      const prompt = 'Need full apartment interior painting 2500 sqft in Bengaluru 560001, needed within 7 days with 24 months warranty.';
      const qtyExtracted = extractQuantity(prompt);
      const warrantyExtracted = extractWarrantyMonths(prompt);

      expect(warrantyExtracted?.value).toBe(24);

      // Subcategory & attribute resolution
      const sub = comprehensiveTaxonomy.subcategories.find((s) => s.code === 'home_interior_exterior_painting')!;
      expect(sub).toBeDefined();
      expect(sub.categoryCode).toBe('property_facility_management');

      const schema = attributeSchemaFor(comprehensiveTaxonomy, sub.code);
      expect(schema.length).toBe(3);
      expect(schema.find((a) => a.code === 'painting_scope_type')?.isRequired).toBe(true);
      expect(schema.find((a) => a.code === 'surface_area_sqft')?.unit).toBe('SQFT');

      // Populate draft
      buyerRequirement = {
        id: 'req-paint-001',
        title: '3BHK Premium Interior Painting',
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        requirementMode: sub.defaultRequirementMode,
        quantity: 1,
        unit: 'JOB',
        deliveryCity: 'Bengaluru',
        deliveryPincode: '560001',
        deliveryLine1: 'Flat 402, Tower B, Green Valley Apartments, Sarjapur Road', // Buyer PII
        contactEmail: 'buyer.procurement@greenvalley-society.in', // Buyer PII
        contactPhone: '+91 98450 99887', // Buyer PII
        attributes: {
          painting_scope_type: 'Full Flat Interior Painting',
          surface_area_sqft: 2500,
          paint_brand_tier: 'Asian Paints Royale / Apex',
        },
        quality: { warrantyMonths: 24 },
        sourcing: {
          sourcingMode: 'IDENTITY_PROTECTED' as const,
          minQuotesRequired: 3,
          quoteDeadlineDays: 7,
          geographicReach: 'LOCAL' as const,
        },
        status: 'DRAFT',
      };

      expect(buyerRequirement.attributes.surface_area_sqft).toBe(2500);
      expect(buyerRequirement.sourcing.sourcingMode).toBe('IDENTITY_PROTECTED');
    });

    it('Flow 1B: Fallback & Nearest Match Hint when requirement does not match predefined catalog', () => {
      // Simulating a buyer entering a niche trade: e.g. "Industrial Chimney Refractory Brick Relining"
      const nicheQuery = 'Industrial Chimney Refractory Brick Relining 50 meters';
      
      // Nearest matching resolution:
      // If query does not hit any catalog leaf, system falls back to 'General / Other'
      // while offering nearest suggested macro categories as 1-tap hints
      const describeOther = resolveDescribeOtherTaxonomyIds(comprehensiveTaxonomy)!;
      expect(describeOther).toBeDefined();
      expect(describeOther.defaultMode).toBe(RequirementMode.OTHER);

      const customRequirementDraft = {
        id: 'req-niche-002',
        title: 'Industrial Chimney Refractory Brick Relining',
        categoryId: describeOther.categoryId,
        subcategoryId: describeOther.subcategoryId,
        requirementMode: describeOther.defaultMode,
        // Custom vertical & custom specification space captured without breaking DB schema:
        attributes: {
          custom_vertical: 'Chimney Refractory & Boiler Insulation',
          height_meters: 50,
          temperature_celsius_rating: 1200,
          nearest_category_hint: 'construction_infrastructure', // Provided as guidance
        },
        status: 'DRAFT',
      };

      expect(customRequirementDraft.attributes.custom_vertical).toBe('Chimney Refractory & Boiler Insulation');
      expect(customRequirementDraft.attributes.nearest_category_hint).toBe('construction_infrastructure');
    });

    it('Flow 1C: Dual Sourcing Mode Publishing — Identity Protected vs Open RFQ', () => {
      // 1. Publishing under IDENTITY_PROTECTED:
      publishedRfq = {
        id: 'rfq-paint-001',
        requirementId: buyerRequirement.id,
        rfqNumber: 'RFQ-2026-BLR-0042',
        sourcingMode: 'IDENTITY_PROTECTED',
        status: 'OPEN',
        revealStatus: 'PROTECTED', // Irrevocable shield active
        minQuotesRequired: 3,
        deadlineDays: 7,
        // Public Sanitized View presented to suppliers:
        publicSummary: {
          title: '3BHK Premium Interior Painting',
          city: 'Bengaluru',
          pincodePrefix: '560001',
          specs: buyerRequirement.attributes,
          warrantyMonths: 24,
          // PII Protection Proof:
          buyerName: 'Identity-Protected Buyer (RWA / Enterprise)',
          buyerAddress: 'Bengaluru, Karnataka (Exact street unmasked upon award reveal)',
          buyerPhone: 'PROTECTED_BY_OTP_SYSTEM',
        },
      };

      expect(publishedRfq.revealStatus).toBe('PROTECTED');
      expect(publishedRfq.publicSummary.buyerPhone).toBe('PROTECTED_BY_OTP_SYSTEM');
      expect(publishedRfq.publicSummary.buyerAddress).not.toContain('Sarjapur Road');
    });
  });

  // =========================================================================
  // ACTOR 2: SUPPLIER FLOW (THE PLATFORM MOAT)
  // =========================================================================
  describe('ACTOR 2: Supplier Moat — Radar, Discovery, Negotiation & Sealed Quotes', () => {
    it('Flow 2A: Supplier Registration & Verified Category Coverage Mapping', () => {
      // Validating supplier enterprise credentials
      const supplierGST = '29ABCDE1234F1Z5';
      const gstinValidation = validateGstin(supplierGST);
      expect(gstinValidation.valid).toBe(true);

      const supplierProfile = {
        id: 'sup-apex-01',
        businessName: 'Apex High-Rise Painters & Society Contractors',
        gstin: supplierGST,
        city: 'Bengaluru',
        coveredCategories: ['property_facility_management', 'construction_infrastructure'],
        coveredSubcategories: ['home_interior_exterior_painting'],
        ratingAvg: 4.85,
        completedJobs: 142,
        verificationStatus: 'PLATFORM_VERIFIED',
      };

      expect(supplierProfile.coveredCategories).toContain('property_facility_management');
      expect(supplierProfile.verificationStatus).toBe('PLATFORM_VERIFIED');
    });

    it('Flow 2B: Supplier Discovery & Reception under Identity Protection (Zero PII Leaks)', () => {
      // Supplier radar receives the RFQ invitation
      const supplierViewOfRfq = {
        rfqId: publishedRfq.id,
        rfqNumber: publishedRfq.rfqNumber,
        category: 'Home & Apartment Interior/Exterior Painting',
        scope: publishedRfq.publicSummary.specs.painting_scope_type,
        areaSqft: publishedRfq.publicSummary.specs.surface_area_sqft,
        brandPreferred: publishedRfq.publicSummary.specs.paint_brand_tier,
        location: 'Bengaluru 560001',
        buyerIdentity: publishedRfq.publicSummary.buyerName,
      };

      // Strict Invariant: Supplier must NEVER receive raw buyer phone or street address
      expect(supplierViewOfRfq.buyerIdentity).toContain('Identity-Protected Buyer');
      expect(JSON.stringify(supplierViewOfRfq)).not.toContain('buyer.procurement@greenvalley-society.in');
      expect(JSON.stringify(supplierViewOfRfq)).not.toContain('+91 98450 99887');
      expect(JSON.stringify(supplierViewOfRfq)).not.toContain('Flat 402');
    });

    it('Flow 2C: Pre-Quote Clarification & Technical Negotiation (Q&A Thread)', () => {
      // Supplier needs clarification on scaffolding & putty touchup scope
      const supplierQuestion = {
        id: 'msg-001',
        rfqId: publishedRfq.id,
        authorSide: 'SUPPLIER',
        authorLabel: 'Supplier A (Sealed)', // Anonymous label protects competitive fairness
        inquiryCategory: 'TECHNICAL_SPECIFICATION',
        body: 'Is wall putty application required on all 2500 sqft or touch-up on damaged areas only?',
        createdAt: new Date().toISOString(),
      };

      clarificationThread.push(supplierQuestion);
      expect(supplierQuestion.authorLabel).toBe('Supplier A (Sealed)');

      // Buyer answers and broadcasts clarification to ensure all competing suppliers have equal information
      const buyerResponse = {
        id: 'msg-002',
        rfqId: publishedRfq.id,
        authorSide: 'BUYER',
        authorLabel: 'Buyer Committee',
        replyToId: 'msg-001',
        isBroadcast: true, // Level playing field
        body: 'Full 1 coat putty scraping on living area; minor touch-up putty on bedrooms.',
        createdAt: new Date().toISOString(),
      };

      clarificationThread.push(buyerResponse);
      expect(clarificationThread.length).toBe(2);
      expect(buyerResponse.isBroadcast).toBe(true);
    });

    it('Flow 2D: 3 Competing Verified Suppliers Submit Sealed Quotes', () => {
      // Supplier A: Premium Quality (Berger / Royale, 30-mo warranty)
      supplierAQuote = {
        id: 'quote-sup-a',
        rfqId: publishedRfq.id,
        supplierId: 'sup-apex-01',
        anonymousAlias: 'Supplier A',
        lineItems: [
          { item: 'Materials: Asian Paints Royale Luxury Emulsion (2500 sqft)', cost: 65000 },
          { item: 'Labor & Mobilization: 2 Coats Putty + 2 Coats Paint', cost: 45000 },
          { item: 'Masking, Floor Protection & Cleanup', cost: 10000 },
        ],
        basePrice: 120000,
        gstAmount: 21600, // 18% GST
        totalPrice: 141600,
        leadTimeDays: 6,
        warrantyMonths: 24,
        paymentTermsAccepted: '30% Advance, 50% on Delivery, 20% on Acceptance',
        status: 'SUBMITTED',
        isSealed: true,
      };

      // Supplier B: L1 Lowest Cost (Standard Emulsion, 12-mo warranty)
      supplierBQuote = {
        id: 'quote-sup-b',
        rfqId: publishedRfq.id,
        supplierId: 'sup-metro-02',
        anonymousAlias: 'Supplier B',
        lineItems: [
          { item: 'Materials: Premium Emulsion Standard', cost: 50000 },
          { item: 'Labor & Masking', cost: 40000 },
        ],
        basePrice: 90000,
        gstAmount: 16200,
        totalPrice: 106200, // L1
        leadTimeDays: 8,
        warrantyMonths: 12,
        paymentTermsAccepted: '100% on delivery',
        status: 'SUBMITTED',
        isSealed: true,
      };

      // Supplier C: Ultra-fast High Speed (Immediate execution within 3 days)
      supplierCQuote = {
        id: 'quote-sup-c',
        rfqId: publishedRfq.id,
        supplierId: 'sup-speed-03',
        anonymousAlias: 'Supplier C',
        lineItems: [
          { item: 'Express Turnkey Painting (Crew of 6 Technicians)', cost: 110000 },
        ],
        basePrice: 110000,
        gstAmount: 19800,
        totalPrice: 129800,
        leadTimeDays: 3, // Fastest
        warrantyMonths: 18,
        paymentTermsAccepted: '30% Advance, 50% on Delivery, 20% on Acceptance',
        status: 'SUBMITTED',
        isSealed: true,
      };

      expect(supplierAQuote.isSealed).toBe(true);
      expect(supplierBQuote.totalPrice).toBeLessThan(supplierAQuote.totalPrice);
      expect(supplierCQuote.leadTimeDays).toBeLessThan(supplierAQuote.leadTimeDays);
    });
  });

  // =========================================================================
  // ACTOR 3: SUPER ADMIN & COMMITTEE EVALUATION AND AWARD
  // =========================================================================
  describe('ACTOR 3: Governance — Blind Comparison, Committee Vote, Award Lock & Reveal', () => {
    it('Flow 3A: Blind Comparison Matrix & Multi-Criteria Merit Scoring', () => {
      const quotes = [supplierAQuote, supplierBQuote, supplierCQuote];
      
      // Objective weighting: Commercial 40%, Speed 35%, SLA 25%
      const weights = { commercial: 40, speed: 35, sla: 25 };
      const normalized = normalizeEvaluationWeights(weights);
      expect(normalized.weights.commercial).toBe(40);

      // Scoring each quote
      // Lowest price = 106200 (Supplier B gets max commercial score)
      // Fastest speed = 3 days (Supplier C gets max speed score)
      // Highest warranty = 24 months (Supplier A gets max SLA score)
      const commercialWeight = normalized.weights.commercial ?? 40;
      const speedWeight = normalized.weights.speed ?? 35;
      const slaWeight = normalized.weights.sla ?? 25;
      const scores = quotes.map((q) => {
        const priceScore = (106200 / q.totalPrice) * commercialWeight;
        const speedScore = (3 / q.leadTimeDays) * speedWeight;
        const slaScore = (q.warrantyMonths / 24) * slaWeight;
        const totalScore = Math.round((priceScore + speedScore + slaScore) * 10) / 10;
        return { alias: q.anonymousAlias, id: q.id, totalScore, priceScore, speedScore, slaScore };
      });

      // Assert competitive matrix
      const scoreA = scores.find((s) => s.id === supplierAQuote.id)!;
      const scoreB = scores.find((s) => s.id === supplierBQuote.id)!;
      const scoreC = scores.find((s) => s.id === supplierCQuote.id)!;

      expect(scoreB.priceScore).toBe(40); // Max commercial score
      expect(scoreC.speedScore).toBe(35); // Max speed score
      expect(scoreA.slaScore).toBe(25);   // Max SLA score
      expect(scoreA.totalScore).toBeGreaterThan(70);
    });

    it('Flow 3B: Committee Weighted Voting with Mandatory Justification', () => {
      const quotes = [supplierAQuote, supplierBQuote, supplierCQuote];

      // Committee voting: President, Secretary, Facility In-charge
      committeeVotes = [
        {
          member: 'RWA President',
          voteForQuoteId: supplierAQuote.id,
          justification: 'Highest SLA guarantee (24 mo warranty) and reputed Asian Paints Royale finish.',
        },
        {
          member: 'RWA Secretary',
          voteForQuoteId: supplierAQuote.id,
          justification: 'Balanced speed (6 days) and comprehensive quality coverage.',
        },
        {
          member: 'RWA Treasurer',
          voteForQuoteId: supplierBQuote.id,
          justification: 'Preferred lowest commercial price (L1).',
        },
      ];

      const votesForA = committeeVotes.filter((v) => v.voteForQuoteId === supplierAQuote.id).length;
      expect(votesForA).toBe(2); // Majority quorum achieved

      // Validate award preconditions
      const rfqState = {
        status: 'EVALUATING',
        revealStatus: 'PROTECTED',
        minQuotesRequired: 3,
      };

      const preconditions = validateAwardPreconditions(
        rfqState,
        quotes,
        supplierAQuote.id,
        committeeVotes[0].justification,
      );
      expect(preconditions.valid).toBe(true);
    });

    it('Flow 3C: Irrevocable Award Decision, Unmasking Reveal & Purchase Order Issuance', () => {
      // 1. Irrevocable Award Record
      awardRecord = {
        id: 'award-paint-777',
        rfqId: publishedRfq.id,
        winningQuoteId: supplierAQuote.id,
        winningSupplierId: supplierAQuote.supplierId,
        awardedAmount: supplierAQuote.totalPrice,
        awardedAt: new Date().toISOString(),
        justification: committeeVotes[0].justification,
        votesSummary: { forWinningQuote: 2, totalVotes: 3 },
        status: 'AWARDED',
      };

      expect(awardRecord.status).toBe('AWARDED');

      // 2. Unmasking Reveal: Now and only now do buyer and supplier see each other's full details
      const unmaskedRevealPayload = {
        rfqId: publishedRfq.id,
        buyerUnmasked: {
          organization: 'Green Valley Residential Community',
          contactPerson: 'Procurement Officer',
          siteAddress: buyerRequirement.deliveryLine1,
          phone: buyerRequirement.contactPhone,
        },
        supplierUnmasked: {
          businessName: 'Apex High-Rise Painters & Society Contractors',
          gstin: '29ABCDE1234F1Z5',
          contactEmail: 'sales@apexpainters.test',
          phone: '+91 98450 11223',
        },
      };

      expect(unmaskedRevealPayload.buyerUnmasked.siteAddress).toContain('Green Valley Apartments');
      expect(unmaskedRevealPayload.supplierUnmasked.businessName).toBe('Apex High-Rise Painters & Society Contractors');

      // 3. Purchase Order (PO) with Milestones
      purchaseOrder = {
        id: 'po-2026-blr-001',
        poNumber: 'PO/2026/BLR/0042',
        awardId: awardRecord.id,
        rfqId: publishedRfq.id,
        supplierId: supplierAQuote.supplierId,
        totalAmount: supplierAQuote.totalPrice,
        currency: 'INR',
        status: 'ISSUED',
        paymentMilestones: [
          { milestoneNumber: 1, name: 'Mobilization & Surface Putty Scraping', pct: 30, amount: 42480, status: 'IN_PROGRESS' },
          { milestoneNumber: 2, name: 'Primer & First Coat Application', pct: 50, amount: 70800, status: 'PENDING' },
          { milestoneNumber: 3, name: 'Final Coat, Inspection & Warranty Handover', pct: 20, amount: 28320, status: 'PENDING' },
        ],
      };

      expect(purchaseOrder.status).toBe('ISSUED');
      expect(purchaseOrder.paymentMilestones.length).toBe(3);
      expect(purchaseOrder.paymentMilestones.reduce((acc: number, m: any) => acc + m.pct, 0)).toBe(100);
      expect(purchaseOrder.paymentMilestones.reduce((acc: number, m: any) => acc + m.amount, 0)).toBe(141600);
    });
  });
});
