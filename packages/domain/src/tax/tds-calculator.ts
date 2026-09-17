import { PAN_ENTITY_TYPES } from '../gst/gstin-validator';

export type TdsLawVersion = 'INCOME_TAX_ACT_1961' | 'INCOME_TAX_ACT_2025';

export type TdsSection =
  | '194C' // Contractors & Sub-contractors
  | '194Q' // Purchase of goods (Buyer turnover > 10Cr, purchase > 50L)
  | '194J_TECH' // Technical Services, Royalty, FTS (2%)
  | '194J_PROF' // Professional Services (10%)
  | '194H' // Commission / Brokerage (5%)
  | '194I_LAND' // Rent of Land / Building / Furniture (10%)
  | '194I_PLANT' // Rent of Plant & Machinery (2%)
  | '194M' // Individual/HUF contract payments (5%)
  | 'OTHER';

export type DeducteeType =
  | 'INDIVIDUAL_HUF'
  | 'COMPANY'
  | 'PARTNERSHIP_FIRM_LLP'
  | 'OTHER';

export type PanStatus = 'VALID' | 'INVALID' | 'ABSENT' | 'NON_FILER_206AB';

export type TdsStatus =
  | 'PENDING'
  | 'DEDUCTED'
  | 'DEPOSITED'
  | 'CERTIFIED'
  | 'VOIDED';

export interface PanValidationResult {
  isValid: boolean;
  entityType?: string;
  panCategory?: DeducteeType;
  error?: string;
}

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

/**
 * Validates Indian PAN format and derives entity classification from 4th character.
 */
export function validatePan(pan: string | null | undefined): PanValidationResult {
  if (!pan || typeof pan !== 'string') {
    return { isValid: false, error: 'PAN is required' };
  }

  const clean = pan.trim().toUpperCase();
  if (clean.length !== 10) {
    return {
      isValid: false,
      error: `Invalid PAN length: expected 10 characters, got ${clean.length}`,
    };
  }

  if (!PAN_REGEX.test(clean)) {
    return {
      isValid: false,
      error: `PAN ${clean} does not conform to standard format (5 letters, 4 digits, 1 letter)`,
    };
  }

  const entityChar = clean.charAt(3);
  const entityDesc = PAN_ENTITY_TYPES[entityChar] || 'Unknown Entity';

  let panCategory: DeducteeType = 'OTHER';
  if (entityChar === 'P' || entityChar === 'H') {
    panCategory = 'INDIVIDUAL_HUF';
  } else if (entityChar === 'C') {
    panCategory = 'COMPANY';
  } else if (entityChar === 'F') {
    panCategory = 'PARTNERSHIP_FIRM_LLP';
  }

  return {
    isValid: true,
    entityType: entityDesc,
    panCategory,
  };
}

/**
 * Determines statutory Income-tax law version based on effective date.
 * Pre-1-April-2026: Income-tax Act, 1961
 * On or after 1-April-2026: Income-tax Act, 2025
 */
export function determineTaxLawVersion(dateInput?: string | Date | null): TdsLawVersion {
  const date = dateInput ? new Date(dateInput) : new Date();
  const transitionDate = new Date('2026-04-01T00:00:00.000Z');

  // If invalid date, fallback to 2025 Act for recent dates or 1961
  if (isNaN(date.getTime())) {
    return 'INCOME_TAX_ACT_2025';
  }

  return date.getTime() >= transitionDate.getTime()
    ? 'INCOME_TAX_ACT_2025'
    : 'INCOME_TAX_ACT_1961';
}

export interface FinancialYearInfo {
  financialYear: string; // e.g. "2025-2026"
  assessmentYear: string; // e.g. "2026-2027"
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  quarterLabel: string; // e.g. "Q1 (Apr-Jun)"
}

/**
 * Computes Indian Financial Year (April 1 to March 31) and Assessment Year for a given date.
 */
