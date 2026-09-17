/**
 * Journal Posting Rules & Business Event Mappers (Phase 5D)
 * Translates authorized procurement and settlement business events into strictly balanced double-entry journal entries.
 */

import type { JournalEntryType, JournalLine } from './journal-entry';

export interface AccountCodeLookup {
  bankAccountId: string;
  accountsPayableId: string;
  procurementExpenseId: string;
  advancesToSuppliersId: string;
  tdsPayableId: string;
  gstInputCgstId?: string;
  gstInputSgstId?: string;
  gstInputIgstId?: string;
  gstInputUtgstId?: string;
  platformFeeRevenueId: string;
  settlementClearingId: string;
}

export interface GenerateInvoiceObligationParams {
  organizationId: string;
  periodId: string;
  invoiceId: string;
  invoiceNumber: string;
  purchaseOrderId?: string;
  supplierId: string;
  baseAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  utgstAmount?: number;
  totalAmount: number;
  entryDate: string;
  accounts: AccountCodeLookup;
}

export interface GeneratePaymentDisbursementParams {
  organizationId: string;
  periodId: string;
  paymentId: string;
  paymentReference?: string;
  purchaseOrderId?: string;
  supplierId: string;
  netPaidAmount: number;
  tdsAmount?: number;
  platformFeeAmount?: number;
  entryDate: string;
  accounts: AccountCodeLookup;
}

export interface GenerateAdvancePaymentParams {
  organizationId: string;
  periodId: string;
  paymentId: string;
  paymentReference?: string;
  purchaseOrderId?: string;
  supplierId: string;
  advanceAmount: number;
  entryDate: string;
  accounts: AccountCodeLookup;
}

export interface GenerateAdvanceAllocationParams {
  organizationId: string;
  periodId: string;
  allocationId: string;
  paymentId: string;
  invoiceId: string;
  purchaseOrderId?: string;
  supplierId: string;
  allocatedAmount: number;
  entryDate: string;
  accounts: AccountCodeLookup;
}

export interface GenerateCreditNoteParams {
  organizationId: string;
  periodId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  invoiceId?: string;
  purchaseOrderId?: string;
  supplierId: string;
  baseAdjustment: number;
  taxAdjustment: number;
  totalAdjustment: number;
  entryDate: string;
  accounts: AccountCodeLookup;
}

export interface GenerateDebitNoteParams {
  organizationId: string;
  periodId: string;
  debitNoteId: string;
  debitNoteNumber: string;
  invoiceId?: string;
  purchaseOrderId?: string;
  supplierId: string;
  baseAdjustment: number;
  taxAdjustment: number;
  totalAdjustment: number;
  entryDate: string;
  accounts: AccountCodeLookup;
}

export interface GeneratePlatformFeeParams {
  organizationId: string;
  periodId: string;
  feeTransactionId: string;
  purchaseOrderId?: string;
  invoiceId?: string;
  supplierId: string;
  feeAmount: number;
  entryDate: string;
  accounts: AccountCodeLookup;
}

export interface GeneratedJournalPayload {
  organizationId: string;
  periodId: string;
  entryDate: string;
  entryType: JournalEntryType;
  narration: string;
  sourceEntityType: string;
  sourceEntityId: string;
  idempotencyKey: string;
  lines: JournalLine[];
}

/**
 * 1. Invoice Obligation & Tax Accrual
 * DR: Procurement Expense (Base Amount)
 * DR: GST Input Tax Credit (CGST / SGST / IGST / UTGST)
 * CR: Accounts Payable (Total Invoiced Amount)
 */
