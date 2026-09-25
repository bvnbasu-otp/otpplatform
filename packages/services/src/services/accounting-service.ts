/**
 * Accounting & Double-Entry Financial Ledger Service (Phase 5D)
 * Manages Chart of Accounts initialization, period management, double-entry journal postings,
 * reversals, trial balance derivation, and ERP journal exports.
 */

import {
  STANDARD_CHART_OF_ACCOUNTS,
  validateJournalLines,
  synthesizeReversalLines,
  calculateTrialBalance,
  buildInvoiceObligationJournal,
  buildPaymentDisbursementJournal,
  buildAdvancePaymentJournal,
  buildAdvanceAllocationJournal,
  buildCreditNoteJournal,
  buildDebitNoteJournal,
  buildPlatformFeeJournal,
  exportToTallyJournalVoucher,
  exportToZohoJournalEntry,
  type AccountCodeLookup,
  type AccountingPeriod,
  type LedgerAccount,
  type JournalEntry,
  type JournalLine,
  type TrialBalanceSummary,
} from '@otp/domain';
import type { Repositories } from '../repositories/interfaces';
import type { ActorContext } from '../types/actor-context';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../types/errors';
import type { AuditAppService } from './audit-service';
import { createId, timestamp } from '../repositories/in-memory';

export interface PostJournalParams {
  periodId: string;
  entryType: JournalEntry['entryType'];
  narration: string;
  entryDate?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  idempotencyKey?: string;
  lines: JournalLine[];
}

export class AccountingService {
  constructor(
    private readonly repos: Repositories,
    private readonly audit: AuditAppService,
  ) {}

  private requireBuyerOwnerOrManager(actor: ActorContext, orgId: string): void {
    if (actor.isPlatformAdmin) return;
    if (actor.organizationId !== orgId || !['OWNER', 'MANAGER'].includes(actor.orgRole || '')) {
      throw new ForbiddenError(
        'Buyer OWNER or MANAGER role required for this accounting operation',
      );
    }
  }

  private requireBuyerOwner(actor: ActorContext, orgId: string): void {
    if (actor.isPlatformAdmin) return;
    if (actor.organizationId !== orgId || actor.orgRole !== 'OWNER') {
      throw new ForbiddenError(
        'Explicit Buyer OWNER role required for period closure or reopening',
      );
    }
  }

  private requireOrgMember(actor: ActorContext, orgId: string): void {
    if (actor.isPlatformAdmin) return;
    if (actor.organizationId !== orgId) {
      throw new ForbiddenError(
        'Cross-tenant access to organization financial ledger is prohibited',
      );
    }
  }

  /**
   * Initializes standard Chart of Accounts and current monthly accounting period for an organization.
   */
  async initializeChartOfAccounts(
    actor: ActorContext,
    orgId: string,
  ): Promise<LedgerAccount[]> {
    this.requireBuyerOwnerOrManager(actor, orgId);

    const accountsRepo = this.repos.ledgerAccounts;
    const periodsRepo = this.repos.accountingPeriods;
    if (!accountsRepo || !periodsRepo) {
      throw new Error('Accounting repositories not configured');
    }

    const existingAccounts = await accountsRepo.findByOrganizationId(orgId);
    const existingMap = new Map(existingAccounts.map((a) => [a.accountCode, a]));

    const createdAccounts: LedgerAccount[] = [];
    const now = timestamp();

    for (const def of STANDARD_CHART_OF_ACCOUNTS) {
      if (!existingMap.has(def.accountCode)) {
        const saved = await accountsRepo.save({
          id: createId(),
          organizationId: orgId,
          accountCode: def.accountCode,
          accountName: def.accountName,
          classification: def.classification,
          subtype: def.subtype,
          currency: 'INR',
          isSystemAccount: def.isSystemAccount,
          status: 'ACTIVE',
          description: def.description,
          createdAt: now,
          updatedAt: now,
        });
        createdAccounts.push(saved);
      } else {
        createdAccounts.push(existingMap.get(def.accountCode)!);
      }
    }

    // Ensure default period exists
    const currentDate = new Date().toISOString().split('T')[0]!;
    const periodCode = currentDate.slice(0, 7);
    const existingPeriod = await periodsRepo.findByCode(orgId, periodCode);

    if (!existingPeriod) {
      const parts = periodCode.split('-');
      const year = parseInt(parts[0]!, 10);
      const month = parseInt(parts[1]!, 10);
      const startDate = `${periodCode}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${periodCode}-${String(lastDay).padStart(2, '0')}`;

      await periodsRepo.save({
        id: createId(),
        organizationId: orgId,
        periodCode,
        periodName: `${periodCode} Accounting Period`,
        startDate,
        endDate,
        status: 'OPEN',
        createdAt: now,
        updatedAt: now,
      });
    }

    return createdAccounts;
  }

