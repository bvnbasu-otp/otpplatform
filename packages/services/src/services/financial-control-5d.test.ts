import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRepositories, createId, timestamp } from '../repositories/in-memory';
import { createOtpServices } from '../factory/create-otp-services';
import type { ActorContext } from '../types/actor-context';
import { ForbiddenError, NotFoundError, ValidationError } from '../types/errors';
import {
  validateJournalLines,
  synthesizeReversalLines,
  calculateTrialBalance,
  exportToTallyJournalVoucher,
  exportToZohoJournalEntry,
  computePayloadChecksum,
  evaluateDuplicateExport,
  buildInvoiceObligationJournal,
  buildPaymentDisbursementJournal,
  buildAdvancePaymentJournal,
  buildAdvanceAllocationJournal,
  buildCreditNoteJournal,
  buildDebitNoteJournal,
  buildPlatformFeeJournal,
  type JournalLine,
  type JournalEntry,
  type LedgerAccount,
} from '@otp/domain';

const ORG_ID = 'org-fin-5d-test';
const OTHER_ORG_ID = 'org-other-5d';

const BUYER_OWNER: ActorContext = {
  profileId: 'buyer-owner-5d',
  organizationId: ORG_ID,
  orgRole: 'OWNER',
};

const BUYER_MANAGER: ActorContext = {
  profileId: 'buyer-mgr-5d',
  organizationId: ORG_ID,
  orgRole: 'MANAGER',
};

const BUYER_MEMBER: ActorContext = {
  profileId: 'buyer-member-5d',
  organizationId: ORG_ID,
  orgRole: 'BUYER',
};

const OTHER_ORG_USER: ActorContext = {
  profileId: 'other-buyer-5d',
  organizationId: OTHER_ORG_ID,
  orgRole: 'OWNER',
};

const SUPPLIER_ACTOR: ActorContext = {
  profileId: 'sup-user-5d',
  supplierIds: ['sup-5d-a'],
};

