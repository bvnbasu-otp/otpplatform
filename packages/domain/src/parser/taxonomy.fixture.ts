/**
 * A slice of the real taxonomy, for tests.
 *
 * Every keyword, pattern, option and required-attribute list here is copied
 * verbatim from supabase/migrations/00019_taxonomy_data.sql. That is the point:
 * these tests fail when the reference data stops supporting the four cities the
 * product is being demonstrated in, not merely when this file's own invented
 * data changes. The integration suite proves the same rows are in the database;
 * this proves the parser does the right thing with them.
 */
import { RequirementMode } from '../enums/requirement-mode';
import type {
  AttributeDef,
  CategoryDef,
  SubcategoryDef,
  TaxonomySnapshot,
} from '../taxonomy/types';

let sequence = 0;
const id = () => `fixture-${(sequence += 1)}`;

function category(code: string, name: string, sortOrder: number): CategoryDef {
  return { id: id(), code, name, sortOrder };
}

function subcategory(
  categoryCode: string,
  code: string,
  name: string,
  matchKeywords: string[],
  defaultRequirementMode: RequirementMode,
  requiredAttributeCodes: string[] = [],
): SubcategoryDef {
  return {
    id: id(),
    categoryId: `${categoryCode}-id`,
    categoryCode,
    code,
    name,
    matchKeywords,
    requiredAttributeCodes,
    defaultRequirementMode,
    sortOrder: 0,
  };
}

interface AttributeOverrides {
  unit?: string | null;
  options?: string[];
  patterns?: string[];
  sortOrder?: number;
}

function attribute(
  scope: { category?: string; subcategory?: string },
  code: string,
  label: string,
  dataType: AttributeDef['dataType'],
  overrides: AttributeOverrides = {},
): AttributeDef {
  return {
    id: id(),
    categoryCode: scope.category ?? null,
    subcategoryCode: scope.subcategory ?? null,
    code,
    label,
    dataType,
    unit: overrides.unit ?? null,
    isRequired: false,
    options: overrides.options ?? [],
    validation: {},
    matchPatterns: overrides.patterns ?? [],
    helpText: null,
    placeholder: null,
    sortOrder: overrides.sortOrder ?? 0,
  };
}

const categories: CategoryDef[] = [
  category('machinery_engineering', 'Machinery & Engineering', 3),
  category('textile_apparel', 'Textile & Apparel', 6),
  category('agriculture_commodities', 'Agriculture & Commodities', 7),
  category('water_environmental', 'Water & Environmental Solutions', 11),
  category('professional_skilled_services', 'Professional & Skilled Services', 14),
];

const subcategories: SubcategoryDef[] = [
  subcategory(
    'water_environmental',
    'motor_rewinding',
    'Motor rewinding & repair',
    [
      'motor rewinding',
      'rewinding',
      'rewind the motor',
      'motor winding',
      'winding has burnt',
      'winding burnt',
      'burnt winding',
      'winding failure',
      'motor repair',
      'motor burnt',
      'burnt motor',
      'motor not starting',
      'winding',
    ],
    RequirementMode.REPAIR_MAINTENANCE,
    ['motor_hp'],
  ),
  subcategory(
    'water_environmental',
    'borewell_drilling',
    'Borewell drilling',
    [
      'borewell drilling',
      'bore well drilling',
      'bore drilling',
      'new borewell',
      'new bore well',
      'sink a borewell',
      'drilling rig',
      'drill a bore',
    ],
    RequirementMode.SERVICE,
    ['depth_ft'],
  ),
  subcategory(
    'water_environmental',
    'borewell_motor_pump',
    'Borewell motor & pump supply',
    [
      'submersible pump',
      'new pump',
      'pump set',
      'monoblock',
      'openwell',
      'motor purchase',
      'buy motor',
      'new motor',
    ],
    RequirementMode.PRODUCT_MATERIAL,
    ['motor_hp'],
  ),
  subcategory(
    'machinery_engineering',
    'cnc_machining',
    'CNC machining job work',
    [
      'cnc',
      'cnc machining',
      'cnc turning',
      'machining job work',
      'precision machining',
    ],
    RequirementMode.JOB_WORK,
    ['material', 'tolerance_mm'],
  ),
  subcategory(
    'textile_apparel',
    'cotton_yarn',
    'Cotton yarn',
    ['cotton yarn', 'combed', 'carded', 'yarn count', 'ring spun', 'hosiery yarn'],
    RequirementMode.PRODUCT_MATERIAL,
    ['yarn_count'],
  ),
  subcategory(
    'agriculture_commodities',
    'turmeric',
    'Turmeric',
    ['turmeric', 'manjal', 'curcumin', 'turmeric finger', 'erode turmeric'],
    RequirementMode.COMMODITY_TRADING,
    ['quality_grade'],
  ),
  // The distractor that made this parser hard: people describe the tradesman
  // who diagnosed the fault, and a bare "electrician" used to hijack the match.
  subcategory(
    'professional_skilled_services',
    'electrician_technician',
    'Electrician & technician',
    [
      'need an electrician',
      'need electrician',
      'electrician required',
      'send an electrician',
      'electrician visit',
      'hire an electrician',
      'wireman',
      'electrical repair visit',
      'electrical technician',
    ],
    RequirementMode.SERVICE,
  ),
];

