import type { Repositories } from './interfaces';
import type {
  ApprovalInstance,
  Award,
  BankReconciliationRecordEntity,
  CoiDeclaration,
  CommitteeVote,
  CreditDebitNoteEntity,
  ErpExportManifestEntity,
  Invoice,
  InvoiceLineItemEntity,
  Payment,
  PaymentAllocationEntity,
  PlatformFeePolicyEntity,
  PlatformFeeTransactionEntity,
  PoChangeOrderEntity,
  PoChangeOrderItemEntity,
  PoFeeSnapshotEntity,
  ProcurementPerformanceRecord,
  PurchaseOrder,
  PurchaseOrderLineItemEntity,
  Quote,
  QuoteVersion,
  Requirement,
  Rfq,
  RfqInvitation,
  SettlementExceptionEntity,
  SettlementExceptionEventEntity,
  SettlementReconciliationEntity,
  Supplier,
  TdsDeductionEntity,
  WorkOrder,
  WorkOrderMilestoneEntity,
  AccountingPeriodEntity,
  LedgerAccountEntity,
  JournalEntryEntity,
} from './entities';

function id(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

// The class carries raw Map<> stores for seeding and getters that build the
// typed Repository ports. It does not implement the Repositories port itself;
// callers use `.asRepositories()` to get one.
export class InMemoryRepositories {
  requirements = new Map<string, Requirement>();
  rfqs = new Map<string, Rfq>();
  invitations = new Map<string, RfqInvitation>();
  quotes = new Map<string, Quote>();
  quoteVersions = new Map<string, QuoteVersion>();
  votes = new Map<string, CommitteeVote>();
  coi = new Map<string, CoiDeclaration>();
  approvals = new Map<string, ApprovalInstance>();
  awards = new Map<string, Award>();
  purchaseOrders = new Map<string, PurchaseOrder>();
  poLineItems = new Map<string, PurchaseOrderLineItemEntity>();
  workOrders = new Map<string, WorkOrder>();
  workOrderMilestones = new Map<string, WorkOrderMilestoneEntity>();
  invoices = new Map<string, Invoice>();
  invoiceLineItems = new Map<string, InvoiceLineItemEntity>();
  payments = new Map<string, Payment>();
  paymentAllocations = new Map<string, PaymentAllocationEntity>();
  creditDebitNotes = new Map<string, CreditDebitNoteEntity>();
  tdsDeductions = new Map<string, TdsDeductionEntity>();
  poChangeOrders = new Map<string, PoChangeOrderEntity>();
  poChangeOrderItems = new Map<string, PoChangeOrderItemEntity>();
  bankReconciliations = new Map<string, BankReconciliationRecordEntity>();
  platformFeePolicies = new Map<string, PlatformFeePolicyEntity>();
  poFeeSnapshots = new Map<string, PoFeeSnapshotEntity>();
  platformFeeTransactions = new Map<string, PlatformFeeTransactionEntity>();
  settlementReconciliations = new Map<string, SettlementReconciliationEntity>();
  settlementExceptions = new Map<string, SettlementExceptionEntity>();
  settlementExceptionEvents = new Map<string, SettlementExceptionEventEntity>();
  erpExportManifests = new Map<string, ErpExportManifestEntity>();
  accountingPeriods = new Map<string, AccountingPeriodEntity>();
  ledgerAccounts = new Map<string, LedgerAccountEntity>();
  journalEntries = new Map<string, JournalEntryEntity>();
  suppliers = new Map<string, Supplier>();

  performance = new Map<string, ProcurementPerformanceRecord>();

  static create(): InMemoryRepositories {
    const mem = new InMemoryRepositories();
    // Seed default commercial platform fee policy version 1 (0.50% rate)
    mem.platformFeePolicies.set('pol-default-v1', {
      id: 'pol-default-v1',
      policyVersion: 1,
      feeType: 'PERCENTAGE',
      rate: 0.50,
      minFeeAmount: null,
      maxFeeAmount: null,
      effectiveFrom: new Date(2026, 0, 1).toISOString(),
      effectiveTo: null,
      status: 'ACTIVE',
      description: 'Standard OTP Platform Fee at Settlement (0.50%)',
      createdAt: new Date(2026, 0, 1).toISOString(),
      updatedAt: new Date(2026, 0, 1).toISOString(),
    });
    return mem;
  }

  get poLineItemsRepo(): Repositories['poLineItems'] {
    const store = this.poLineItems;
    return {
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((item) => item.purchaseOrderId === poId),
      save: async (item) => {
        store.set(item.id, item);
        return item;
      },
      saveMany: async (items) => {
        for (const item of items) store.set(item.id, item);
        return items;
      },
    };
  }

  get workOrderMilestonesRepo(): Repositories['workOrderMilestones'] {
    const store = this.workOrderMilestones;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByWorkOrderId: async (woId) =>
        [...store.values()].filter((m) => m.workOrderId === woId),
      save: async (m) => {
        store.set(m.id, m);
        return m;
      },
      saveMany: async (milestones) => {
        for (const m of milestones) store.set(m.id, m);
        return milestones;
      },
    };
  }

  get invoiceLineItemsRepo(): Repositories['invoiceLineItems'] {
    const store = this.invoiceLineItems;
    return {
      findByInvoiceId: async (invId) =>
        [...store.values()].filter((item) => item.invoiceId === invId),
      save: async (item) => {
        store.set(item.id, item);
        return item;
      },
      saveMany: async (items) => {
        for (const item of items) store.set(item.id, item);
        return items;
      },
    };
  }

  get requirementsRepo(): Repositories['requirements'] {
    const store = this.requirements;
    return {
      findById: async (id) => store.get(id) ?? null,
      save: async (r) => {
        store.set(r.id, r);
        return r;
      },
    };
  }

  get rfqsRepo(): Repositories['rfqs'] {
    const store = this.rfqs;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByRequirementId: async (reqId) =>
        [...store.values()].find((r) => r.requirementId === reqId) ?? null,
      save: async (r) => {
        store.set(r.id, r);
        return r;
      },
    };
  }

  get invitationsRepo(): Repositories['invitations'] {
    const store = this.invitations;
    return {
      findByRfqId: async (rfqId) =>
        [...store.values()].filter((i) => i.rfqId === rfqId),
      findById: async (id) => store.get(id) ?? null,
      save: async (i) => {
        store.set(i.id, i);
        return i;
      },
      saveMany: async (items) => {
        for (const i of items) store.set(i.id, i);
        return items;
      },
    };
  }

  get quotesRepo(): Repositories['quotes'] {
    const store = this.quotes;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByRfqId: async (rfqId) =>
        [...store.values()].filter((q) => q.rfqId === rfqId),
      save: async (q) => {
        store.set(q.id, q);
        return q;
      },
    };
  }

  get quoteVersionsRepo(): Repositories['quoteVersions'] {
    const store = this.quoteVersions;
    return {
      findByQuoteId: async (quoteId) =>
        [...store.values()].filter((v) => v.quoteId === quoteId),
      save: async (v) => {
        store.set(v.id, v);
        return v;
      },
    };
  }

  get votesRepo(): Repositories['votes'] {
    const store = this.votes;
    return {
      findByRfqId: async (rfqId) =>
        [...store.values()].filter((v) => v.rfqId === rfqId),
      save: async (v) => {
        store.set(v.id, v);
        return v;
      },
    };
  }

  get coiRepo(): Repositories['coi'] {
    const store = this.coi;
    return {
      findByRfqAndProfile: async (rfqId, profileId) =>
        [...store.values()].find(
          (c) => c.rfqId === rfqId && c.profileId === profileId,
        ) ?? null,
      save: async (c) => {
        store.set(c.id, c);
        return c;
      },
    };
  }

  get approvalsRepo(): Repositories['approvals'] {
    const store = this.approvals;
    return {
      findByRfqId: async (rfqId) =>
        [...store.values()].find((a) => a.rfqId === rfqId) ?? null,
      save: async (a) => {
        store.set(a.id, a);
        return a;
      },
    };
  }

  get awardsRepo(): Repositories['awards'] {
    const store = this.awards;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByRfqId: async (rfqId) =>
        [...store.values()].find((a) => a.rfqId === rfqId) ?? null,
      save: async (a) => {
        store.set(a.id, a);
        return a;
      },
    };
  }

  get purchaseOrdersRepo(): Repositories['purchaseOrders'] {
    const store = this.purchaseOrders;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((p) => p.organizationId === orgId),
      findBySupplierId: async (supplierId) =>
        [...store.values()].filter((p) => p.supplierId === supplierId),
      findAll: async () => [...store.values()],
      save: async (p) => {
        store.set(p.id, p);
        return p;
      },
    };
  }

  get workOrdersRepo(): Repositories['workOrders'] {
    const store = this.workOrders;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].find((w) => w.purchaseOrderId === poId) ?? null,
      save: async (w) => {
        store.set(w.id, w);
        return w;
      },
    };
  }

  get invoicesRepo(): Repositories['invoices'] {
    const store = this.invoices;
    const poStore = this.purchaseOrders;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByWorkOrderId: async (woId) =>
        [...store.values()].filter((i) => i.workOrderId === woId),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((i) => i.purchaseOrderId === poId),
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((i) => {
          if (!i.purchaseOrderId) return false;
          const po = poStore.get(i.purchaseOrderId);
          return po?.organizationId === orgId;
        }),
      save: async (i) => {
        store.set(i.id, i);
        return i;
      },
    };
  }

  get paymentsRepo(): Repositories['payments'] {
    const store = this.payments;
    const poStore = this.purchaseOrders;
    const invStore = this.invoices;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByInvoiceId: async (invId) =>
        [...store.values()].filter((p) => p.invoiceId === invId),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((p) => p.purchaseOrderId === poId),
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((p) => {
          if (p.purchaseOrderId) {
            const po = poStore.get(p.purchaseOrderId);
            if (po?.organizationId === orgId) return true;
          }
          if (p.invoiceId) {
            const inv = invStore.get(p.invoiceId);
            if (inv?.purchaseOrderId) {
              const po = poStore.get(inv.purchaseOrderId);
              if (po?.organizationId === orgId) return true;
            }
          }
          return false;
        }),
      save: async (p) => {
        store.set(p.id, p);
        return p;
      },
    };
  }

  get paymentAllocationsRepo(): Repositories['paymentAllocations'] {
    const store = this.paymentAllocations;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByPaymentId: async (payId) =>
        [...store.values()].filter((a) => a.paymentId === payId),
      findByInvoiceId: async (invId) =>
        [...store.values()].filter((a) => a.invoiceId === invId),
      save: async (a) => {
        store.set(a.id, a);
        return a;
      },
      saveMany: async (allocations) => {
        for (const a of allocations) store.set(a.id, a);
        return allocations;
      },
    };
  }

  get creditDebitNotesRepo(): Repositories['creditDebitNotes'] {
    const store = this.creditDebitNotes;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByInvoiceId: async (invId) =>
        [...store.values()].filter((n) => n.invoiceId === invId),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((n) => n.purchaseOrderId === poId),
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((n) => n.organizationId === orgId),
      save: async (n) => {
        store.set(n.id, n);
        return n;
      },
      saveMany: async (notes) => {
        for (const n of notes) store.set(n.id, n);
        return notes;
      },
    };
  }

  get tdsDeductionsRepo(): Repositories['tdsDeductions'] {
    const store = this.tdsDeductions;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByInvoiceId: async (invId) =>
        [...store.values()].filter((t) => t.invoiceId === invId),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((t) => t.purchaseOrderId === poId),
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((t) => t.organizationId === orgId),
      findBySupplierId: async (supId) =>
        [...store.values()].filter((t) => t.supplierId === supId),
      save: async (t) => {
        store.set(t.id, t);
        return t;
      },
      saveMany: async (deductions) => {
        for (const t of deductions) store.set(t.id, t);
        return deductions;
      },
    };
  }

  get poChangeOrdersRepo(): Repositories['poChangeOrders'] {
    const store = this.poChangeOrders;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((co) => co.purchaseOrderId === poId),
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((co) => co.organizationId === orgId),
      save: async (co) => {
        store.set(co.id, co);
        return co;
      },
      saveMany: async (cos) => {
        for (const co of cos) store.set(co.id, co);
        return cos;
      },
    };
  }

  get poChangeOrderItemsRepo(): Repositories['poChangeOrderItems'] {
    const store = this.poChangeOrderItems;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByChangeOrderId: async (coId) =>
        [...store.values()].filter((item) => item.changeOrderId === coId),
      save: async (item) => {
        store.set(item.id, item);
        return item;
      },
      saveMany: async (items) => {
        for (const item of items) store.set(item.id, item);
        return items;
      },
    };
  }

  get bankReconciliationsRepo(): Repositories['bankReconciliations'] {
    const store = this.bankReconciliations;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByUtrNumber: async (orgId, utr) => {
        const cleanUtr = utr.trim().toUpperCase().replace(/[\s-_]/g, '');
        return (
          [...store.values()].find(
            (r) =>
              r.organizationId === orgId &&
              r.utrNumber.trim().toUpperCase().replace(/[\s-_]/g, '') === cleanUtr,
          ) ?? null
        );
      },
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((r) => r.organizationId === orgId),
      findByPaymentId: async (payId) =>
        [...store.values()].filter((r) => r.paymentId === payId),
      save: async (r) => {
        store.set(r.id, r);
        return r;
      },
      saveMany: async (records) => {
        for (const r of records) store.set(r.id, r);
        return records;
      },
    };
  }

  get platformFeePoliciesRepo(): Repositories['platformFeePolicies'] {
    const store = this.platformFeePolicies;
    return {
      findById: async (id) => store.get(id) ?? null,
      findActivePolicy: async () =>
        [...store.values()]
          .filter((p) => p.status === 'ACTIVE')
          .sort((a, b) => b.policyVersion - a.policyVersion)[0] ?? null,
      findAll: async () => [...store.values()],
      save: async (policy) => {
        store.set(policy.id, policy);
        return policy;
      },
    };
  }

  get poFeeSnapshotsRepo(): Repositories['poFeeSnapshots'] {
    const store = this.poFeeSnapshots;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].find((s) => s.purchaseOrderId === poId) ?? null,
      save: async (snapshot) => {
        store.set(snapshot.id, snapshot);
        return snapshot;
      },
    };
  }

  get platformFeeTransactionsRepo(): Repositories['platformFeeTransactions'] {
    const store = this.platformFeeTransactions;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((tx) => tx.purchaseOrderId === poId),
      findByInvoiceId: async (invoiceId) =>
        [...store.values()].filter((tx) => tx.invoiceId === invoiceId),
      findByPaymentId: async (paymentId) =>
        [...store.values()].filter((tx) => tx.paymentId === paymentId),
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((tx) => tx.organizationId === orgId),
      save: async (tx) => {
        store.set(tx.id, tx);
        return tx;
      },
    };
  }

  get settlementReconciliationsRepo(): Repositories['settlementReconciliations'] {
    const store = this.settlementReconciliations;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByInvoiceId: async (invoiceId) =>
        [...store.values()].find((rec) => rec.invoiceId === invoiceId) ?? null,
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((rec) => rec.organizationId === orgId),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((rec) => rec.purchaseOrderId === poId),
      save: async (rec) => {
        store.set(rec.id, rec);
        return rec;
      },
    };
  }

  get settlementExceptionsRepo(): Repositories['settlementExceptions'] {
    const store = this.settlementExceptions;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByReconciliationId: async (recId) =>
        [...store.values()].filter((exc) => exc.reconciliationId === recId),
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((exc) => exc.organizationId === orgId),
      save: async (exc) => {
        store.set(exc.id, exc);
        return exc;
      },
    };
  }

  get settlementExceptionEventsRepo(): Repositories['settlementExceptionEvents'] {
    const store = this.settlementExceptionEvents;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByExceptionId: async (excId) =>
        [...store.values()].filter((evt) => evt.exceptionId === excId),
      save: async (evt) => {
        store.set(evt.id, evt);
        return evt;
      },
    };
  }

  get erpExportManifestsRepo(): Repositories['erpExportManifests'] {
    const store = this.erpExportManifests;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((m) => m.organizationId === orgId),
      findByBatchReference: async (orgId, batchRef) =>
        [...store.values()].filter(
          (m) => m.organizationId === orgId && m.batchReference === batchRef,
        ),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((m) => m.purchaseOrderId === poId),
      save: async (m) => {
        store.set(m.id, m);
        return m;
      },
    };
  }

  get accountingPeriodsRepo(): Repositories['accountingPeriods'] {
    const store = this.accountingPeriods;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((p) => p.organizationId === orgId),
      findByCode: async (orgId, periodCode) =>
        [...store.values()].find(
          (p) => p.organizationId === orgId && p.periodCode === periodCode,
        ) ?? null,
      save: async (p) => {
        store.set(p.id, p);
        return p;
      },
    };
  }

  get ledgerAccountsRepo(): Repositories['ledgerAccounts'] {
    const store = this.ledgerAccounts;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((a) => a.organizationId === orgId),
      findByCode: async (orgId, accountCode) =>
        [...store.values()].find(
          (a) => a.organizationId === orgId && a.accountCode === accountCode,
        ) ?? null,
      save: async (a) => {
        store.set(a.id, a);
        return a;
      },
      saveMany: async (accounts) => {
        for (const a of accounts) {
          store.set(a.id, a);
        }
        return accounts;
      },
    };
  }

  get journalEntriesRepo(): Repositories['journalEntries'] {
    const store = this.journalEntries;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByOrganizationId: async (orgId) =>
        [...store.values()].filter((j) => j.organizationId === orgId),
      findByPeriodId: async (periodId) =>
        [...store.values()].filter((j) => j.periodId === periodId),
      findByIdempotencyKey: async (orgId, idempotencyKey) =>
        [...store.values()].find(
          (j) => j.organizationId === orgId && j.idempotencyKey === idempotencyKey,
        ) ?? null,
      findBySourceEntity: async (sourceType, sourceId) =>
        [...store.values()].filter(
          (j) => j.sourceEntityType === sourceType && j.sourceEntityId === sourceId,
        ),
      save: async (j) => {
        store.set(j.id, j);
        return j;
      },
    };
  }

  get suppliersRepo(): Repositories['suppliers'] {
    const store = this.suppliers;
    return {
      findById: async (id) => store.get(id) ?? null,
      findActiveByCategory: async (category) =>
        [...store.values()].filter(
          (s) => s.status === 'ACTIVE' && s.categories.includes(category),
        ),
    };
  }

  get performanceRepo(): Repositories['performance'] {
    const store = this.performance;
    return {
      save: async (r) => {
        store.set(r.id, r);
        return r;
      },
    };
  }

  /** Wire all repository getters */
  asRepositories(): Repositories {
    return {
      requirements: this.requirementsRepo,
      rfqs: this.rfqsRepo,
      invitations: this.invitationsRepo,
      quotes: this.quotesRepo,
      quoteVersions: this.quoteVersionsRepo,
      votes: this.votesRepo,
      coi: this.coiRepo,
      approvals: this.approvalsRepo,
      awards: this.awardsRepo,
      purchaseOrders: this.purchaseOrdersRepo,
      poLineItems: this.poLineItemsRepo,
      workOrders: this.workOrdersRepo,
      workOrderMilestones: this.workOrderMilestonesRepo,
      invoices: this.invoicesRepo,
      invoiceLineItems: this.invoiceLineItemsRepo,
      payments: this.paymentsRepo,
      paymentAllocations: this.paymentAllocationsRepo,
      creditDebitNotes: this.creditDebitNotesRepo,
      tdsDeductions: this.tdsDeductionsRepo,
      poChangeOrders: this.poChangeOrdersRepo,
      poChangeOrderItems: this.poChangeOrderItemsRepo,
      bankReconciliations: this.bankReconciliationsRepo,
      platformFeePolicies: this.platformFeePoliciesRepo,
      poFeeSnapshots: this.poFeeSnapshotsRepo,
      platformFeeTransactions: this.platformFeeTransactionsRepo,
      settlementReconciliations: this.settlementReconciliationsRepo,
      settlementExceptions: this.settlementExceptionsRepo,
      settlementExceptionEvents: this.settlementExceptionEventsRepo,
      erpExportManifests: this.erpExportManifestsRepo,
      accountingPeriods: this.accountingPeriodsRepo,
      ledgerAccounts: this.ledgerAccountsRepo,
      journalEntries: this.journalEntriesRepo,
      suppliers: this.suppliersRepo,
      performance: this.performanceRepo,
    };
  }

  seedSupplier(supplier: Supplier): void {
    this.suppliers.set(supplier.id, supplier);
  }
}

export function createId(): string {
  return id();
}

export function timestamp(): string {
  return now();
}