export function buildInvoiceObligationJournal(
  params: GenerateInvoiceObligationParams,
): GeneratedJournalPayload {
  const base = Math.round(Number(params.baseAmount || 0) * 100) / 100;
  const cgst = Math.round(Number(params.cgstAmount || 0) * 100) / 100;
  const sgst = Math.round(Number(params.sgstAmount || 0) * 100) / 100;
  const igst = Math.round(Number(params.igstAmount || 0) * 100) / 100;
  const utgst = Math.round(Number(params.utgstAmount || 0) * 100) / 100;
  const total = Math.round(Number(params.totalAmount || (base + cgst + sgst + igst + utgst)) * 100) / 100;

  const lines: JournalLine[] = [];
  let lineNum = 1;

  // DR: Base Expense
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.procurementExpenseId,
    debitAmount: base,
    creditAmount: 0,
    currency: 'INR',
    description: `Procurement base expense for Invoice ${params.invoiceNumber}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    invoiceId: params.invoiceId,
  });

  // DR: Split Tax components
  if (cgst > 0 && params.accounts.gstInputCgstId) {
    lines.push({
      lineNumber: lineNum++,
      accountId: params.accounts.gstInputCgstId,
      debitAmount: cgst,
      creditAmount: 0,
      currency: 'INR',
      description: `Input CGST credit for Invoice ${params.invoiceNumber}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    });
  }

  if (sgst > 0 && params.accounts.gstInputSgstId) {
    lines.push({
      lineNumber: lineNum++,
      accountId: params.accounts.gstInputSgstId,
      debitAmount: sgst,
      creditAmount: 0,
      currency: 'INR',
      description: `Input SGST credit for Invoice ${params.invoiceNumber}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    });
  }

  if (igst > 0 && params.accounts.gstInputIgstId) {
    lines.push({
      lineNumber: lineNum++,
      accountId: params.accounts.gstInputIgstId,
      debitAmount: igst,
      creditAmount: 0,
      currency: 'INR',
      description: `Input IGST credit for Invoice ${params.invoiceNumber}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    });
  }

  if (utgst > 0 && params.accounts.gstInputUtgstId) {
    lines.push({
      lineNumber: lineNum++,
      accountId: params.accounts.gstInputUtgstId,
      debitAmount: utgst,
      creditAmount: 0,
      currency: 'INR',
      description: `Input UTGST credit for Invoice ${params.invoiceNumber}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    });
  }

  // CR: Accounts Payable
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.accountsPayableId,
    debitAmount: 0,
    creditAmount: total,
    currency: 'INR',
    description: `Trade payable obligation to supplier for Invoice ${params.invoiceNumber}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    invoiceId: params.invoiceId,
  });

  return {
    organizationId: params.organizationId,
    periodId: params.periodId,
    entryDate: params.entryDate,
    entryType: 'INVOICE_OBLIGATION',
    narration: `Accrual of trade payable and input tax for Invoice ${params.invoiceNumber}`,
    sourceEntityType: 'INVOICE',
    sourceEntityId: params.invoiceId,
    idempotencyKey: `INV-OBLIGATION-${params.invoiceId}`,
    lines,
  };
}

/**
 * 2. Payment Settlement & Disbursement
 * DR: Accounts Payable (Gross Allocated / Settled)
 * CR: Bank Account (Net Amount Paid via Bank)
 * CR: TDS Payable (Statutory Withholding, if any)
 * CR: Settlement Clearing / Platform Fee Revenue (if deducted at source)
 */
export function buildPaymentDisbursementJournal(
  params: GeneratePaymentDisbursementParams,
): GeneratedJournalPayload {
  const netPaid = Math.round(Number(params.netPaidAmount || 0) * 100) / 100;
  const tds = Math.round(Number(params.tdsAmount || 0) * 100) / 100;
  const fee = Math.round(Number(params.platformFeeAmount || 0) * 100) / 100;
  const grossDebit = Math.round((netPaid + tds + fee) * 100) / 100;

  const lines: JournalLine[] = [];
  let lineNum = 1;

  // DR: Accounts Payable (Gross reduction)
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.accountsPayableId,
    debitAmount: grossDebit,
    creditAmount: 0,
    currency: 'INR',
    description: `Settlement of trade payable for Payment ${params.paymentReference || params.paymentId}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    paymentId: params.paymentId,
  });

  // CR: Bank Account (Net paid)
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.bankAccountId,
    debitAmount: 0,
    creditAmount: netPaid,
    currency: 'INR',
    description: `Net bank disbursement via ${params.paymentReference || 'Bank Transfer'}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    paymentId: params.paymentId,
  });

  // CR: TDS Payable (Statutory liability)
  if (tds > 0) {
    lines.push({
      lineNumber: lineNum++,
      accountId: params.accounts.tdsPayableId,
      debitAmount: 0,
      creditAmount: tds,
      currency: 'INR',
      description: `Statutory TDS withholding for Payment ${params.paymentReference || params.paymentId}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      paymentId: params.paymentId,
    });
  }

  // CR: Platform Fee Revenue / Clearing
  if (fee > 0) {
    lines.push({
      lineNumber: lineNum++,
      accountId: params.accounts.platformFeeRevenueId,
      debitAmount: 0,
      creditAmount: fee,
      currency: 'INR',
      description: `Platform fee deduction on settlement for Payment ${params.paymentReference || params.paymentId}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      paymentId: params.paymentId,
    });
  }

  return {
    organizationId: params.organizationId,
    periodId: params.periodId,
    entryDate: params.entryDate,
    entryType: 'PAYMENT_DISBURSEMENT',
    narration: `Settlement payment of ₹${netPaid.toFixed(2)} to supplier (Ref: ${params.paymentReference || params.paymentId})`,
    sourceEntityType: 'PAYMENT',
    sourceEntityId: params.paymentId,
    idempotencyKey: `PAY-DISBURSEMENT-${params.paymentId}`,
    lines,
  };
}