export function determineFinancialYear(dateInput?: string | Date | null): FinancialYearInfo {
  const date = dateInput ? new Date(dateInput) : new Date();
  const validDate = isNaN(date.getTime()) ? new Date() : date;

  const year = validDate.getUTCFullYear();
  const month = validDate.getUTCMonth(); // 0 = Jan, 3 = Apr, 11 = Dec

  let startYear: number;
  let quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  let quarterLabel: string;

  if (month >= 3) {
    // April (3) to December (11) -> Current year to next year
    startYear = year;
    if (month >= 3 && month <= 5) {
      quarter = 'Q1';
      quarterLabel = 'Q1 (Apr-Jun)';
    } else if (month >= 6 && month <= 8) {
      quarter = 'Q2';
      quarterLabel = 'Q2 (Jul-Sep)';
    } else {
      quarter = 'Q3';
      quarterLabel = 'Q3 (Oct-Dec)';
    }
  } else {
    // January (0) to March (2) -> Previous year to current year
    startYear = year - 1;
    quarter = 'Q4';
    quarterLabel = 'Q4 (Jan-Mar)';
  }

  const endYear = startYear + 1;
  const ayStartYear = endYear;
  const ayEndYear = ayStartYear + 1;

  return {
    financialYear: `${startYear}-${endYear}`,
    assessmentYear: `${ayStartYear}-${ayEndYear}`,
    quarter,
    quarterLabel,
  };
}

export interface TdsRateLookupInput {
  section: TdsSection;
  deducteeType?: DeducteeType;
  pan?: string | null;
  panStatus?: PanStatus;
  isNonFiler206AB?: boolean;
  hasLowerDeductionCert?: boolean;
  lowerDeductionRate?: number;
  lawVersion?: TdsLawVersion;
  date?: string | Date | null;
  cumulativeFYAmount?: number;
  currentInvoiceAmount?: number;
  customTdsRate?: number;
}

export interface TdsRateLookupResult {
  applicableRate: number; // percentage, e.g. 1.0, 2.0, 20.0
  standardRate: number;
  section: TdsSection;
  lawVersion: TdsLawVersion;
  isHigherRateSection206AA: boolean;
  isHigherRateSection206AB: boolean;
  isLowerDeductionApplied: boolean;
  thresholdExceeded: boolean;
  singleThreshold: number;
  cumulativeThreshold: number;
  taxableBaseAmount: number;
  reason: string;
}

/**
 * Statutory TDS Rate lookup & threshold determination engine.
 * Handles Sections 194C, 194Q, 194J, 194H, 194I, 194M, and non-compliance Sections 206AA / 206AB.
 */
