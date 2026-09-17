import type { SupplyType } from './place-of-supply';

export type HsnSacType = 'HSN' | 'SAC';

export interface HsnSacEntry {
  code: string;
  type: HsnSacType;
  description: string;
  defaultGstRate: number;
  category: string;
  isService: boolean;
}

/**
 * Standard Regex for Indian HSN (Goods) and SAC (Services):
 * - HSN: 4, 6, or 8 digits
 * - SAC: 6 digits starting with '99'
 */
export const HSN_REGEX = /^(\d{4}|\d{6}|\d{8})$/;
export const SAC_REGEX = /^99\d{4}$/;
export const HSN_OR_SAC_REGEX = /^(\d{4}|\d{6}|\d{8}|99\d{4})$/;

export interface HsnSacValidationResult {
  valid: boolean;
  type?: HsnSacType;
  formattedCode?: string;
  digitCount?: number;
  error?: string;
  warning?: string;
}

/**
 * Curated Catalog of Standard Procurement HSN / SAC Codes for OTP Verticals
 */
export const STANDARD_PROCUREMENT_HSN_SAC_CATALOG: HsnSacEntry[] = [
  // Works Contracts & Construction Services (SAC)
  {
    code: '995411',
    type: 'SAC',
    description: 'General construction services of residential buildings',
    defaultGstRate: 18.0,
    category: 'Construction & Civil Works',
    isService: true,
  },
  {
    code: '995421',
    type: 'SAC',
    description: 'General construction services of other civil engineering works',
    defaultGstRate: 18.0,
    category: 'Civil Infrastructure',
    isService: true,
  },
  {
    code: '995461',
    type: 'SAC',
    description: 'Electrical installation services',
    defaultGstRate: 18.0,
    category: 'Electrical & Automation',
    isService: true,
  },
  {
    code: '995462',
    type: 'SAC',
    description: 'Water plumbing and drain laying services',
    defaultGstRate: 18.0,
    category: 'Plumbing & Water Systems',
    isService: true,
  },
  {
    code: '995473',
    type: 'SAC',
    description: 'Painting and waterproofing services',
    defaultGstRate: 18.0,
    category: 'Painting & Waterproofing',
    isService: true,
  },

  // Maintenance & Repair Services (SAC)
  {
    code: '998717',
    type: 'SAC',
    description: 'Maintenance and repair services of commercial & residential elevators/lifts',
    defaultGstRate: 18.0,
    category: 'Elevator & Lift Maintenance',
    isService: true,
  },
  {
    code: '998719',
    type: 'SAC',
    description: 'Maintenance and repair services of other machinery and equipment (motors, pumps, transformers)',
    defaultGstRate: 18.0,
    category: 'Motor & Pump Maintenance',
    isService: true,
  },
  {
    code: '998525',
    type: 'SAC',
    description: 'Security and surveillance monitoring services',
    defaultGstRate: 18.0,
    category: 'Security & Surveillance',
    isService: true,
  },
  {
    code: '998313',
    type: 'SAC',
    description: 'Information technology consulting and network support services',
    defaultGstRate: 18.0,
    category: 'IT & Software Infrastructure',
    isService: true,
  },

  // Goods / Products (HSN)
  {
    code: '3208',
    type: 'HSN',
    description: 'Paints and varnishes based on synthetic polymers (solvent medium)',
    defaultGstRate: 18.0,
    category: 'Painting & Waterproofing',
    isService: false,
  },
  {
    code: '3209',
    type: 'HSN',
    description: 'Paints and varnishes based on acrylic polymers (aqueous medium / emulsion)',
    defaultGstRate: 18.0,
    category: 'Painting & Waterproofing',
    isService: false,
  },
  {
    code: '8413',
    type: 'HSN',
    description: 'Pumps for liquids; whether or not fitted with a measuring device',
    defaultGstRate: 18.0,
    category: 'Pumps & Motors',
    isService: false,
  },
  {
    code: '8501',
    type: 'HSN',
    description: 'Electric motors and generators (excluding generating sets)',
    defaultGstRate: 18.0,
    category: 'Electric Motors',
    isService: false,
  },
  {
    code: '8537',
    type: 'HSN',
    description: 'Boards, panels, consoles, desks, cabinets and other bases for electric control or distribution of electricity',
    defaultGstRate: 18.0,
    category: 'Electrical Panels',
    isService: false,
  },
  {
    code: '852580',
    type: 'HSN',
    description: 'CCTV Cameras, digital video recorders and surveillance hardware',
    defaultGstRate: 18.0,
    category: 'Security & Surveillance',
    isService: false,
  },
  {
    code: '842121',
    type: 'HSN',
    description: 'Water filtering or purifying machinery and apparatus for domestic / commercial use',
    defaultGstRate: 18.0,
    category: 'Water Purification & Filters',
    isService: false,
  },
  {
    code: '854140',
    type: 'HSN',
    description: 'Solar photovoltaic cells, modules and panels',
    defaultGstRate: 12.0,
    category: 'Solar Energy & Photovoltaics',
    isService: false,
  },
  {
    code: '9403',
    type: 'HSN',
    description: 'Office and institutional furniture, modular workstations and seating systems',
    defaultGstRate: 18.0,
    category: 'Furniture & Workstations',
    isService: false,
  },
];