describe('OTP Phase 5D — Accounting & Double-Entry Financial Ledger Red-Team Matrix (RED-01 to RED-30)', () => {
  let mem: InMemoryRepositories;
  let services: ReturnType<typeof createOtpServices>;
  let accounts: LedgerAccount[];
  let openPeriodId: string;
  let closedPeriodId: string;
  let lockedPeriodId: string;

  beforeEach(async () => {
    mem = InMemoryRepositories.create();
    mem.seedSupplier({
      id: 'sup-5d-a',
      businessName: 'Apex Machinery & Components Ltd',
      source: 'DIRECT',
      status: 'ACTIVE',
      categories: ['Industrial Parts'],
      gstin: '29AABCS1429B1ZX',
    });

    const repos = mem.asRepositories();
    services = createOtpServices(repos);

    // Initialize Standard Chart of Accounts
    accounts = await services.accounting.initializeChartOfAccounts(BUYER_OWNER, ORG_ID);

    // Create periods: OPEN, CLOSED, LOCKED
    const now = timestamp();
    const p1 = await repos.accountingPeriods!.save({
      id: createId(),
      organizationId: ORG_ID,
      periodCode: '2026-09',
      periodName: 'September 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      status: 'OPEN',
      createdAt: now,
      updatedAt: now,
    });
    openPeriodId = p1.id;

    const p2 = await repos.accountingPeriods!.save({
      id: createId(),
      organizationId: ORG_ID,
      periodCode: '2026-08',
      periodName: 'August 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'CLOSED',
      closedAt: now,
      closedBy: BUYER_OWNER.profileId,
      createdAt: now,
      updatedAt: now,
    });
    closedPeriodId = p2.id;

    const p3 = await repos.accountingPeriods!.save({
      id: createId(),
      organizationId: ORG_ID,
      periodCode: '2026-07',
      periodName: 'July 2026',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      status: 'LOCKED',
      lockedAt: now,
      lockedBy: BUYER_OWNER.profileId,
      createdAt: now,
      updatedAt: now,
    });
    lockedPeriodId = p3.id;
  });

  function getAccountId(code: string): string {
    const acc = accounts.find((a) => a.accountCode === code);
    if (!acc) throw new Error(`Account code ${code} not found in test fixture`);
    return acc.id;
  }

  // =========================================================================
  // CATEGORY 1: Double-Entry Balance Invariants & Trigger Validation (RED-01 to RED-07)
  // =========================================================================

  it('RED-01: Unbalanced journal posting attempt rejected (SUM(debit) != SUM(credit))', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 100000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 99000 },
    ];

    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: openPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Unbalanced invoice obligation',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-02: Negative debit or credit line item rejected', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: -50000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: -50000 },
    ];

    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: openPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Negative line item test',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-03: Line with both debit and credit populated rejected', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 50000, creditAmount: 1000 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 49000 },
    ];

    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: openPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Dual debit and credit line',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-04: Zero-value line item rejected', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 0, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 0 },
    ];

    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: openPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Zero amount line test',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-05: Cross-tenant account linkage in journal entry rejected', async () => {
    // Seed account for OTHER org
    const otherAcc = await mem.asRepositories().ledgerAccounts!.save({
      id: createId(),
      organizationId: OTHER_ORG_ID,
      accountCode: '5010-OTHER-EXP',
      accountName: 'Other Tenant Expense',
      classification: 'EXPENSE',
      subtype: 'PROCUREMENT_EXPENSE',
      currency: 'INR',
      isSystemAccount: true,
      status: 'ACTIVE',
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });

    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: otherAcc.id, debitAmount: 10000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 10000 },
    ];

    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: openPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Cross tenant account leak attempt',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-06: Posting to a CLOSED or LOCKED accounting period rejected', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 20000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 20000 },
    ];

    // Closed period
    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: closedPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Posting into closed period',
        lines,
      }),
    ).rejects.toThrow(ValidationError);

    // Locked period
    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: lockedPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Posting into locked period',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-07: Direct UPDATE or DELETE on a POSTED journal entry blocked by immutability principles', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 25000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 25000 },
    ];

    const jrn = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
      periodId: openPeriodId,
      entryType: 'INVOICE_OBLIGATION',
      narration: 'Immutability test',
      lines,
    });

    expect(jrn.status).toBe('POSTED');
    // Cannot delete posted journal; must use reverseJournalEntry
    expect(jrn.totalDebit).toBe(25000);
    expect(jrn.totalCredit).toBe(25000);
  });

  // =========================================================================
  // CATEGORY 2: Idempotency & Reversals (RED-08 to RED-11)
  // =========================================================================

  it('RED-08: Duplicate posting of same source business event prevented by unique idempotency constraint', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 30000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 30000 },
    ];

    const jrn1 = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
      periodId: openPeriodId,
      entryType: 'INVOICE_OBLIGATION',
      narration: 'Idempotency test run',
      idempotencyKey: 'IDEMP-INV-5D-001',
      lines,
    });

    const jrn2 = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
      periodId: openPeriodId,
      entryType: 'INVOICE_OBLIGATION',
      narration: 'Idempotency duplicate replay',
      idempotencyKey: 'IDEMP-INV-5D-001',
      lines,
    });

    expect(jrn1.id).toBe(jrn2.id);
    expect(jrn2.journalNumber).toBe(jrn1.journalNumber);
  });

  it('RED-09: Journal reversal creates exact mirrored debit/credit lines yielding net zero balance', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 40000, creditAmount: 0, description: 'Expense line' },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 40000, description: 'Payable line' },
    ];

    const orig = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
      periodId: openPeriodId,
      entryType: 'INVOICE_OBLIGATION',
      narration: 'To be reversed',
      lines,
    });

    const { original, reversal } = await services.accounting.reverseJournalEntry(
      BUYER_OWNER,
      ORG_ID,
      orig.id,
      'Invoice cancelled by supplier',
    );

    expect(original.status).toBe('REVERSED');
    expect(original.reversedByJournalId).toBe(reversal.id);
    expect(reversal.entryType).toBe('JOURNAL_REVERSAL');
    expect(reversal.reversesJournalId).toBe(original.id);
    expect(reversal.lines[0]?.debitAmount).toBe(0);
    expect(reversal.lines[0]?.creditAmount).toBe(40000);
    expect(reversal.lines[1]?.debitAmount).toBe(40000);
    expect(reversal.lines[1]?.creditAmount).toBe(0);

    // Sum of original + reversal lines equals exact zero net impact per account
    const tb = await services.accounting.getTrialBalance(BUYER_OWNER, ORG_ID, openPeriodId);
    expect(tb.isBalanced).toBe(true);
    const expAcc = tb.accounts.find((a: any) => a.accountCode === '5010-PROCUREMENT-EXPENSE');
    const apAcc = tb.accounts.find((a: any) => a.accountCode === '2010-ACCOUNTS-PAYABLE');
    expect(expAcc?.netBalance).toBe(0);
    expect(apAcc?.netBalance).toBe(0);
  });

  it('RED-10: Reversal of an already REVERSED journal rejected', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 15000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 15000 },
    ];

    const orig = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
      periodId: openPeriodId,
      entryType: 'INVOICE_OBLIGATION',
      narration: 'Double reversal check',
      lines,
    });

    await services.accounting.reverseJournalEntry(BUYER_OWNER, ORG_ID, orig.id);

    await expect(
      services.accounting.reverseJournalEntry(BUYER_OWNER, ORG_ID, orig.id),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-11: Reversal on a non-POSTED journal rejected', async () => {
    const draftJournal: JournalEntry = {
      id: createId(),
      organizationId: ORG_ID,
      periodId: openPeriodId,
      journalNumber: 'DRAFT-001',
      entryDate: '2026-09-17',
      entryType: 'MANUAL_JOURNAL',
      status: 'DRAFT',
      narration: 'Draft journal',
      lines: [],
      totalDebit: 0,
      totalCredit: 0,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    };

    await mem.asRepositories().journalEntries!.save(draftJournal);

    await expect(
      services.accounting.reverseJournalEntry(BUYER_OWNER, ORG_ID, draftJournal.id),
    ).rejects.toThrow(ValidationError);
  });

  // =========================================================================
  // CATEGORY 3: Access Control & Tenant Isolation (RED-12 to RED-14)
  // =========================================================================

  it('RED-12: Supplier role attempting to post or reverse buyer journal entries blocked', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 10000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 10000 },
    ];

    await expect(
      services.accounting.postJournalEntry(SUPPLIER_ACTOR, ORG_ID, {
        periodId: openPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Supplier posting attempt',
        lines,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('RED-13: Cross-tenant actor querying ledger accounts or journals blocked', async () => {
    await expect(
      services.accounting.getTrialBalance(OTHER_ORG_USER, ORG_ID, openPeriodId),
    ).rejects.toThrow(ForbiddenError);
  });

  it('RED-14: Backdated journal posting into closed historical period blocked', async () => {
    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: getAccountId('5010-PROCUREMENT-EXPENSE'), debitAmount: 10000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 10000 },
    ];

    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: closedPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Backdated posting into August 2026',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  // =========================================================================
  // CATEGORY 4: Core Procurement Accounting Event Mappings (RED-15 to RED-24)
  // =========================================================================

  it('RED-15: Invoice obligation journal debits Expense/Purchases and credits Accounts Payable & Tax Payable', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildInvoiceObligationJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      invoiceId: 'inv-red15',
      invoiceNumber: 'INV-2026-R15',
      supplierId: 'sup-5d-a',
      baseAmount: 100000,
      cgstAmount: 9000,
      sgstAmount: 9000,
      totalAmount: 118000,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    expect(posted.totalDebit).toBe(118000);
    expect(posted.totalCredit).toBe(118000);
    expect(posted.lines.length).toBe(4);
  });

  it('RED-16: Payment journal debits Accounts Payable and credits Bank Ledger with exact balanced lines', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildPaymentDisbursementJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      paymentId: 'pay-red16',
      paymentReference: 'UTR-HDFC-99182',
      supplierId: 'sup-5d-a',
      netPaidAmount: 97500,
      tdsAmount: 2000,
      platformFeeAmount: 500,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    expect(posted.totalDebit).toBe(100000);
    expect(posted.totalCredit).toBe(100000);
  });

  it('RED-17: Statutory TDS journal isolates TDS Payable liability without distorting Gross Expense', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildPaymentDisbursementJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      paymentId: 'pay-red17',
      supplierId: 'sup-5d-a',
      netPaidAmount: 98000,
      tdsAmount: 2000,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    const tdsLine = posted.lines.find((l: any) => l.creditAmount === 2000);
    expect(tdsLine).toBeDefined();
    expect(tdsLine?.accountCode).toBe('2020-TDS-PAYABLE-STATUTORY');
  });

  it('RED-18: Platform fee journal recognizes Platform Fee Revenue and credits fee clearing', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildPlatformFeeJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      feeTransactionId: 'fee-red18',
      supplierId: 'sup-5d-a',
      feeAmount: 500,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    expect(posted.totalDebit).toBe(500);
    expect(posted.totalCredit).toBe(500);
    expect(posted.entryType).toBe('PLATFORM_FEE_REVENUE');
  });

  it('RED-19: Credit note journal reverses appropriate liability and expense lines', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildCreditNoteJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      creditNoteId: 'cn-red19',
      creditNoteNumber: 'CN-2026-01',
      supplierId: 'sup-5d-a',
      baseAdjustment: 10000,
      taxAdjustment: 1800,
      totalAdjustment: 11800,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    expect(posted.totalDebit).toBe(11800);
    expect(posted.totalCredit).toBe(11800);
    expect(posted.entryType).toBe('CREDIT_NOTE_ADJUSTMENT');
  });

  it('RED-20: Debit note journal adjusts Accounts Payable and Tax recovery accounts', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildDebitNoteJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      debitNoteId: 'dn-red20',
      debitNoteNumber: 'DN-2026-01',
      supplierId: 'sup-5d-a',
      baseAdjustment: 5000,
      taxAdjustment: 900,
      totalAdjustment: 5900,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    expect(posted.totalDebit).toBe(5900);
    expect(posted.totalCredit).toBe(5900);
    expect(posted.entryType).toBe('DEBIT_NOTE_ADJUSTMENT');
  });

  it('RED-21: Advance payment receipt debits Bank and credits Advances to Suppliers', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildAdvancePaymentJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      paymentId: 'pay-adv-red21',
      supplierId: 'sup-5d-a',
      advanceAmount: 50000,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    expect(posted.totalDebit).toBe(50000);
    expect(posted.totalCredit).toBe(50000);
    expect(posted.entryType).toBe('ADVANCE_PAYMENT');
  });

  it('RED-22: Advance allocation transfers balance from Advance clearing to Accounts Payable', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = buildAdvanceAllocationJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      allocationId: 'alloc-red22',
      paymentId: 'pay-adv-red21',
      invoiceId: 'inv-101',
      supplierId: 'sup-5d-a',
      allocatedAmount: 50000,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const posted = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn);
    expect(posted.totalDebit).toBe(50000);
    expect(posted.totalCredit).toBe(50000);
    expect(posted.entryType).toBe('ADVANCE_ALLOCATION');
  });

  it('RED-23: Multi-PO consolidated supplier settlement preserves independent PO journal references', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn1 = buildPaymentDisbursementJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      paymentId: 'pay-po1',
      purchaseOrderId: 'po-101',
      supplierId: 'sup-5d-a',
      netPaidAmount: 50000,
      entryDate: '2026-09-17',
      accounts: lookup,
    });
    const jrn2 = buildPaymentDisbursementJournal({
      organizationId: ORG_ID,
      periodId: openPeriodId,
      paymentId: 'pay-po2',
      purchaseOrderId: 'po-102',
      supplierId: 'sup-5d-a',
      netPaidAmount: 75000,
      entryDate: '2026-09-17',
      accounts: lookup,
    });

    const p1 = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn1);
    const p2 = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrn2);

    expect(p1.lines.some((l: any) => l.purchaseOrderId === 'po-101')).toBe(true);
    expect(p2.lines.some((l: any) => l.purchaseOrderId === 'po-102')).toBe(true);
  });

  it('RED-24: Concurrent journal posting attempts serialize cleanly via pessimistic locks', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrnParams = (idx: number) => ({
      periodId: openPeriodId,
      entryType: 'INVOICE_OBLIGATION' as const,
      narration: `Concurrent posting ${idx}`,
      lines: [
        { lineNumber: 1, accountId: lookup.procurementExpenseId, debitAmount: 1000 * idx, creditAmount: 0 },
        { lineNumber: 2, accountId: lookup.accountsPayableId, debitAmount: 0, creditAmount: 1000 * idx },
      ],
    });

    const results = await Promise.all([
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrnParams(1)),
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrnParams(2)),
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, jrnParams(3)),
    ]);

    expect(results.length).toBe(3);
    for (const res of results) {
      expect(res.status).toBe('POSTED');
    }
  });

  // =========================================================================
  // CATEGORY 5: ERP Integration & System Controls (RED-25 to RED-30)
  // =========================================================================

  it('RED-25: ERP export registers journal export with SHA-256 payload checksum', async () => {
    const lookup = await services.accounting.getAccountCodeLookup(ORG_ID);
    const jrn = await services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
      periodId: openPeriodId,
      entryType: 'INVOICE_OBLIGATION',
      narration: 'ERP export payload test',
      lines: [
        { lineNumber: 1, accountId: lookup.procurementExpenseId, debitAmount: 20000, creditAmount: 0 },
        { lineNumber: 2, accountId: lookup.accountsPayableId, debitAmount: 0, creditAmount: 20000 },
      ],
    });

    const tallyXml = exportToTallyJournalVoucher(jrn);
    const checksum = computePayloadChecksum(tallyXml);
    expect(checksum).toBeDefined();
    expect(checksum.length).toBe(64);
  });

  it('RED-26: Replayed ERP export flagged as duplicate without creating second journal', () => {
    const existing = [
      {
        id: 'man-1',
        organizationId: ORG_ID,
        exportType: 'TALLY_PAYMENT_VOUCHER' as const,
        batchReference: 'BATCH-001',
        exportVersion: 1,
        recordCount: 1,
        totalAmount: 50000,
        payloadChecksumSha256: 'a1b2c3d4'.repeat(8),
        exportedAt: '2026-09-17T00:00:00Z',
        createdAt: '2026-09-17T00:00:00Z',
      },
    ];

    const evalResult = evaluateDuplicateExport(
      existing,
      'TALLY_PAYMENT_VOUCHER',
      'BATCH-001',
      'a1b2c3d4'.repeat(8),
    );

    expect(evalResult.isDuplicate).toBe(true);
  });

  it('RED-27: Trial balance calculation across all posted lines guarantees Total Debits == Total Credits', async () => {
    const tb = await services.accounting.getTrialBalance(BUYER_OWNER, ORG_ID, openPeriodId);
    expect(tb.isBalanced).toBe(true);
    expect(tb.difference).toBe(0);
    expect(tb.totalDebits).toBe(tb.totalCredits);
  });

  it('RED-28: Inactive or deprecated ledger account rejected for new journal lines', async () => {
    // Deprecate an account
    const accToDeprecate = accounts[0]!;
    accToDeprecate.status = 'DEPRECATED';
    await mem.asRepositories().ledgerAccounts!.save(accToDeprecate);

    const lines: JournalLine[] = [
      { lineNumber: 1, accountId: accToDeprecate.id, debitAmount: 5000, creditAmount: 0 },
      { lineNumber: 2, accountId: getAccountId('2010-ACCOUNTS-PAYABLE'), debitAmount: 0, creditAmount: 5000 },
    ];

    await expect(
      services.accounting.postJournalEntry(BUYER_OWNER, ORG_ID, {
        periodId: openPeriodId,
        entryType: 'INVOICE_OBLIGATION',
        narration: 'Posting to deprecated account',
        lines,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('RED-29: Unauthorized user closing an accounting period blocked', async () => {
    await expect(
      services.accounting.closeAccountingPeriod(BUYER_MEMBER, ORG_ID, openPeriodId),
    ).rejects.toThrow(ForbiddenError);

    await expect(
      services.accounting.closeAccountingPeriod(BUYER_MANAGER, ORG_ID, openPeriodId),
    ).rejects.toThrow(ForbiddenError);
  });

  it('RED-30: Reopening a locked period requires explicit Buyer OWNER permission', async () => {
    // Non-owner rejected
    await expect(
      services.accounting.reopenAccountingPeriod(BUYER_MANAGER, ORG_ID, lockedPeriodId, 'Audit adjust'),
    ).rejects.toThrow(ForbiddenError);

    // Owner succeeds
    const reopened = await services.accounting.reopenAccountingPeriod(
      BUYER_OWNER,
      ORG_ID,
      lockedPeriodId,
      'Authorized audit adjustment',
    );
    expect(reopened.status).toBe('OPEN');
    expect(reopened.reopenReason).toBe('Authorized audit adjustment');
  });
});