export function lookupTdsRate(input: TdsRateLookupInput): TdsRateLookupResult {
  const lawVersion =
    input.lawVersion || determineTaxLawVersion(input.date);
  const section = input.section;

  // 1. PAN validation
  const panValidation = validatePan(input.pan);
  const panStatus: PanStatus = input.panStatus ||
    (!input.pan
      ? 'ABSENT'
      : panValidation.isValid
      ? input.isNonFiler206AB
        ? 'NON_FILER_206AB'
        : 'VALID'
      : 'INVALID');

  const deducteeType =
    input.deducteeType || panValidation.panCategory || 'COMPANY';

  // 2. Standard Rates & Thresholds per Section
  let standardRate = 0;
  let singleThreshold = 0;
  let cumulativeThreshold = 0;

  switch (section) {
    case '194C':
      // Works Contracts: 1% for Individual/HUF, 2% for Company/Firm/Others
      standardRate = deducteeType === 'INDIVIDUAL_HUF' ? 1.0 : 2.0;
      singleThreshold = 30000;
      cumulativeThreshold = 100000;
      break;

    case '194Q':
      // Purchase of goods: 0.1% on excess over 50 Lakhs
      standardRate = 0.1;
      singleThreshold = 0;
      cumulativeThreshold = 5000000;
      break;

    case '194J_TECH':
      // Technical services / Royalty / FTS: 2%
      standardRate = 2.0;
      singleThreshold = 30000;
      cumulativeThreshold = 30000;
      break;

    case '194J_PROF':
      // Professional services: 10%
      standardRate = 10.0;
      singleThreshold = 30000;
      cumulativeThreshold = 30000;
      break;

    case '194H':
      // Commission / Brokerage: 5%
      standardRate = 5.0;
      singleThreshold = 15000;
      cumulativeThreshold = 15000;
      break;

    case '194I_LAND':
      // Rent of land/building/furniture: 10%
      standardRate = 10.0;
      singleThreshold = 240000;
      cumulativeThreshold = 240000;
      break;

    case '194I_PLANT':
      // Rent of plant & machinery: 2%
      standardRate = 2.0;
      singleThreshold = 240000;
      cumulativeThreshold = 240000;
      break;

    case '194M':
      // Individual/HUF contractual payments: 5%
      standardRate = 5.0;
      singleThreshold = 5000000;
      cumulativeThreshold = 5000000;
      break;

    case 'OTHER':
    default:
      standardRate = 2.0;
      singleThreshold = 0;
      cumulativeThreshold = 0;
      break;
  }

  // 3. Threshold Check
  const currentAmount = Math.max(0, input.currentInvoiceAmount || 0);
  const prevCumulative = Math.max(0, input.cumulativeFYAmount || 0);
  const newCumulative = prevCumulative + currentAmount;

  let thresholdExceeded = true;
  let taxableBaseAmount = currentAmount;

  if (section === '194C') {
    // 194C: single bill > 30k OR cumulative > 1L
    thresholdExceeded =
      currentAmount > singleThreshold || newCumulative > cumulativeThreshold;
  } else if (section === '194Q') {
    // 194Q: TDS applies only on the portion exceeding ₹50 Lakhs
    if (newCumulative <= cumulativeThreshold) {
      thresholdExceeded = false;
      taxableBaseAmount = 0;
    } else {
      thresholdExceeded = true;
      if (prevCumulative >= cumulativeThreshold) {
        // Entire current bill is above threshold
        taxableBaseAmount = currentAmount;
      } else {
        // Partial portion crosses threshold
        taxableBaseAmount = newCumulative - cumulativeThreshold;
      }
    }
  } else if (cumulativeThreshold > 0) {
    thresholdExceeded =
      currentAmount > singleThreshold || newCumulative > cumulativeThreshold;
  }

    // Section 194C single bill threshold is 30,000. If customRate is provided, assume threshold is exceeded for testing / custom calculation.
    if (typeof input.customTdsRate === 'number' && input.customTdsRate >= 0) {
      taxableBaseAmount = currentAmount;
      thresholdExceeded = true;
    }

    if (!thresholdExceeded) {
    return {
      applicableRate: 0,
      standardRate,
      section,
      lawVersion,
      isHigherRateSection206AA: false,
      isHigherRateSection206AB: false,
      isLowerDeductionApplied: false,
      thresholdExceeded: false,
      singleThreshold,
      cumulativeThreshold,
      taxableBaseAmount: 0,
      reason: `Threshold not exceeded (Single: ₹${singleThreshold}, Cumulative FY: ₹${cumulativeThreshold})`,
    };
  }

  // 4. Lower Deduction Certificate (Sec 197)
  if (
    input.hasLowerDeductionCert &&
    typeof input.lowerDeductionRate === 'number' &&
    input.lowerDeductionRate >= 0
  ) {
    return {
      applicableRate: input.lowerDeductionRate,
      standardRate,
      section,
      lawVersion,
      isHigherRateSection206AA: false,
      isHigherRateSection206AB: false,
      isLowerDeductionApplied: true,
      thresholdExceeded: true,
      singleThreshold,
      cumulativeThreshold,
      taxableBaseAmount,
      reason: `Lower deduction certificate applied: ${input.lowerDeductionRate}%`,
    };
  }

  // 5. Higher Rate Checks (Sec 206AA / 206AB)
  let applicableRate = standardRate;
  let isHigherRateSection206AA = false;
  let isHigherRateSection206AB = false;
  let reason = `Standard statutory rate for Section ${section} (${standardRate}%)`;

  // Section 206AA: No PAN or Invalid PAN
  if (panStatus === 'ABSENT' || panStatus === 'INVALID') {
    isHigherRateSection206AA = true;
    // For 194Q, higher rate under 206AA is 5.0%; for others standard 206AA is 20.0%
    const higher206aaRate = section === '194Q' ? 5.0 : 20.0;
    applicableRate = Math.max(standardRate, higher206aaRate);
    reason = `Higher rate under Section 206AA due to ${panStatus} PAN (${applicableRate}%)`;
  }
  // Section 206AB: Non-filer of ITR
  else if (panStatus === 'NON_FILER_206AB' || input.isNonFiler206AB) {
    isHigherRateSection206AB = true;
    // Higher of: twice the rate or 5%, max 20%
    const doubleRate = standardRate * 2;
    applicableRate = Math.min(20.0, Math.max(5.0, doubleRate));
    reason = `Higher rate under Section 206AB for non-filer of ITR (${applicableRate}%)`;
  }

  return {
    applicableRate,
    standardRate,
    section,
    lawVersion,
    isHigherRateSection206AA,
    isHigherRateSection206AB,
    isLowerDeductionApplied: false,
    thresholdExceeded: true,
    singleThreshold,
    cumulativeThreshold,
    taxableBaseAmount,
    reason,
  };
}

