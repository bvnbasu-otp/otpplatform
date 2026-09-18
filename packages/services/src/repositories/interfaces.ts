import type {
  AccountingPeriodEntity,
  ApprovalInstance,
  Award,
  BankReconciliationRecordEntity,
  BuyerRewardAllocationEntity,
  BuyerRewardPolicyEntity,
  CoiDeclaration,
  CommitteeVote,
  CreditDebitNoteEntity,
  ErpExportManifestEntity,
  Invoice,
  InvoiceLineItemEntity,
  JournalEntryEntity,
  LedgerAccountEntity,
  OrganizationWalletEntity,
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
  WalletTransactionEntity,
  WorkOrder,
  WorkOrderMilestoneEntity,
  NotificationTemplateEntity,
  NotificationPreferencesEntity,
  NotificationDispatchQueueEntity,
  WorkOrderInspectionEntity,
  WorkOrderInspectionItemEntity,
  DisputeEntity,
  DisputeEvidenceEntity,
  DisputeEventEntity,
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
  findByOrganizationId?(orgId: string): Promise<PurchaseOrder[]>;
  findBySupplierId?(supplierId: string): Promise<PurchaseOrder[]>;
  findAll?(): Promise<PurchaseOrder[]>;
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
  findByOrganizationId?(orgId: string): Promise<Invoice[]>;
  save(invoice: Invoice): Promise<Invoice>;
}

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByInvoiceId?(invoiceId: string): Promise<Payment[]>;
  findByPurchaseOrderId?(poId: string): Promise<Payment[]>;
  findByOrganizationId?(orgId: string): Promise<Payment[]>;
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

export interface CreditDebitNoteRepository {
  findById(id: string): Promise<CreditDebitNoteEntity | null>;
  findByInvoiceId(invoiceId: string): Promise<CreditDebitNoteEntity[]>;
  findByPurchaseOrderId(poId: string): Promise<CreditDebitNoteEntity[]>;
  findByOrganizationId(orgId: string): Promise<CreditDebitNoteEntity[]>;
  findBySupplierId?(supplierId: string): Promise<CreditDebitNoteEntity[]>;
  save(note: CreditDebitNoteEntity): Promise<CreditDebitNoteEntity>;
  saveMany?(notes: CreditDebitNoteEntity[]): Promise<CreditDebitNoteEntity[]>;
}

export interface TdsDeductionRepository {
  findById(id: string): Promise<TdsDeductionEntity | null>;
  findByInvoiceId(invoiceId: string): Promise<TdsDeductionEntity[]>;
  findByPurchaseOrderId(poId: string): Promise<TdsDeductionEntity[]>;
  findByOrganizationId(orgId: string): Promise<TdsDeductionEntity[]>;
  findBySupplierId?(supplierId: string): Promise<TdsDeductionEntity[]>;
  save(deduction: TdsDeductionEntity): Promise<TdsDeductionEntity>;
  saveMany?(deductions: TdsDeductionEntity[]): Promise<TdsDeductionEntity[]>;
}

export interface PoChangeOrderRepository {
  findById(id: string): Promise<PoChangeOrderEntity | null>;
  findByPurchaseOrderId(poId: string): Promise<PoChangeOrderEntity[]>;
  findByOrganizationId(orgId: string): Promise<PoChangeOrderEntity[]>;
  save(changeOrder: PoChangeOrderEntity): Promise<PoChangeOrderEntity>;
  saveMany?(changeOrders: PoChangeOrderEntity[]): Promise<PoChangeOrderEntity[]>;
}

export interface PoChangeOrderItemRepository {
  findById(id: string): Promise<PoChangeOrderItemEntity | null>;
  findByChangeOrderId(changeOrderId: string): Promise<PoChangeOrderItemEntity[]>;
  save(item: PoChangeOrderItemEntity): Promise<PoChangeOrderItemEntity>;
  saveMany(items: PoChangeOrderItemEntity[]): Promise<PoChangeOrderItemEntity[]>;
}

