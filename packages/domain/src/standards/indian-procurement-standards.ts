/**
 * OTP: Indian Standards Compliance & Category Mapping Evaluator
 *
 * Implements deterministic matching and confidence calculation against
 * BIS, FSSAI, CPWD, BEE and HSN/SAC Indian Procurement Standards.
 */

import {
  CANONICAL_INDIAN_PROCUREMENT_STANDARDS,
  type IndianProcurementStandard,
  type IndianStandardAuthority,
} from '../types/supplier-network-refresh';
import { STANDARD_PROCUREMENT_HSN_SAC_CATALOG, type HsnSacEntry } from '../tax/hsn-sac-catalog';

export interface StandardEvaluationRequest {
  category: string;
  declaredStandards?: string[]; // e.g. ['IS 694', 'FSSAI']
  hsnSacCode?: string;
  itemDescription?: string;
  supplierCapabilities?: string[];
}

export interface StandardComplianceMatch {
  standard: IndianProcurementStandard;
  isMatched: boolean;
  matchType: 'EXACT_CODE' | 'CATEGORY_RELEVANT' | 'KEYWORD_INFERRED';
  confidenceBoost: number;
  explanation: string;
}

export interface StandardEvaluationResult {
  category: string;
  matchedStandards: StandardComplianceMatch[];
  matchedHsnSac?: HsnSacEntry;
  totalConfidenceBoost: number; // 0 - 25 capped
  isMandatoryCompliant: boolean;
  complianceSummary: string;
}

export class IndianProcurementStandardsEvaluator {
  /**
   * Evaluates standard compliance for a given category and supplier capability declaration.
   */
  public static evaluateCompliance(
    request: StandardEvaluationRequest,
  ): StandardEvaluationResult {
    const matchedStandards: StandardComplianceMatch[] = [];
    const categoryLower = request.category.trim().toLowerCase();
    const declaredCodes = new Set((request.declaredStandards ?? []).map((s) => s.trim().toUpperCase()));
    const itemDescLower = (request.itemDescription ?? '').toLowerCase();

    // 1. Evaluate against canonical Indian Standards
    for (const std of CANONICAL_INDIAN_PROCUREMENT_STANDARDS) {
      const codeUpper = std.code.toUpperCase();
      const stdCatLower = std.category.toLowerCase();
      const isSectorMatch = std.applicableSectors.some((sec) =>
        categoryLower.includes(sec.toLowerCase()) || itemDescLower.includes(sec.toLowerCase())
      );
      const isCategoryMatch = categoryLower.includes(stdCatLower) || stdCatLower.includes(categoryLower);

      if (declaredCodes.has(codeUpper)) {
        matchedStandards.push({
          standard: std,
          isMatched: true,
          matchType: 'EXACT_CODE',
          confidenceBoost: std.minConfidenceBoost,
          explanation: `Explicitly certified to ${std.authority} standard: ${std.code} (${std.title})`,
        });
      } else if (isSectorMatch || isCategoryMatch) {
        matchedStandards.push({
          standard: std,
          isMatched: false,
          matchType: 'CATEGORY_RELEVANT',
          confidenceBoost: 0,
          explanation: `Applicable sector standard: ${std.code}. Verification recommended for institutional procurement.`,
        });
      }
    }

    // 2. Evaluate HSN / SAC match
    let matchedHsnSac: HsnSacEntry | undefined;
    if (request.hsnSacCode) {
      matchedHsnSac = STANDARD_PROCUREMENT_HSN_SAC_CATALOG.find(
        (entry) => entry.code === request.hsnSacCode
      );
    } else {
      matchedHsnSac = STANDARD_PROCUREMENT_HSN_SAC_CATALOG.find((entry) =>
        entry.category.toLowerCase().includes(categoryLower) || categoryLower.includes(entry.category.toLowerCase())
      );
    }

    // Calculate total boost capped at 25
    const exactMatches = matchedStandards.filter((m) => m.isMatched);
    let rawBoost = exactMatches.reduce((sum, m) => sum + m.confidenceBoost, 0);
    if (matchedHsnSac) {
      rawBoost += 5;
    }
    const totalConfidenceBoost = Math.min(25, rawBoost);

    // Mandatory standard check
    const mandatoryList = matchedStandards.filter((m) => m.standard.mandatoryForTenders);
    const isMandatoryCompliant = mandatoryList.length === 0 || mandatoryList.some((m) => m.isMatched);

    const complianceSummary = exactMatches.length > 0
      ? `Certified compliant with ${exactMatches.map((m) => m.standard.code).join(', ')} (+${totalConfidenceBoost} confidence boost)`
      : `Standard procurement guidelines mapped (${matchedStandards.length} applicable standards recognized)`;

    return {
      category: request.category,
      matchedStandards,
      matchedHsnSac,
      totalConfidenceBoost,
      isMandatoryCompliant,
      complianceSummary,
    };
  }
}