/**
 * 3. Advance Payment to Supplier
 * DR: Advances to Suppliers (Current Asset)
 * CR: Bank Account (Current Asset)
 */
export function buildAdvancePaymentJournal(
  params: GenerateAdvancePaymentParams,
): GeneratedJournalPayload {
  const amount = Math.round(Number(params.advanceAmount || 0) * 100) / 100;

  const lines: JournalLine[] = [
    {
      lineNumber: 1,
      accountId: params.accounts.advancesToSuppliersId,
      debitAmount: amount,
      creditAmount: 0,
      currency: 'INR',
      description: `Advance paid to supplier for PO ${params.purchaseOrderId || 'Procurement'}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      paymentId: params.paymentId,
    },
    {
      lineNumber: 2,
      accountId: params.accounts.bankAccountId,
      debitAmount: 0,
      creditAmount: amount,
      currency: 'INR',
      description: `Bank disbursement for supplier mobilization advance (Ref: ${params.paymentReference || params.paymentId})`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      paymentId: params.paymentId,
    },
  ];

  return {
    organizationId: params.organizationId,
    periodId: params.periodId,
    entryDate: params.entryDate,
    entryType: 'ADVANCE_PAYMENT',
    narration: `Supplier advance payment of ₹${amount.toFixed(2)} (Ref: ${params.paymentReference || params.paymentId})`,
    sourceEntityType: 'PAYMENT',
    sourceEntityId: params.paymentId,
    idempotencyKey: `ADV-PAYMENT-${params.paymentId}`,
    lines,
  };
}

/**
 * 4. Advance Allocation to Invoice
 * DR: Accounts Payable (Trade Payable extinguished)
 * CR: Advances to Suppliers (Advance Asset cleared)
 */
export function buildAdvanceAllocationJournal(
  params: GenerateAdvanceAllocationParams,
): GeneratedJournalPayload {
  const amount = Math.round(Number(params.allocatedAmount || 0) * 100) / 100;

  const lines: JournalLine[] = [
    {
      lineNumber: 1,
      accountId: params.accounts.accountsPayableId,
      debitAmount: amount,
      creditAmount: 0,
      currency: 'INR',
      description: `Settlement of invoice liability via advance allocation`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
      paymentId: params.paymentId,
    },
    {
      lineNumber: 2,
      accountId: params.accounts.advancesToSuppliersId,
      debitAmount: 0,
      creditAmount: amount,
      currency: 'INR',
      description: `Utilization of supplier advance against invoice`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
      paymentId: params.paymentId,
    },
  ];

  return {
    organizationId: params.organizationId,
    periodId: params.periodId,
    entryDate: params.entryDate,
    entryType: 'ADVANCE_ALLOCATION',
    narration: `Allocation of supplier advance of ₹${amount.toFixed(2)} to invoice`,
    sourceEntityType: 'PAYMENT_ALLOCATION',
    sourceEntityId: params.allocationId,
    idempotencyKey: `ADV-ALLOC-${params.allocationId}`,
    lines,
  };
}

/**
 * 5. Credit Note Adjustment
 * DR: Accounts Payable (Liability reduced)
 * CR: Procurement Expense (Expense reduced)
 * CR: GST Input Tax Credit (Input tax reversed)
 */
export function buildCreditNoteJournal(
  params: GenerateCreditNoteParams,
): GeneratedJournalPayload {
  const base = Math.round(Number(params.baseAdjustment || 0) * 100) / 100;
  const tax = Math.round(Number(params.taxAdjustment || 0) * 100) / 100;
  const total = Math.round(Number(params.totalAdjustment || (base + tax)) * 100) / 100;

  const lines: JournalLine[] = [];
  let lineNum = 1;

  // DR: Accounts Payable
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.accountsPayableId,
    debitAmount: total,
    creditAmount: 0,
    currency: 'INR',
    description: `Credit note reduction of trade payable for CN ${params.creditNoteNumber}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    invoiceId: params.invoiceId,
  });

  // CR: Procurement Expense
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.procurementExpenseId,
    debitAmount: 0,
    creditAmount: base,
    currency: 'INR',
    description: `Credit note reduction of procurement expense for CN ${params.creditNoteNumber}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    invoiceId: params.invoiceId,
  });

  // CR: GST Input Tax Credit
  if (tax > 0) {
    const taxAccId = params.accounts.gstInputCgstId || params.accounts.procurementExpenseId;
    lines.push({
      lineNumber: lineNum++,
      accountId: taxAccId,
      debitAmount: 0,
      creditAmount: tax,
      currency: 'INR',
      description: `Reversal of input tax on credit note for CN ${params.creditNoteNumber}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    });
  }

  return {
    organizationId: params.organizationId,
    periodId: params.periodId,
    entryDate: params.entryDate,
    entryType: 'CREDIT_NOTE_ADJUSTMENT',
    narration: `Credit note adjustment of ₹${total.toFixed(2)} (CN: ${params.creditNoteNumber})`,
    sourceEntityType: 'CREDIT_DEBIT_NOTE',
    sourceEntityId: params.creditNoteId,
    idempotencyKey: `CN-ADJUSTMENT-${params.creditNoteId}`,
    lines,
  };
}

