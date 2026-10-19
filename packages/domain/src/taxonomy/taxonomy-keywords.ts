/**
 * =============================================================================
 * OTP Platform — Taxonomy Keywords, Aliases & Search Normalization Engine
 * =============================================================================
 * Stage V3-01: SuperAdmin Managed Taxonomy Keywords & Aliases
 *
 * Responsibilities:
 * 1. Term normalization: lowercase, strip punctuation, handle common plural/singular forms.
 * 2. Search resolution: resolve natural language search terms to canonical subcategories.
 * 3. Conflict detection: find overlapping or conflicting keywords across subcategories.
 * 4. Spreadsheet formula injection protection (sanitize on export, sanitize on import).
 * =============================================================================
 */

import type { SubcategoryDef } from './types';

export interface TaxonomyAliasConflict {
  keyword: string;
  normalizedKeyword: string;
  subcategories: Array<{
    id: string;
    code: string;
    name: string;
  }>;
}

export interface TaxonomyKeywordMatchResult {
  subcategory: SubcategoryDef;
  matchedKeyword: string;
  normalizedInput: string;
  score: number;
}

export interface TaxonomyImportRow {
  categoryCode: string;
  categoryName: string;
  subcategoryCode: string;
  subcategoryName: string;
  keywords: string[];
  unit?: string;
  isActive: boolean;
  description?: string;
}

