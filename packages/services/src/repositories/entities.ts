import type {
  ApprovalInstanceStatus,
  AwardStatus,
  CoiStatus,
  InviteStatus,
  InvoiceStatus,
  PaymentStatus,
  PurchaseOrderStatus,
  QuoteStatus,
  RequirementStatus,
  RequirementType,
  RfqRevealStatus,
  RfqStatus,
  VoteChoice,
  WorkOrderStatus,
  AccountClassification,
  AccountSubtype,
  JournalEntryType,
  WalletStatus,
  WalletTransactionType,
  BuyerRewardAllocationStatus,
  NotificationChannel,
  NotificationCategory,
  NotificationDispatchStatus,
  InspectionType,
  InspectionStatus,
  InspectionItemCategory,
  InspectionItemStatus,
  InspectionEvidenceMetadata,
  DisputeEntityType,
  DisputeCategory,
  DisputeSeverity,
  DisputeResolutionCategory,
  DisputeEventType,
} from '@otp/domain';
import type { StructuredSpecs } from '../interfaces/requirement-parser-service';

export interface Requirement {
  id: string;
  organizationId: string;
  createdBy: string;
  requirementType: RequirementType;
  status: RequirementStatus;
  title: string;
  description?: string;
  structuredSpecs?: StructuredSpecs;
  createdAt: string;
  updatedAt: string;
}

