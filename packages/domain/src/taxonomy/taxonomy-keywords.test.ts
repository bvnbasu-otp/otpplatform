import { describe, expect, it } from 'vitest';
import {
  normalizeTaxonomyTerm,
  detectTaxonomyAliasConflicts,
  resolveTaxonomyKeyword,
  sanitizeSpreadsheetCell,
  cleanSpreadsheetCell,
  validateTaxonomyImportData,
  generateTaxonomyCsvTemplate,
} from './taxonomy-keywords';
import type { SubcategoryDef } from './types';

describe('Taxonomy Keywords, Aliases & Search Normalization Engine', () => {
  it('normalizes terms by stripping punctuation, extra spaces, and handling common plurals', () => {
    expect(normalizeTaxonomyTerm('  10-HP Submersible Pumps!  ')).toBe('10 hp submersible pump');
    expect(normalizeTaxonomyTerm('Motor Rewindings & Repairs...')).toBe('motor rewinding repair');
    expect(normalizeTaxonomyTerm('Batteries and Switches')).toBe('battery and switch');
    expect(normalizeTaxonomyTerm('Industrial Flanges / Valves')).toBe('industrial flange valve');
  });

  it('detects alias conflicts across different subcategories', () => {
    const subcategories = [
      {
        id: 'sub-1',
        code: 'motor_rewind',
        name: 'Motor Rewinding',
        matchKeywords: ['submersible pump', 'rewinding service', 'borewell motor'],
      },
      {
        id: 'sub-2',
        code: 'pump_replacement',
        name: 'Pump Replacement',
        matchKeywords: ['pump replacement', 'submersible pump', 'water pump'],
      },
      {
        id: 'sub-3',
        code: 'terrace_waterproofing',
        name: 'Terrace Waterproofing',
        matchKeywords: ['roof crack repair', 'waterproofing'],
      },
    ];

    const conflicts = detectTaxonomyAliasConflicts(subcategories);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.normalizedKeyword).toBe('submersible pump');
    expect(conflicts[0]!.subcategories).toHaveLength(2);
    expect(conflicts[0]!.subcategories.map((s) => s.code)).toEqual(['motor_rewind', 'pump_replacement']);
  });

  it('resolves natural search queries to the appropriate canonical subcategory', () => {
    const subcategories: SubcategoryDef[] = [
      {
        id: 'sub-motor',
        categoryId: 'cat-elec',
        categoryCode: 'electrical_power',
        code: 'motor_rewind',
        name: 'Motor Repair & Rewinding',
        matchKeywords: ['borewell motor', 'submersible pump', 'rewind coil', 'rotor balancing'],
        requiredAttributeCodes: [],
        defaultRequirementMode: null,
        sortOrder: 1,
      },
      {
        id: 'sub-waterproof',
        categoryId: 'cat-civil',
        categoryCode: 'civil_structural',
        code: 'waterproofing',
        name: 'Waterproofing & Civil Repairs',
        matchKeywords: ['roof leakage', 'terrace waterproofing', 'crack filling'],
        requiredAttributeCodes: [],
        defaultRequirementMode: null,
        sortOrder: 2,
      },
    ];

    // Exact alias
    const match1 = resolveTaxonomyKeyword('borewell motor', subcategories);
    expect(match1).not.toBeNull();
    expect(match1?.subcategory.code).toBe('motor_rewind');

    // Natural search query containing alias with plural
    const match2 = resolveTaxonomyKeyword('Urgent repair needed for borewell motors in building', subcategories);
    expect(match2).not.toBeNull();
    expect(match2?.subcategory.code).toBe('motor_rewind');

    // Waterproofing query
    const match3 = resolveTaxonomyKeyword('Terrace roof leakages during rain', subcategories);
    expect(match3).not.toBeNull();
    expect(match3?.subcategory.code).toBe('waterproofing');

    // Unrelated query
    const match4 = resolveTaxonomyKeyword('Catering for community festival lunch', subcategories);
    expect(match4).toBeNull();
  });

  it('prevents spreadsheet formula injection on export and import', () => {
    // Dangerous formula prefixes: =, +, -, @
    expect(sanitizeSpreadsheetCell('=1+1')).toBe("'=1+1");
    expect(sanitizeSpreadsheetCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
    expect(sanitizeSpreadsheetCell('-100')).toBe("'-100");
    expect(sanitizeSpreadsheetCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
    expect(sanitizeSpreadsheetCell('Normal Title')).toBe('Normal Title');

    // Cleaning safely strips the neutralizing single quote
    expect(cleanSpreadsheetCell("'=1+1")).toBe('=1+1');
    expect(cleanSpreadsheetCell("'+test")).toBe('+test');
    expect(cleanSpreadsheetCell('Normal Text')).toBe('Normal Text');
  });

  it('validates taxonomy import data and catches duplicates and missing mandatory fields', () => {
    const rawRows = [
      {
        categoryCode: 'elec_power',
        categoryName: 'Electrical & Power',
        subcategoryCode: 'motor_rewind',
        subcategoryName: 'Motor Rewinding',
        keywords: 'borewell motor; submersible pump',
        isActive: 'true',
      },
      {
        categoryCode: 'elec_power',
        categoryName: 'Electrical & Power',
        subcategoryCode: '', // Missing subcategory code!
        subcategoryName: 'Transformer Service',
        keywords: 'transformer oil',
        isActive: 'true',
      },
      {
        categoryCode: 'elec_power',
        categoryName: 'Electrical & Power',
        subcategoryCode: 'motor_rewind', // Duplicate subcategory code in same file!
        subcategoryName: 'Duplicate Motor Entry',
        keywords: 'electric motor',
        isActive: 'true',
      },
    ];

    const result = validateTaxonomyImportData(rawRows);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.field === 'subcategoryCode' && e.message.includes('mandatory'))).toBe(true);
    expect(result.errors.some((e) => e.field === 'subcategoryCode' && e.message.includes('Duplicate'))).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.subcategoryCode).toBe('motor_rewind');
    expect(result.rows[0]!.keywords).toEqual(['borewell motor', 'submersible pump']);
  });

  it('generates a clean CSV template with formula injection safeguards', () => {
    const categories = [{ code: 'mfg_ind', name: 'Manufacturing & Industrial' }];
    const subcategories = [
      {
        categoryCode: 'mfg_ind',
        code: 'cnc_machining',
        name: 'Precision CNC Machining',
        matchKeywords: ['cnc turning', 'flanges'],
        description: 'CNC turned components',
      },
    ];

    const csv = generateTaxonomyCsvTemplate(categories, subcategories);
    expect(csv).toContain('Category Code,Category Name,Subcategory Code');
    expect(csv).toContain('mfg_ind,Manufacturing & Industrial,cnc_machining,Precision CNC Machining');
    expect(csv).toContain('"cnc turning; flanges"');
  });
});
