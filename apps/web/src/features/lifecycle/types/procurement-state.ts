import type {
  InvoiceStatus,
  PaymentStatus,
  PurchaseOrderStatus,
  RequirementStatus,
  RfqRevealStatus,
  RfqStatus,
  WorkOrderStatus,
  ProcurementStepNumber,
  LinearStepDescriptor,
} from '@otp/domain';
import {
  LINEAR_PROCUREMENT_STEPS,
  PROCUREMENT_STEP_NUMBERS,
  ProcurementStepCode,
} from '@otp/domain';
import type { LifecycleSignals } from './lifecycle';

export {
  LINEAR_PROCUREMENT_STEPS,
  PROCUREMENT_STEP_NUMBERS,
  ProcurementStepCode,
  type ProcurementStepNumber,
  type LinearStepDescriptor,
};

/**
 * The 8 Core Procurement Lifecycle States of the OTP Platform (Legacy & Milestone Mapping)
 */
export type CoreProcurementState =
  | 'DRAFT'
  | 'QUOTING'
  | 'EVALUATING'
  | 'AWARDED'
  | 'PO_ISSUED'
  | 'INVOICED'
  | 'SETTLED'
  | 'STALLED';

export interface ProcurementStateDescriptor {
  key: CoreProcurementState;
  stepNumber: number; // 1 to 7, 0 for STALLED
  title: string;
  shortLabel: string;
  tagline: string;
  description: string;
  icon: string;
  badgeClass: string;
  pillBorderClass: string;
  activeBgClass: string;
  isOverlay?: boolean;
}

export const CORE_PROCUREMENT_STATES: Record<CoreProcurementState, ProcurementStateDescriptor> = {
  DRAFT: {
    key: 'DRAFT',
    stepNumber: 1,
    title: '1. Draft & Specification',
    shortLabel: 'Draft',
    tagline: 'Specification authoring & budget definition',
    description: 'Requirement details, technical parameters, delivery terms, and commercial scope are being drafted.',
    icon: '📝',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    pillBorderClass: 'border-slate-300 dark:border-slate-700',
    activeBgClass: 'bg-slate-500/10 text-slate-900 dark:text-slate-100 border-slate-400',
  },
  QUOTING: {
    key: 'QUOTING',
    stepNumber: 2,
    title: '2. Sourcing & Quoting',
    shortLabel: 'Quoting',
    tagline: 'Supplier discovery, RFQ publication & sealed quoting',
    description: 'Verified suppliers discovered and invited. Anonymous quotes are submitted and clarification Q&A conducted.',
    icon: '💬',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800/60',
    pillBorderClass: 'border-purple-300 dark:border-purple-800',
    activeBgClass: 'bg-purple-500/10 text-purple-900 dark:text-purple-200 border-purple-500',
  },
  EVALUATING: {
    key: 'EVALUATING',
    stepNumber: 3,
    title: '3. Evaluation & Voting',
    shortLabel: 'Evaluating',
    tagline: 'Identity-protected comparison & committee quorum voting',
    description: 'Sealed quotes compared side-by-side on price, specs, and turnaround. Committee quorum vote decides the award.',
    icon: '⚖️',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/60',
    pillBorderClass: 'border-amber-300 dark:border-amber-700',
    activeBgClass: 'bg-amber-500/10 text-amber-900 dark:text-amber-200 border-amber-500',
  },
  AWARDED: {
    key: 'AWARDED',
    stepNumber: 4,
    title: '4. Award & Identity Reveal',
    shortLabel: 'Awarded',
    tagline: 'Winner selection, supplier reveal & contract lock',
    description: 'Winning quote confirmed. Winning supplier identity is unmasked and legal contract terms are locked.',
    icon: '🏆',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800/60',
    pillBorderClass: 'border-teal-300 dark:border-teal-700',
    activeBgClass: 'bg-teal-500/10 text-teal-900 dark:text-teal-200 border-teal-500',
  },
  PO_ISSUED: {
    key: 'PO_ISSUED',
    stepNumber: 5,
    title: '5. PO & Execution',
    shortLabel: 'PO Issued',
    tagline: 'Purchase order acceptance, milestone fulfillment & delivery inspection',
    description: 'Official PO accepted by supplier. Work order tracked through 0–100% milestones with on-site buyer sign-off.',
    icon: '📦',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800/60',
    pillBorderClass: 'border-blue-300 dark:border-blue-700',
    activeBgClass: 'bg-blue-500/10 text-blue-900 dark:text-blue-200 border-blue-500',
  },
  INVOICED: {
    key: 'INVOICED',
    stepNumber: 6,
    title: '6. Invoiced & GST Review',
    shortLabel: 'Invoiced',
    tagline: 'Commercial GST invoice matching & commercial sign-off',
    description: 'Supplier submitted commercial GST tax invoice. Line items, GSTIN verification, and buyer approval in review.',
    icon: '🧾',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800/60',
    pillBorderClass: 'border-indigo-300 dark:border-indigo-700',
    activeBgClass: 'bg-indigo-500/10 text-indigo-900 dark:text-indigo-200 border-indigo-500',
  },
  SETTLED: {
    key: 'SETTLED',
    stepNumber: 7,
    title: '7. Settled & Completed',
    shortLabel: 'Settled',
    tagline: 'Payment reconciliation, performance rating & immutable audit closeout',
    description: 'Payment verified and remitted. Performance rating recorded and transaction sealed in immutable audit log.',
    icon: '🏁',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800/60',
    pillBorderClass: 'border-emerald-300 dark:border-emerald-700',
    activeBgClass: 'bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 border-emerald-500',
  },
  STALLED: {
    key: 'STALLED',
    stepNumber: 0,
    title: '⚠️ Stalled (>24h Inactive)',
    shortLabel: 'Stalled',
    tagline: 'SLA timeout or pending blocker requiring immediate unblocking',
    description: 'Order has exceeded time threshold (>24 hours) without progress at current stage.',
    icon: '⚠️',
    badgeClass: 'bg-red-100 text-red-900 border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800 font-bold',
    pillBorderClass: 'border-red-400 dark:border-red-700',
    activeBgClass: 'bg-red-500/10 text-red-900 dark:text-red-200 border-red-500',
    isOverlay: true,
  },
};