const attributes: AttributeDef[] = [
  // Water & Environmental
  attribute({ category: 'water_environmental' }, 'motor_hp', 'Motor rating', 'NUMBER', {
    unit: 'HP',
    patterns: [String.raw`(\d+(?:\.\d+)?)\s*(?:hp|h\.p\.?|horse\s*power)`],
    sortOrder: 1,
  }),
  attribute({ category: 'water_environmental' }, 'pump_type', 'Pump / motor type', 'ENUM', {
    options: ['Submersible', 'Openwell', 'Monoblock', 'Jet pump', 'Centrifugal', 'Not sure'],
    patterns: [
      String.raw`\b(submersible|openwell|open well|monoblock|jet pump|centrifugal)\b`,
    ],
    sortOrder: 2,
  }),
  attribute({ category: 'water_environmental' }, 'phase', 'Phase', 'ENUM', {
    options: ['Single phase', 'Three phase', 'Not sure'],
    patterns: [String.raw`\b(single\s*phase|three\s*phase|3\s*phase|1\s*phase)\b`],
    sortOrder: 3,
  }),
  attribute({ category: 'water_environmental' }, 'depth_ft', 'Depth', 'NUMBER', {
    unit: 'FT',
    patterns: [
      String.raw`(\d+)\s*(?:ft|feet|foot)\s*(?:deep|depth)?`,
      String.raw`depth\s*(?:of)?\s*(\d+)`,
    ],
    sortOrder: 4,
  }),
  attribute({ subcategory: 'motor_rewinding' }, 'winding_type', 'Winding type', 'ENUM', {
    options: ['Copper', 'Aluminium', 'As original'],
    patterns: [String.raw`\b(copper|aluminium|aluminum)\s*(?:winding|wire)?\b`],
    sortOrder: 20,
  }),
  attribute({ subcategory: 'motor_rewinding' }, 'failure_symptom', 'What happened', 'ENUM', {
    options: [
      'Burnt / smoking',
      'Not starting',
      'Tripping repeatedly',
      'Low output',
      'Water ingress',
      'Unknown',
    ],
    patterns: [String.raw`\b(burnt|burn|smoking|not starting|tripping|water)\b`],
    sortOrder: 21,
  }),
  attribute({ subcategory: 'motor_rewinding' }, 'pickup_required', 'Pickup and drop required', 'BOOLEAN', {
    patterns: [String.raw`\b(pickup|pick up|collect|transport included)\b`],
    sortOrder: 22,
  }),

  // Machinery & Engineering
  attribute({ category: 'machinery_engineering' }, 'machine_type', 'Machine / equipment type', 'TEXT', {
    sortOrder: 1,
  }),
  attribute({ category: 'machinery_engineering' }, 'motor_hp', 'Motor rating', 'NUMBER', {
    unit: 'HP',
    patterns: [String.raw`(\d+(?:\.\d+)?)\s*(?:hp|h\.p\.?|horse\s*power)`],
    sortOrder: 3,
  }),
  attribute({ category: 'machinery_engineering' }, 'material', 'Material', 'TEXT', {
    patterns: [
      String.raw`\b(?:in|of|material)\s+(en\s?\d+|ss\s?\d+|ms|mild steel|cast iron|aluminium|brass|en8|en19|d2|hchcr)\b`,
    ],
    sortOrder: 4,
  }),
  attribute({ category: 'machinery_engineering' }, 'tolerance_mm', 'Tolerance', 'NUMBER', {
    unit: 'MM',
    patterns: [
      String.raw`(?:±|\+/-|\+-|tolerance\s*(?:of)?\s*)\s*(\d+(?:\.\d+)?)\s*(?:mm|micron)?`,
    ],
    sortOrder: 5,
  }),
  attribute({ category: 'machinery_engineering' }, 'drawing_available', 'Drawing available', 'BOOLEAN', {
    patterns: [String.raw`\b(drawing|as per drawing|drawing attached|gd&t)\b`],
    sortOrder: 6,
  }),
  attribute({ category: 'machinery_engineering' }, 'batch_size', 'Batch size', 'NUMBER', {
    unit: 'PCS',
    patterns: [String.raw`(\d+)\s*(?:nos|pcs|pieces|units)\b`],
    sortOrder: 7,
  }),
  attribute({ subcategory: 'cnc_machining' }, 'operations', 'Operations required', 'MULTI_ENUM', {
    options: [
      'Turning',
      'Milling',
      'Drilling',
      'Boring',
      'Threading',
      'Grinding',
      'Tapping',
      'Deburring',
    ],
    patterns: [
      String.raw`\b(turning|milling|drilling|boring|threading|grinding|tapping)\b`,
    ],
    sortOrder: 20,
  }),
  attribute({ subcategory: 'cnc_machining' }, 'inspection_report', 'Inspection report required', 'BOOLEAN', {
    patterns: [String.raw`\b(inspection report|cmm report|dimension report)\b`],
    sortOrder: 22,
  }),

  // Textile & Apparel
  attribute({ category: 'textile_apparel' }, 'yarn_count', 'Count', 'TEXT', {
    unit: 'NE',
    patterns: [
      String.raw`\b(\d+)\s*(?:s|'s)\s*(?:count|combed|carded)?\b`,
      String.raw`count\s*(\d+)`,
    ],
    sortOrder: 2,
  }),
  attribute({ subcategory: 'cotton_yarn' }, 'package_type', 'Package', 'ENUM', {
    options: ['Cone', 'Hank', 'Cheese', 'Bobbin'],
    patterns: [String.raw`\b(cone|hank|cheese|bobbin)\b`],
    sortOrder: 21,
  }),

  // Agriculture & Commodities
  attribute({ category: 'agriculture_commodities' }, 'variety', 'Variety', 'TEXT', {
    sortOrder: 1,
  }),
  attribute({ category: 'agriculture_commodities' }, 'quality_grade', 'Grade', 'ENUM', {
    options: [
      'FAQ (Fair Average Quality)',
      'Grade A',
      'Grade B',
      'Export quality',
      'Organic',
      'Ungraded',
    ],
    patterns: [String.raw`\b(faq|grade\s*a|grade\s*b|export quality|organic)\b`],
    sortOrder: 2,
  }),
  attribute({ category: 'agriculture_commodities' }, 'moisture_percent', 'Moisture', 'NUMBER', {
    unit: 'PERCENT',
    patterns: [
      String.raw`(\d+(?:\.\d+)?)\s*%\s*(?:moisture|mc)`,
      String.raw`moisture\s*(?:of|below|under|max)?\s*(\d+(?:\.\d+)?)\s*%?`,
    ],
    sortOrder: 3,
  }),
  attribute({ category: 'agriculture_commodities' }, 'packaging_type', 'Packaging', 'ENUM', {
    options: ['Loose / bulk', 'Gunny bag', 'PP woven bag', 'Jute bag', 'Carton', 'As per buyer'],
    patterns: [String.raw`\b(gunny|jute bag|pp bag|loose|bulk)\b`],
    sortOrder: 4,
  }),
  attribute({ subcategory: 'turmeric' }, 'curcumin_percent', 'Curcumin content', 'NUMBER', {
    unit: 'PERCENT',
    patterns: [
      String.raw`(\d+(?:\.\d+)?)\s*%\s*curcumin`,
      String.raw`curcumin\s*(?:of|above|min)?\s*(\d+(?:\.\d+)?)\s*%?`,
    ],
    sortOrder: 20,
  }),
  attribute({ subcategory: 'turmeric' }, 'form', 'Form', 'ENUM', {
    options: ['Whole finger', 'Bulb', 'Powder', 'Polished finger'],
    patterns: [String.raw`\b(finger|bulb|powder|polished)\b`],
    sortOrder: 21,
  }),
];

/** The six cities the demo suppliers declare service areas in. */
export const DEMO_CITIES = [
  'Bengaluru',
  'Coimbatore',
  'Tiruppur',
  'Erode',
  'Chennai',
  'Salem',
];

export const TEST_TAXONOMY: TaxonomySnapshot = {
  categories,
  subcategories,
  capabilities: [],
  attributes,
  criteria: [],
  cities: DEMO_CITIES,
};