  /**
   * Retrieves standard account lookups for business event mapping.
   */
  async getAccountCodeLookup(orgId: string): Promise<AccountCodeLookup> {
    const accountsRepo = this.repos.ledgerAccounts;
    if (!accountsRepo) throw new Error('Ledger accounts repository not configured');

    const accounts = await accountsRepo.findByOrganizationId(orgId);
    const codeMap = new Map(accounts.map((a) => [a.accountCode, a.id]));

    return {
      bankAccountId: codeMap.get('1010-BANK-DEFAULT') || 'acc-bank-default',
      accountsPayableId: codeMap.get('2010-ACCOUNTS-PAYABLE') || 'acc-ap-default',
      procurementExpenseId: codeMap.get('5010-PROCUREMENT-EXPENSE') || 'acc-exp-default',
      advancesToSuppliersId: codeMap.get('1030-ADVANCES-TO-SUPPLIERS') || 'acc-adv-default',
      tdsPayableId: codeMap.get('2020-TDS-PAYABLE-STATUTORY') || 'acc-tds-default',
      gstInputCgstId: codeMap.get('1040-GST-INPUT-TAX-CGST'),
      gstInputSgstId: codeMap.get('1041-GST-INPUT-TAX-SGST'),
      gstInputIgstId: codeMap.get('1042-GST-INPUT-TAX-IGST'),
      gstInputUtgstId: codeMap.get('1043-GST-INPUT-TAX-UTGST'),
      platformFeeRevenueId: codeMap.get('4010-PLATFORM-FEE-REVENUE') || 'acc-fee-default',
      settlementClearingId: codeMap.get('2090-SETTLEMENT-CLEARING') || 'acc-clear-default',
    };
  }

  /**
   * Retrieves posted journals for an organization with cross-tenant check.
   */
  async getJournalEntries(
    actor: ActorContext,
    orgId: string,
    periodId?: string,
  ): Promise<Result<JournalEntry[], Error>> {
    try {
      this.requireOrgMember(actor, orgId);
      const journalsRepo = this.repos.journalEntries;
      if (!journalsRepo) throw new Error('Journal entries repository not configured');
      let list = await journalsRepo.findByOrganizationId(orgId);
      if (periodId) {
        list = list.filter((j) => j.periodId === periodId);
      }
      return ok(list);
    } catch (err: any) {
      return { ok: false, error: err };
    }
  }

