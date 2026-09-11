import type { PurchaseOrderStatus } from '@otp/domain';

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground border border-border',
  PENDING_APPROVAL: 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
  APPROVED: 'bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60',
  ISSUED: 'bg-primary/10 text-primary border border-primary/20',
  ACCEPTED: 'bg-accent text-accent-foreground border border-accent-foreground/10',
  IN_PROGRESS: 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60',
  COMPLETED: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
  CANCELLED: 'bg-red-100 dark:bg-red-950/60 text-red-900 dark:text-red-300 border border-red-200 dark:border-red-800/60',
  NOT_STARTED: 'bg-muted text-muted-foreground border border-border',
  DISPUTED: 'bg-red-100 dark:bg-red-950/60 text-red-900 dark:text-red-300 border border-red-200 dark:border-red-800/60',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-muted'}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

interface PoAction {
  label: string;
  next: PurchaseOrderStatus;
}

type PoActionMap = Partial<Record<PurchaseOrderStatus, PoAction[]>>;

export function PoActionButtons({
  status,
  role,
  onAction,
  disabled,
}: {
  status: PurchaseOrderStatus;
  role: 'buyer' | 'supplier';
  onAction: (next: PurchaseOrderStatus) => void;
  disabled?: boolean;
}) {
  if (role === 'supplier' && status === 'ISSUED') {
    return (
      <div className="rounded-lg border-2 border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
              <span>⚡</span> Commercial Purchase Order Issued by Buyer
            </h3>
            <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5">
              Please accept this purchase order to acknowledge commercial terms and begin milestone delivery tracking.
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onAction('ACCEPTED')}
            className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50 transition flex items-center gap-1.5"
          >
            <span>{disabled ? 'Accepting PO…' : '⚡ Accept Purchase Order'}</span>
            <span>→</span>
          </button>
        </div>
      </div>
    );
  }

  const byRole: Record<'buyer' | 'supplier', PoActionMap> = {
    buyer: {
      DRAFT: [{ label: 'Submit for approval', next: 'PENDING_APPROVAL' }],
      PENDING_APPROVAL: [{ label: 'Approve', next: 'APPROVED' }],
      APPROVED: [{ label: 'Issue to supplier', next: 'ISSUED' }],
      ACCEPTED: [{ label: 'Mark in progress', next: 'IN_PROGRESS' }],
      IN_PROGRESS: [{ label: 'Mark completed', next: 'COMPLETED' }],
    },
    supplier: {
      ISSUED: [{ label: 'Accept Purchase Order', next: 'ACCEPTED' }],
    },
  };

  const actions = byRole[role][status] ?? [];

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((a) => (
        <button
          key={a.next}
          type="button"
          disabled={disabled}
          onClick={() => onAction(a.next)}
          className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