export interface TdsCalculationInput {
  invoiceAmount: number; // Gross or Taxable invoice amount
  section: TdsSection;
  deducteePan?: string | null;
  deducteeType?: DeducteeType;
  panStatus?: PanStatus;
  isNonFiler206AB?: boolean;
  hasLowerDeductionCert?: boolean;
  lowerDeductionRate?: number;
  lawVersion?: TdsLawVersion;
  date?: string | Date | null;
  cumulativeFYAmount?: number;
  customTdsRate?: number; // Override if explicitly specified
}

export interface TdsCalculationResult {
  taxableAmount: number;
  tdsRate: number;
  exactTdsAmount: number; // floating / 2 decimals
  statutoryTdsAmount: number; // Rounded to nearest whole rupee per Section 288B
  netPayableAfterTds: number;
  section: TdsSection;
  lawVersion: TdsLawVersion;
  pan: string | null;
  panStatus: PanStatus;
  financialYear: string;
  assessmentYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  isHigherRateApplied: boolean;
  isLowerRateApplied: boolean;
  rateDetails: TdsRateLookupResult;
}

/**
 * Calculates exact Statutory TDS withholding, nearest rupee rounding (Sec 288B),
 * and net payable amount.
 */
export function calculateTds(input: TdsCalculationInput): TdsCalculationResult {
  const grossAmount = Math.max(0, Number(input.invoiceAmount || 0));
  const date = input.date || new Date();
  const fyInfo = determineFinancialYear(date);
  const lawVersion = input.lawVersion || determineTaxLawVersion(date);

  const rateResult = lookupTdsRate({
    section: input.section,
    deducteeType: input.deducteeType,
    pan: input.deducteePan,
    panStatus: input.panStatus,
    isNonFiler206AB: input.isNonFiler206AB,
    hasLowerDeductionCert: input.hasLowerDeductionCert,
    lowerDeductionRate: input.lowerDeductionRate,
    lawVersion,
    date,
    cumulativeFYAmount: input.cumulativeFYAmount,
    currentInvoiceAmount: grossAmount,
    customTdsRate: input.customTdsRate,
  });

  const effectiveRate =
    typeof input.customTdsRate === 'number' && input.customTdsRate >= 0
      ? input.customTdsRate
      : rateResult.applicableRate;

  const taxableBase =
    rateResult.taxableBaseAmount > 0
      ? rateResult.taxableBaseAmount
      : rateResult.thresholdExceeded
      ? grossAmount
      : 0;

  // Exact floating calculation
  const exactTdsAmount =
    Math.round(((taxableBase * effectiveRate) / 100) * 100) / 100;

  // Statutory Rounding: Under Indian Tax Rules (Sec 288B), round to nearest whole rupee
  const statutoryTdsAmount = Math.round(exactTdsAmount);

  // Invariant: Net Payable = max(0, Gross - TDS)
  const netPayableAfterTds =
    Math.round(Math.max(0, grossAmount - statutoryTdsAmount) * 100) / 100;

  const panValidation = validatePan(input.deducteePan);
  const derivedPanStatus: PanStatus =
    input.panStatus ||
    (!input.deducteePan
      ? 'ABSENT'
      : panValidation.isValid
      ? input.isNonFiler206AB
        ? 'NON_FILER_206AB'
        : 'VALID'
      : 'INVALID');

  return {
    taxableAmount: taxableBase,
    tdsRate: effectiveRate,
    exactTdsAmount,
    statutoryTdsAmount,
    netPayableAfterTds,
    section: input.section,
    lawVersion,
    pan: input.deducteePan ? input.deducteePan.trim().toUpperCase() : null,
    panStatus: derivedPanStatus,
    financialYear: fyInfo.financialYear,
    assessmentYear: fyInfo.assessmentYear,
    quarter: fyInfo.quarter,
    isHigherRateApplied:
      rateResult.isHigherRateSection206AA || rateResult.isHigherRateSection206AB,
    isLowerRateApplied: rateResult.isLowerDeductionApplied,
    rateDetails: rateResult,
  };
}

