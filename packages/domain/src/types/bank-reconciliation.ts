export type BankReconciliationStatus =
  | 'UNRECONCILED'
  | 'MATCHED'
  | 'DISCREPANCY'
  | 'RESOLVED'
  | 'RECONCILED';

export type DiscrepancyType =
  | 'AMOUNT_MISMATCH'
  | 'DATE_DRIFT'
  | 'UNKNOWN_UTR'
  | 'DUPLICATE_UTR'
  | 'BENEFICIARY_MISMATCH'
  | 'NONE';

export interface BankRemittanceAdvice {
  utrNumber: string;
  bankReference?: string | null;
  bankName?: string | null;
  senderAccount?: string | null;
  beneficiaryAccount?: string | null;
  clearedAmount: number;
  clearedAt: string;
  valueDate?: string | null;
  remarks?: string | null;
}

export interface BuyerPaymentInfo {
  id: string;
  amount: number;
  recordedAt?: string | null;
  reference?: string | null;
  paymentReference?: string | null;
}

export interface BankReconciliationRecord {
  id: string;
  organizationId: string;
  paymentId?: string | null;
  utrNumber: string;
  bankReference?: string | null;
  bankName?: string | null;
  buyerRecordedAmount: number;
  bankClearedAmount: number;
  amountDifference: number; // buyerRecorded - bankCleared
  buyerRecordedDate?: string | null;
  bankClearedDate: string;
  dateDriftDays: number;
  status: BankReconciliationStatus;
  discrepancyType: DiscrepancyType;
  discrepancyDetails?: string | null;
  resolutionNotes?: string | null;
  reconciledBy?: string | null;
  reconciledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BankReconciliationSummary {
  totalRecords: number;
  totalClearedAmount: number;
  totalBuyerAmount: number;
  matchedCount: number;
  reconciledCount: number;
  discrepancyCount: number;
  unreconciledCount: number;
  resolvedCount: number;
  totalDiscrepancyAmount: number;
}

export interface ReconcileUtrParams {
  organizationId: string;
  buyerPayment?: BuyerPaymentInfo | null;
  bankAdvice: BankRemittanceAdvice;
  existingUtrRecords?: Array<{ utrNumber: string; id?: string }>;
  maxAllowedDateDriftDays?: number; // Defaults to 7 days
  recordId?: string;
  reconciledBy?: string | null;
}

/**
 * Normalizes UTR (Unique Transaction Reference) string.
 */
export function normalizeUtr(utr: string): string {
  return utr.trim().toUpperCase().replace(/[\s-_]/g, '');
}

/**
 * Reconciles a bank remittance advice record against internal buyer payment data.
 * Detects:
 * 1. UNKNOWN_UTR (Bank cleared a payment not found in buyer books)
 * 2. DUPLICATE_UTR (Same UTR cleared multiple times)
 * 3. AMOUNT_MISMATCH (Buyer recorded amount != Bank cleared amount)
 * 4. DATE_DRIFT (Clearance date deviates beyond allowable threshold)
 * 5. MATCHED / RECONCILED (Exact match on amount and acceptable timing)
 */
export function reconcileBankRemittance(
  params: ReconcileUtrParams,
): BankReconciliationRecord {
  const cleanUtr = normalizeUtr(params.bankAdvice.utrNumber);
  const bankClearedAmount =
    Math.round(Number(params.bankAdvice.clearedAmount || 0) * 100) / 100;
  const bankClearedDate =
    params.bankAdvice.clearedAt || new Date().toISOString();
  const maxDrift = params.maxAllowedDateDriftDays ?? 7;

  const now = new Date().toISOString();
  const recordId = params.recordId || `rec-${Date.now()}`;

  // 1. Check for Duplicate UTR in existing records
  if (params.existingUtrRecords && params.existingUtrRecords.length > 0) {
    const isDuplicate = params.existingUtrRecords.some(
      (r) =>
        normalizeUtr(r.utrNumber) === cleanUtr &&
        (!params.recordId || r.id !== params.recordId),
    );
    if (isDuplicate) {
      return {
        id: recordId,
        organizationId: params.organizationId,
        paymentId: params.buyerPayment?.id || null,
        utrNumber: cleanUtr,
        bankReference: params.bankAdvice.bankReference || null,
        bankName: params.bankAdvice.bankName || null,
        buyerRecordedAmount: params.buyerPayment?.amount ?? 0,
        bankClearedAmount,
        amountDifference:
          Math.round(
            ((params.buyerPayment?.amount ?? 0) - bankClearedAmount) * 100,
          ) / 100,
        buyerRecordedDate: params.buyerPayment?.recordedAt || null,
        bankClearedDate,
        dateDriftDays: 0,
        status: 'DISCREPANCY',
        discrepancyType: 'DUPLICATE_UTR',
        discrepancyDetails: `Duplicate UTR ${cleanUtr} detected across remittance batches`,
        createdAt: now,
        updatedAt: now,
      };
    }
  }

  // 2. Check for Unknown UTR (No matching payment found in buyer books)
  if (!params.buyerPayment) {
    return {
      id: recordId,
      organizationId: params.organizationId,
      paymentId: null,
      utrNumber: cleanUtr,
      bankReference: params.bankAdvice.bankReference || null,
      bankName: params.bankAdvice.bankName || null,
      buyerRecordedAmount: 0,
      bankClearedAmount,
      amountDifference: Math.round((0 - bankClearedAmount) * 100) / 100,
      buyerRecordedDate: null,
      bankClearedDate,
      dateDriftDays: 0,
      status: 'DISCREPANCY',
      discrepancyType: 'UNKNOWN_UTR',
      discrepancyDetails: `UTR ${cleanUtr} cleared ₹${bankClearedAmount} at bank but has no matching buyer payment record`,
      createdAt: now,
      updatedAt: now,
    };
  }

  const buyerAmount =
    Math.round(Number(params.buyerPayment.amount || 0) * 100) / 100;
  const amountDiff = Math.round((buyerAmount - bankClearedAmount) * 100) / 100;

  // Calculate date drift in days
  let dateDriftDays = 0;
  if (params.buyerPayment.recordedAt && bankClearedDate) {
    const d1 = new Date(params.buyerPayment.recordedAt).getTime();
    const d2 = new Date(bankClearedDate).getTime();
    if (!isNaN(d1) && !isNaN(d2)) {
      dateDriftDays = Math.round(
        Math.abs(d2 - d1) / (1000 * 60 * 60 * 24),
      );
    }
  }

  // 3. Amount Mismatch Check
  if (Math.abs(amountDiff) > 0.01) {
    return {
      id: recordId,
      organizationId: params.organizationId,
      paymentId: params.buyerPayment.id,
      utrNumber: cleanUtr,
      bankReference: params.bankAdvice.bankReference || null,
      bankName: params.bankAdvice.bankName || null,
      buyerRecordedAmount: buyerAmount,
      bankClearedAmount,
      amountDifference: amountDiff,
      buyerRecordedDate: params.buyerPayment.recordedAt || null,
      bankClearedDate,
      dateDriftDays,
      status: 'DISCREPANCY',
      discrepancyType: 'AMOUNT_MISMATCH',
      discrepancyDetails: `Amount mismatch: Buyer recorded ₹${buyerAmount} vs Bank cleared ₹${bankClearedAmount} (Diff: ₹${amountDiff})`,
      createdAt: now,
      updatedAt: now,
    };
  }

  // 4. Date Drift Check
  if (dateDriftDays > maxDrift) {
    return {
      id: recordId,
      organizationId: params.organizationId,
      paymentId: params.buyerPayment.id,
      utrNumber: cleanUtr,
      bankReference: params.bankAdvice.bankReference || null,
      bankName: params.bankAdvice.bankName || null,
      buyerRecordedAmount: buyerAmount,
      bankClearedAmount,
      amountDifference: 0,
      buyerRecordedDate: params.buyerPayment.recordedAt || null,
      bankClearedDate,
      dateDriftDays,
      status: 'DISCREPANCY',
      discrepancyType: 'DATE_DRIFT',
      discrepancyDetails: `Date drift of ${dateDriftDays} days exceeds allowable maximum of ${maxDrift} days`,
      createdAt: now,
      updatedAt: now,
    };
  }

  // 5. Clean Match -> MATCHED / RECONCILED
  return {
    id: recordId,
    organizationId: params.organizationId,
    paymentId: params.buyerPayment.id,
    utrNumber: cleanUtr,
    bankReference: params.bankAdvice.bankReference || null,
    bankName: params.bankAdvice.bankName || null,
    buyerRecordedAmount: buyerAmount,
    bankClearedAmount,
    amountDifference: 0,
    buyerRecordedDate: params.buyerPayment.recordedAt || null,
    bankClearedDate,
    dateDriftDays,
    status: 'MATCHED',
    discrepancyType: 'NONE',
    discrepancyDetails: null,
    reconciledBy: params.reconciledBy || null,
    reconciledAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Calculates aggregate summary metrics across bank reconciliation records.
 */
export function calculateReconciliationSummary(
  records: BankReconciliationRecord[],
): BankReconciliationSummary {
  let totalCleared = 0;
  let totalBuyer = 0;
  let matched = 0;
  let reconciled = 0;
  let discrepancy = 0;
  let unreconciled = 0;
  let resolved = 0;
  let totalDiscrepancyAmount = 0;

  for (const r of records) {
    totalCleared += r.bankClearedAmount || 0;
    totalBuyer += r.buyerRecordedAmount || 0;

    if (r.status === 'MATCHED') matched++;
    else if (r.status === 'RECONCILED') reconciled++;
    else if (r.status === 'DISCREPANCY') {
      discrepancy++;
      totalDiscrepancyAmount += Math.abs(r.amountDifference || 0);
    } else if (r.status === 'UNRECONCILED') unreconciled++;
    else if (r.status === 'RESOLVED') resolved++;
  }

  return {
    totalRecords: records.length,
    totalClearedAmount: Math.round(totalCleared * 100) / 100,
    totalBuyerAmount: Math.round(totalBuyer * 100) / 100,
    matchedCount: matched,
    reconciledCount: reconciled,
    discrepancyCount: discrepancy,
    unreconciledCount: unreconciled,
    resolvedCount: resolved,
    totalDiscrepancyAmount: Math.round(totalDiscrepancyAmount * 100) / 100,
  };
}
