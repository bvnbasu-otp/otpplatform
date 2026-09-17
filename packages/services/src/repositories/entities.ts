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
