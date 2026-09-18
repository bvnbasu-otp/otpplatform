import type { DisputeStatus } from '../enums/procurement';
export type { DisputeStatus };

/**
 * OTP Phase 6.5: Dispute Resolution & Exception Escalation Domain Model
 *
 * Implements structured exception lifecycle management across procurement artifacts
 * (PO, WO, Milestone, Invoice, Payment, Settlement, Delivery), multi-tier escalation hierarchy,
 * SLA breach tracking, immutable evidence auditing, and financial segregation invariants.
 *
 * STRICT INVARIANT: Disputes and escalations MUST NOT silently move money, reverse payments,
 * or mutate settlement records without explicit financial operation invocation.
 */

export type DisputeEntityType =
  | 'PURCHASE_ORDER'
  | 'WORK_ORDER'
  | 'MILESTONE'
  | 'INVOICE'
  | 'PAYMENT'
  | 'SETTLEMENT'
  | 'DELIVERY';

export const DISPUTE_ENTITY_TYPES: readonly DisputeEntityType[] = [
  'PURCHASE_ORDER',
  'WORK_ORDER',
  'MILESTONE',
  'INVOICE',
  'PAYMENT',
  'SETTLEMENT',
  'DELIVERY',
] as const;

export type DisputeCategory =
  | 'QUALITY_DEFICIENCY'
  | 'DELIVERY_DELAY'
  | 'NON_PERFORMANCE'
  | 'SPEC_DEVIATION'
  | 'BILLING_DISCREPANCY'
  | 'MILESTONE_REJECTION'
  | 'PAYMENT_SHORTAGE'
  | 'UNAUTHORIZED_ALTERATION';

export const DISPUTE_CATEGORIES: readonly DisputeCategory[] = [
  'QUALITY_DEFICIENCY',
  'DELIVERY_DELAY',
  'NON_PERFORMANCE',
  'SPEC_DEVIATION',
  'BILLING_DISCREPANCY',
  'MILESTONE_REJECTION',
  'PAYMENT_SHORTAGE',
  'UNAUTHORIZED_ALTERATION',
] as const;

export type DisputeSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const DISPUTE_SEVERITIES: readonly DisputeSeverity[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

export const DISPUTE_STATUSES: readonly DisputeStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'WITHDRAWN',
] as const;

export type DisputeResolutionCategory =
  | 'NO_ACTION_REQUIRED'
  | 'REWORK_AGREED'
  | 'PRICE_ADJUSTMENT_MUTUAL'
  | 'CHANGE_ORDER_ISSUED'
  | 'TERMINATION_SETTLED'
  | 'CLAIM_REJECTED';

export const DISPUTE_RESOLUTION_CATEGORIES: readonly DisputeResolutionCategory[] = [
  'NO_ACTION_REQUIRED',
  'REWORK_AGREED',
  'PRICE_ADJUSTMENT_MUTUAL',
  'CHANGE_ORDER_ISSUED',
  'TERMINATION_SETTLED',
  'CLAIM_REJECTED',
] as const;

export type DisputeEventType =
  | 'OPENED'
  | 'COMMENT_ADDED'
  | 'EVIDENCE_ATTACHED'
  | 'ESCALATED'
  | 'ASSIGNED'
  | 'REBUTTAL_SUBMITTED'
  | 'STATUS_CHANGED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REOPENED';

export const DISPUTE_EVENT_TYPES: readonly DisputeEventType[] = [
  'OPENED',
  'COMMENT_ADDED',
  'EVIDENCE_ATTACHED',
  'ESCALATED',
  'ASSIGNED',
  'REBUTTAL_SUBMITTED',
  'STATUS_CHANGED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
] as const;

export interface DisputeEvidence {
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

export interface DisputeEvent {
  id: string;
  disputeId: string;
  eventType: DisputeEventType;
  actorId: string;
  actorRole: string;
  previousStatus?: DisputeStatus | null;
  newStatus?: DisputeStatus | null;
  previousEscalationLevel?: number | null;
  newEscalationLevel?: number | null;
  notes?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface Dispute {
  id: string;
  disputeNumber: string;
  organizationId: string;
  counterpartyOrganizationId?: string | null;
  entityType: DisputeEntityType;
  entityId: string;
  category: DisputeCategory;
  severity: DisputeSeverity;
  status: DisputeStatus;
  escalationLevel: number; // 1 to 4
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
  createdAt: string;
  updatedAt: string;
  evidence?: DisputeEvidence[];
  events?: DisputeEvent[];
}

export const SLA_HOURS_BY_SEVERITY: Record<DisputeSeverity, number> = {
  CRITICAL: 24,
  HIGH: 48,
  MEDIUM: 72,
  LOW: 120,
};

/**
 * Calculates the SLA expiration timestamp based on initial severity.
 */
export function calculateDisputeSlaDeadline(
  openedAt: string,
  severity: DisputeSeverity,
): string {
  const hours = SLA_HOURS_BY_SEVERITY[severity] || 72;
  const openedDate = new Date(openedAt);
  const deadline = new Date(openedDate.getTime() + hours * 60 * 60 * 1000);
  return deadline.toISOString();
}

/**
 * Checks if the dispute has breached its SLA deadline.
 */
export function isSlaBreached(slaDeadline: string, currentTimeStr?: string): boolean {
  const current = currentTimeStr ? new Date(currentTimeStr).getTime() : Date.now();
  const deadline = new Date(slaDeadline).getTime();
  return current > deadline;
}

/**
 * Computes next escalation level (capped at 4).
 */
export function getNextEscalationLevel(currentLevel: number): number {
  if (currentLevel < 1) return 1;
  if (currentLevel >= 4) return 4;
  return currentLevel + 1;
}

/**
 * Validates whether a dispute can be escalated.
 */
export function canEscalateDispute(status: DisputeStatus, currentLevel: number): boolean {
  if (status === 'RESOLVED' || status === 'CLOSED' || status === 'WITHDRAWN') {
    return false;
  }
  return currentLevel < 4;
}

const ALLOWED_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  OPEN: ['UNDER_REVIEW', 'ESCALATED', 'RESOLVED', 'CLOSED', 'WITHDRAWN'],
  UNDER_REVIEW: ['ESCALATED', 'RESOLVED', 'CLOSED', 'WITHDRAWN'],
  ESCALATED: ['UNDER_REVIEW', 'RESOLVED', 'CLOSED', 'WITHDRAWN'],
  RESOLVED: ['CLOSED', 'OPEN'], // Reopen allowed under special conditions
  CLOSED: [],
  WITHDRAWN: [],
};

/**
 * Validates legal state transitions for disputes.
 */
export function validateDisputeTransition(
  currentStatus: DisputeStatus,
  targetStatus: DisputeStatus,
): boolean {
  if (currentStatus === targetStatus) return true;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

/**
 * Validates dispute monetary amount against baseline bounds.
 */
export function validateDisputeAmount(amount: number, maxAllowedAmount?: number): boolean {
  if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
    return false;
  }
  if (maxAllowedAmount !== undefined && amount > maxAllowedAmount) {
    return false;
  }
  return true;
}