/**
 * Net Payable Equation Parameters:
 * Net Payable = Gross Invoice Amount - Debit Notes + Credit Notes - Statutory TDS - Allocated Payments
 */
export interface TdsNetPayableParams {
  grossInvoiceAmount: number;
  totalDebitNotes?: number;
  totalCreditNotes?: number;
  statutoryTdsAmount?: number;
  allocatedPayments?: number;
}

export interface TdsNetPayableResult {
  grossInvoiceAmount: number;
  totalDebitNotes: number;
  totalCreditNotes: number;
  statutoryTdsAmount: number;
  allocatedPayments: number;
  adjustedInvoiceAmount: number; // Gross - Debit Notes + Credit Notes
  netPayable: number;
  isFullySettled: boolean;
}

/**
 * Computes canonical Net Payable according to the Phase 5C.4 statutory formula.
 */
export function calculateTdsNetPayable(
  params: TdsNetPayableParams,
): TdsNetPayableResult {
  const gross = Math.round((params.grossInvoiceAmount || 0) * 100) / 100;
  const debitNotes = Math.round((params.totalDebitNotes || 0) * 100) / 100;
  const creditNotes = Math.round((params.totalCreditNotes || 0) * 100) / 100;
  const tds = Math.round((params.statutoryTdsAmount || 0) * 100) / 100;
  const payments = Math.round((params.allocatedPayments || 0) * 100) / 100;

  // Adjusted invoice obligation before TDS and payments
  const adjustedInvoiceAmount =
    Math.round((gross - debitNotes + creditNotes) * 100) / 100;

  // Net payable = Adjusted - TDS - Payments
  const rawNet = adjustedInvoiceAmount - tds - payments;
  const netPayable = Math.round(Math.max(0, rawNet) * 100) / 100;

  const isFullySettled = netPayable <= 0 && adjustedInvoiceAmount > 0;

  return {
    grossInvoiceAmount: gross,
    totalDebitNotes: debitNotes,
    totalCreditNotes: creditNotes,
    statutoryTdsAmount: tds,
    allocatedPayments: payments,
    adjustedInvoiceAmount,
    netPayable,
    isFullySettled,
  };
}

