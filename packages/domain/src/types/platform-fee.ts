/**
 * OTP Phase 5C.5: Supplier Platform Fee at Settlement Domain Model
 *
 * Implements versioned commercial fee policies, deterministic exact decimal calculations,
 * PO fee snapshotting, fee transaction lifecycles, and financial conservation invariants.
 */

export type PlatformFeeType = 'PERCENTAGE' | 'FLAT' | 'TIERED';
export type PlatformFeePolicyStatus = 'ACTIVE' | 'SUPERSEDED' | 'DEPRECATED';

export type PlatformFeeTransactionStatus =
  | 'CALCULATED'
  | 'DISCLOSED'
  | 'ACKNOWLEDGED'
  | 'APPLIED'
  | 'SETTLED'
  | 'VOIDED'
  | 'REVERSED'
  | 'DISPUTED';

export interface PlatformFeePolicy {
  id: string;
  policyVersion: number;
  feeType: PlatformFeeType;
  rate: number; // e.g. 0.50 for 0.5%
  minFeeAmount?: number;
  maxFeeAmount?: number;
  effectiveFrom: string; // ISO timestamp
  effectiveTo?: string | null; // ISO timestamp or null if active
  status: PlatformFeePolicyStatus;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PoFeeSnapshot {
  id: string;
  purchaseOrderId: string;
  policyId: string;
  policyVersion: number;
  feeType: PlatformFeeType;
  rate: number;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  isAcknowledged: boolean;
  estimatedFeeAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFeeTransaction {
  id: string;
  organizationId: string;
  supplierId: string;
  purchaseOrderId: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  paymentAllocationId?: string | null;
  policyId: string;
  policyVersion: number;
  grossAmount: number;
  feeRate: number;
  feeAmount: number;
  netSettlementAmount: number;
  status: PlatformFeeTransactionStatus;
  notes?: string | null;
  settledAt?: string | null;
  voidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeeCalculationParams {
  grossAmount: number;
  rate: number; // percentage, e.g. 0.5 for 0.5%
  feeType?: PlatformFeeType;
  minFee?: number;
  maxFee?: number;
}

export interface FeeCalculationResult {
  grossAmount: number;
  feeRate: number;
  feeAmount: number;
  netSettlementAmount: number;
  effectiveRate: number;
}

export interface SettlementConservationParams {
  grossInvoiceAmount: number;
  debitAdjustments?: number;
  creditAdjustments?: number;
  tdsAmount?: number;
  platformFeeAmount?: number;
}

export interface SettlementConservationResult {
  grossInvoiceAmount: number;
  adjustedGrossAmount: number;
  tdsAmount: number;
  platformFeeAmount: number;
  supplierNetSettlement: number;
  totalOutflowObligation: number;
  isConserved: boolean;
}

/**
 * Calculates deterministic platform fee with exact 2-decimal paise rounding.
 * Invariant: feeAmount >= 0, feeAmount <= grossAmount, netSettlementAmount >= 0.
 */
export function calculatePlatformFee(
  params: FeeCalculationParams,
): FeeCalculationResult {
  const gross = Math.round(Number(params.grossAmount || 0) * 100) / 100;
  if (gross <= 0) {
    return {
      grossAmount: 0,
      feeRate: params.rate,
      feeAmount: 0,
      netSettlementAmount: 0,
      effectiveRate: 0,
    };
  }

  const rate = Number(params.rate || 0);
  if (rate < 0) {
    throw new Error('Platform fee rate cannot be negative');
  }

  let rawFee = (gross * rate) / 100;
  if (params.minFee !== undefined && rawFee < params.minFee) {
    rawFee = params.minFee;
  }
  if (params.maxFee !== undefined && rawFee > params.maxFee) {
    rawFee = params.maxFee;
  }

  let feeAmount = Math.round(rawFee * 100) / 100;

  // Invariant: fee cannot exceed gross settlement
  if (feeAmount > gross) {
    feeAmount = gross;
  }

  const netSettlementAmount = Math.round((gross - feeAmount) * 100) / 100;
  const effectiveRate =
    gross > 0 ? Math.round(((feeAmount / gross) * 100) * 10000) / 10000 : 0;

  return {
    grossAmount: gross,
    feeRate: rate,
    feeAmount,
    netSettlementAmount: Math.max(0, netSettlementAmount),
    effectiveRate,
  };
}

/**
 * Computes the full financial conservation chain for a settlement.
 * Chain:
 *   Adjusted Gross = Gross Invoice - Debit Notes + Credit Notes
 *   Supplier Net Settlement = Adjusted Gross - TDS - Platform Fee
 *   Total Outflow/Obligation = TDS + Platform Fee + Supplier Net Settlement
 */
export function calculateSettlementConservation(
  params: SettlementConservationParams,
): SettlementConservationResult {
  const gross = Math.round(Number(params.grossInvoiceAmount || 0) * 100) / 100;
  const debits = Math.round(Number(params.debitAdjustments || 0) * 100) / 100;
  const credits = Math.round(Number(params.creditAdjustments || 0) * 100) / 100;
  const tds = Math.round(Number(params.tdsAmount || 0) * 100) / 100;
  const fee = Math.round(Number(params.platformFeeAmount || 0) * 100) / 100;

  const adjustedGross = Math.round((gross - debits + credits) * 100) / 100;
  const rawNet = Math.round((adjustedGross - tds - fee) * 100) / 100;
  const supplierNetSettlement = Math.max(0, rawNet);

  const totalOutflowObligation = Math.round((tds + fee + supplierNetSettlement) * 100) / 100;
  const isConserved = Math.abs(totalOutflowObligation - adjustedGross) < 0.001;

  return {
    grossInvoiceAmount: gross,
    adjustedGrossAmount: adjustedGross,
    tdsAmount: tds,
    platformFeeAmount: fee,
    supplierNetSettlement,
    totalOutflowObligation,
    isConserved,
  };
}

/**
 * Validates whether a state transition for PlatformFeeTransaction is permitted.
 */
export function canTransitionFeeTransaction(
  current: PlatformFeeTransactionStatus,
  next: PlatformFeeTransactionStatus,
): boolean {
  if (current === next) return true;

  const allowedTransitions: Record<PlatformFeeTransactionStatus, PlatformFeeTransactionStatus[]> = {
    CALCULATED: ['DISCLOSED', 'VOIDED'],
    DISCLOSED: ['ACKNOWLEDGED', 'VOIDED'],
    ACKNOWLEDGED: ['APPLIED', 'VOIDED', 'DISPUTED'],
    APPLIED: ['SETTLED', 'REVERSED', 'DISPUTED', 'VOIDED'],
    SETTLED: ['REVERSED', 'DISPUTED'],
    VOIDED: [],
    REVERSED: [],
    DISPUTED: ['ACKNOWLEDGED', 'APPLIED', 'VOIDED', 'REVERSED'],
  };

  return allowedTransitions[current]?.includes(next) ?? false;
}