export const CHRONOLOGICAL_STAGES: CoreProcurementState[] = [
  'DRAFT',
  'QUOTING',
  'EVALUATING',
  'AWARDED',
  'PO_ISSUED',
  'INVOICED',
  'SETTLED',
];

/**
 * Determines whether an order is considered STALLED based on inactivity hours (>24h).
 */
export function isOrderStalled(
  signals: LifecycleSignals,
  lastActivityAt?: string | null,
  idleHours?: number,
): boolean {
  if (
    signals.requirementStatus === 'COMPLETED' ||
    signals.requirementStatus === 'CANCELLED' ||
    signals.rfqStatus === 'CANCELLED' ||
    signals.poStatus === 'COMPLETED' ||
    signals.poStatus === 'CANCELLED' ||
    signals.paymentStatus === 'VERIFIED'
  ) {
    return false;
  }

  if (typeof idleHours === 'number') {
    return idleHours > 24;
  }

  if (lastActivityAt) {
    const elapsedMs = Date.now() - new Date(lastActivityAt).getTime();
    return elapsedMs > 24 * 60 * 60 * 1000;
  }

  return false;
}

/**
 * Derives the exact CoreProcurementState from the golden-path lifecycle signals.
 */
export function deriveCoreProcurementState(
  signals: LifecycleSignals,
  options?: {
    lastActivityAt?: string | null;
    idleHours?: number;
    checkStalled?: boolean;
  },
): CoreProcurementState {
  if (options?.checkStalled && isOrderStalled(signals, options.lastActivityAt, options.idleHours)) {
    return 'STALLED';
  }

  if (
    signals.paymentStatus === 'VERIFIED' ||
    signals.invoiceStatus === 'PAID' ||
    signals.requirementStatus === 'COMPLETED'
  ) {
    return 'SETTLED';
  }

  if (
    signals.invoiceStatus === 'SUBMITTED' ||
    signals.invoiceStatus === 'APPROVED' ||
    signals.paymentStatus === 'RECORDED'
  ) {
    return 'INVOICED';
  }

  if (
    signals.poStatus === 'ACCEPTED' ||
    signals.poStatus === 'IN_PROGRESS' ||
    signals.workOrderStatus != null ||
    (signals.workOrderProgressPercent != null && signals.workOrderProgressPercent > 0) ||
    signals.requirementStatus === 'IN_PROGRESS'
  ) {
    return 'PO_ISSUED';
  }

  if (signals.poStatus === 'ISSUED' || signals.poStatus === 'DRAFT') {
    return 'PO_ISSUED';
  }

  if (
    signals.rfqStatus === 'AWARDED' ||
    signals.revealStatus === 'REVEALED' ||
    signals.requirementStatus === 'AWARDED'
  ) {
    return 'AWARDED';
  }

  if (
    signals.rfqStatus === 'EVALUATING' ||
    signals.rfqStatus === 'CLOSED' ||
    signals.requirementStatus === 'EVALUATION'
  ) {
    return 'EVALUATING';
  }

  if (
    signals.rfqStatus === 'OPEN' ||
    signals.rfqStatus === 'CLARIFICATION' ||
    signals.requirementStatus === 'QUOTING' ||
    signals.requirementStatus === 'NEGOTIATION'
  ) {
    return 'QUOTING';
  }

  return 'DRAFT';
}

