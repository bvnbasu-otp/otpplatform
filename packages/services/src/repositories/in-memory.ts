import type { Repositories } from './interfaces';
import type {
  ApprovalInstance,
  Award,
  CoiDeclaration,
  CommitteeVote,
  Invoice,
  Payment,
  ProcurementPerformanceRecord,
  PurchaseOrder,
  Quote,
  QuoteVersion,
  Requirement,
  Rfq,
  RfqInvitation,
  Supplier,
  WorkOrder,
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
  workOrders = new Map<string, WorkOrder>();
  invoices = new Map<string, Invoice>();
  payments = new Map<string, Payment>();
  suppliers = new Map<string, Supplier>();
  performance = new Map<string, ProcurementPerformanceRecord>();

  static create(): InMemoryRepositories {
    return new InMemoryRepositories();
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
      save: async (i) => {
        store.set(i.id, i);
        return i;
      },
    };
  }

  get paymentsRepo(): Repositories['payments'] {
    const store = this.payments;
    return {
      save: async (p) => {
        store.set(p.id, p);
        return p;
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
      workOrders: this.workOrdersRepo,
      invoices: this.invoicesRepo,
      payments: this.paymentsRepo,
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