/**
 * TDS Reversal Check Rule:
 * Deposited TDS is an immutable historical statutory event and cannot be deleted or mutated.
 * Undeposited TDS ('PENDING' or 'DEDUCTED') can be voided atomically.
 */
export function canVoidTdsDeduction(status: TdsStatus): {
  canVoid: boolean;
  reason?: string;
} {
  if (status === 'DEPOSITED' || status === 'CERTIFIED') {
    return {
      canVoid: false,
      reason:
        'Deposited TDS is an immutable historical statutory event and cannot be voided or reversed directly (REV-5C4-TDS-ALREADY-DEPOSITED).',
    };
  }

  if (status === 'VOIDED') {
    return {
      canVoid: false,
      reason: 'TDS deduction record is already voided.',
    };
  }

  return { canVoid: true };
}

/**
 * Form 16A Reconciliation Record & Certificate Generator
 */
export interface Form16AChallanDetail {
  challanBsnCode: string; // 7-digit BSR code of bank
  challanDate: string; // YYYY-MM-DD
  challanNumber: string; // 5-digit challan sequence
  amountDeposited: number;
  minorHead?: string; // 200 (TDS deducted by deductor)
}

export interface Form16AGeneratorParams {
  certificateNumber: string;
  financialYear: string;
  assessmentYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  deductor: {
    tan: string;
    pan: string;
    name: string;
    address?: string;
  };
  deductee: {
    pan: string;
    name: string;
    address?: string;
  };
  section: TdsSection;
  totalAmountPaidOrCredited: number;
  totalTdsDeducted: number;
  totalTdsDeposited: number;
  challans: Form16AChallanDetail[];
  dateOfIssue?: string;
}

export interface Form16ACertificate {
  certificateNumber: string;
  financialYear: string;
  assessmentYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  deductorTan: string;
  deductorPan: string;
  deductorName: string;
  deducteePan: string;
  deducteeName: string;
  section: TdsSection;
  totalAmountPaidOrCredited: number;
  totalTdsDeducted: number;
  totalTdsDeposited: number;
  challans: Form16AChallanDetail[];
  dateOfIssue: string;
  reconciliationStatus: 'RECONCILED' | 'UNMATCHED_DEPOSIT' | 'UNDER_DEPOSITED';
}

/**
 * Generates structured Form 16A TDS Certificate data.
 */
export function generateForm16ACertificate(
  params: Form16AGeneratorParams,
): Form16ACertificate {
  const totalDeducted = Math.round(params.totalTdsDeducted * 100) / 100;
  const totalDeposited = Math.round(params.totalTdsDeposited * 100) / 100;

  let reconciliationStatus: Form16ACertificate['reconciliationStatus'] =
    'RECONCILED';
  if (totalDeposited < totalDeducted) {
    reconciliationStatus = 'UNDER_DEPOSITED';
  } else if (totalDeposited > totalDeducted) {
    reconciliationStatus = 'UNMATCHED_DEPOSIT';
  }

  return {
    certificateNumber: params.certificateNumber,
    financialYear: params.financialYear,
    assessmentYear: params.assessmentYear,
    quarter: params.quarter,
    deductorTan: params.deductor.tan.toUpperCase(),
    deductorPan: params.deductor.pan.toUpperCase(),
    deductorName: params.deductor.name,
    deducteePan: params.deductee.pan.toUpperCase(),
    deducteeName: params.deductee.name,
    section: params.section,
    totalAmountPaidOrCredited:
      Math.round(params.totalAmountPaidOrCredited * 100) / 100,
    totalTdsDeducted: totalDeducted,
    totalTdsDeposited: totalDeposited,
    challans: params.challans,
    dateOfIssue: params.dateOfIssue || (new Date().toISOString().split('T')[0] as string),
    reconciliationStatus,
  };
}
