/**
 * OTP Stage R2-17: Canonical Double-Entry Financial & Settlement Controls
 *
 * Supreme Platform Specification:
 * - Double-entry balanced ledger invariant: SUM(DEBITS) = SUM(CREDITS)
 * - Quadruple financial monetary segregation:
 *     1. Buyer Gross GMV Payable
 *     2. OTP Platform Fee (0.50% standard, frozen)
 *     3. Buyer Platform Reward (0.10% standard, 20% of fee, frozen)
 *     4. Net Supplier Disbursement
 * - Immutability: No destructive UPDATE/DELETE; corrections use compensating/reversal entries
 * - Idempotency: Duplicate events / replay yield exactly one financial effect
 * - Supplier verification gate: Unverified suppliers (R2-08) cannot receive financial settlement
 * - Bilateral GST (PA-06) independence & server-authoritative calculations
 * - Wallet segregation: Buyer promotional wallet is strictly isolated from GMV and restricted to subscription renewals
 * - Reconstructed settlement certificate with SHA-256 HMAC digital seal
 */

import { computeDeterministicHmac } from './procurement-communications';

export type FinancialSettlementStatus =
  | 'PENDING_PREREQUISITES'
  | 'AUTHORIZED'
  | 'DISBURSED'
  | 'RECONCILED'
  | 'DISPUTED'
  | 'REVERSED';

export interface FinancialSegregationBreakdown {
  grossCommercialAmount: number;     // Buyer Gross GMV (Base + GST)
  taxableBaseAmount: number;         // Pure goods/service value
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGstAmount: number;
  otpPlatformFeeRate: number;        // Frozen at 0.50%
  otpPlatformFeeAmount: number;      // 0.50% of base or gross as configured
  buyerRewardShareRate: number;      // Frozen at 20% of platform fee
  buyerRewardAmount: number;         // 0.10% net
  tdsWithholdingAmount: number;      // Sec 194C / 194Q if applicable
  debitNoteAdjustments: number;
  creditNoteAdjustments: number;
  netSupplierDisbursement: number;   // Gross - Deductions
  isConserved: boolean;
}

export interface SettlementPrerequisitesCheck {
  isPoValid: boolean;
  isSupplierVerified: boolean;
  isPoAccepted: boolean;
  isInspectionComplete: boolean;
  isInvoiceApproved: boolean;
  isSpendAuthorized: boolean;
  isAlreadySettled: boolean;
  canExecuteSettlement: boolean;
  blockingReasons: string[];
}

export interface AuthoritativeSettlementCertificate {
  certificateId: string;
  purchaseOrderId: string;
  poNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  buyerOrganizationId: string;
  buyerOrganizationName: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string | null;
  breakdown: FinancialSegregationBreakdown;
  paymentReference?: string | null;
  bankUtr?: string | null;
  reconciliationStatus: 'MATCHED' | 'PARTIAL' | 'UNRECONCILED' | 'EXCEPTION';
  issuedAt: string;
  authorizedBy: string;
  digitalSealSha256: string;
}

/**
 * Computes deterministic financial segregation breakdown with exact 2-decimal paise precision.
 * Invariant: Gross GMV = Net Supplier Disbursement + Platform Fee + TDS + Adjustments.
 */