export interface BankReconciliationRepository {
  findById(id: string): Promise<BankReconciliationRecordEntity | null>;
  findByUtrNumber(orgId: string, utrNumber: string): Promise<BankReconciliationRecordEntity | null>;
  findByOrganizationId(orgId: string): Promise<BankReconciliationRecordEntity[]>;
  findByPaymentId?(paymentId: string): Promise<BankReconciliationRecordEntity[]>;
  save(record: BankReconciliationRecordEntity): Promise<BankReconciliationRecordEntity>;
  saveMany?(records: BankReconciliationRecordEntity[]): Promise<BankReconciliationRecordEntity[]>;
}

export interface PlatformFeePolicyRepository {
  findById(id: string): Promise<PlatformFeePolicyEntity | null>;
  findActivePolicy(): Promise<PlatformFeePolicyEntity | null>;
  findAll(): Promise<PlatformFeePolicyEntity[]>;
  save(policy: PlatformFeePolicyEntity): Promise<PlatformFeePolicyEntity>;
}

export interface PoFeeSnapshotRepository {
  findById(id: string): Promise<PoFeeSnapshotEntity | null>;
  findByPurchaseOrderId(poId: string): Promise<PoFeeSnapshotEntity | null>;
  save(snapshot: PoFeeSnapshotEntity): Promise<PoFeeSnapshotEntity>;
}

export interface PlatformFeeTransactionRepository {
  findById(id: string): Promise<PlatformFeeTransactionEntity | null>;
  findByPurchaseOrderId(poId: string): Promise<PlatformFeeTransactionEntity[]>;
  findByInvoiceId(invoiceId: string): Promise<PlatformFeeTransactionEntity[]>;
  findByPaymentId(paymentId: string): Promise<PlatformFeeTransactionEntity[]>;
  findByOrganizationId(orgId: string): Promise<PlatformFeeTransactionEntity[]>;
  save(tx: PlatformFeeTransactionEntity): Promise<PlatformFeeTransactionEntity>;
}

export interface SettlementReconciliationRepository {
  findById(id: string): Promise<SettlementReconciliationEntity | null>;
  findByInvoiceId(invoiceId: string): Promise<SettlementReconciliationEntity | null>;
  findByOrganizationId(orgId: string): Promise<SettlementReconciliationEntity[]>;
  findByPurchaseOrderId(poId: string): Promise<SettlementReconciliationEntity[]>;
  save(rec: SettlementReconciliationEntity): Promise<SettlementReconciliationEntity>;
}

export interface SettlementExceptionRepository {
  findById(id: string): Promise<SettlementExceptionEntity | null>;
  findByReconciliationId(recId: string): Promise<SettlementExceptionEntity[]>;
  findByOrganizationId(orgId: string): Promise<SettlementExceptionEntity[]>;
  save(exc: SettlementExceptionEntity): Promise<SettlementExceptionEntity>;
}

export interface SettlementExceptionEventRepository {
  findById(id: string): Promise<SettlementExceptionEventEntity | null>;
  findByExceptionId(exceptionId: string): Promise<SettlementExceptionEventEntity[]>;
  save(event: SettlementExceptionEventEntity): Promise<SettlementExceptionEventEntity>;
}

export interface ErpExportManifestRepository {
  findById(id: string): Promise<ErpExportManifestEntity | null>;
  findByOrganizationId(orgId: string): Promise<ErpExportManifestEntity[]>;
  findByBatchReference(orgId: string, batchRef: string): Promise<ErpExportManifestEntity[]>;
  findByPurchaseOrderId(poId: string): Promise<ErpExportManifestEntity[]>;
  save(manifest: ErpExportManifestEntity): Promise<ErpExportManifestEntity>;
}