export interface Rfq {
  id: string;
  requirementId: string;
  organizationId: string;
  status: RfqStatus;
  revealStatus: RfqRevealStatus;
  title: string;
  quoteDeadline?: string;
  evaluationDeadline?: string;
  buyerAnonymousToSuppliers: boolean;
  minQuotesRequired: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RfqInvitation {
  id: string;
  rfqId: string;
  supplierId: string;
  anonymousLabel: string;
  status: InviteStatus;
  matchScore?: number;
  matchReasons?: string[];
  invitedAt: string;
}

export interface Quote {
  id: string;
  rfqId: string;
  supplierId: string;
  invitationId: string;
  status: QuoteStatus;
  currentVersion: number;
  evaluationScore?: number;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteVersion {
  id: string;
  quoteId: string;
  version: number;
  snapshot: QuoteSnapshot;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface QuoteSnapshot {
  basePrice: number;
  gstAmount: number;
  transportCost: number;
  totalCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  currency: string;
}

export interface CommitteeVote {
  id: string;
  rfqId: string;
  profileId: string;
  recommendedQuoteId?: string;
  choice: VoteChoice;
  comment?: string;
  castAt: string;
}

export interface CoiDeclaration {
  id: string;
  rfqId: string;
  profileId: string;
  status: CoiStatus;
  description?: string;
  declaredAt: string;
}

export interface ApprovalInstance {
  id: string;
  rfqId: string;
  policyId: string;
  status: ApprovalInstanceStatus;
}

export interface Award {
  id: string;
  rfqId: string;
  quoteId: string;
  awardedBy: string;
  justification: string;
  decisionRationale?: Record<string, unknown>;
  status: AwardStatus;
  awardedAt: string;
  revealedAt?: string;
}

export interface PurchaseOrder {
  id: string;
  awardId: string;
  rfqId: string;
  organizationId: string;
  supplierId: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  totalAmount: number;
  currency: string;
  placeOfSupplyStateCode?: string;
  placeOfSupplyBasis?: string;
  taxSnapshot?: Record<string, unknown> | null;
  taxableTotal?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  utgstTotal?: number;
  igstTotal?: number;
  issuedAt?: string;
  acknowledgedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrder {
  id: string;
  purchaseOrderId: string;
  supplierId: string;
  status: WorkOrderStatus;
  title: string;
  progressPercent: number;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderLineItemEntity {
  id: string;
  purchaseOrderId: string;
  itemIndex: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  totalAmount: number;
  hsnCode?: string | null;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface WorkOrderMilestoneEntity {
  id: string;
  workOrderId: string;
  milestoneIndex: number;
  milestoneTitle: string;
  targetPercentage: number;
  allocatedAmount: number;
  invoicedAmount: number;
  status: string;
  isInvoiced: boolean;
  deliverablePhotos?: string[];
  supplierNotes?: string | null;
  buyerNotes?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceLineItemEntity {
  id: string;
  invoiceId: string;
  poLineItemId?: string | null;
  milestoneId?: string | null;
  lineIndex: number;
  description: string;
  quantity: number;
  unitPrice: number;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  hsnCode?: string | null;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  utgstRate?: number;
  utgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Invoice {
  id: string;
  organizationId?: string;
  purchaseOrderId?: string;
  workOrderId: string;
  milestoneId?: string | null;
  supplierId: string;
  invoiceNumber: string;
  invoiceType?: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  submittedAt: string;
  paidAmount?: number;
  balanceDue?: number;
  placeOfSupplyStateCode?: string;
  placeOfSupplyBasis?: string;
  taxSnapshot?: Record<string, unknown> | null;
  taxableTotal?: number;
  cgstTotal?: number;
  sgstTotal?: number;
  utgstTotal?: number;
  igstTotal?: number;
}

export interface Payment {
  id: string;
  invoiceId?: string | null;
  purchaseOrderId?: string | null;
  amount: number;
  unallocatedAmount?: number;
  currency: string;
  method: string;
  status: PaymentStatus;
  recordedBy: string;
  recordedAt: string;
  reference?: string | null;
}

export interface PaymentAllocationEntity {
  id: string;
  paymentId: string;
  invoiceId: string;
  allocatedAmount: number;
  allocatedAt: string;
  status: 'ALLOCATED' | 'VOIDED' | 'REVERSED';
  idempotencyKey?: string | null;
  allocatedBy?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  businessName: string;
  source: string;
  status: string;
  categories: string[];
  gstin?: string;
  capabilities?: Record<string, unknown>;
  ratingAvg?: number;
  serviceArea?: Record<string, unknown>;
}

export interface ProcurementPerformanceRecord {
  id: string;
  supplierId: string;
  rfqId: string;
  organizationId: string;
  quotedTotal: number;
  actualTotal?: number;
  quotedDeliveryDays: number;
  actualDeliveryDays?: number;
  qualityRating?: number;
  recordedAt: string;
}

export interface CreditDebitNoteEntity {
  id: string;
  organizationId: string;
  purchaseOrderId?: string | null;
  invoiceId: string;
  noteNumber: string;
  noteType: 'DEBIT_NOTE' | 'CREDIT_NOTE';
  amount: number;
  taxAmount: number;
  reason: string;
  status: 'DRAFT' | 'ISSUED' | 'APPLIED' | 'CANCELLED';
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TdsDeductionEntity {
  id: string;
  organizationId: string;
  supplierId: string;
  purchaseOrderId?: string | null;
  invoiceId: string;
  paymentId?: string | null;
  lawVersion: string;
  section: string;
  taxableAmount: number;
  tdsRate: number;
  tdsAmount: number;
  status: 'PENDING' | 'DEDUCTED' | 'DEPOSITED' | 'CERTIFIED' | 'VOIDED';
  deducteePan?: string | null;
  panStatus: 'VALID' | 'INVALID' | 'ABSENT' | 'NON_FILER_206AB';
  isLowerDeduction: boolean;
  lowerDeductionCertNumber?: string | null;
  challanBsrCode?: string | null;
  challanNumber?: string | null;
  challanDate?: string | null;
  certificateNumber?: string | null;
  financialYear: string;
  assessmentYear: string;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PoChangeOrderItemEntity {
  id: string;
  changeOrderId: string;
  poLineItemId?: string | null;
  itemIndex: number;
  description: string;
  hsnSacCode?: string | null;
  quantityDelta: number;
  unit: string;
  unitPrice: number;
  amountDelta: number;
  taxAmountDelta: number;
  totalDelta: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PoChangeOrderEntity {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  changeOrderNumber: string;
  sequence: number;
  title: string;
  reason: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'COMMITTED' | 'REJECTED';
  changeType: 'SCOPE_EXPANSION' | 'SCOPE_REDUCTION' | 'SPECIFICATION_CHANGE' | 'RATE_ADJUSTMENT' | 'ADMINISTRATIVE';
  netAmountDelta: number;
  taxAmountDelta: number;
  totalDelta: number;
  previousPoTotal: number;
  revisedPoTotal: number;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  committedBy?: string | null;
  committedAt?: string | null;
  rejectionReason?: string | null;
  items?: PoChangeOrderItemEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface BankReconciliationRecordEntity {
  id: string;
  organizationId: string;
  paymentId?: string | null;
  utrNumber: string;
  bankReference?: string | null;
  bankName?: string | null;
  buyerRecordedAmount: number;
  bankClearedAmount: number;
  amountDifference: number;
  buyerRecordedDate?: string | null;
  bankClearedDate: string;
  dateDriftDays: number;
  status: 'UNRECONCILED' | 'MATCHED' | 'DISCREPANCY' | 'RESOLVED' | 'RECONCILED';
  discrepancyType: 'AMOUNT_MISMATCH' | 'DATE_DRIFT' | 'UNKNOWN_UTR' | 'DUPLICATE_UTR' | 'BENEFICIARY_MISMATCH' | 'MANUALLY_INVALIDATED' | 'NONE';
  discrepancyDetails?: string | null;
  resolutionNotes?: string | null;
  reconciledBy?: string | null;
  reconciledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFeePolicyEntity {
  id: string;
  policyVersion: number;
  feeType: 'PERCENTAGE' | 'FLAT' | 'TIERED';
  rate: number;
  minFeeAmount?: number | null;
  maxFeeAmount?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'DEPRECATED';
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PoFeeSnapshotEntity {
  id: string;
  purchaseOrderId: string;
  policyId: string;
  policyVersion: number;
  feeType: 'PERCENTAGE' | 'FLAT' | 'TIERED';
  rate: number;
  estimatedFeeAmount: number;
  isAcknowledged: boolean;
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformFeeTransactionEntity {
  id: string;
  organizationId: string;
  supplierId: string;
  purchaseOrderId: string;
  invoiceId?: string | null;
  paymentId?: string | null;
  paymentAllocationId?: string | null;
  policyId: string;
  policyVersion: number;
  grossAmount: number;
  feeRate: number;
  feeAmount: number;
  netSettlementAmount: number;
  status: 'CALCULATED' | 'DISCLOSED' | 'ACKNOWLEDGED' | 'APPLIED' | 'SETTLED' | 'VOIDED' | 'REVERSED' | 'DISPUTED';
  notes?: string | null;
  settledAt?: string | null;
  voidedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementReconciliationEntity {
  id: string;
  organizationId: string;
  supplierId: string;
  purchaseOrderId: string;
  invoiceId: string;
  paymentId?: string | null;
  invoiceGrossAmount: number;
  adjustedGrossAmount: number;
  tdsAmount: number;
  platformFeeAmount: number;
  paidAllocatedAmount: number;
  supplierNetSettlementAmount: number;
  utrNumber?: string | null;
  utrClearedAmount?: number | null;
  varianceAmount: number;
  status: 'UNRECONCILED' | 'MATCHED' | 'PARTIAL' | 'MISMATCH' | 'DISPUTED' | 'RESOLVED';
  discrepancyType: 'NONE' | 'PAYMENT_AMOUNT_MISMATCH' | 'UTR_AMOUNT_MISMATCH' | 'TDS_MISMATCH' | 'FEE_MISMATCH' | 'ALLOCATION_MISMATCH' | 'DUPLICATE_UTR' | 'MISSING_UTR' | 'EXCESS_ALLOCATION' | 'UNDER_ALLOCATION' | 'UNKNOWN';
  discrepancyDetails?: string | null;
  notes?: string | null;
  reconciledAt?: string | null;
  reconciledBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementExceptionEventEntity {
  id: string;
  exceptionId: string;
  eventType: 'CREATED' | 'ASSIGNED' | 'INVESTIGATION_NOTE' | 'STATUS_CHANGE' | 'RESOLVED' | 'REOPENED';
  fromStatus?: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | null;
  toStatus?: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | null;
  notes?: string | null;
  actorId?: string | null;
  createdAt: string;
}

export interface SettlementExceptionEntity {
  id: string;
  organizationId: string;
  reconciliationId: string;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  exceptionType: 'NONE' | 'PAYMENT_AMOUNT_MISMATCH' | 'UTR_AMOUNT_MISMATCH' | 'TDS_MISMATCH' | 'FEE_MISMATCH' | 'ALLOCATION_MISMATCH' | 'DUPLICATE_UTR' | 'MISSING_UTR' | 'EXCESS_ALLOCATION' | 'UNDER_ALLOCATION' | 'UNKNOWN';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
  amountInDispute: number;
  reason: string;
  resolutionNotes?: string | null;
  assignedTo?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  events?: SettlementExceptionEventEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface ErpExportManifestEntity {
  id: string;
  organizationId: string;
  exportType: 'TALLY_PAYMENT_VOUCHER' | 'ZOHO_PAYMENT_RECEIPT' | 'FINANCIAL_AUDIT_PACK_CSV' | 'FINANCIAL_AUDIT_PACK_JSON';
  batchReference: string;
  exportVersion: number;
  purchaseOrderId?: string | null;
  paymentId?: string | null;
  recordCount: number;
  totalAmount: number;
  payloadChecksumSha256: string;
  exportedBy?: string | null;
  exportedAt: string;
  createdAt: string;
}

export interface AccountingPeriodEntity {
  id: string;
  organizationId: string;
  periodCode: string;
  periodName: string;
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED' | 'LOCKED';
  closedAt?: string | null;
  closedBy?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  reopenedAt?: string | null;
  reopenedBy?: string | null;
  reopenReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerAccountEntity {
  id: string;
  organizationId: string;
  accountCode: string;
  accountName: string;
  classification: AccountClassification;
  subtype: AccountSubtype;
  currency: string;
  isSystemAccount: boolean;
  status: 'ACTIVE' | 'INACTIVE' | 'DEPRECATED';
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalLineEntity {
  id?: string;
  journalEntryId?: string;
  lineNumber: number;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debitAmount: number;
  creditAmount: number;
  currency?: string;
  description?: string | null;
  supplierId?: string | null;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
  paymentId?: string | null;
  createdAt?: string;
}

export interface JournalEntryEntity {
  id: string;
  organizationId: string;
  periodId: string;
  journalNumber: string;
  entryDate: string;
  entryType: JournalEntryType;
  status: 'DRAFT' | 'POSTED' | 'REVERSED';
  narration: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  idempotencyKey?: string | null;
  reversedByJournalId?: string | null;
  reversesJournalId?: string | null;
  reversalReason?: string | null;
  lines: JournalLineEntity[];
  totalDebit: number;
  totalCredit: number;
  postedBy?: string | null;
  postedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationWalletEntity {
  id: string;
  organizationId: string;
  balanceCredits: number;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransactionEntity {
  id: string;
  organizationId: string;
  walletId: string;
  txType: WalletTransactionType;
  amount: number;
  openingBalance: number;
  closingBalance: number;
  sourceEntityType: string;
  sourceEntityId?: string | null;
  idempotencyKey?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface BuyerRewardAllocationEntity {
  id: string;
  organizationId: string;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
  platformFeeTxId: string;
  settlementId?: string | null;
  procurementBaseAmount: number;
  feeRate: number;
  feeAmount: number;
  rewardShareRate: number;
  rewardAmount: number;
  status: BuyerRewardAllocationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BuyerRewardPolicyEntity {
  id: string;
  policyVersion: number;
  feeRate: number;
  rewardShareRate: number;
  minRewardAmount?: number | null;
  maxRewardAmount?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  status: 'ACTIVE' | 'SUPERSEDED' | 'DEPRECATED';
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Phase 6.5 Entities: Communications, Milestone Inspections & Disputes
// ---------------------------------------------------------------------------

export interface NotificationTemplateEntity {
  id: string;
  templateCode: string;
  version: number;
  channel: NotificationChannel;
  category: NotificationCategory;
  lifecycleStages: string[];
  subjectTemplate?: string | null;
  bodyTemplate: string;
  variablesSchema: Record<string, unknown>;
  isActive: boolean;
  requiresIdentityRedaction: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationPreferencesEntity {
  id: string;
  userId: string;
  organizationId?: string | null;
  channelPreferences: Record<NotificationChannel, boolean>;
  categoryOptOuts: NotificationCategory[];
  phoneNumber?: string | null;
  email?: string | null;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDispatchQueueEntity {
  id: string;
  organizationId?: string | null;
  recipientUserId?: string | null;
  recipientAddress: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  templateCode: string;
  templateVersion: number;
  payload: Record<string, unknown>;
  redactedPayload: Record<string, unknown>;
  isIdentityMasked: boolean;
  status: NotificationDispatchStatus;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string;
  errorLog: Array<{ timestamp: string; error: string; attempt: number }>;
  providerMessageId?: string | null;
  providerResponse?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  deliveryConfirmedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkOrderInspectionItemEntity {
  id: string;
  inspectionId: string;
  itemCode: string;
  category: InspectionItemCategory;
  description: string;
  status: InspectionItemStatus;
  score?: number | null;
  evidenceUrls: string[];
  evidenceMetadata: InspectionEvidenceMetadata[];
  notes?: string | null;
  createdAt: string;
}

export interface WorkOrderInspectionEntity {
  id: string;
  workOrderId: string;
  milestoneId: string;
  organizationId: string;
  inspectorId: string;
  inspectionType: InspectionType;
  status: InspectionStatus;
  checklistTemplateCode: string;
  overallScore?: number | null;
  passed: boolean;
  digitalSignoffHash?: string | null;
  reworkReason?: string | null;
  reworkCount: number;
  evidenceVersion: number;
  notes?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  items?: WorkOrderInspectionItemEntity[];
  createdAt: string;
  updatedAt: string;
}

export interface DisputeEvidenceEntity {
  id: string;
  disputeId: string;
  uploadedBy: string;
  fileName: string;
  fileUrl: string;
  fileSizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  description?: string | null;
  isImmutable: boolean;
  createdAt: string;
}

export interface DisputeEventEntity {
  id: string;
  disputeId: string;
  eventType: DisputeEventType;
  actorId: string;
  actorRole: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  previousEscalationLevel?: number | null;
  newEscalationLevel?: number | null;
  notes?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface DisputeEntity {
  id: string;
  disputeNumber: string;
  organizationId: string;
  counterpartyOrganizationId?: string | null;
  entityType: DisputeEntityType;
  entityId: string;
  category: DisputeCategory;
  severity: DisputeSeverity;
  status: 'OPEN' | 'UNDER_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'CLOSED' | 'WITHDRAWN';
  escalationLevel: number;
  disputedAmount: number;
  currency: string;
  title: string;
  description: string;
  slaDeadline: string;
  openedBy: string;
  assignedTo?: string | null;
  resolvedBy?: string | null;
  resolutionSummary?: string | null;
  resolutionCategory?: DisputeResolutionCategory | null;
  resolvedAt?: string | null;
  evidence?: DisputeEvidenceEntity[];
  events?: DisputeEventEntity[];
  createdAt: string;
  updatedAt: string;
}






