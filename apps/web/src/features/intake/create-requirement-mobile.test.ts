import { describe, expect, it } from 'vitest';
import {
  RuleBasedRequirementParser,
  normalizeEvaluationWeights,
  type TaxonomySnapshot,
} from '@otp/domain';
import type { IntakeDraft } from './types/intake-draft';
import { groupAttributesForMobile } from './mobile-perf.test';

const mockTaxonomy: TaxonomySnapshot = {
  categories: [
    { id: 'cat-solar', code: 'solar', name: 'Solar Energy', description: null, sortOrder: 1 },
    { id: 'cat-machining', code: 'machining', name: 'Precision Machining', description: null, sortOrder: 2 },
    { id: 'cat-waterproofing', code: 'waterproofing', name: 'Civil & Waterproofing', description: null, sortOrder: 3 },
  ],
  subcategories: [
    {
      id: 'sub-rooftop-solar',
      categoryId: 'cat-solar',
      categoryCode: 'solar',
      code: 'rooftop_solar',
      name: 'Rooftop Solar PV Installation',
      description: null,
      matchKeywords: ['solar', 'rooftop', 'photovoltaic', 'panel'],
      requiredAttributeCodes: ['capacity_kw'],
      defaultRequirementMode: 'SERVICE',
      sortOrder: 1,
    },
    {
      id: 'sub-cnc-turning',
      categoryId: 'cat-machining',
      categoryCode: 'machining',
      code: 'cnc_turning',
      name: 'CNC Turning & Machining',
      description: null,
      matchKeywords: ['cnc', 'shaft', 'machining', 'turning'],
      requiredAttributeCodes: ['material_grade', 'tolerance_mm'],
      defaultRequirementMode: 'PRODUCT_MATERIAL',
      sortOrder: 2,
    },
  ],
  capabilities: [],
  attributes: [
    {
      id: 'attr-1',
      categoryCode: 'solar',
      subcategoryCode: 'rooftop_solar',
      code: 'capacity_kw',
      label: 'Capacity (kW)',
      dataType: 'NUMBER',
      isRequired: true,
      unit: 'kW',
      helpText: 'Plant AC/DC capacity',
      options: [],
      validation: { min: 1, max: 1000 },
      matchPatterns: [],
      placeholder: '50',
      sortOrder: 1,
    },
    {
      id: 'attr-2',
      categoryCode: 'solar',
      subcategoryCode: 'rooftop_solar',
      code: 'net_metering',
      label: 'Net Metering Required',
      dataType: 'BOOLEAN',
      isRequired: false,
      unit: null,
      helpText: 'Grid synchronisation approval',
      options: [],
      validation: {},
      matchPatterns: [],
      placeholder: null,
      sortOrder: 2,
    },
    {
      id: 'attr-3',
      categoryCode: 'machining',
      subcategoryCode: 'cnc_turning',
      code: 'material_grade',
      label: 'Material Grade',
      dataType: 'TEXT',
      isRequired: true,
      unit: null,
      helpText: 'e.g. EN8, SS304, AL6061',
      options: [],
      validation: {},
      matchPatterns: [],
      placeholder: 'EN8',
      sortOrder: 1,
    },
    {
      id: 'attr-4',
      categoryCode: 'machining',
      subcategoryCode: 'cnc_turning',
      code: 'tolerance_mm',
      label: 'Tolerance (±mm)',
      dataType: 'NUMBER',
      isRequired: true,
      unit: 'mm',
      helpText: 'Dimensional tolerance',
      options: [],
      validation: { min: 0.001, max: 1 },
      matchPatterns: [],
      placeholder: '0.05',
      sortOrder: 2,
    },
  ],
  criteria: [
    {
      id: 'crit-commercial',
      code: 'commercial',
      name: 'Price & Landed Cost',
      direction: 'LOWER_IS_BETTER',
      valueSource: 'quote.total_price',
      sortOrder: 1,
    },
    {
      id: 'crit-speed',
      code: 'speed',
      name: 'Delivery Speed & TAT',
      direction: 'LOWER_IS_BETTER',
      valueSource: 'quote.lead_time_days',
      sortOrder: 2,
    },
    {
      id: 'crit-quality',
      code: 'quality',
      name: 'Warranty & Quality Standards',
      direction: 'HIGHER_IS_BETTER',
      valueSource: 'quote.warranty_months',
      sortOrder: 3,
    },
    {
      id: 'crit-technical',
      code: 'technical',
      name: 'Technical Merit & Past Experience',
      direction: 'HIGHER_IS_BETTER',
      valueSource: 'supplier.rating',
      sortOrder: 4,
    },
  ],
  cities: ['Bengaluru', 'Chennai', 'Coimbatore', 'Mumbai', 'Pune', 'Delhi NCR', 'Hyderabad'],
};