export interface AccountingPeriodRepository {
  findById(id: string): Promise<AccountingPeriodEntity | null>;
  findByOrganizationId(orgId: string): Promise<AccountingPeriodEntity[]>;
  findByCode(orgId: string, periodCode: string): Promise<AccountingPeriodEntity | null>;
  save(period: AccountingPeriodEntity): Promise<AccountingPeriodEntity>;
}

export interface LedgerAccountRepository {
  findById(id: string): Promise<LedgerAccountEntity | null>;
  findByOrganizationId(orgId: string): Promise<LedgerAccountEntity[]>;
  findByCode(orgId: string, accountCode: string): Promise<LedgerAccountEntity | null>;
  save(account: LedgerAccountEntity): Promise<LedgerAccountEntity>;
  saveMany(accounts: LedgerAccountEntity[]): Promise<LedgerAccountEntity[]>;
}

export interface JournalEntryRepository {
  findById(id: string): Promise<JournalEntryEntity | null>;
  findByOrganizationId(orgId: string): Promise<JournalEntryEntity[]>;
  findByPeriodId(periodId: string): Promise<JournalEntryEntity[]>;
  findByIdempotencyKey(orgId: string, idempotencyKey: string): Promise<JournalEntryEntity | null>;
  findBySourceEntity(sourceType: string, sourceId: string): Promise<JournalEntryEntity[]>;
  save(journal: JournalEntryEntity): Promise<JournalEntryEntity>;
}

export interface OrganizationWalletRepository {
  findById(id: string): Promise<OrganizationWalletEntity | null>;
  findByOrganizationId(organizationId: string): Promise<OrganizationWalletEntity | null>;
  save(wallet: OrganizationWalletEntity): Promise<OrganizationWalletEntity>;
}

export interface WalletTransactionRepository {
  findById(id: string): Promise<WalletTransactionEntity | null>;
  findByOrganizationId(organizationId: string): Promise<WalletTransactionEntity[]>;
  findByWalletId(walletId: string): Promise<WalletTransactionEntity[]>;
  findByIdempotencyKey(key: string): Promise<WalletTransactionEntity | null>;
  save(tx: WalletTransactionEntity): Promise<WalletTransactionEntity>;
}

export interface BuyerRewardAllocationRepository {
  findById(id: string): Promise<BuyerRewardAllocationEntity | null>;
  findByOrganizationId(organizationId: string): Promise<BuyerRewardAllocationEntity[]>;
  findByPlatformFeeTxId(feeTxId: string): Promise<BuyerRewardAllocationEntity | null>;
  findByPurchaseOrderId(poId: string): Promise<BuyerRewardAllocationEntity[]>;
  save(alloc: BuyerRewardAllocationEntity): Promise<BuyerRewardAllocationEntity>;
}

export interface BuyerRewardPolicyRepository {
  findById(id: string): Promise<BuyerRewardPolicyEntity | null>;
  findActivePolicy(): Promise<BuyerRewardPolicyEntity | null>;
  save(policy: BuyerRewardPolicyEntity): Promise<BuyerRewardPolicyEntity>;
}

export interface NotificationTemplateRepository {
  findById(id: string): Promise<NotificationTemplateEntity | null>;
  findByCode(code: string): Promise<NotificationTemplateEntity | null>;
  findAll(): Promise<NotificationTemplateEntity[]>;
  save(template: NotificationTemplateEntity): Promise<NotificationTemplateEntity>;
}

export interface NotificationPreferencesRepository {
  findById(id: string): Promise<NotificationPreferencesEntity | null>;
  findByUserAndOrg(userId: string, orgId?: string | null): Promise<NotificationPreferencesEntity | null>;
  findByUserId(userId: string): Promise<NotificationPreferencesEntity[]>;
  save(prefs: NotificationPreferencesEntity): Promise<NotificationPreferencesEntity>;
}

export interface NotificationDispatchQueueRepository {
  findById(id: string): Promise<NotificationDispatchQueueEntity | null>;
  findByIdempotencyKey(key: string): Promise<NotificationDispatchQueueEntity | null>;
  findPending(): Promise<NotificationDispatchQueueEntity[]>;
  findByRecipient(recipientUserId: string): Promise<NotificationDispatchQueueEntity[]>;
  save(item: NotificationDispatchQueueEntity): Promise<NotificationDispatchQueueEntity>;
}

