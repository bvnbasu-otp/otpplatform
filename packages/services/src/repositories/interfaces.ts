import type {
  ApprovalInstance,
  Award,
  CoiDeclaration,
  CommitteeVote,
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

export interface PurchaseOrderLineItemRepository {
  findByPurchaseOrderId(poId: string): Promise<PurchaseOrderLineItemEntity[]>;
  save(item: PurchaseOrderLineItemEntity): Promise<PurchaseOrderLineItemEntity>;
  saveMany(items: PurchaseOrderLineItemEntity[]): Promise<PurchaseOrderLineItemEntity[]>;
}

export interface WorkOrderMilestoneRepository {
  findById(id: string): Promise<WorkOrderMilestoneEntity | null>;
  findByWorkOrderId(workOrderId: string): Promise<WorkOrderMilestoneEntity[]>;
  save(milestone: WorkOrderMilestoneEntity): Promise<WorkOrderMilestoneEntity>;
  saveMany(milestones: WorkOrderMilestoneEntity[]): Promise<WorkOrderMilestoneEntity[]>;
}

export interface InvoiceLineItemRepository {
  findByInvoiceId(invoiceId: string): Promise<InvoiceLineItemEntity[]>;
  save(item: InvoiceLineItemEntity): Promise<InvoiceLineItemEntity>;
  saveMany(items: InvoiceLineItemEntity[]): Promise<InvoiceLineItemEntity[]>;
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
  findByWorkOrderId(workOrderId: string): Promise<Invoice[]>;
  findByPurchaseOrderId(poId: string): Promise<Invoice[]>;
  save(invoice: Invoice): Promise<Invoice>;
}

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByInvoiceId?(invoiceId: string): Promise<Payment[]>;
  findByPurchaseOrderId?(poId: string): Promise<Payment[]>;
  save(payment: Payment): Promise<Payment>;
}

export interface PaymentAllocationRepository {
  findById(id: string): Promise<PaymentAllocationEntity | null>;
  findByPaymentId(paymentId: string): Promise<PaymentAllocationEntity[]>;
  findByInvoiceId(invoiceId: string): Promise<PaymentAllocationEntity[]>;
  save(allocation: PaymentAllocationEntity): Promise<PaymentAllocationEntity>;
  saveMany(allocations: PaymentAllocationEntity[]): Promise<PaymentAllocationEntity[]>;
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
  poLineItems?: PurchaseOrderLineItemRepository;
  workOrders: WorkOrderRepository;
  workOrderMilestones?: WorkOrderMilestoneRepository;
  invoices: InvoiceRepository;
  invoiceLineItems?: InvoiceLineItemRepository;
  payments: PaymentRepository;
  paymentAllocations?: PaymentAllocationRepository;
  suppliers: SupplierRepository;
  performance: PerformanceRepository;
}