/**
 * Derives the exact linear step number (1..15) from lifecycle signals and route context.
 */
export function deriveLinearStepNumber(
  signals?: LifecycleSignals | null,
  currentRoute?: string
): ProcurementStepNumber {
  const path = currentRoute || (typeof window !== 'undefined' ? window.location.pathname : '');

  // Specific route matches
  if (path.includes('/market-intelligence')) return 3;
  if (path.includes('/voting-room/ballot') || path.includes('/committee')) return 8;
  if (path.includes('/voting-room')) return 7;
  if (path.includes('/comparison') || path.includes('/evaluation') || path.includes('/quotes')) return 6;
  if (path.includes('/clarification')) return 4;
  if (path.includes('/discover')) return 2;
  if (path.includes('/award-justification')) return 9;
  if (path.includes('/award-lock') || path.includes('/award')) return 10;
  if (path.includes('/contract')) return 11;
  if (path.includes('/reveal')) return 12;
  if (path.includes('/purchase-orders')) {
    if (path.includes('stage=settled') || path.includes('/rating-settlement')) return 15;
    if (path.includes('stage=execution') || path.includes('/execution')) return 14;
    return 13;
  }

  if (!signals) return 1;

  if (signals.paymentStatus === 'VERIFIED' || signals.requirementStatus === 'COMPLETED') return 15;
  if (signals.poStatus === 'ACCEPTED' || signals.requirementStatus === 'IN_PROGRESS') return 14;
  if (signals.poStatus === 'ISSUED') return 13;
  if (signals.revealStatus === 'REVEALED') return 12;
  if (signals.rfqStatus === 'AWARDED') return 10;
  if (signals.rfqStatus === 'EVALUATING') return 6;
  if (signals.rfqStatus === 'CLARIFICATION') return 4;
  if (signals.rfqStatus === 'OPEN') return 2;

  return 1;
}

export function getLinearStepState(
  stepNumber: ProcurementStepNumber,
  currentStep: ProcurementStepNumber
): 'DONE' | 'CURRENT' | 'PENDING' {
  if (stepNumber < currentStep) return 'DONE';
  if (stepNumber === currentStep) return 'CURRENT';
  return 'PENDING';
}

