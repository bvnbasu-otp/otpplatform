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

export interface RequirementRepository {
  findById(id: string): Promise<Requirement | null>;
  save(requirement: Requirement): Promise<Requirement>;
}

export interface RfqRepository {
  findById(id: string): Promise<Rfq | null>;
  findByRequirementId(requirementId: string): Promise<Rfq | null>;
  save(rfq: Rfq): Promise<Rfq>;
}

export interface InvitationRepository {
  findByRfqId(rfqId: string): Promise<RfqInvitation[]>;
  findById(id: string): Promise<RfqInvitation | null>;
  save(invitation: RfqInvitation): Promise<RfqInvitation>;
  saveMany(invitations: RfqInvitation[]): Promise<RfqInvitation[]>;
}

export interface QuoteRepository {
  findById(id: string): Promise<Quote | null>;
  findByRfqId(rfqId: string): Promise<Quote[]>;
  save(quote: Quote): Promise<Quote>;
}

export interface QuoteVersionRepository {
  findByQuoteId(quoteId: string): Promise<QuoteVersion[]>;
  save(version: QuoteVersion): Promise<QuoteVersion>;
}

export interface CommitteeVoteRepository {
  findByRfqId(rfqId: string): Promise<CommitteeVote[]>;
  save(vote: CommitteeVote): Promise<CommitteeVote>;
}

export interface CoiRepository {
  findByRfqAndProfile(rfqId: string, profileId: string): Promise<CoiDeclaration | null>;
  save(decl: CoiDeclaration): Promise<CoiDeclaration>;
}

export interface ApprovalRepository {
  findByRfqId(rfqId: string): Promise<ApprovalInstance | null>;
  save(instance: ApprovalInstance): Promise<ApprovalInstance>;
}

export interface AwardRepository {
  findById(id: string): Promise<Award | null>;
  findByRfqId(rfqId: string): Promise<Award | null>;
  save(award: Award): Promise<Award>;
}

export interface PurchaseOrderRepository {
  findById(id: string): Promise<PurchaseOrder | null>;
  save(po: PurchaseOrder): Promise<PurchaseOrder>;
}

export interface WorkOrderRepository {
  findById(id: string): Promise<WorkOrder | null>;
  findByPurchaseOrderId(poId: string): Promise<WorkOrder | null>;
  save(wo: WorkOrder): Promise<WorkOrder>;
}

export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  save(invoice: Invoice): Promise<Invoice>;
}

export interface PaymentRepository {
  save(payment: Payment): Promise<Payment>;
}

export interface SupplierRepository {
  findById(id: string): Promise<Supplier | null>;
  findActiveByCategory(category: string): Promise<Supplier[]>;
}

export interface PerformanceRepository {
  save(record: ProcurementPerformanceRecord): Promise<ProcurementPerformanceRecord>;
}

export interface Repositories {
  requirements: RequirementRepository;
  rfqs: RfqRepository;
  invitations: InvitationRepository;
  quotes: QuoteRepository;
  quoteVersions: QuoteVersionRepository;
  votes: CommitteeVoteRepository;
  coi: CoiRepository;
  approvals: ApprovalRepository;
  awards: AwardRepository;
  purchaseOrders: PurchaseOrderRepository;
  workOrders: WorkOrderRepository;
  invoices: InvoiceRepository;
  payments: PaymentRepository;
  suppliers: SupplierRepository;
  performance: PerformanceRepository;
}