/**
 * Validates an HSN or SAC code based on Indian GST format rules.
 */
export function validateHsnSacCode(
  rawCode: string | null | undefined,
  supplyType?: SupplyType,
): HsnSacValidationResult {
  if (!rawCode) {
    return {
      valid: false,
      error: 'HSN/SAC code is required for statutory GST invoice compliance',
    };
  }

  const clean = rawCode.toString().trim().replace(/[\s.-]/g, '');

  if (!/^\d+$/.test(clean)) {
    return {
      valid: false,
      error: `HSN/SAC code must contain only numeric digits (received '${rawCode}')`,
    };
  }

  const len = clean.length;
  const isSac = clean.startsWith('99');

  if (isSac) {
    if (len !== 6) {
      return {
        valid: false,
        type: 'SAC',
        digitCount: len,
        error: `Services Accounting Code (SAC) must be exactly 6 digits starting with 99 (received ${len} digits: '${clean}')`,
      };
    }

    if (supplyType === 'PRODUCT_GOODS') {
      return {
        valid: true,
        type: 'SAC',
        formattedCode: clean,
        digitCount: len,
        warning: 'SAC code specified for goods supply type. Ensure line item represents an installation or professional service.',
      };
    }

    return {
      valid: true,
      type: 'SAC',
      formattedCode: clean,
      digitCount: len,
    };
  }

  // HSN Goods: 4, 6, or 8 digits
  if (len !== 4 && len !== 6 && len !== 8) {
    return {
      valid: false,
      type: 'HSN',
      digitCount: len,
      error: `Harmonized System Nomenclature (HSN) code must be 4, 6, or 8 digits (received ${len} digits: '${clean}')`,
    };
  }

  if (supplyType === 'PROFESSIONAL_SERVICE' || supplyType === 'WORKS_CONTRACT_PROJECT') {
    return {
      valid: true,
      type: 'HSN',
      formattedCode: clean,
      digitCount: len,
      warning: 'HSN (Goods) code specified for service / works contract supply type. Ensure line item represents material supply.',
    };
  }

  return {
    valid: true,
    type: 'HSN',
    formattedCode: clean,
    digitCount: len,
  };
}

/**
 * Lookup catalog entry by code or category keyword
 */
export function lookupHsnSacEntry(codeOrKeyword: string): HsnSacEntry | undefined {
  const clean = codeOrKeyword.trim().toLowerCase();
  return STANDARD_PROCUREMENT_HSN_SAC_CATALOG.find(
    (entry) => entry.code.toLowerCase() === clean || entry.category.toLowerCase().includes(clean),
  );
}