export function calculateFinancialSegregation(params: {
  taxableBaseAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  platformFeeRate?: number;    // Default 0.50%
  rewardShareRate?: number;    // Default 20.00% (yielding 0.10% net reward)
  tdsAmount?: number;
  debitNotes?: number;
  creditNotes?: number;
}): FinancialSegregationBreakdown {
  const base = Math.max(0, Math.round(Number(params.taxableBaseAmount || 0) * 100) / 100);
  const cgst = Math.max(0, Math.round(Number(params.cgstAmount || 0) * 100) / 100);
  const sgst = Math.max(0, Math.round(Number(params.sgstAmount || 0) * 100) / 100);
  const igst = Math.max(0, Math.round(Number(params.igstAmount || 0) * 100) / 100);
  const totalGst = Math.round((cgst + sgst + igst) * 100) / 100;
  const grossCommercial = Math.round((base + totalGst) * 100) / 100;

  const feeRate = params.platformFeeRate !== undefined ? Number(params.platformFeeRate) : 0.50;
  const rewardShareRate = params.rewardShareRate !== undefined ? Number(params.rewardShareRate) : 20.00;

  // Platform Fee is computed on base amount
  const feeAmount = Math.round(((base * feeRate) / 100) * 100) / 100;

  // Buyer Reward is computed as share of fee
  let rawReward = (base * feeRate * rewardShareRate) / 10000;
  let rewardAmount = Math.round(rawReward * 100) / 100;
  if (rewardAmount > feeAmount) {
    rewardAmount = feeAmount;
  }

  const tds = Math.max(0, Math.round(Number(params.tdsAmount || 0) * 100) / 100);
  const debits = Math.max(0, Math.round(Number(params.debitNotes || 0) * 100) / 100);
  const credits = Math.max(0, Math.round(Number(params.creditNotes || 0) * 100) / 100);

  // Net supplier disbursement = Gross - Debits + Credits - TDS - Platform Fee
  const adjustedGross = Math.round((grossCommercial - debits + credits) * 100) / 100;
  const rawDisbursement = Math.round((adjustedGross - tds - feeAmount) * 100) / 100;
  const netSupplierDisbursement = Math.max(0, rawDisbursement);

  const totalOutflow = Math.round((netSupplierDisbursement + tds + feeAmount) * 100) / 100;
  const isConserved = Math.abs(totalOutflow - adjustedGross) < 0.001;

  return {
    grossCommercialAmount: grossCommercial,
    taxableBaseAmount: base,
    cgstAmount: cgst,
    sgstAmount: sgst,
    igstAmount: igst,
    totalGstAmount: totalGst,
    otpPlatformFeeRate: feeRate,
    otpPlatformFeeAmount: feeAmount,
    buyerRewardShareRate: rewardShareRate,
    buyerRewardAmount: rewardAmount,
    tdsWithholdingAmount: tds,
    debitNoteAdjustments: debits,
    creditNoteAdjustments: credits,
    netSupplierDisbursement,
    isConserved,
  };
}

/**
 * Authoritatively evaluates settlement prerequisites against procurement state.
 */