/**
 * 6. Debit Note Adjustment
 * DR: Procurement Expense (Expense increased)
 * DR: GST Input Tax Credit (Input tax increased)
 * CR: Accounts Payable (Liability increased)
 */
export function buildDebitNoteJournal(
  params: GenerateDebitNoteParams,
): GeneratedJournalPayload {
  const base = Math.round(Number(params.baseAdjustment || 0) * 100) / 100;
  const tax = Math.round(Number(params.taxAdjustment || 0) * 100) / 100;
  const total = Math.round(Number(params.totalAdjustment || (base + tax)) * 100) / 100;

  const lines: JournalLine[] = [];
  let lineNum = 1;

  // DR: Procurement Expense
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.procurementExpenseId,
    debitAmount: base,
    creditAmount: 0,
    currency: 'INR',
    description: `Debit note additional procurement expense for DN ${params.debitNoteNumber}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    invoiceId: params.invoiceId,
  });

  // DR: GST Input Tax Credit
  if (tax > 0) {
    const taxAccId = params.accounts.gstInputCgstId || params.accounts.procurementExpenseId;
    lines.push({
      lineNumber: lineNum++,
      accountId: taxAccId,
      debitAmount: tax,
      creditAmount: 0,
      currency: 'INR',
      description: `Additional input tax on debit note for DN ${params.debitNoteNumber}`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    });
  }

  // CR: Accounts Payable
  lines.push({
    lineNumber: lineNum++,
    accountId: params.accounts.accountsPayableId,
    debitAmount: 0,
    creditAmount: total,
    currency: 'INR',
    description: `Debit note increase of trade payable for DN ${params.debitNoteNumber}`,
    supplierId: params.supplierId,
    purchaseOrderId: params.purchaseOrderId,
    invoiceId: params.invoiceId,
  });

  return {
    organizationId: params.organizationId,
    periodId: params.periodId,
    entryDate: params.entryDate,
    entryType: 'DEBIT_NOTE_ADJUSTMENT',
    narration: `Debit note adjustment of ₹${total.toFixed(2)} (DN: ${params.debitNoteNumber})`,
    sourceEntityType: 'CREDIT_DEBIT_NOTE',
    sourceEntityId: params.debitNoteId,
    idempotencyKey: `DN-ADJUSTMENT-${params.debitNoteId}`,
    lines,
  };
}

/**
 * 7. Platform Fee Recognition
 * DR: Settlement Clearing / Accounts Payable
 * CR: Platform Fee Revenue
 */
export function buildPlatformFeeJournal(
  params: GeneratePlatformFeeParams,
): GeneratedJournalPayload {
  const fee = Math.round(Number(params.feeAmount || 0) * 100) / 100;

  const lines: JournalLine[] = [
    {
      lineNumber: 1,
      accountId: params.accounts.settlementClearingId || params.accounts.accountsPayableId,
      debitAmount: fee,
      creditAmount: 0,
      currency: 'INR',
      description: `Platform fee clearing on settlement`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    },
    {
      lineNumber: 2,
      accountId: params.accounts.platformFeeRevenueId,
      debitAmount: 0,
      creditAmount: fee,
      currency: 'INR',
      description: `OTP platform facilitation revenue recognized`,
      supplierId: params.supplierId,
      purchaseOrderId: params.purchaseOrderId,
      invoiceId: params.invoiceId,
    },
  ];

  return {
    organizationId: params.organizationId,
    periodId: params.periodId,
    entryDate: params.entryDate,
    entryType: 'PLATFORM_FEE_REVENUE',
    narration: `Recognition of OTP platform fee of ₹${fee.toFixed(2)}`,
    sourceEntityType: 'PLATFORM_FEE',
    sourceEntityId: params.feeTransactionId,
    idempotencyKey: `FEE-REVENUE-${params.feeTransactionId}`,
    lines,
  };
}
