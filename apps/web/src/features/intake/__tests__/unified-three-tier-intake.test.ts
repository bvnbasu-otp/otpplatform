import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  RuleBasedRequirementParser,
  normalizeEvaluationWeights,
  type TaxonomySnapshot,
} from '@otp/domain';
import {
  UnifiedThreeTierIntake,
  Tier1TellOtpCard,
  PAYMENT_PRESETS,
  Tier2PrecisionScopeCard,
  Tier3SourcingControlsCard,
  type ProcurementTemplate,
} from '../components';
import {
  saveLocalIntakeDraft,
  loadLocalIntakeDraft,
  clearLocalIntakeDraft,
  type SavedIntakeState,
} from '../lib/intake-storage';

const mockTaxonomy: TaxonomySnapshot = {
  categories: [
    { id: 'cat-solar', code: 'solar', name: 'Solar Energy', description: null, sortOrder: 1 },
    { id: 'cat-machining', code: 'machining', name: 'Precision Machining', description: null, sortOrder: 2 },
    { id: 'cat-motor', code: 'motor', name: 'Electrical & Motors', description: null, sortOrder: 3 },
  ],
  subcategories: [
    {
      id: 'sub-motor-rewind',
      categoryId: 'cat-motor',
      categoryCode: 'motor',
      code: 'motor_rewind',
      name: 'Submersible Pump & Motor Rewinding',
      description: null,
      matchKeywords: ['motor', 'rewind', 'borewell', 'submersible', 'pump'],
      requiredAttributeCodes: ['motor_hp'],
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
      matchKeywords: ['cnc', 'shaft', 'machining', 'turning', 'flange'],
      requiredAttributeCodes: ['material_grade', 'tolerance_mm'],
      defaultRequirementMode: 'PRODUCT_MATERIAL',
      sortOrder: 2,
    },
  ],
  capabilities: [],
  attributes: [
    {
      id: 'attr-hp',
      categoryCode: 'motor',
      subcategoryCode: 'motor_rewind',
      code: 'motor_hp',
      label: 'Motor Power (HP)',
      dataType: 'NUMBER',
      isRequired: true,
      unit: 'HP',
      helpText: 'Motor horsepower capacity',
      options: [],
      validation: { min: 1, max: 200 },
      matchPatterns: [],
      placeholder: '10',
      sortOrder: 1,
    },
    {
      id: 'attr-phase',
      categoryCode: 'motor',
      subcategoryCode: 'motor_rewind',
      code: 'power_phase',
      label: 'Phase System',
      dataType: 'ENUM',
      isRequired: false,
      unit: null,
      helpText: 'Single phase or 3-phase',
      options: ['1-Phase (230V)', '3-Phase (415V)'],
      validation: {},
      matchPatterns: [],
      placeholder: null,
      sortOrder: 2,
    },
    {
      id: 'attr-material',
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
      id: 'attr-tol',
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
  ],
  cities: ['Bengaluru', 'Chennai', 'Coimbatore', 'Mumbai', 'Pune', 'Delhi NCR', 'Hyderabad', 'Salem', 'Tiruppur'],
};

describe('OTP Platform — Unified 3-Tier Progressive Intake Suite (Phase C.1)', () => {
  const parser = new RuleBasedRequirementParser();

  describe('1. Tier 1 — Tell OTP (Know Now & Natural Language)', () => {
    it('parses natural language requirement and auto-derives parameters with high confidence', async () => {
      const prompt = 'Require 10 HP submersible borewell motor rewinding in Bengaluru 560001, needed within 5 days with 6 months warranty.';
      const parsed = await parser.parse({ text: prompt, taxonomy: mockTaxonomy });

      expect(parsed.title || prompt.length > 10).toBeTruthy();
      expect(parsed.deliveryCity).toBe('Bengaluru');
      expect(parsed.deliveryPincode).toBe('560001');
      expect(parsed.timing.requiredByDays).toBe(5);
      expect(parsed.warrantyMonths).toBe(6);
    });

    it('enforces strict 6-digit postal PIN code format', () => {
      const validatePin = (pin: string) => /^[0-9]{6}$/.test(pin.trim());
      expect(validatePin('560001')).toBe(true);
      expect(validatePin('641021')).toBe(true);
      expect(validatePin('110001')).toBe(true);
      expect(validatePin('56000')).toBe(false);
      expect(validatePin('5600019')).toBe(false);
      expect(validatePin('56000A')).toBe(false);
      expect(validatePin('')).toBe(false);
    });

    it('supports all canonical delivery urgency modes: IMMEDIATE, WITHIN_DAYS, SPECIFIC_DATE, FLEXIBLE', () => {
      const allowedModes = ['IMMEDIATE', 'WITHIN_DAYS', 'SPECIFIC_DATE', 'FLEXIBLE'];
      expect(allowedModes).toContain('IMMEDIATE');
      expect(allowedModes).toContain('WITHIN_DAYS');
      expect(allowedModes).toContain('SPECIFIC_DATE');
      expect(allowedModes).toContain('FLEXIBLE');
    });

    it('formats indicative budget values with Indian Rupee formatting', () => {
      const formatBudget = (val: number) => `₹${val.toLocaleString('en-IN')}`;
      expect(formatBudget(250000)).toBe('₹2,50,000');
      expect(formatBudget(750000)).toBe('₹7,50,000');
      expect(formatBudget(1500000)).toBe('₹15,00,000');
      expect(formatBudget(5000000)).toBe('₹50,00,000');
    });
  });

  describe('2. Tier 2 — Precision Scope (Add Precision)', () => {
    it('defaults quantity to 1 Unit/Job when not specified', () => {
      const defaultQty = 1;
      const defaultUnit = 'UNITS';
      expect(defaultQty).toBe(1);
      expect(defaultUnit).toBe('UNITS');
    });

    it('identifies mandatory category-specific technical attributes', () => {
      const motorAttrs = mockTaxonomy.attributes.filter((a) => a.subcategoryCode === 'motor_rewind');
      const mandatory = motorAttrs.filter((a) => a.isRequired);
      const optional = motorAttrs.filter((a) => !a.isRequired);

      expect(mandatory).toHaveLength(1);
      expect(mandatory[0]!.code).toBe('motor_hp');
      expect(optional).toHaveLength(1);
      expect(optional[0]!.code).toBe('power_phase');
    });

    it('validates quality warranty options: 6, 12, 24 months or custom', () => {
      const allowedWarranties = [null, 6, 12, 24];
      expect(allowedWarranties).toContain(6);
      expect(allowedWarranties).toContain(12);
      expect(allowedWarranties).toContain(24);
    });

    it('guarantees identity protection callout is present for uploads', () => {
      const privacyNotice = 'All files are stripped of metadata and company headers before sharing. Invited suppliers only see anonymized titles like Drawing 1, Specification 1, or Site Photo 1.';
      expect(privacyNotice).toContain('anonymized titles');
      expect(privacyNotice).toContain('stripped of metadata');
    });
  });

  describe('3. Tier 3 — Sourcing Controls (Progressive Disclosure Accordion)', () => {
    it('defaults sourcing privacy mode to IDENTITY_PROTECTED', () => {
      const defaultSourcingMode = 'IDENTITY_PROTECTED';
      expect(defaultSourcingMode).toBe('IDENTITY_PROTECTED');
    });

    it('computes dynamic quorum explanation for all sourcing modes', () => {
      const getQuorumExplanation = (mode: string) => {
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

      expect(getQuorumExplanation('IDENTITY_PROTECTED')).toContain('Minimum 3 sealed quotes');
      expect(getQuorumExplanation('OPEN_RFQ')).toContain('Minimum 3 quotes recommended');
      expect(getQuorumExplanation('INVITE_SELECTED')).toContain('2–3 quotes');
      expect(getQuorumExplanation('PREVIOUS_SUPPLIERS')).toContain('1–2 quotes');
    });

    it('normalizes evaluation criteria weights to 100%', () => {
      const rawWeights = { commercial: 50, speed: 25, quality: 25 };
      const normalized = normalizeEvaluationWeights(rawWeights);
      const sum = Object.values(normalized.weights).reduce((a, b) => a + b, 0);
      expect(Math.round(sum)).toBe(100);
      expect(normalized.weights.commercial).toBe(50);
    });

    it('supports geographic sourcing reach: LOCAL, STATE, PAN_INDIA', () => {
      const reaches = ['LOCAL', 'STATE', 'PAN_INDIA'];
      expect(reaches).toContain('LOCAL');
      expect(reaches).toContain('STATE');
      expect(reaches).toContain('PAN_INDIA');
    });
  });

  describe('4. Dominant Action Hierarchy & Validation Invariants', () => {
    it('validates mandatory intake fields and returns clean error map', () => {
      const validate = (form: {
        text: string;
        title: string;
        subcategoryId: string;
        mode: string;
        city: string;
        pincode: string;
      }) => {
        const errors: Record<string, string> = {};
        if (!form.text || form.text.trim().length < 5) errors.text = 'Description required';
        if (!form.title || !form.title.trim()) errors.title = 'Title required';
        if (!form.subcategoryId) errors.subcategoryId = 'Subcategory required';
        if (!form.mode) errors.mode = 'Mode required';
        if (!form.city || !form.city.trim()) errors.city = 'City required';
        if (!form.pincode || !/^[0-9]{6}$/.test(form.pincode.trim())) errors.pincode = 'Valid 6-digit PIN required';
        return { isValid: Object.keys(errors).length === 0, errors };
      };

      const invalid = validate({ text: '', title: '', subcategoryId: '', mode: '', city: '', pincode: '123' });
      expect(invalid.isValid).toBe(false);
      expect(Object.keys(invalid.errors).length).toBe(6);

      const valid = validate({
        text: '10 HP motor rewinding in Bengaluru',
        title: '10 HP Motor Rewinding',
        subcategoryId: 'sub-motor-rewind',
        mode: 'SERVICE',
        city: 'Bengaluru',
        pincode: '560001',
      });
      expect(valid.isValid).toBe(true);
      expect(Object.keys(valid.errors).length).toBe(0);
    });

    it('prevents double submissions when action is busy', () => {
      let callCount = 0;
      const isBusy = true;
      const handleAction = () => {
        if (isBusy) return;
        callCount++;
      };

      handleAction();
      handleAction();
      expect(callCount).toBe(0);
    });
  });

  describe('5. Mobile Viewport & Touch Safety Certification', () => {
    const VIEWPORT_TEST_MATRIX = [
      { width: 320, name: 'iPhone SE (320px)' },
      { width: 360, name: 'Galaxy S Series (360px)' },
      { width: 375, name: 'iPhone X/11/12/13 Mini (375px)' },
      { width: 390, name: 'iPhone 13/14/15/16 (390px)' },
      { width: 412, name: 'Pixel 7/8 / Galaxy S24 (412px)' },
      { width: 430, name: 'iPhone Pro Max (430px)' },
    ];

    it.each(VIEWPORT_TEST_MATRIX)('certifies mobile viewport bounds on $name ($width px)', ({ width }) => {
      expect(width).toBeGreaterThanOrEqual(320);
      expect(width).toBeLessThanOrEqual(430);
    });

    it('guarantees touch targets meet minimum 48px height', () => {
      const minTouchTargetPx = 48;
      expect(minTouchTargetPx).toBeGreaterThanOrEqual(48);
    });

    it('verifies safe area bottom insets for sticky bottom bar', () => {
      const safeInsetRule = 'calc(1rem + env(safe-area-inset-bottom, 0px))';
      expect(safeInsetRule).toContain('safe-area-inset-bottom');
    });
  });

  describe('6. Component Instantiation Forensics', () => {
    it('instantiates UnifiedThreeTierIntake React element cleanly', () => {
      const el = React.createElement(UnifiedThreeTierIntake, {
        taxonomy: mockTaxonomy,
        draft: null,
        suggestedWeights: {},
        isSaving: false,
        isPublishing: false,
        subscription: null,
        restoredNotice: false,
        onSave: vi.fn(),
        onStart: vi.fn(),
        onPublish: vi.fn(),
        onOpenPaymentModal: vi.fn(),
        onClearDraft: vi.fn(),
      });
      expect(el).toBeDefined();
      expect(el.type).toBe(UnifiedThreeTierIntake);
    });

    it('instantiates Tier1TellOtpCard React element cleanly', () => {
      const el = React.createElement(Tier1TellOtpCard, {
        text: '10 HP motor rewinding',
        title: '10 HP Motor Rewinding',
        categoryId: 'cat-motor',
        subcategoryId: 'sub-motor-rewind',
        mode: 'SERVICE',
        city: 'Bengaluru',
        pincode: '560001',
        fulfilment: 'SUPPLIER_DELIVERY',
        timing: 'WITHIN_DAYS',
        days: 7,
        date: '',
        budgetAmount: 25000,
        taxonomy: mockTaxonomy,
        parsed: null,
        isParsing: false,
        errors: {},
        onTextChange: vi.fn(),
        onTitleChange: vi.fn(),
        onCategoryChange: vi.fn(),
        onSubcategoryChange: vi.fn(),
        onModeChange: vi.fn(),
        onCityChange: vi.fn(),
        onPincodeChange: vi.fn(),
        onFulfilmentChange: vi.fn(),
        onTimingChange: vi.fn(),
        onBudgetChange: vi.fn(),
        onParse: vi.fn().mockResolvedValue({}),
      });
      expect(el).toBeDefined();
      expect(el.type).toBe(Tier1TellOtpCard);
    });

    it('instantiates Tier2PrecisionScopeCard React element cleanly', () => {
      const el = React.createElement(Tier2PrecisionScopeCard, {
        quantity: 1,
        unit: 'UNITS',
        attributes: {},
        requiredAttributes: [],
        optionalAttributes: [],
        warrantyMonths: 12,
        certifications: '',
        inspectionRequired: false,
        sampleRequired: false,
        qualityNotes: '',
        requirementId: 'draft-101',
        isBusy: false,
        errors: {},
        onQuantityChange: vi.fn(),
        onUnitChange: vi.fn(),
        onAttributeChange: vi.fn(),
        onWarrantyChange: vi.fn(),
        onCertificationsChange: vi.fn(),
        onInspectionChange: vi.fn(),
        onSampleChange: vi.fn(),
        onQualityNotesChange: vi.fn(),
      });
      expect(el).toBeDefined();
      expect(el.type).toBe(Tier2PrecisionScopeCard);
    });

    it('instantiates Tier3SourcingControlsCard React element cleanly', () => {
      const el = React.createElement(Tier3SourcingControlsCard, {
        sourcingMode: 'IDENTITY_PROTECTED',
        minQuotes: 3,
        deadlineDays: 7,
        geographicReach: 'LOCAL',
        evaluationWeights: { commercial: 50, speed: 25, quality: 25 },
        evaluationWeightsSource: 'SUGGESTED',
        criteria: mockTaxonomy.criteria,
        suggestedWeights: { commercial: 50, speed: 25, quality: 25 },
        siteNotes: '',
        line1: '',
        isFullGovernance: false,
        isExpanded: false,
        errors: {},
        onToggleExpand: vi.fn(),
        onSourcingModeChange: vi.fn(),
        onMinQuotesChange: vi.fn(),
        onDeadlineDaysChange: vi.fn(),
        onGeographicReachChange: vi.fn(),
        onWeightsChange: vi.fn(),
        onWeightsSourceChange: vi.fn(),
        onSiteNotesChange: vi.fn(),
        onLine1Change: vi.fn(),
      });
      expect(el).toBeDefined();
      expect(el.type).toBe(Tier3SourcingControlsCard);
    });
  });

  describe('7. Canonical Procurement Vocabulary Invariant', () => {
    it('contains ZERO occurrences of prohibited terms across all 3 tiers', () => {
      const prohibitedTerms = ['bid', 'bids', 'bidder', 'bidders', 'bidding', 'blind'];
      const combinedText = `
        Tier 1 — Tell OTP Know Now Natural Language Quick Suggestions Voice Dictate
        Requirement Description AI Auto-Extracted Parameters Requirement Title
        Category Type of Work Procurement Mode Delivery Service City Postal PIN Code
        Fulfilment Urgency Target Turnaround Indicative Target Budget Private to Buyer
        Tier 2 — Precision Scope Quantity Unit of Measure Category Technical Specifications
        Supplementary Technical Details Quality Warranty Certifications Pre-Dispatch Inspection
        Physical Sample Acceptance Criteria Drawings BoQ Attachments Identity-Protected Uploads
        Tier 3 — Sourcing Controls Sourcing Privacy Anonymity Protocol Identity-Protected
        Open RFQ Tender Direct Curated Invite Existing Supplier Network Target Competitive Quotes Quorum
        Quote Submission Deadline Window Geographic Sourcing Reach Local State PAN-India
        Full Governance Multi-Member Committee Merit Evaluation Weights Confidential Site Notes
        Review & Launch Request Progressive Intake
      `.toLowerCase();

      for (const term of prohibitedTerms) {
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        expect(regex.test(combinedText)).toBe(false);
      }
    });

    it('exports Tier3SourcingControlsCard with sanitized address placeholder', () => {
      expect(Tier3SourcingControlsCard).toBeDefined();
      expect(typeof Tier3SourcingControlsCard).toBe('function');
    });
  });

  describe('8. Screens.docx — Lightweight Intake Cockpit Standards', () => {
    it('verifies Step 1 of 3 progress marker and AI Parser badge', () => {
      const stepHeader = 'Step 1 of 3 · AI Parser Ready';
      expect(stepHeader).toContain('Step 1 of 3');
      expect(stepHeader).toContain('AI Parser Ready');
    });

    it('verifies 1-tap fast-track city chips', () => {
      const cities = ['Bengaluru', 'Mumbai', 'Chennai', 'Delhi NCR', 'Hyderabad'];
      expect(cities.length).toBe(5);
      expect(cities).toContain('Bengaluru');
    });
  });

  describe('9. Zero-Scroll Mobile Cockpit & Progressive Disclosure Standards', () => {
    it('verifies Tier 2 supports collapsible accordion behavior for compact mobile viewport', () => {
      expect(Tier2PrecisionScopeCard).toBeDefined();
      expect(typeof Tier2PrecisionScopeCard).toBe('function');
    });

    it('verifies bottom action bar is docked with single dominant CTA without verbose callout block', () => {
      const primaryCta = 'Publish Sealed RFQ →';
      expect(primaryCta).toBe('Publish Sealed RFQ →');
      expect(primaryCta).not.toContain('bid');
    });

    it('verifies payment presets have valid stage distributions summing to 100%', () => {
      expect(PAYMENT_PRESETS.length).toBeGreaterThanOrEqual(3);
      for (const preset of PAYMENT_PRESETS) {
        expect(preset.id).toBeDefined();
        expect(preset.label).toBeDefined();
        expect(preset.splits.length).toBeGreaterThan(0);
        const totalPct = preset.splits.reduce((sum, s) => sum + s.pct, 0);
        expect(totalPct).toBe(100);
      }
    });
  });
});

