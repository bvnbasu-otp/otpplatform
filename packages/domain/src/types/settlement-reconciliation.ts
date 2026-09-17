/**
 * OTP Phase 5C.5: Settlement Reconciliation & Financial Exception Domain Model
 *
 * Provides authoritative reconciliation read model tracking, mismatch classification,
 * variance calculations, and immutable financial exception management.
 */

export type SettlementReconciliationStatus =
  | 'UNRECONCILED'
  | 'MATCHED'
  | 'PARTIAL'
  | 'MISMATCH'
  | 'DISPUTED'
  | 'RESOLVED';

export type SettlementDiscrepancyType =
  | 'NONE'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'UTR_AMOUNT_MISMATCH'
  | 'TDS_MISMATCH'
  | 'FEE_MISMATCH'
  | 'ALLOCATION_MISMATCH'
  | 'DUPLICATE_UTR'
  | 'MISSING_UTR'
  | 'EXCESS_ALLOCATION'
  | 'UNDER_ALLOCATION'
  | 'UNKNOWN';

export type SettlementExceptionStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED';

export type SettlementExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SettlementReconciliationRecord {
  id: string;
  organizationId: string;
  supplierId: string;
  purchaseOrderId: string;
  invoiceId: string;
  paymentId?: string | null;
  invoiceGrossAmount: number;
  adjustedGrossAmount: number;
  tdsAmount: number;
  platformFeeAmount: number;
  paidAllocatedAmount: number;
  supplierNetSettlementAmount: number;
  utrNumber?: string | null;
  utrClearedAmount?: number | null;
  varianceAmount: number;
  status: SettlementReconciliationStatus;
  discrepancyType: SettlementDiscrepancyType;
  discrepancyDetails?: string | null;
  notes?: string | null;
  reconciledAt?: string | null;
  reconciledBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SettlementExceptionEventType =
  | 'CREATED'
  | 'ASSIGNED'
  | 'INVESTIGATION_NOTE'
  | 'STATUS_CHANGE'
  | 'RESOLVED'
  | 'REOPENED';

export interface SettlementExceptionEvent {
  id: string;
  exceptionId: string;
  eventType: SettlementExceptionEventType;
  fromStatus?: SettlementExceptionStatus | null;
  toStatus?: SettlementExceptionStatus | null;
  notes?: string | null;
  actorId?: string | null;
  createdAt: string;
}

export interface SettlementExceptionRecord {
  id: string;
  organizationId: string;
  reconciliationId: string;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  exceptionType: SettlementDiscrepancyType;
  severity: SettlementExceptionSeverity;
  status: SettlementExceptionStatus;
  amountInDispute: number;
  reason: string;
  resolutionNotes?: string | null;
  assignedTo?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  events?: SettlementExceptionEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationEvaluationParams {
  invoiceGrossAmount: number;
  debitAdjustments?: number;
  creditAdjustments?: number;
  tdsAmount?: number;
  platformFeeAmount?: number;
  paidAllocatedAmount: number;
  utrNumber?: string | null;
  utrClearedAmount?: number | null;
  existingUtrsInOrg?: string[];
  currentReconciliationId?: string;
}

export interface ReconciliationEvaluationResult {
  invoiceGrossAmount: number;
  adjustedGrossAmount: number;
  tdsAmount: number;
  platformFeeAmount: number;
  paidAllocatedAmount: number;
  supplierNetSettlementAmount: number;
  expectedNetPayment: number;
  utrClearedAmount: number | null;
  varianceAmount: number;
  status: SettlementReconciliationStatus;
  discrepancyType: SettlementDiscrepancyType;
  discrepancyDetails: string;
  requiresException: boolean;
  exceptionSeverity: SettlementExceptionSeverity;
}

/**
 * Authoritative settlement reconciliation evaluation & discrepancy classification.
 */
export function evaluateSettlementReconciliation(
  params: ReconciliationEvaluationParams,
): ReconciliationEvaluationResult {
  const gross = Math.round(Number(params.invoiceGrossAmount || 0) * 100) / 100;
  const debits = Math.round(Number(params.debitAdjustments || 0) * 100) / 100;
  const credits = Math.round(Number(params.creditAdjustments || 0) * 100) / 100;
  const tds = Math.round(Number(params.tdsAmount || 0) * 100) / 100;
  const fee = Math.round(Number(params.platformFeeAmount || 0) * 100) / 100;
  const paid = Math.round(Number(params.paidAllocatedAmount || 0) * 100) / 100;

  const adjustedGross = Math.round((gross - debits + credits) * 100) / 100;
  const expectedNetPayment = Math.max(0, Math.round((adjustedGross - tds - fee) * 100) / 100);
  const supplierNetSettlement = expectedNetPayment;

  const utrCleared =
    params.utrClearedAmount !== undefined && params.utrClearedAmount !== null
      ? Math.round(Number(params.utrClearedAmount) * 100) / 100
      : null;

  const utr = (params.utrNumber || '').trim().toUpperCase();

  // 1. Check Duplicate UTR
  if (utr && params.existingUtrsInOrg && params.existingUtrsInOrg.length > 0) {
    const isDuplicate = params.existingUtrsInOrg.some((u) => u.trim().toUpperCase() === utr);
    if (isDuplicate) {
      return {
        invoiceGrossAmount: gross,
        adjustedGrossAmount: adjustedGross,
        tdsAmount: tds,
        platformFeeAmount: fee,
        paidAllocatedAmount: paid,
        supplierNetSettlementAmount: supplierNetSettlement,
        expectedNetPayment,
        utrClearedAmount: utrCleared,
        varianceAmount: utrCleared !== null ? Math.round(Math.abs(utrCleared - expectedNetPayment) * 100) / 100 : 0,
        status: 'MISMATCH',
        discrepancyType: 'DUPLICATE_UTR',
        discrepancyDetails: `Bank UTR ${utr} is already associated with another reconciled transaction in this organization.`,
        requiresException: true,
        exceptionSeverity: 'HIGH',
      };
    }
  }

  // 2. Excess Allocation Check
  if (paid > expectedNetPayment) {
    const excess = Math.round((paid - expectedNetPayment) * 100) / 100;
    return {
      invoiceGrossAmount: gross,
      adjustedGrossAmount: adjustedGross,
      tdsAmount: tds,
      platformFeeAmount: fee,
      paidAllocatedAmount: paid,
      supplierNetSettlementAmount: supplierNetSettlement,
      expectedNetPayment,
      utrClearedAmount: utrCleared,
      varianceAmount: excess,
      status: 'MISMATCH',
      discrepancyType: 'EXCESS_ALLOCATION',
      discrepancyDetails: `Paid allocation (₹${paid}) exceeds net settlement obligation (₹${expectedNetPayment}) by ₹${excess}.`,
      requiresException: true,
      exceptionSeverity: 'HIGH',
    };
  }

  // 3. UTR Amount vs Expected / Paid Mismatch Check
  if (utrCleared !== null) {
    const diff = Math.round((utrCleared - paid) * 100) / 100;
    if (Math.abs(diff) > 0.01) {
      return {
        invoiceGrossAmount: gross,
        adjustedGrossAmount: adjustedGross,
        tdsAmount: tds,
        platformFeeAmount: fee,
        paidAllocatedAmount: paid,
        supplierNetSettlementAmount: supplierNetSettlement,
        expectedNetPayment,
        utrClearedAmount: utrCleared,
        varianceAmount: Math.abs(diff),
        status: 'MISMATCH',
        discrepancyType: 'UTR_AMOUNT_MISMATCH',
        discrepancyDetails: `Bank cleared amount (₹${utrCleared}) differs from system recorded payment (₹${paid}) by ₹${Math.abs(diff)}.`,
        requiresException: true,
        exceptionSeverity: Math.abs(diff) > 1000 ? 'CRITICAL' : 'MEDIUM',
      };
    }
  }

  // 4. Partial Allocation Check
  if (paid < expectedNetPayment && paid > 0) {
    const under = Math.round((expectedNetPayment - paid) * 100) / 100;
    return {
      invoiceGrossAmount: gross,
      adjustedGrossAmount: adjustedGross,
      tdsAmount: tds,
      platformFeeAmount: fee,
      paidAllocatedAmount: paid,
      supplierNetSettlementAmount: supplierNetSettlement,
      expectedNetPayment,
      utrClearedAmount: utrCleared,
      varianceAmount: under,
      status: 'PARTIAL',
      discrepancyType: 'UNDER_ALLOCATION',
      discrepancyDetails: `Partial settlement: ₹${paid} paid out of ₹${expectedNetPayment} net obligation. Remaining: ₹${under}.`,
      requiresException: false,
      exceptionSeverity: 'LOW',
    };
  }

  // 5. Zero Paid -> UNRECONCILED
  if (paid === 0) {
    return {
      invoiceGrossAmount: gross,
      adjustedGrossAmount: adjustedGross,
      tdsAmount: tds,
      platformFeeAmount: fee,
      paidAllocatedAmount: 0,
      supplierNetSettlementAmount: supplierNetSettlement,
      expectedNetPayment,
      utrClearedAmount: utrCleared,
      varianceAmount: expectedNetPayment,
      status: 'UNRECONCILED',
      discrepancyType: 'NONE',
      discrepancyDetails: 'Settlement pending disbursement.',
      requiresException: false,
      exceptionSeverity: 'LOW',
    };
  }

  // 6. Missing UTR when payment is fully allocated
  if (paid >= expectedNetPayment && !utr && utrCleared === null) {
    return {
      invoiceGrossAmount: gross,
      adjustedGrossAmount: adjustedGross,
      tdsAmount: tds,
      platformFeeAmount: fee,
      paidAllocatedAmount: paid,
      supplierNetSettlementAmount: supplierNetSettlement,
      expectedNetPayment,
      utrClearedAmount: null,
      varianceAmount: 0,
      status: 'UNRECONCILED',
      discrepancyType: 'MISSING_UTR',
      discrepancyDetails: 'Payment recorded but bank remittance UTR not yet provided.',
      requiresException: false,
      exceptionSeverity: 'LOW',
    };
  }

  // 7. Exact MATCHED
  return {
    invoiceGrossAmount: gross,
    adjustedGrossAmount: adjustedGross,
    tdsAmount: tds,
    platformFeeAmount: fee,
    paidAllocatedAmount: paid,
    supplierNetSettlementAmount: supplierNetSettlement,
    expectedNetPayment,
    utrClearedAmount: utrCleared,
    varianceAmount: 0,
    status: 'MATCHED',
    discrepancyType: 'NONE',
    discrepancyDetails: 'Settlement fully matched and reconciled against bank clearance.',
    requiresException: false,
    exceptionSeverity: 'LOW',
  };
}

/**
 * Validates exception resolution rules.
 */
export function canResolveSettlementException(
  exception: SettlementExceptionRecord,
  resolutionNotes: string,
): { allowed: boolean; reason?: string } {
  if (exception.status === 'RESOLVED') {
    return { allowed: false, reason: 'Settlement exception is already resolved' };
  }
  if (!resolutionNotes || resolutionNotes.trim().length < 5) {
    return { allowed: false, reason: 'Resolution notes must provide at least 5 characters of explanation' };
  }
  return { allowed: true };
}