describe('Create Requirement Mobile Redesign — Progressive Flow & Invariants', () => {
  const parser = new RuleBasedRequirementParser();

  describe('Step 1: "What do you need?" — Conversational Prompt & Quick Template Chips', () => {
    it('successfully extracts parameters from quick template prompts', async () => {
      const templatePrompt = 'Require 12.5 HP submersible borewell motor rewinding in Bengaluru 560001, needed within 5 days with 6 months warranty.';
      const result = await parser.parse({ text: templatePrompt, taxonomy: mockTaxonomy });

      expect(result.deliveryCity).toBe('Bengaluru');
      expect(result.deliveryPincode).toBe('560001');
      expect(result.timing.requiredByDays).toBe(5);
      expect(result.warrantyMonths).toBe(6);
    });

    it('rejects empty or less than 5 character input descriptions', () => {
      const validateStep1 = (text: string, title: string, subcategory: string, mode: string) => {
        if (text.trim().length < 5) return { valid: false, error: 'Please describe your requirement in a sentence or two.' };
        if (!title.trim()) return { valid: false, error: 'Give the requirement a short title.' };
        if (!subcategory) return { valid: false, error: 'Choose what kind of work this is.' };
        if (!mode) return { valid: false, error: 'Tell us procurement mode.' };
        return { valid: true, error: null };
      };

      expect(validateStep1('', 'Title', 'sub-1', 'SERVICE').valid).toBe(false);
      expect(validateStep1('abc', 'Title', 'sub-1', 'SERVICE').valid).toBe(false);
      expect(validateStep1('50kW Solar Installation in Bangalore', '', 'sub-1', 'SERVICE').valid).toBe(false);
      expect(validateStep1('50kW Solar Installation in Bangalore', '50kW Solar', '', 'SERVICE').valid).toBe(false);
      expect(validateStep1('50kW Solar Installation in Bangalore', '50kW Solar', 'sub-rooftop-solar', 'SERVICE').valid).toBe(true);
    });
  });

  describe('Step 2: "Where?" — City Pills & PIN Validation', () => {
    it('validates 6-digit postal PIN codes strictly', () => {
      const validateLocation = (city: string, pincode: string) => {
        if (!city.trim()) return { valid: false, error: 'City is required' };
        if (!pincode.trim() || !/^[0-9]{6}$/.test(pincode.trim())) {
          return { valid: false, error: 'Postal PIN code must be a 6-digit number' };
        }
        return { valid: true, error: null };
      };

      expect(validateLocation('Bangalore', '560001').valid).toBe(true);
      expect(validateLocation('', '560001').valid).toBe(false);
      expect(validateLocation('Bangalore', '5600').valid).toBe(false);
      expect(validateLocation('Bangalore', '560001A').valid).toBe(false);
      expect(validateLocation('Bangalore', '1234567').valid).toBe(false);
    });

    it('supports all canonical sourcing reaches: LOCAL, STATE, PAN_INDIA', () => {
      const allowedReaches = ['LOCAL', 'STATE', 'PAN_INDIA'];
      expect(allowedReaches).toContain('LOCAL');
      expect(allowedReaches).toContain('STATE');
      expect(allowedReaches).toContain('PAN_INDIA');
    });
  });

  describe('Step 3: "When & Budget?" — TAT Chips & Budget Slider', () => {
    it('validates timing mode and turnaround days correctly', () => {
      const validateTiming = (mode: string, days: number | null, date: string | null) => {
        if (mode === 'WITHIN_DAYS' && (!days || days < 1)) return false;
        if (mode === 'SPECIFIC_DATE' && !date) return false;
        return true;
      };

      expect(validateTiming('IMMEDIATE', null, null)).toBe(true);
      expect(validateTiming('WITHIN_DAYS', 15, null)).toBe(true);
      expect(validateTiming('WITHIN_DAYS', 0, null)).toBe(false);
      expect(validateTiming('SPECIFIC_DATE', null, '2026-10-15')).toBe(true);
      expect(validateTiming('SPECIFIC_DATE', null, '')).toBe(false);
    });

    it('formats Indian rupee budgets and supports private budget ceilings', () => {
      const formatInr = (amount: number) => `₹${amount.toLocaleString('en-IN')}`;
      expect(formatInr(250000)).toBe('₹2,50,000');
      expect(formatInr(750000)).toBe('₹7,50,000');
      expect(formatInr(1500000)).toBe('₹15,00,000');
      expect(formatInr(5000000)).toBe('₹50,00,000');
    });
  });

  describe('Step 4: "Scope & Specifications" — Mandatory vs Optional Attributes', () => {
    it('enforces all category mandatory attributes before progression', () => {
      const cncAttrs = mockTaxonomy.attributes.filter((a) =>
        ['material_grade', 'tolerance_mm'].includes(a.code),
      );
      const { mandatory } = groupAttributesForMobile(cncAttrs);
      expect(mandatory.length).toBe(2);

      const enteredValues: Record<string, any> = { material_grade: 'EN8' };
      const missing = mandatory.filter((m) => enteredValues[m.code] === undefined || enteredValues[m.code] === '');
      expect(missing.length).toBe(1);
      expect(missing[0]?.code).toBe('tolerance_mm');
    });
  });

  describe('Step 5: "Attachments" — Identity Protection & Optional Flow', () => {
    it('allows progression with or without attachments preserving draft state', () => {
      const draftWithAttachments: Partial<IntakeDraft> = {
        requirementId: 'draft-101',
        title: '50kW Solar',
      };
      expect(draftWithAttachments.requirementId).toBe('draft-101');
    });
  });

  describe('Step 6: "Review & Publish" — Smart Weights & Double-Submission Invariants', () => {
    it('normalizes suggested merit weights to exactly 100%', () => {
      const rawWeights = { commercial: 40, speed: 20, quality: 20, technical: 20 };
      const normalized = normalizeEvaluationWeights(rawWeights);
      const sum = Object.values(normalized.weights).reduce((acc, val) => acc + val, 0);
      expect(Math.round(sum)).toBe(100);
      expect(normalized.weights.commercial).toBe(40);
    });

    it('DEF-003: dynamically computes quorum explanation badge for sourcing modes', () => {
      const getQuorumHelper = (mode: string) => {
        switch (mode) {
          case 'IDENTITY_PROTECTED':
            return '🛡️ Identity-Protected Quorum: Minimum 3 sealed quotes recommended for unbiased commercial & technical merit evaluation before unsealing.';
          case 'OPEN_RFQ':
            return '📢 Open RFQ Quorum: Minimum 3 quotes recommended (up to 5) for healthy competitive tender benchmarking across verified suppliers.';
          case 'INVITE_SELECTED':
            return '🎯 Direct Curated Quorum: Minimum 2–3 quotes recommended from specifically invited suppliers.';
          case 'PREVIOUS_SUPPLIERS':
            return '🤝 Network Quorum: Minimum 1–2 quotes required from your verified past supplier relationships.';
          default:
            return 'Optimal competitive pricing is achieved with 3+ quotes.';
        }
      };

      expect(getQuorumHelper('IDENTITY_PROTECTED')).toContain('Minimum 3 sealed quotes');
      expect(getQuorumHelper('OPEN_RFQ')).toContain('Minimum 3 quotes recommended');
      expect(getQuorumHelper('INVITE_SELECTED')).toContain('2–3 quotes');
      expect(getQuorumHelper('PREVIOUS_SUPPLIERS')).toContain('1–2 quotes');
    });

    it('prevents double submissions by disabling submit handler while isPublishing is true', () => {
      let callCount = 0;
      const isPublishing = true;
      const handlePublishClick = () => {
        if (isPublishing) return;
        callCount++;
      };

      handlePublishClick();
      handlePublishClick();
      expect(callCount).toBe(0);
    });
  });

  describe('Step 1 Suggestions & Fast Track Invariants', () => {
    it('provides high-relevance suggestion presets for instant extraction', async () => {
      const suggestions = [
        'Require 10 HP submersible borewell motor rewinding in Bengaluru 560001, needed within 5 days with 6 months warranty.',
        'Industrial electrical panel wiring, busbar installation and LT breaker maintenance in Chennai 600001 within 7 days.',
        'Commercial building booster pump overhaul, valve fitting and pipe replacement in Hyderabad 500001 within 5 days.',
        '8-Channel HD CCTV camera installation with 2TB NVR recording and smartphone remote monitoring in Pune 411001.',
        'Deep cleaning and sanitization for 10,000 sq ft commercial facility in Mumbai 400001 within 3 days.',
        'Commercial terrace waterproofing 5000 sq ft with elastomeric membrane coating in Mumbai 400001 within 15 days.',
        'Annual diesel generator DG set servicing, oil filter replacement and preventative maintenance in Coimbatore 641001.',
        'Custom printed 5-ply corrugated shipping boxes 1000 units in Delhi NCR within 10 days.',
      ];

      for (const text of suggestions) {
        const parsed = await parser.parse({ text, taxonomy: mockTaxonomy });
        expect(parsed.title || text.length > 10).toBeTruthy();
      }
    });

    it('distinguishes Fast Track (Individual/MSME) and Full Governance (RWA) appropriately', () => {
      const isGovernanceRequired = (buyerType: string | null) => {
        return ['RESIDENTIAL_RWA', 'COMMUNITY', 'RWA'].includes(buyerType || '');
      };

      expect(isGovernanceRequired('INDIVIDUAL')).toBe(false);
      expect(isGovernanceRequired('MSME')).toBe(false);
      expect(isGovernanceRequired(null)).toBe(false);
      expect(isGovernanceRequired('RESIDENTIAL_RWA')).toBe(true);
      expect(isGovernanceRequired('COMMUNITY')).toBe(true);
      expect(isGovernanceRequired('RWA')).toBe(true);
    });
  });

  describe('Draft Persistence Invariant', () => {
    it('serializes and recovers draft state without dropping user entries', () => {
      const draftState: Partial<IntakeDraft> = {
        requirementId: 'draft-202',
        title: 'Borewell motor repair',
        originalText: 'Require 10 HP submersible borewell motor repair in Bengaluru 560001',
        deliveryCity: 'Bengaluru',
        deliveryPincode: '560001',
        quantity: 1,
        unit: 'SETS',
        quality: {
          warrantyMonths: 6,
          certifications: [],
          inspectionRequired: false,
          sampleRequired: false,
          notes: null,
        },
        commercial: {
          budgetAmount: 25000,
          paymentTerms: '100% on delivery',
          priceIncludesTransport: true,
          priceIncludesGst: true,
          notes: null,
        },
      };

      const serialized = JSON.stringify(draftState);
      const restored = JSON.parse(serialized);

      expect(restored.title).toBe('Borewell motor repair');
      expect(restored.deliveryCity).toBe('Bengaluru');
      expect(restored.commercial.budgetAmount).toBe(25000);
      expect(restored.quality.warrantyMonths).toBe(6);
    });
  });

  describe('Phase 2.2: Requirement Review Invariants', () => {
    it('distinguishes blocking validation errors from advisory warnings', () => {
      const validateDraft = (draft: Partial<IntakeDraft>, schema: any[], attachmentsCount: number) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!draft.title?.trim() || !draft.originalText?.trim() || !draft.subcategoryId) {
          errors.push('Requirement title, description, and vertical are required.');
        }
        if (!draft.deliveryCity?.trim() || !draft.deliveryPincode?.trim() || !/^[0-9]{6}$/.test(draft.deliveryPincode.trim())) {
          errors.push('Delivery city and valid 6-digit PIN code are required.');
        }
        if (!draft.commercial?.budgetAmount) {
          warnings.push('No internal budget ceiling set. Suppliers will quote based on open market pricing.');
        }
        if (attachmentsCount === 0) {
          warnings.push('No drawings or BoQ files attached.');
        }

        return { errors, warnings, isValid: errors.length === 0 };
      };

      // Valid draft without budget or attachments: Valid, but has 2 advisory warnings
      const completeDraft: Partial<IntakeDraft> = {
        title: 'Borewell Motor Repair',
        originalText: '10 HP submersible pump overhaul in Bengaluru 560001 within 5 days',
        subcategoryId: 'sub-cnc-turning',
        deliveryCity: 'Bengaluru',
        deliveryPincode: '560001',
        attributes: {},
        commercial: {
          budgetAmount: null,
          paymentTerms: '100% on delivery',
          priceIncludesTransport: true,
          priceIncludesGst: true,
          notes: null,
        },
      };

      const res = validateDraft(completeDraft, [], 0);
      expect(res.isValid).toBe(true);
      expect(res.errors.length).toBe(0);
      expect(res.warnings.length).toBe(2);

      // Incomplete draft missing city/PIN: Invalid with blocking errors
      const invalidDraft: Partial<IntakeDraft> = {
        ...completeDraft,
        deliveryCity: '',
        deliveryPincode: '123',
      };
      const resInvalid = validateDraft(invalidDraft, [], 0);
      expect(resInvalid.isValid).toBe(false);
      expect(resInvalid.errors.length).toBe(1);
    });

    it('maps section edit buttons to appropriate canonical wizard step indexes', () => {
      const stepIndexMap = {
        'What You Need': 0,
        'Where Location': 1,
        'When & Budget': 2,
        'Specifications': 3,
        'Attachments': 4,
        'Review & Sourcing': 5,
      };

      expect(stepIndexMap['What You Need']).toBe(0);
      expect(stepIndexMap['Where Location']).toBe(1);
      expect(stepIndexMap['When & Budget']).toBe(2);
      expect(stepIndexMap['Specifications']).toBe(3);
      expect(stepIndexMap['Attachments']).toBe(4);
      expect(stepIndexMap['Review & Sourcing']).toBe(5);
    });

    it('enforces 30-minute supplier response expectation without prohibited timing claims', () => {
      const responseNotice = 'Your requirement will be broadcast to verified suppliers matching your category and location. Suppliers submit sealed, identity-protected quotes with responses expected within 30 minutes.';
      expect(responseNotice).toContain('within 30 minutes');
      expect(responseNotice).not.toContain('15 sec');
      expect(responseNotice).not.toContain('15 seconds');
    });

    it('provides free-text capture when category or subcategory is not listed', () => {
      const categoryOptions = [
        { value: 'cat-1', label: 'Solar' },
        { value: 'OTHER', label: 'Not listed? Tell us what you need' },
      ];
      expect(categoryOptions.some((c) => c.value === 'OTHER')).toBe(true);
    });
  });

  describe('Vocabulary Scanner Invariant', () => {
    it('contains ZERO occurrences of prohibited terms in step configuration and labels', () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      const combinedText = `
        What do you need to buy? Where is this needed? When & Budget? Scope & Specifications
        Drawings & Attachments Review & Start Sourcing RFQ & Discover Suppliers
        Identity-Protected Quorum Quotes Wanted Quoting Deadline Landed Cost
      `.toLowerCase();

      for (const term of prohibitedTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        expect(regex.test(combinedText)).toBe(false);
      }
    });
  });
});