export function resolveLinearStepUrl(
  stepNumber: ProcurementStepNumber,
  ids: {
    requirementId?: string | null;
    rfqId?: string | null;
    poId?: string | null;
  }
): string {
  const { requirementId, rfqId, poId } = ids;

  switch (stepNumber) {
    case 1:
      return requirementId ? `/requirements/${requirementId}` : '/requirements/new';
    case 2:
      return requirementId ? `/requirements/${requirementId}/discover` : '/dashboard';
    case 3:
      return requirementId
        ? `/requirements/${requirementId}/market-intelligence`
        : rfqId
        ? `/rfq/${rfqId}/market-intelligence`
        : '/dashboard';
    case 4:
    case 5:
      return rfqId ? `/rfq/${rfqId}/clarification` : '/dashboard';
    case 6:
      return rfqId ? `/rfq/${rfqId}/evaluation` : '/dashboard';
    case 7:
    case 8:
      return rfqId ? `/rfq/${rfqId}/committee` : '/dashboard';
    case 9:
    case 10:
      return rfqId ? `/rfq/${rfqId}/award` : '/dashboard';
    case 11:
      return rfqId ? `/rfq/${rfqId}/award?stage=contract` : '/dashboard';
    case 12:
      return rfqId ? `/rfq/${rfqId}/reveal` : '/dashboard';
    case 13:
      return poId ? `/purchase-orders/${poId}` : '/purchase-orders';
    case 14:
      return poId ? `/purchase-orders/${poId}?stage=execution` : '/purchase-orders';
    case 15:
      return poId ? `/purchase-orders/${poId}?stage=settled` : '/purchase-orders';
    default:
      return '/dashboard';
  }
}

export function getStageStepState(
  stage: CoreProcurementState,
  currentStage: CoreProcurementState,
  isCancelled: boolean = false,
): 'DONE' | 'CURRENT' | 'PENDING' | 'CANCELLED' {
  if (stage === 'STALLED') {
    return currentStage === 'STALLED' ? 'CURRENT' : 'PENDING';
  }

  if (isCancelled && stage === currentStage) {
    return 'CANCELLED';
  }

  const currentIndex = CHRONOLOGICAL_STAGES.indexOf(
    currentStage === 'STALLED' ? 'DRAFT' : currentStage,
  );
  const targetIndex = CHRONOLOGICAL_STAGES.indexOf(stage);

  if (targetIndex < currentIndex) return 'DONE';
  if (targetIndex === currentIndex) return 'CURRENT';
  return 'PENDING';
}

export function resolveStageNavigationUrl(
  targetState: CoreProcurementState,
  ids: {
    requirementId?: string | null;
    rfqId?: string | null;
    poId?: string | null;
  },
  role: 'buyer' | 'supplier' | 'admin' = 'buyer',
): string {
  const { requirementId, rfqId, poId } = ids;

  switch (targetState) {
    case 'DRAFT':
      return requirementId ? `/requirements/${requirementId}` : '/requirements/new';
    case 'QUOTING':
      if (role === 'supplier') return rfqId ? `/supplier/rfq/${rfqId}` : '/dashboard';
      return requirementId
        ? `/requirements/${requirementId}/discover`
        : rfqId
        ? `/rfq/${rfqId}/clarification`
        : '/dashboard';
    case 'EVALUATING':
      if (role === 'supplier') return rfqId ? `/supplier/rfq/${rfqId}` : '/dashboard';
      return rfqId ? `/rfq/${rfqId}/quotes` : requirementId ? `/requirements/${requirementId}` : '/dashboard';
    case 'AWARDED':
      return rfqId ? `/rfq/${rfqId}/reveal` : requirementId ? `/requirements/${requirementId}` : '/dashboard';
    case 'PO_ISSUED':
      if (role === 'supplier') return poId ? `/supplier/purchase-orders/${poId}` : '/supplier/purchase-orders';
      return poId ? `/purchase-orders/${poId}` : '/purchase-orders';
    case 'INVOICED':
      if (role === 'supplier') return poId ? `/supplier/purchase-orders/${poId}?stage=invoiced` : '/supplier/purchase-orders';
      return poId ? `/purchase-orders/${poId}?stage=invoiced` : '/purchase-orders';
    case 'SETTLED':
      if (role === 'supplier') return poId ? `/supplier/purchase-orders/${poId}?stage=settled` : '/supplier/purchase-orders';
      return poId ? `/purchase-orders/${poId}?stage=settled` : rfqId ? `/rfq/${rfqId}/audit` : '/audit';
    case 'STALLED':
      if (role === 'admin') return rfqId ? `/admin/buyer-diagnostics?id=${rfqId}` : '/admin?stalled=true';
      if (role === 'supplier') return poId ? `/supplier/purchase-orders/${poId}` : '/dashboard';
      return rfqId ? `/rfq/${rfqId}/quotes` : requirementId ? `/requirements/${requirementId}` : '/dashboard';
    default:
      return '/dashboard';
  }
}
