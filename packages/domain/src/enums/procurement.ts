export const RequirementType = {
  PRODUCT: 'PRODUCT',
  SERVICE: 'SERVICE',
  PROJECT: 'PROJECT',
} as const;

export type RequirementType =
  (typeof RequirementType)[keyof typeof RequirementType];

export const RequirementStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  RFQ_CREATED: 'RFQ_CREATED',
  QUOTING: 'QUOTING',
  NEGOTIATION: 'NEGOTIATION',
  EVALUATION: 'EVALUATION',
  AWARDED: 'AWARDED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type RequirementStatus =
  (typeof RequirementStatus)[keyof typeof RequirementStatus];

export const RfqStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  CLARIFICATION: 'CLARIFICATION',
  CLOSED: 'CLOSED',
  EVALUATING: 'EVALUATING',
  AWARDED: 'AWARDED',
  CANCELLED: 'CANCELLED',
} as const;

export type RfqStatus = (typeof RfqStatus)[keyof typeof RfqStatus];

export const RfqRevealStatus = {
  PROTECTED: 'PROTECTED',
  REVEALED: 'REVEALED',
  /** @deprecated Use PROTECTED */
  BLIND: 'BLIND',
} as const;

export type RfqRevealStatus =
  (typeof RfqRevealStatus)[keyof typeof RfqRevealStatus];

export const QuoteStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  REVISED: 'REVISED',
  FINAL: 'FINAL',
  SELECTED: 'SELECTED',
  NOT_SELECTED: 'NOT_SELECTED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const InviteStatus = {
  INVITED: 'INVITED',
  VIEWED: 'VIEWED',
  DECLINED: 'DECLINED',
  QUOTED: 'QUOTED',
} as const;

export type InviteStatus = (typeof InviteStatus)[keyof typeof InviteStatus];

export const AwardStatus = {
  LOCKED: 'LOCKED',
  AWARD_LOCKED: 'AWARD_LOCKED',
  PENDING_REVEAL: 'PENDING_REVEAL',
  IDENTITY_UNMASKED: 'IDENTITY_UNMASKED',
  REVEALED: 'REVEALED',
} as const;

export type AwardStatus = (typeof AwardStatus)[keyof typeof AwardStatus];

export const PurchaseOrderStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  ISSUED: 'ISSUED',
  ACCEPTED: 'ACCEPTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type PurchaseOrderStatus =
  (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

export const WorkOrderStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  DISPUTED: 'DISPUTED',
} as const;

export type WorkOrderStatus =
  (typeof WorkOrderStatus)[keyof typeof WorkOrderStatus];

export const InvoiceStatus = {
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  REJECTED: 'REJECTED',
  PAID: 'PAID',
} as const;

export type InvoiceStatus =
  (typeof InvoiceStatus)[keyof typeof InvoiceStatus];

export const PaymentAllocationStatus = {
  ALLOCATED: 'ALLOCATED',
  VOIDED: 'VOIDED',
  REVERSED: 'REVERSED',
} as const;

export type PaymentAllocationStatus =
  (typeof PaymentAllocationStatus)[keyof typeof PaymentAllocationStatus];

export const InvoiceType = {
  PROGRESSIVE: 'PROGRESSIVE',
  FINAL: 'FINAL',
  ADVANCE: 'ADVANCE',
  STANDARD: 'STANDARD',
} as const;

export type InvoiceType =
  (typeof InvoiceType)[keyof typeof InvoiceType];

export const MilestoneStatus = {
  PENDING: 'PENDING',
  SUBMITTED_BY_SUPPLIER: 'SUBMITTED_BY_SUPPLIER',
  VERIFIED_BY_BUYER: 'VERIFIED_BY_BUYER',
  DISPUTED: 'DISPUTED',
} as const;

export type MilestoneStatus =
  (typeof MilestoneStatus)[keyof typeof MilestoneStatus];

export const PaymentMethod = {
  MANUAL: 'MANUAL',
  UPI: 'UPI',
  BANK_TRANSFER: 'BANK_TRANSFER',
  OTHER: 'OTHER',
} as const;

export type PaymentMethod =
  (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  RECORDED: 'RECORDED',
  VERIFIED: 'VERIFIED',
  DISPUTED: 'DISPUTED',
} as const;

export type PaymentStatus =
  (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentGatewayStatus = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type PaymentGatewayStatus =
  (typeof PaymentGatewayStatus)[keyof typeof PaymentGatewayStatus];

export const EvaluationStatus = {
  PENDING: 'PENDING',
  COMPUTED: 'COMPUTED',
  STALE: 'STALE',
} as const;

export type EvaluationStatus =
  (typeof EvaluationStatus)[keyof typeof EvaluationStatus];

// CoiStatus, VoteChoice, ApprovalPolicyType and ApprovalInstanceStatus live in
// ./governance, which is the definition the state-machine doc describes. They
// were duplicated here with a narrower ApprovalInstanceStatus, which made both
// copies ambiguous through the package barrel and silently unavailable to
// importers.

export const DisputeStatus = {
  OPEN: 'OPEN',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ESCALATED: 'ESCALATED',
  RESOLVED: 'RESOLVED',
  CLOSED: 'CLOSED',
  WITHDRAWN: 'WITHDRAWN',
} as const;

export type DisputeStatus =
  (typeof DisputeStatus)[keyof typeof DisputeStatus];

/**
 * Canonical 14-Stage Procurement Lifecycle
 *
 * Sequence:
 * Requirement -> Discovery -> RFQ -> Identity-Protected Evaluation ->
 * Market Intelligence -> Committee Vote -> Award -> Reveal ->
 * PO -> Work Order -> Invoice -> Payment -> Performance -> Audit
 */
export const CANONICAL_PROCUREMENT_LIFECYCLE = [
  'Requirement',
  'Discovery',
  'RFQ',
  'Identity-Protected Evaluation',
  'Market Intelligence',
  'Committee Vote',
  'Award',
  'Reveal',
  'PO',
  'Work Order',
  'Invoice',
  'Payment',
  'Performance',
  'Audit',
] as const;

export type CanonicalProcurementStage =
  (typeof CANONICAL_PROCUREMENT_LIFECYCLE)[number];

// NotificationChannel and NotificationStatus live in ./notifications, for the
// same reason.
