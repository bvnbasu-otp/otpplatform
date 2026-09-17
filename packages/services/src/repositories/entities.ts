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
  discrepancyType: 'AMOUNT_MISMATCH' | 'DATE_DRIFT' | 'UNKNOWN_UTR' | 'DUPLICATE_UTR' | 'BENEFICIARY_MISMATCH' | 'NONE';
  discrepancyDetails?: string | null;
  resolutionNotes?: string | null;
  reconciledBy?: string | null;
  reconciledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}