export interface TaxonomyImportValidationIssue {
  rowNumber: number;
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface TaxonomyImportValidationResult {
  isValid: boolean;
  rows: TaxonomyImportRow[];
  errors: TaxonomyImportValidationIssue[];
  warnings: TaxonomyImportValidationIssue[];
  summary: {
    totalRows: number;
    validRows: number;
    errorCount: number;
    warningCount: number;
    newCategoriesCount: number;
    newSubcategoriesCount: number;
    updatedKeywordsCount: number;
  };
}

/**
 * Normalizes search terms for robust, case-insensitive, punctuation-free keyword matching.
 */
export function normalizeTaxonomyTerm(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let term = raw.trim().toLowerCase();

  // Strip formula injection triggers if present
  if (term.startsWith("'") || term.startsWith('=')) {
    term = term.replace(/^['=+\-@]+/, '').trim();
  }

  // Replace punctuation & separators with single spaces
  term = term
    .replace(/[_\-/\\,;:()\[\]{}|#&^%$!~`"?+*.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Standardize common Indian procurement plurals & suffixes
  const words = term.split(' ').map((word) => {
    if (word.length <= 3) return word;
    // Common procurement plural normalizations
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y'; // batteries -> battery
    if (word.endsWith('ings')) return word.slice(0, -1); // rewindings -> rewinding
    if (word.endsWith('es') && (word.endsWith('shes') || word.endsWith('ches') || word.endsWith('xes') || word.endsWith('ses'))) {
      return word.slice(0, -2); // bushes -> bush, switches -> switch
    }
    if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
      return word.slice(0, -1); // motors -> motor, pumps -> pump, repairs -> repair, valves -> valve, flanges -> flange
    }
    return word;
  });

  return words.join(' ').trim();
}

/**
 * Detects whether any keyword/alias is duplicated or conflicting across multiple subcategories.
 */
export function detectTaxonomyAliasConflicts(
  subcategories: Array<{
    id: string;
    code: string;
    name: string;
    matchKeywords?: string[] | null;
  }>,
): TaxonomyAliasConflict[] {
  const keywordMap = new Map<
    string,
    {
      originalKeyword: string;
      subcategories: Map<string, { id: string; code: string; name: string }>;
    }
  >();

  for (const sub of subcategories) {
    const keywords = Array.isArray(sub.matchKeywords) ? sub.matchKeywords : [];
    for (const kw of keywords) {
      const normalized = normalizeTaxonomyTerm(kw);
      if (!normalized) continue;

      let entry = keywordMap.get(normalized);
      if (!entry) {
        entry = { originalKeyword: kw, subcategories: new Map() };
        keywordMap.set(normalized, entry);
      }
      entry.subcategories.set(sub.code || sub.id, {
        id: sub.id,
        code: sub.code,
        name: sub.name,
      });
    }
  }

  const conflicts: TaxonomyAliasConflict[] = [];
  for (const [normalizedKeyword, data] of keywordMap.entries()) {
    if (data.subcategories.size > 1) {
      conflicts.push({
        keyword: data.originalKeyword,
        normalizedKeyword,
        subcategories: Array.from(data.subcategories.values()),
      });
    }
  }

  return conflicts;
}

/**
 * Resolves a natural search term or buyer inquiry phrase to the best matching canonical subcategory.
 */
export function resolveTaxonomyKeyword(
  query: string,
  subcategories: SubcategoryDef[],
): TaxonomyKeywordMatchResult | null {
  const normalizedQuery = normalizeTaxonomyTerm(query);
  if (!normalizedQuery || subcategories.length === 0) return null;

  let bestMatch: TaxonomyKeywordMatchResult | null = null;
  let highestScore = 0;

  for (const sub of subcategories) {
    const subNameNorm = normalizeTaxonomyTerm(sub.name);
    // 1. Direct subcategory name match
    if (subNameNorm === normalizedQuery) {
      return {
        subcategory: sub,
        matchedKeyword: sub.name,
        normalizedInput: normalizedQuery,
        score: 1.0,
      };
    }

    // 2. Keyword exact & phrase matching
    const keywords = Array.isArray(sub.matchKeywords) ? sub.matchKeywords : [];
    for (const kw of keywords) {
      const kwNorm = normalizeTaxonomyTerm(kw);
      if (!kwNorm) continue;

      let score = 0;

      if (kwNorm === normalizedQuery) {
        score = 0.95; // Exact alias match
      } else if (normalizedQuery.includes(kwNorm)) {
        // Query contains the keyword: score based on keyword length ratio
        score = 0.7 + Math.min(0.2, (kwNorm.length / normalizedQuery.length) * 0.2);
      } else if (kwNorm.includes(normalizedQuery)) {
        // Keyword contains the query
        score = 0.6 + Math.min(0.2, (normalizedQuery.length / kwNorm.length) * 0.2);
      } else {
        // Word overlap match
        const queryWords = normalizedQuery.split(' ');
        const kwWords = kwNorm.split(' ');
        const matchingWords = queryWords.filter((w) => kwWords.includes(w) && w.length > 2);
        if (matchingWords.length > 0) {
          score = (matchingWords.length / Math.max(queryWords.length, kwWords.length)) * 0.6;
        }
      }

      if (score > highestScore && score >= 0.5) {
        highestScore = score;
        bestMatch = {
          subcategory: sub,
          matchedKeyword: kw,
          normalizedInput: normalizedQuery,
          score: Math.round(score * 100) / 100,
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Sanitizes a spreadsheet cell string against CSV / Excel Formula Injection (CSV Injection / CWE-1236).
 * Prepend single quote (') if the string begins with =, +, -, @, or tab/carriage return.
 */
export function sanitizeSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (!str) return '';

  // Vulnerable formula trigger characters
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Cleans a value read from a spreadsheet or CSV, removing prepended single quotes used for formula neutralization.
 */
export function cleanSpreadsheetCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value).trim();
  if (str.startsWith("'") && /^[=+\-@\t\r]/.test(str.slice(1))) {
    return str.slice(1).trim();
  }
  return str;
}

/**
 * Validates a batch of taxonomy import rows.
 */
export function validateTaxonomyImportData(
  rows: Array<Record<string, unknown>>,
  existingCategories?: Array<{ id: string; code: string; name: string }>,
  existingSubcategories?: Array<{ id: string; code: string; name: string; categoryCode: string }>,
): TaxonomyImportValidationResult {
  const errors: TaxonomyImportValidationIssue[] = [];
  const warnings: TaxonomyImportValidationIssue[] = [];
  const validRows: TaxonomyImportRow[] = [];

  const seenCategoryCodes = new Set<string>();
  const seenSubcategoryCodes = new Set<string>();
  const keywordSubcategoryMap = new Map<string, string>();

  const existingCatMap = new Map((existingCategories || []).map((c) => [c.code.toLowerCase(), c]));
  const existingSubMap = new Map((existingSubcategories || []).map((s) => [s.code.toLowerCase(), s]));

  let newCategoriesCount = 0;
  let newSubcategoriesCount = 0;
  let updatedKeywordsCount = 0;

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // 1-indexed, accounting for header
    let hasRowError = false;

    const categoryCode = cleanSpreadsheetCell(rawRow.categoryCode || rawRow['Category Code'] || rawRow.category_code || '').trim();
    const categoryName = cleanSpreadsheetCell(rawRow.categoryName || rawRow['Category Name'] || rawRow.category_name || '').trim();
    const subcategoryCode = cleanSpreadsheetCell(rawRow.subcategoryCode || rawRow['Subcategory Code'] || rawRow.subcategory_code || '').trim();
    const subcategoryName = cleanSpreadsheetCell(rawRow.subcategoryName || rawRow['Subcategory Name'] || rawRow.subcategory_name || '').trim();
    const rawKeywords = cleanSpreadsheetCell(rawRow.keywords || rawRow['Keywords / Aliases'] || rawRow.aliases || rawRow.match_keywords || '').trim();
    const unit = cleanSpreadsheetCell(rawRow.unit || rawRow['Unit'] || rawRow.capacity_unit || '').trim();
    const rawActive = cleanSpreadsheetCell(rawRow.isActive || rawRow['Active'] || rawRow.is_active || 'true').trim().toLowerCase();
    const description = cleanSpreadsheetCell(rawRow.description || rawRow['Description'] || '').trim();

    const isActive = rawActive !== 'false' && rawActive !== '0' && rawActive !== 'no';

    // Validation 1: Required fields
    if (!categoryCode) {
      errors.push({ rowNumber, field: 'categoryCode', message: 'Category Code is mandatory', severity: 'ERROR' });
      hasRowError = true;
    }
    if (!categoryName) {
      errors.push({ rowNumber, field: 'categoryName', message: 'Category Name is mandatory', severity: 'ERROR' });
      hasRowError = true;
    }
    if (!subcategoryCode) {
      errors.push({ rowNumber, field: 'subcategoryCode', message: 'Subcategory Code is mandatory', severity: 'ERROR' });
      hasRowError = true;
    }
    if (!subcategoryName) {
      errors.push({ rowNumber, field: 'subcategoryName', message: 'Subcategory Name is mandatory', severity: 'ERROR' });
      hasRowError = true;
    }

    // Validation 2: Code format (alphanumeric and underscores)
    if (subcategoryCode && !/^[a-zA-Z0-9_-]+$/.test(subcategoryCode)) {
      errors.push({
        rowNumber,
        field: 'subcategoryCode',
        message: 'Subcategory Code must contain only letters, numbers, hyphens, and underscores',
        severity: 'ERROR',
      });
      hasRowError = true;
    }

    // Validation 3: Duplicate subcategory code in same file
    if (subcategoryCode) {
      const lowerSub = subcategoryCode.toLowerCase();
      if (seenSubcategoryCodes.has(lowerSub)) {
        errors.push({
          rowNumber,
          field: 'subcategoryCode',
          message: `Duplicate subcategory code '${subcategoryCode}' in import file`,
          severity: 'ERROR',
        });
        hasRowError = true;
      } else {
        seenSubcategoryCodes.add(lowerSub);
        if (!existingSubMap.has(lowerSub)) {
          newSubcategoriesCount++;
        }
      }
    }

    if (categoryCode && !seenCategoryCodes.has(categoryCode.toLowerCase())) {
      seenCategoryCodes.add(categoryCode.toLowerCase());
      if (!existingCatMap.has(categoryCode.toLowerCase())) {
        newCategoriesCount++;
      }
    }

    // Keywords parsing & validation
    const parsedKeywords = rawKeywords
      ? rawKeywords
          .split(/[,;|]/)
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      : [];

    if (parsedKeywords.length === 0) {
      warnings.push({
        rowNumber,
        field: 'keywords',
        message: 'Subcategory has no keywords defined. Natural search will rely solely on title matching.',
        severity: 'WARNING',
      });
    } else {
      updatedKeywordsCount += parsedKeywords.length;
      for (const kw of parsedKeywords) {
        const norm = normalizeTaxonomyTerm(kw);
        if (keywordSubcategoryMap.has(norm) && keywordSubcategoryMap.get(norm) !== subcategoryCode) {
          warnings.push({
            rowNumber,
            field: 'keywords',
            message: `Keyword '${kw}' conflicts with another subcategory '${keywordSubcategoryMap.get(norm)}'`,
            severity: 'WARNING',
          });
        } else {
          keywordSubcategoryMap.set(norm, subcategoryCode);
        }
      }
    }

    if (!hasRowError && categoryCode && categoryName && subcategoryCode && subcategoryName) {
      validRows.push({
        categoryCode,
        categoryName,
        subcategoryCode,
        subcategoryName,
        keywords: parsedKeywords,
        unit: unit || undefined,
        isActive,
        description: description || undefined,
      });
    }
  });

  return {
    isValid: errors.length === 0,
    rows: validRows,
    errors,
    warnings,
    summary: {
      totalRows: rows.length,
      validRows: validRows.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      newCategoriesCount,
      newSubcategoriesCount,
      updatedKeywordsCount,
    },
  };
}

/**
 * Generates an Excel-compatible CSV template string with formula injection protection.
 */
export function generateTaxonomyCsvTemplate(
  categories: Array<{ code: string; name: string }>,
  subcategories: Array<{
    categoryCode: string;
    code: string;
    name: string;
    matchKeywords?: string[];
    description?: string;
  }>,
): string {
  const headers = [
    'Category Code',
    'Category Name',
    'Subcategory Code',
    'Subcategory Name',
    'Keywords / Aliases (Comma-Separated)',
    'Unit',
    'Active (true/false)',
    'Description',
  ];

  const lines = [headers.join(',')];

  for (const sub of subcategories) {
    const cat = categories.find((c) => c.code === sub.categoryCode);
    const keywordsFormatted = (sub.matchKeywords || []).join('; ');
    const row = [
      sanitizeSpreadsheetCell(sub.categoryCode),
      sanitizeSpreadsheetCell(cat?.name || sub.categoryCode),
      sanitizeSpreadsheetCell(sub.code),
      sanitizeSpreadsheetCell(sub.name),
      `"${sanitizeSpreadsheetCell(keywordsFormatted).replace(/"/g, '""')}"`,
      'unit',
      'true',
      `"${sanitizeSpreadsheetCell(sub.description || '').replace(/"/g, '""')}"`,
    ];
    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}
