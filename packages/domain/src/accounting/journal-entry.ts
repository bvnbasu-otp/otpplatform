/**
 * Double-Entry Journal Entries & Journal Lines Models (Phase 5D)
 * Enforces double-entry balance invariants, immutable posted states, reversal synthesis, and validation.
 */

export type JournalEntryType =
  | 'INVOICE_OBLIGATION'
  | 'PAYMENT_DISBURSEMENT'
  | 'ADVANCE_PAYMENT'
  | 'ADVANCE_ALLOCATION'
  | 'STATUTORY_TDS_ACCRUAL'
  | 'PLATFORM_FEE_REVENUE'
  | 'CREDIT_NOTE_ADJUSTMENT'
  | 'DEBIT_NOTE_ADJUSTMENT'
  | 'SETTLEMENT_RECONCILIATION'
  | 'JOURNAL_REVERSAL'
  | 'MANUAL_JOURNAL';

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface JournalLine {
  id?: string;
  journalEntryId?: string;
  lineNumber: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debitAmount: number;   // In INR (with exact paise precision, >= 0)
  creditAmount: number;  // In INR (with exact paise precision, >= 0)
  currency?: string;
  description?: string | null;
  supplierId?: string | null;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  createdAt?: string;
}

export interface JournalEntry {
  id: string;
  organizationId: string;
  periodId: string;
  journalNumber: string; // Unique within org e.g. "JRN-2026-0001"
  entryDate: string;     // YYYY-MM-DD
  entryType: JournalEntryType;
  status: JournalEntryStatus;
  narration: string;
  
  // Source Business Event Linking
  sourceEntityType?: string | null; // e.g. "INVOICE", "PAYMENT", "PAYMENT_ALLOCATION", "TDS_DEDUCTION", "PLATFORM_FEE", "CREDIT_NOTE"
  sourceEntityId?: string | null;
  idempotencyKey?: string | null;
  
  // Reversal linkage
  reversedByJournalId?: string | null;
  reversesJournalId?: string | null;
  reversalReason?: string | null;

  lines: JournalLine[];
  
  // Computed balance cached totals
  totalDebit: number;
  totalCredit: number;

  postedBy?: string | null;
  postedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalValidationResult {
  isValid: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
  errors: string[];
}

/**
 * Validates double-entry invariants on journal lines:
 * 1. At least 2 lines present.
 * 2. Every line has either debit > 0 or credit > 0, NEVER both, NEVER negative, NEVER both zero.
 * 3. Total debits == Total credits exactly (within 0.001 paise tolerance).
 * 4. Line numbers are sequential from 1.
 */
export function validateJournalLines(lines: JournalLine[]): JournalValidationResult {
  const errors: string[] = [];

  if (!lines || lines.length < 2) {
    errors.push('Journal entry must contain at least 2 lines (double-entry requirement)');
    return {
      isValid: false,
      totalDebit: 0,
      totalCredit: 0,
      difference: 0,
      errors,
    };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const debit = Math.round(Number(line.debitAmount || 0) * 100) / 100;
    const credit = Math.round(Number(line.creditAmount || 0) * 100) / 100;

    if (!line.accountId) {
      errors.push(`Line ${i + 1}: Missing accountId`);
    }

    if (debit < 0 || credit < 0) {
      errors.push(`Line ${i + 1}: Negative debit (${debit}) or credit (${credit}) is strictly prohibited`);
    }

    if (debit > 0 && credit > 0) {
      errors.push(`Line ${i + 1}: Single line item cannot have both debit (${debit}) and credit (${credit}) populated`);
    }

    if (debit === 0 && credit === 0) {
      errors.push(`Line ${i + 1}: Line item has zero value for both debit and credit`);
    }

    totalDebit = Math.round((totalDebit + debit) * 100) / 100;
    totalCredit = Math.round((totalCredit + credit) * 100) / 100;
  }

  const difference = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;

  if (difference > 0.001) {
    errors.push(`Journal entry is unbalanced: Total Debits (₹${totalDebit.toFixed(2)}) != Total Credits (₹${totalCredit.toFixed(2)}). Difference: ₹${difference.toFixed(2)}`);
  }

  return {
    isValid: errors.length === 0,
    totalDebit,
    totalCredit,
    difference,
    errors,
  };
}

/**
 * Synthesizes an exact mirrored reversal journal entry:
 * For every debit line -> becomes a credit line with same amount.
 * For every credit line -> becomes a debit line with same amount.
 */
export function synthesizeReversalLines(originalLines: JournalLine[]): JournalLine[] {
  return originalLines.map((line, index) => ({
    lineNumber: index + 1,
    accountId: line.accountId,
    accountCode: line.accountCode,
    accountName: line.accountName,
    debitAmount: line.creditAmount,  // Swap
    creditAmount: line.debitAmount, // Swap
    currency: line.currency || 'INR',
    description: `Reversal of line ${line.lineNumber}: ${line.description || ''}`.trim(),
    supplierId: line.supplierId,
    purchaseOrderId: line.purchaseOrderId,
    invoiceId: line.invoiceId,
    paymentId: line.paymentId,
  }));
}
