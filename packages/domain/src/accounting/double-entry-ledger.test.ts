import { describe, expect, it } from 'vitest';
import {
  STANDARD_CHART_OF_ACCOUNTS,
  isValidAccountCode,
  type LedgerAccount,
} from './chart-of-accounts';
import {
  isDateWithinPeriod,
  canPostToPeriod,
  derivePeriodCodeFromDate,
  type AccountingPeriod,
} from './accounting-period';
import {
  validateJournalLines,
  synthesizeReversalLines,
  type JournalLine,
  type JournalEntry,
} from './journal-entry';
import {
  calculateTrialBalance,
} from './ledger-balance';
import {
  buildInvoiceObligationJournal,
  buildPaymentDisbursementJournal,
  buildAdvancePaymentJournal,
  buildAdvanceAllocationJournal,
  buildCreditNoteJournal,
  buildDebitNoteJournal,
  buildPlatformFeeJournal,
  type AccountCodeLookup,
} from './journal-posting-rules';
import { exportToTallyJournalVoucher } from './tally-journal-exporter';
import { exportToZohoJournalEntry } from './zoho-journal-exporter';

describe('OTP Phase 5D — Accounting & Double-Entry Financial Ledger Domain Engine', () => {
  const dummyAccounts: AccountCodeLookup = {
    bankAccountId: 'acc-bank-1010',
    accountsPayableId: 'acc-ap-2010',
    procurementExpenseId: 'acc-exp-5010',
    advancesToSuppliersId: 'acc-adv-1030',
    tdsPayableId: 'acc-tds-2020',
    gstInputCgstId: 'acc-cgst-1040',
    gstInputSgstId: 'acc-sgst-1041',
    gstInputIgstId: 'acc-igst-1042',
    gstInputUtgstId: 'acc-utgst-1043',
    platformFeeRevenueId: 'acc-fee-4010',
    settlementClearingId: 'acc-clear-2090',
  };

  const fullAccountsList: LedgerAccount[] = STANDARD_CHART_OF_ACCOUNTS.map((def, idx) => ({
    id: `acc-${idx + 1}`,
    organizationId: 'org-1',
    accountCode: def.accountCode,
    accountName: def.accountName,
    classification: def.classification,
    subtype: def.subtype,
    currency: 'INR',
    isSystemAccount: def.isSystemAccount,
    status: 'ACTIVE',
    createdAt: '2026-09-17T00:00:00Z',
    updatedAt: '2026-09-17T00:00:00Z',
  }));

  describe('Chart of Accounts & Period Rules', () => {
    it('provides all canonical standard accounts with valid classifications', () => {
      expect(STANDARD_CHART_OF_ACCOUNTS.length).toBeGreaterThanOrEqual(10);
      for (const acc of STANDARD_CHART_OF_ACCOUNTS) {
        expect(isValidAccountCode(acc.accountCode)).toBe(true);
        expect(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).toContain(acc.classification);
      }
    });

    it('evaluates period dates and posting permissions', () => {
      const period: AccountingPeriod = {
        id: 'p-1',
        organizationId: 'org-1',
        periodCode: '2026-09',
        periodName: 'September 2026',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        status: 'OPEN',
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-01T00:00:00Z',
      };

      expect(isDateWithinPeriod('2026-09-15', period)).toBe(true);
      expect(isDateWithinPeriod('2026-10-01', period)).toBe(false);
      expect(canPostToPeriod(period)).toBe(true);
      expect(canPostToPeriod({ status: 'CLOSED' })).toBe(false);
      expect(canPostToPeriod({ status: 'LOCKED' })).toBe(false);
      expect(derivePeriodCodeFromDate('2026-09-17')).toBe('2026-09');
    });
  });

  describe('Double-Entry Invariant Validation', () => {
    it('validates a balanced 2-line journal entry', () => {
      const lines: JournalLine[] = [
        { lineNumber: 1, accountId: 'acc-1', debitAmount: 5000, creditAmount: 0 },
        { lineNumber: 2, accountId: 'acc-2', debitAmount: 0, creditAmount: 5000 },
      ];
      const res = validateJournalLines(lines);
      expect(res.isValid).toBe(true);
      expect(res.totalDebit).toBe(5000);
      expect(res.totalCredit).toBe(5000);
      expect(res.difference).toBe(0);
      expect(res.errors.length).toBe(0);
    });

    it('rejects unbalanced journal entries', () => {
      const lines: JournalLine[] = [
        { lineNumber: 1, accountId: 'acc-1', debitAmount: 5000, creditAmount: 0 },
        { lineNumber: 2, accountId: 'acc-2', debitAmount: 0, creditAmount: 4990 },
      ];
      const res = validateJournalLines(lines);
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('unbalanced');
    });

    it('rejects lines with both debit and credit populated', () => {
      const lines: JournalLine[] = [
        { lineNumber: 1, accountId: 'acc-1', debitAmount: 5000, creditAmount: 100 },
        { lineNumber: 2, accountId: 'acc-2', debitAmount: 0, creditAmount: 4900 },
      ];
      const res = validateJournalLines(lines);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('both debit'))).toBe(true);
    });

    it('rejects negative debit or credit amounts', () => {
      const lines: JournalLine[] = [
        { lineNumber: 1, accountId: 'acc-1', debitAmount: -5000, creditAmount: 0 },
        { lineNumber: 2, accountId: 'acc-2', debitAmount: 0, creditAmount: -5000 },
      ];
      const res = validateJournalLines(lines);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.includes('Negative debit'))).toBe(true);
    });

    it('synthesizes exact mirrored reversal lines', () => {
      const original: JournalLine[] = [
        { lineNumber: 1, accountId: 'acc-exp', debitAmount: 10000, creditAmount: 0, description: 'Expense line' },
        { lineNumber: 2, accountId: 'acc-ap', debitAmount: 0, creditAmount: 10000, description: 'Payable line' },
      ];
      const reversed = synthesizeReversalLines(original);
      expect(reversed[0]?.debitAmount).toBe(0);
      expect(reversed[0]?.creditAmount).toBe(10000);
      expect(reversed[1]?.debitAmount).toBe(10000);
      expect(reversed[1]?.creditAmount).toBe(0);
      
      const validation = validateJournalLines([...original, ...reversed]);
      expect(validation.isValid).toBe(true);
      expect(validation.totalDebit).toBe(20000);
      expect(validation.totalCredit).toBe(20000);
    });
  });

  describe('Business Event Journal Posting Rules', () => {
    it('builds a balanced invoice obligation journal with split GST', () => {
      const jrn = buildInvoiceObligationJournal({
        organizationId: 'org-1',
        periodId: 'p-1',
        invoiceId: 'inv-101',
        invoiceNumber: 'INV-2026-001',
        supplierId: 'sup-1',
        baseAmount: 100000,
        cgstAmount: 9000,
        sgstAmount: 9000,
        totalAmount: 118000,
        entryDate: '2026-09-17',
        accounts: dummyAccounts,
      });

      expect(jrn.entryType).toBe('INVOICE_OBLIGATION');
      expect(jrn.lines.length).toBe(4);
      const validation = validateJournalLines(jrn.lines);
      expect(validation.isValid).toBe(true);
      expect(validation.totalDebit).toBe(118000);
      expect(validation.totalCredit).toBe(118000);
    });

    it('builds a balanced payment disbursement journal with TDS and platform fee', () => {
      const jrn = buildPaymentDisbursementJournal({
        organizationId: 'org-1',
        periodId: 'p-1',
        paymentId: 'pay-201',
        paymentReference: 'UTR-HDFC-99182',
        supplierId: 'sup-1',
        netPaidAmount: 97500,
        tdsAmount: 2000,
        platformFeeAmount: 500,
        entryDate: '2026-09-17',
        accounts: dummyAccounts,
      });

      expect(jrn.entryType).toBe('PAYMENT_DISBURSEMENT');
      const validation = validateJournalLines(jrn.lines);
      expect(validation.isValid).toBe(true);
      expect(validation.totalDebit).toBe(100000);
      expect(validation.totalCredit).toBe(100000);
    });

    it('builds advance payment and advance allocation journals', () => {
      const advPay = buildAdvancePaymentJournal({
        organizationId: 'org-1',
        periodId: 'p-1',
        paymentId: 'pay-adv-1',
        supplierId: 'sup-1',
        advanceAmount: 25000,
        entryDate: '2026-09-17',
        accounts: dummyAccounts,
      });
      expect(validateJournalLines(advPay.lines).isValid).toBe(true);

      const advAlloc = buildAdvanceAllocationJournal({
        organizationId: 'org-1',
        periodId: 'p-1',
        allocationId: 'alloc-1',
        paymentId: 'pay-adv-1',
        invoiceId: 'inv-101',
        supplierId: 'sup-1',
        allocatedAmount: 25000,
        entryDate: '2026-09-17',
        accounts: dummyAccounts,
      });
      expect(validateJournalLines(advAlloc.lines).isValid).toBe(true);
    });

    it('builds credit note, debit note, and platform fee journals', () => {
      const cn = buildCreditNoteJournal({
        organizationId: 'org-1',
        periodId: 'p-1',
        creditNoteId: 'cn-1',
        creditNoteNumber: 'CN-001',
        supplierId: 'sup-1',
        baseAdjustment: 10000,
        taxAdjustment: 1800,
        totalAdjustment: 11800,
        entryDate: '2026-09-17',
        accounts: dummyAccounts,
      });
      expect(validateJournalLines(cn.lines).isValid).toBe(true);

      const dn = buildDebitNoteJournal({
        organizationId: 'org-1',
        periodId: 'p-1',
        debitNoteId: 'dn-1',
        debitNoteNumber: 'DN-001',
        supplierId: 'sup-1',
        baseAdjustment: 5000,
        taxAdjustment: 900,
        totalAdjustment: 5900,
        entryDate: '2026-09-17',
        accounts: dummyAccounts,
      });
      expect(validateJournalLines(dn.lines).isValid).toBe(true);

      const fee = buildPlatformFeeJournal({
        organizationId: 'org-1',
        periodId: 'p-1',
        feeTransactionId: 'fee-tx-1',
        supplierId: 'sup-1',
        feeAmount: 500,
        entryDate: '2026-09-17',
        accounts: dummyAccounts,
      });
      expect(validateJournalLines(fee.lines).isValid).toBe(true);
    });
  });

  describe('Trial Balance Engine', () => {
    it('calculates trial balance across multiple posted journals and verifies debit==credit', () => {
      const postedLines: JournalLine[] = [
        { lineNumber: 1, accountId: fullAccountsList[0]!.id, debitAmount: 500000, creditAmount: 0 },
        { lineNumber: 2, accountId: fullAccountsList[7]!.id, debitAmount: 0, creditAmount: 500000 },
        { lineNumber: 1, accountId: fullAccountsList[11]!.id, debitAmount: 400000, creditAmount: 0 },
        { lineNumber: 2, accountId: fullAccountsList[7]!.id, debitAmount: 0, creditAmount: 400000 },
      ];

      const tb = calculateTrialBalance('org-1', fullAccountsList, postedLines, '2026-09-30', 'p-1');
      expect(tb.isBalanced).toBe(true);
      expect(tb.totalDebits).toBe(900000);
      expect(tb.totalCredits).toBe(900000);
      expect(tb.difference).toBe(0);
      expect(tb.accounts.length).toBe(fullAccountsList.length);
    });
  });

  describe('Tally Prime & Zoho Books Journal Exporters', () => {
    it('exports journal entry to Tally XML with <VOUCHER VCHTYPE="Journal">', () => {
      const sampleJournal: JournalEntry = {
        id: 'jrn-1',
        organizationId: 'org-1',
        periodId: 'p-1',
        journalNumber: 'JRN-2026-0001',
        entryDate: '2026-09-17',
        entryType: 'INVOICE_OBLIGATION',
        status: 'POSTED',
        narration: 'Invoice obligation accrual',
        totalDebit: 118000,
        totalCredit: 118000,
        lines: [
          { lineNumber: 1, accountId: 'acc-exp', accountName: 'Procurement Purchases', debitAmount: 100000, creditAmount: 0 },
          { lineNumber: 2, accountId: 'acc-tax', accountName: 'Input CGST', debitAmount: 9000, creditAmount: 0 },
          { lineNumber: 3, accountId: 'acc-tax2', accountName: 'Input SGST', debitAmount: 9000, creditAmount: 0 },
          { lineNumber: 4, accountId: 'acc-ap', accountName: 'Trade Payables', debitAmount: 0, creditAmount: 118000 },
        ],
        createdAt: '2026-09-17T00:00:00Z',
        updatedAt: '2026-09-17T00:00:00Z',
      };

      const xml = exportToTallyJournalVoucher(sampleJournal);
      expect(xml).toContain('<VOUCHER VCHTYPE="Journal" ACTION="Create"');
      expect(xml).toContain('<VOUCHERNUMBER>JRN-2026-0001</VOUCHERNUMBER>');
      expect(xml).toContain('<LEDGERNAME>Procurement Purchases</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>-100000.00</AMOUNT>');
      expect(xml).toContain('<LEDGERNAME>Trade Payables</LEDGERNAME>');
      expect(xml).toContain('<AMOUNT>118000.00</AMOUNT>');
    });

    it('exports journal entry to Zoho Books JSON schema', () => {
      const sampleJournal: JournalEntry = {
        id: 'jrn-1',
        organizationId: 'org-1',
        periodId: 'p-1',
        journalNumber: 'JRN-2026-0001',
        entryDate: '2026-09-17',
        entryType: 'PAYMENT_DISBURSEMENT',
        status: 'POSTED',
        narration: 'Payment disbursement to supplier',
        totalDebit: 100000,
        totalCredit: 100000,
        lines: [
          { lineNumber: 1, accountId: 'acc-ap', accountName: 'Trade Payables', debitAmount: 100000, creditAmount: 0 },
          { lineNumber: 2, accountId: 'acc-bank', accountName: 'Bank Main', debitAmount: 0, creditAmount: 100000 },
        ],
        createdAt: '2026-09-17T00:00:00Z',
        updatedAt: '2026-09-17T00:00:00Z',
      };

      const zoho = exportToZohoJournalEntry(sampleJournal);
      expect(zoho.entry_number).toBe('JRN-2026-0001');
      expect(zoho.total).toBe(100000);
      expect(zoho.line_items.length).toBe(2);
      expect(zoho.line_items[0]?.debit_or_credit).toBe('d');
      expect(zoho.line_items[1]?.debit_or_credit).toBe('c');
    });
  });
});