export interface WorkOrderInspectionRepository {
  findById(id: string): Promise<WorkOrderInspectionEntity | null>;
  findByWorkOrderId(workOrderId: string): Promise<WorkOrderInspectionEntity[]>;
  findByMilestoneId(milestoneId: string): Promise<WorkOrderInspectionEntity[]>;
  save(inspection: WorkOrderInspectionEntity): Promise<WorkOrderInspectionEntity>;
}

export interface WorkOrderInspectionItemRepository {
  findById(id: string): Promise<WorkOrderInspectionItemEntity | null>;
  findByInspectionId(inspectionId: string): Promise<WorkOrderInspectionItemEntity[]>;
  save(item: WorkOrderInspectionItemEntity): Promise<WorkOrderInspectionItemEntity>;
  saveMany(items: WorkOrderInspectionItemEntity[]): Promise<WorkOrderInspectionItemEntity[]>;
}

export interface DisputeRepository {
  findById(id: string): Promise<DisputeEntity | null>;
  findByDisputeNumber(disputeNumber: string): Promise<DisputeEntity | null>;
  findByOrganizationId(organizationId: string): Promise<DisputeEntity[]>;
  findByEntity(entityType: string, entityId: string): Promise<DisputeEntity[]>;
  findAll(): Promise<DisputeEntity[]>;
  save(dispute: DisputeEntity): Promise<DisputeEntity>;
}

export interface DisputeEvidenceRepository {
  findById(id: string): Promise<DisputeEvidenceEntity | null>;
  findByDisputeId(disputeId: string): Promise<DisputeEvidenceEntity[]>;
  save(evidence: DisputeEvidenceEntity): Promise<DisputeEvidenceEntity>;
}

export interface DisputeEventRepository {
  findById(id: string): Promise<DisputeEventEntity | null>;
  findByDisputeId(disputeId: string): Promise<DisputeEventEntity[]>;
  save(event: DisputeEventEntity): Promise<DisputeEventEntity>;
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
  creditDebitNotes?: CreditDebitNoteRepository;
  tdsDeductions?: TdsDeductionRepository;
  poChangeOrders?: PoChangeOrderRepository;
  poChangeOrderItems?: PoChangeOrderItemRepository;
  bankReconciliations?: BankReconciliationRepository;
  platformFeePolicies?: PlatformFeePolicyRepository;
  poFeeSnapshots?: PoFeeSnapshotRepository;
  platformFeeTransactions?: PlatformFeeTransactionRepository;
  settlementReconciliations?: SettlementReconciliationRepository;
  settlementExceptions?: SettlementExceptionRepository;
  settlementExceptionEvents?: SettlementExceptionEventRepository;
  erpExportManifests?: ErpExportManifestRepository;
  accountingPeriods?: AccountingPeriodRepository;
  ledgerAccounts?: LedgerAccountRepository;
  journalEntries?: JournalEntryRepository;
  organizationWallets?: OrganizationWalletRepository;
  walletTransactions?: WalletTransactionRepository;
  buyerRewardAllocations?: BuyerRewardAllocationRepository;
  buyerRewardPolicies?: BuyerRewardPolicyRepository;
  notificationTemplates?: NotificationTemplateRepository;
  notificationPreferences?: NotificationPreferencesRepository;
  notificationQueue?: NotificationDispatchQueueRepository;
  workOrderInspections?: WorkOrderInspectionRepository;
  workOrderInspectionItems?: WorkOrderInspectionItemRepository;
  disputes?: DisputeRepository;
  disputeEvidence?: DisputeEvidenceRepository;
  disputeEvents?: DisputeEventRepository;
  suppliers: SupplierRepository;
  performance: PerformanceRepository;
}