  /**
   * Posts a double-entry journal entry atomically.
   */
  async postJournalEntry(
    actor: ActorContext,
    orgId: string,
    params: PostJournalParams,
  ): Promise<JournalEntry> {
    this.requireBuyerOwnerOrManager(actor, orgId);

    const periodsRepo = this.repos.accountingPeriods;
    const journalsRepo = this.repos.journalEntries;
    const accountsRepo = this.repos.ledgerAccounts;
    if (!periodsRepo || !journalsRepo || !accountsRepo) {
      throw new Error('Accounting repositories not configured');
    }

    // Idempotency check
    if (params.idempotencyKey) {
      const existing = await journalsRepo.findByIdempotencyKey(orgId, params.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    // Period validation
    const period = await periodsRepo.findById(params.periodId);
    if (!period || period.organizationId !== orgId) {
      throw new NotFoundError(`Accounting period ${params.periodId} not found`);
    }

    if (period.status !== 'OPEN') {
      throw new ValidationError(`Cannot post journal into ${period.status} accounting period`);
    }

    // Validate journal lines
    const validation = validateJournalLines(params.lines);
    if (!validation.isValid) {
      throw new ValidationError(
        `Journal entry validation failed: ${validation.errors.join('; ')}`,
      );
    }

    // Validate account validity, active status & tenant isolation
    const allAccounts = await accountsRepo.findByOrganizationId(orgId);
    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));

    for (let i = 0; i < params.lines.length; i++) {
      const line = params.lines[i]!;
      const acc = accountMap.get(line.accountId);
      if (!acc) {
        // Check if account belongs to another tenant
        const otherAcc = await accountsRepo.findById(line.accountId);
        if (otherAcc && otherAcc.organizationId !== orgId) {
          throw new ValidationError(
            `Line ${i + 1}: Cross-tenant account ${line.accountId} cannot be used`,
          );
        }
        throw new NotFoundError(`Line ${i + 1}: Account ${line.accountId} not found in organization`);
      }
      if (acc.status !== 'ACTIVE') {
        throw new ValidationError(
          `Line ${i + 1}: Account ${acc.accountCode} has status ${acc.status} and cannot accept postings`,
        );
      }
      // Populate account name/code if omitted
      line.accountCode = acc.accountCode;
      line.accountName = acc.accountName;
    }

    const now = timestamp();
    const entryDate = params.entryDate || now.split('T')[0]!;
    const journalId = createId();
    const journalNumber = `JRN-${entryDate.replace(/-/g, '').slice(0, 6)}-${journalId.slice(0, 6).toUpperCase()}`;

    const journal: JournalEntry = {
      id: journalId,
      organizationId: orgId,
      periodId: params.periodId,
      journalNumber,
      entryDate,
      entryType: params.entryType,
      status: 'POSTED',
      narration: params.narration,
      sourceEntityType: params.sourceEntityType || null,
      sourceEntityId: params.sourceEntityId || null,
      idempotencyKey: params.idempotencyKey || null,
      lines: params.lines.map((l, idx) => ({
        ...l,
        lineNumber: idx + 1,
        journalEntryId: journalId,
        currency: l.currency || 'INR',
      })),
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      postedBy: actor.profileId || null,
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await journalsRepo.save(journal);

    await this.audit.log({
      actorId: actor.profileId || 'system',
      action: 'JOURNAL_POSTED',
      entityId: saved.id,
      entityType: 'JOURNAL_ENTRY',
      metadata: {
        organizationId: orgId,
        journalNumber: saved.journalNumber,
        entryType: saved.entryType,
        totalDebit: saved.totalDebit,
        totalCredit: saved.totalCredit,
      },
    });

    return saved;
  }

  /**
   * Reverses a posted journal entry atomically.
   */
  async reverseJournalEntry(
    actor: ActorContext,
    orgId: string,
    journalId: string,
    reason = 'Correction or business event cancellation',
  ): Promise<{ original: JournalEntry; reversal: JournalEntry }> {
    this.requireBuyerOwnerOrManager(actor, orgId);

    const journalsRepo = this.repos.journalEntries;
    if (!journalsRepo) throw new Error('Journal entries repository not configured');

    const orig = await journalsRepo.findById(journalId);
    if (!orig || orig.organizationId !== orgId) {
      throw new NotFoundError(`Journal entry ${journalId} not found`);
    }

    if (orig.status === 'REVERSED') {
      throw new ValidationError(`Journal entry ${orig.journalNumber} is already reversed`);
    }

    if (orig.status !== 'POSTED') {
      throw new ValidationError(`Only POSTED journals can be reversed (current: ${orig.status})`);
    }

    const now = timestamp();
    const entryDate = now.split('T')[0]!;
    const reversalId = createId();
    const reversalNumber = `REV-${entryDate.replace(/-/g, '').slice(0, 6)}-${reversalId.slice(0, 6).toUpperCase()}`;

    const reversalLines = synthesizeReversalLines(orig.lines);

    const reversal: JournalEntry = {
      id: reversalId,
      organizationId: orgId,
      periodId: orig.periodId,
      journalNumber: reversalNumber,
      entryDate,
      entryType: 'JOURNAL_REVERSAL',
      status: 'POSTED',
      narration: `Reversal of ${orig.journalNumber}: ${reason}`,
      sourceEntityType: orig.sourceEntityType,
      sourceEntityId: orig.sourceEntityId,
      reversesJournalId: orig.id,
      reversalReason: reason,
      lines: reversalLines.map((l: Omit<JournalLine, 'journalEntryId' | 'lineNumber'>, idx: number) => ({
        ...l,
        lineNumber: idx + 1,
        journalEntryId: reversalId,
      })),
      totalDebit: orig.totalCredit,
      totalCredit: orig.totalDebit,
      postedBy: actor.profileId || null,
      postedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const savedReversal = await journalsRepo.save(reversal);

    orig.status = 'REVERSED';
    orig.reversedByJournalId = savedReversal.id;
    orig.reversalReason = reason;
    orig.updatedAt = now;
    const updatedOrig = await journalsRepo.save(orig);

    await this.audit.log({
      actorId: actor.profileId || 'system',
      action: 'JOURNAL_REVERSED',
      entityId: orig.id,
      entityType: 'JOURNAL_ENTRY',
      metadata: {
        organizationId: orgId,
        originalJournalNumber: orig.journalNumber,
        reversalJournalNumber: savedReversal.journalNumber,
        reason,
      },
    });

    return { original: updatedOrig, reversal: savedReversal };
  }

  /**
   * Closes an open accounting period. Requires Buyer OWNER role.
   */
  async closeAccountingPeriod(
    actor: ActorContext,
    orgId: string,
    periodId: string,
  ): Promise<AccountingPeriod> {
    this.requireBuyerOwner(actor, orgId);

    const periodsRepo = this.repos.accountingPeriods;
    if (!periodsRepo) throw new Error('Accounting periods repository not configured');

    const period = await periodsRepo.findById(periodId);
    if (!period || period.organizationId !== orgId) {
      throw new NotFoundError(`Accounting period ${periodId} not found`);
    }

    if (period.status === 'CLOSED' || period.status === 'LOCKED') {
      throw new ValidationError(`Period is already ${period.status}`);
    }

    const now = timestamp();
    period.status = 'CLOSED';
    period.closedAt = now;
    period.closedBy = actor.profileId || null;
    period.updatedAt = now;

    const saved = await periodsRepo.save(period);

    await this.audit.log({
      actorId: actor.profileId || 'system',
      action: 'ACCOUNTING_PERIOD_CLOSED',
      entityId: periodId,
      entityType: 'ACCOUNTING_PERIOD',
      metadata: {
        organizationId: orgId,
        periodCode: saved.periodCode,
      },
    });

    return saved;
  }

  /**
   * Reopens a closed/locked accounting period. Requires explicit Buyer OWNER role.
   */
  async reopenAccountingPeriod(
    actor: ActorContext,
    orgId: string,
    periodId: string,
    reason: string,
  ): Promise<AccountingPeriod> {
    this.requireBuyerOwner(actor, orgId);

    const periodsRepo = this.repos.accountingPeriods;
    if (!periodsRepo) throw new Error('Accounting periods repository not configured');

    const period = await periodsRepo.findById(periodId);
    if (!period || period.organizationId !== orgId) {
      throw new NotFoundError(`Accounting period ${periodId} not found`);
    }

    if (period.status === 'OPEN') {
      throw new ValidationError(`Period is already OPEN`);
    }

    const now = timestamp();
    period.status = 'OPEN';
    period.reopenedAt = now;
    period.reopenedBy = actor.profileId || null;
    period.reopenReason = reason;
    period.updatedAt = now;

    const saved = await periodsRepo.save(period);

    await this.audit.log({
      actorId: actor.profileId || 'system',
      action: 'ACCOUNTING_PERIOD_REOPENED',
      entityId: periodId,
      entityType: 'ACCOUNTING_PERIOD',
      metadata: { periodCode: saved.periodCode, reason, organizationId: orgId },
    });

    return saved;
  }

  /**
   * Computes the trial balance and ledger balance summary.
   */
  async getTrialBalance(
    actor: ActorContext,
    orgId: string,
    periodId?: string,
  ): Promise<TrialBalanceSummary> {
    this.requireOrgMember(actor, orgId);

    const accountsRepo = this.repos.ledgerAccounts;
    const journalsRepo = this.repos.journalEntries;
    if (!accountsRepo || !journalsRepo) {
      throw new Error('Accounting repositories not configured');
    }

    const accounts = await accountsRepo.findByOrganizationId(orgId);
    let journals = await journalsRepo.findByOrganizationId(orgId);

    if (periodId) {
      journals = journals.filter((j) => j.periodId === periodId);
    }

    const postedLines: JournalLine[] = [];
    for (const j of journals) {
      if (j.status === 'POSTED' || j.status === 'REVERSED') {
        postedLines.push(...j.lines);
      }
    }

    return calculateTrialBalance(
      orgId,
      accounts,
      postedLines,
      new Date().toISOString().split('T')[0]!,
      periodId,
    );
  }

  /**
   * Generates standard balanced journals from business events.
   */
  async generateProcurementJournal(
    actor: ActorContext,
    orgId: string,
    eventType:
      | 'INVOICE_OBLIGATION'
      | 'PAYMENT_DISBURSEMENT'
      | 'ADVANCE_PAYMENT'
      | 'ADVANCE_ALLOCATION'
      | 'CREDIT_NOTE'
      | 'DEBIT_NOTE'
      | 'PLATFORM_FEE',
    sourceId: string,
    periodId: string,
  ): Promise<JournalEntry> {
    this.requireBuyerOwnerOrManager(actor, orgId);

    const accounts = await this.getAccountCodeLookup(orgId);
    const currentDate = new Date().toISOString().split('T')[0]!;

    if (eventType === 'INVOICE_OBLIGATION') {
      const invRepo = this.repos.invoices;
      if (!invRepo) throw new Error('Invoices repository not configured');
      const invoice = await invRepo.findById(sourceId);
      if (!invoice || invoice.organizationId !== orgId) {
        throw new NotFoundError(`Invoice ${sourceId} not found`);
      }

      const total = invoice.amount;
      const base = (invoice as any).baseAmount || invoice.taxableTotal || Math.round((total / 1.18) * 100) / 100;
      const cgst = (invoice as any).cgstAmount || invoice.cgstTotal || Math.round(((total - base) / 2) * 100) / 100;
      const sgst = (invoice as any).sgstAmount || invoice.sgstTotal || Math.round(((total - base) / 2) * 100) / 100;
      const igst = (invoice as any).igstAmount || invoice.igstTotal || 0;
      const utgst = (invoice as any).utgstAmount || invoice.utgstTotal || 0;

      const payload = buildInvoiceObligationJournal({
        organizationId: orgId,
        periodId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        purchaseOrderId: invoice.purchaseOrderId,
        supplierId: invoice.supplierId,
        baseAmount: base,
        cgstAmount: cgst,
        sgstAmount: sgst,
        igstAmount: igst,
        utgstAmount: utgst,
        totalAmount: total,
        entryDate: currentDate,
        accounts,
      });

      return this.postJournalEntry(actor, orgId, payload);
    }

    if (eventType === 'PAYMENT_DISBURSEMENT') {
      const payRepo = this.repos.payments;
      if (!payRepo) throw new Error('Payments repository not configured');
      const payment = await payRepo.findById(sourceId);
      if (!payment) {
        throw new NotFoundError(`Payment ${sourceId} not found`);
      }

      const payload = buildPaymentDisbursementJournal({
        organizationId: orgId,
        periodId,
        paymentId: payment.id,
        paymentReference: payment.reference || (payment as any).paymentReference || payment.id,
        purchaseOrderId: payment.purchaseOrderId || undefined,
        supplierId: 'sup-default',
        netPaidAmount: payment.amount,
        accounts,
        entryDate: currentDate,
      });

      return this.postJournalEntry(actor, orgId, payload);
    }

    if (eventType === 'ADVANCE_PAYMENT') {
      const payRepo = this.repos.payments;
      if (!payRepo) throw new Error('Payments repository not configured');
      const payment = await payRepo.findById(sourceId);
      if (!payment) throw new NotFoundError(`Payment ${sourceId} not found`);

      const payload = buildAdvancePaymentJournal({
        organizationId: orgId,
        periodId,
        paymentId: payment.id,
        paymentReference: payment.reference || (payment as any).paymentReference || payment.id,
        purchaseOrderId: payment.purchaseOrderId || undefined,
        supplierId: 'sup-default',
        advanceAmount: payment.amount,
        entryDate: currentDate,
        accounts,
      });

      return this.postJournalEntry(actor, orgId, payload);
    }

    throw new ValidationError(`Unsupported event type: ${eventType}`);
  }
}