export function evaluateSettlementPrerequisites(params: {
  poStatus: string;
  supplierLifecycleTier: string; // Must be OTP_VERIFIED or GST_VERIFIED
  isPoAcceptedBySupplier: boolean;
  inspectionStatus: string;      // Must be PASSED or COMPLETED
  invoiceStatus: string;         // Must be APPROVED or PARTIALLY_PAID
  isSpendAuthorized: boolean;
  isAlreadySettled: boolean;
}): SettlementPrerequisitesCheck {
  const blockingReasons: string[] = [];

  const validPoStates = ['ISSUED', 'IN_PROGRESS', 'FULFILLED', 'INVOICED', 'PARTIALLY_PAID'];
  const isPoValid = validPoStates.includes(params.poStatus.toUpperCase());
  if (!isPoValid) {
    blockingReasons.push(`Purchase order is in status ${params.poStatus}, not eligible for settlement.`);
  }

  const verifiedTiers = ['OTP_VERIFIED', 'GST_VERIFIED', 'ACTIVE', 'VERIFIED'];
  const isSupplierVerified = verifiedTiers.includes(params.supplierLifecycleTier.toUpperCase());
  if (!isSupplierVerified) {
    blockingReasons.push(
      `Supplier is in unverified tier (${params.supplierLifecycleTier}). Stage 2 KYC verification gate required before settlement (PA-02 / R2-08).`,
    );
  }

  if (!params.isPoAcceptedBySupplier) {
    blockingReasons.push('Supplier has not accepted the Purchase Order terms and fee disclosure.');
  }

  const validInspectionStates = ['PASSED', 'COMPLETED', 'ACCEPTED', 'NOT_APPLICABLE'];
  const isInspectionComplete = validInspectionStates.includes(params.inspectionStatus.toUpperCase());
  if (!isInspectionComplete) {
    blockingReasons.push(`Quality inspection status is ${params.inspectionStatus}; must be PASSED before final disbursement.`);
  }

  const validInvoiceStates = ['APPROVED', 'PARTIALLY_PAID', 'VERIFIED'];
  const isInvoiceApproved = validInvoiceStates.includes(params.invoiceStatus.toUpperCase());
  if (!isInvoiceApproved) {
    blockingReasons.push(`Invoice status is ${params.invoiceStatus}; must be APPROVED by authorized buyer before disbursement.`);
  }

  if (!params.isSpendAuthorized) {
    blockingReasons.push('Financial spend authorization or delegation approval is absent or expired.');
  }

  if (params.isAlreadySettled) {
    blockingReasons.push('This purchase order invoice has already been fully settled and reconciled.');
  }

  const canExecuteSettlement =
    isPoValid &&
    isSupplierVerified &&
    params.isPoAcceptedBySupplier &&
    isInspectionComplete &&
    isInvoiceApproved &&
    params.isSpendAuthorized &&
    !params.isAlreadySettled;

  return {
    isPoValid,
    isSupplierVerified,
    isPoAccepted: params.isPoAcceptedBySupplier,
    isInspectionComplete,
    isInvoiceApproved,
    isSpendAuthorized: params.isSpendAuthorized,
    isAlreadySettled: params.isAlreadySettled,
    canExecuteSettlement,
    blockingReasons,
  };
}

/**
 * Builds an authoritative, tamper-evident settlement certificate with SHA-256 digital seal.
 */
export function buildAuthoritativeSettlementCertificate(params: {
  purchaseOrderId: string;
  poNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  buyerOrganizationId: string;
  buyerOrganizationName: string;
  supplierId: string;
  supplierName: string;
  supplierGstin?: string | null;
  breakdown: FinancialSegregationBreakdown;
  paymentReference?: string | null;
  bankUtr?: string | null;
  reconciliationStatus?: 'MATCHED' | 'PARTIAL' | 'UNRECONCILED' | 'EXCEPTION';
  authorizedBy: string;
  signingSecret?: string;
}): AuthoritativeSettlementCertificate {
  const now = new Date().toISOString();
  const certId = `SETTLE-${params.purchaseOrderId.slice(0, 8).toUpperCase()}-${now.replace(/[-:T.Z]/g, '').slice(0, 14)}`;

  const canonicalPayload = JSON.stringify({
    certId,
    poId: params.purchaseOrderId,
    poNumber: params.poNumber,
    invId: params.invoiceId,
    invNumber: params.invoiceNumber,
    buyerOrgId: params.buyerOrganizationId,
    supplierId: params.supplierId,
    breakdown: params.breakdown,
    bankUtr: params.bankUtr || null,
    authorizedBy: params.authorizedBy,
    issuedAt: now,
  });

  const secret = params.signingSecret || 'OTP_CANONICAL_SETTLEMENT_SEAL_SECRET_2026';
  const digitalSealSha256 = computeDeterministicHmac(secret, canonicalPayload);

  return {
    certificateId: certId,
    purchaseOrderId: params.purchaseOrderId,
    poNumber: params.poNumber,
    invoiceId: params.invoiceId,
    invoiceNumber: params.invoiceNumber,
    buyerOrganizationId: params.buyerOrganizationId,
    buyerOrganizationName: params.buyerOrganizationName,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    supplierGstin: params.supplierGstin || null,
    breakdown: params.breakdown,
    paymentReference: params.paymentReference || null,
    bankUtr: params.bankUtr || null,
    reconciliationStatus: params.reconciliationStatus || 'MATCHED',
    issuedAt: now,
    authorizedBy: params.authorizedBy,
    digitalSealSha256,
  };
}
