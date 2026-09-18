/**
 * Canonical 11-Status Visual & Status Vocabulary
 *
 * Guarantees a single source of truth across the OTP platform for all status badges,
 * labels, emoji symbols (with standard VS-16 modifiers), and Tailwind styling tokens.
 */

export const CanonicalStatusKey = {
  OPEN: 'OPEN',
  ACTION_REQUIRED: 'ACTION_REQUIRED',
  EVALUATION: 'EVALUATION',
  VOTING: 'VOTING',
  AWARDED: 'AWARDED',
  IDENTITY_PROTECTED: 'IDENTITY_PROTECTED',
  IDENTITY_REVEALED: 'IDENTITY_REVEALED',
  IN_PROGRESS: 'IN_PROGRESS',
  INVOICE_PENDING: 'INVOICE_PENDING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  COMPLETED_SETTLED: 'COMPLETED_SETTLED',
} as const;

export type CanonicalStatusKey =
  (typeof CanonicalStatusKey)[keyof typeof CanonicalStatusKey];

export interface StatusBadgeDefinition {
  key: CanonicalStatusKey;
  icon: string;
  label: string;
  tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral';
  badgeClass: string;
  borderClass: string;
  bgClass: string;
  textClass: string;
}

export const CANONICAL_STATUS_REGISTRY: Record<CanonicalStatusKey, StatusBadgeDefinition> = {
  OPEN: {
    key: 'OPEN',
    icon: '🟢',
    label: 'Open',
    tone: 'success',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    borderClass: 'border-emerald-500',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
  ACTION_REQUIRED: {
    key: 'ACTION_REQUIRED',
    icon: '🔴',
    label: 'Action Required',
    tone: 'danger',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800',
    borderClass: 'border-rose-500',
    bgClass: 'bg-rose-500/10',
    textClass: 'text-rose-700 dark:text-rose-400',
  },
  EVALUATION: {
    key: 'EVALUATION',
    icon: '📊',
    label: 'Evaluation',
    tone: 'info',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
    borderClass: 'border-blue-500',
    bgClass: 'bg-blue-500/10',
    textClass: 'text-blue-700 dark:text-blue-400',
  },
  VOTING: {
    key: 'VOTING',
    icon: '🗳️',
    label: 'Voting',
    tone: 'info',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800',
    borderClass: 'border-indigo-500',
    bgClass: 'bg-indigo-500/10',
    textClass: 'text-indigo-700 dark:text-indigo-400',
  },
  AWARDED: {
    key: 'AWARDED',
    icon: '🏆',
    label: 'Awarded',
    tone: 'success',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    borderClass: 'border-amber-500',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  IDENTITY_PROTECTED: {
    key: 'IDENTITY_PROTECTED',
    icon: '🔒',
    label: 'Identity Protected',
    tone: 'neutral',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
    borderClass: 'border-slate-500',
    bgClass: 'bg-slate-500/10',
    textClass: 'text-slate-700 dark:text-slate-300',
  },
  IDENTITY_REVEALED: {
    key: 'IDENTITY_REVEALED',
    icon: '🔓',
    label: 'Identity Revealed',
    tone: 'info',
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800',
    borderClass: 'border-cyan-500',
    bgClass: 'bg-cyan-500/10',
    textClass: 'text-cyan-700 dark:text-cyan-400',
  },
  IN_PROGRESS: {
    key: 'IN_PROGRESS',
    icon: '📦',
    label: 'In Progress',
    tone: 'info',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    borderClass: 'border-sky-500',
    bgClass: 'bg-sky-500/10',
    textClass: 'text-sky-700 dark:text-sky-400',
  },
  INVOICE_PENDING: {
    key: 'INVOICE_PENDING',
    icon: '🧾',
    label: 'Invoice Pending',
    tone: 'warning',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    borderClass: 'border-amber-500',
    bgClass: 'bg-amber-500/10',
    textClass: 'text-amber-700 dark:text-amber-400',
  },
  PAYMENT_PENDING: {
    key: 'PAYMENT_PENDING',
    icon: '💳',
    label: 'Payment Pending',
    tone: 'warning',
    badgeClass: 'bg-orange-50 text-orange-800 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800',
    borderClass: 'border-orange-500',
    bgClass: 'bg-orange-500/10',
    textClass: 'text-orange-700 dark:text-orange-400',
  },
  COMPLETED_SETTLED: {
    key: 'COMPLETED_SETTLED',
    icon: '✅',
    label: 'Completed / Settled',
    tone: 'success',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
    borderClass: 'border-emerald-500',
    bgClass: 'bg-emerald-500/10',
    textClass: 'text-emerald-700 dark:text-emerald-400',
  },
};

/**
 * Resolves any domain status (RFQ, PO, Invoice, Payment, Lifecycle) to its canonical visual badge definition.
 */
export function resolveCanonicalStatus(status: string | null | undefined): StatusBadgeDefinition {
  if (!status) return CANONICAL_STATUS_REGISTRY.OPEN;
  const upper = status.toUpperCase().trim();

  switch (upper) {
    case 'OPEN':
    case 'DRAFT':
    case 'PUBLISHED':
      return CANONICAL_STATUS_REGISTRY.OPEN;

    case 'ACTION_REQUIRED':
    case 'DISPUTED':
    case 'REJECTED':
    case 'FAILED':
    case 'STALLED':
      return CANONICAL_STATUS_REGISTRY.ACTION_REQUIRED;

    case 'EVALUATING':
    case 'EVALUATION':
    case 'CLARIFICATION':
      return CANONICAL_STATUS_REGISTRY.EVALUATION;

    case 'VOTING':
      return CANONICAL_STATUS_REGISTRY.VOTING;

    case 'AWARDED':
    case 'SELECTED':
      return CANONICAL_STATUS_REGISTRY.AWARDED;

    case 'BLIND':
    case 'PROTECTED':
    case 'IDENTITY_PROTECTED':
      return CANONICAL_STATUS_REGISTRY.IDENTITY_PROTECTED;

    case 'REVEALED':
    case 'IDENTITY_REVEALED':
      return CANONICAL_STATUS_REGISTRY.IDENTITY_REVEALED;

    case 'PO_ISSUED':
    case 'ISSUED':
    case 'ACCEPTED':
    case 'IN_PROGRESS':
    case 'STARTED':
      return CANONICAL_STATUS_REGISTRY.IN_PROGRESS;

    case 'INVOICED':
    case 'INVOICE_PENDING':
    case 'SUBMITTED':
    case 'PARTIALLY_PAID':
      return CANONICAL_STATUS_REGISTRY.INVOICE_PENDING;

    case 'APPROVED':
    case 'PAYMENT_PENDING':
    case 'ALLOCATED':
      return CANONICAL_STATUS_REGISTRY.PAYMENT_PENDING;

    case 'COMPLETED':
    case 'SETTLED':
    case 'PAID':
    case 'VERIFIED':
    case 'COMPLETED_SETTLED':
      return CANONICAL_STATUS_REGISTRY.COMPLETED_SETTLED;

    default:
      return CANONICAL_STATUS_REGISTRY.OPEN;
  }
}
