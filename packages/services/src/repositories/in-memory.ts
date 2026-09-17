import type { Repositories } from './interfaces';
import type {
  ApprovalInstance,
  Award,
  CoiDeclaration,
  CommitteeVote,
  CreditDebitNoteEntity,
  Invoice,
  InvoiceLineItemEntity,
  Payment,
  PaymentAllocationEntity,
  ProcurementPerformanceRecord,
  PurchaseOrder,
  PurchaseOrderLineItemEntity,
  Quote,
  QuoteVersion,
  Requirement,
  Rfq,
  RfqInvitation,
  Supplier,
  WorkOrder,
  WorkOrderMilestoneEntity,
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
  suppliers = new Map<string, Supplier>();
  performance = new Map<string, ProcurementPerformanceRecord>();

  static create(): InMemoryRepositories {
    return new InMemoryRepositories();
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
    return {
      findById: async (id) => store.get(id) ?? null,
      findByWorkOrderId: async (woId) =>
        [...store.values()].filter((i) => i.workOrderId === woId),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((i) => i.purchaseOrderId === poId),
      save: async (i) => {
        store.set(i.id, i);
        return i;
      },
    };
  }

  get paymentsRepo(): Repositories['payments'] {
    const store = this.payments;
    return {
      findById: async (id) => store.get(id) ?? null,
      findByInvoiceId: async (invId) =>
        [...store.values()].filter((p) => p.invoiceId === invId),
      findByPurchaseOrderId: async (poId) =>
        [...store.values()].filter((p) => p.purchaseOrderId === poId),
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
