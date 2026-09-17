import React, { useState } from 'react';
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
  poTotalAmount = 0,
}: {
  status: PurchaseOrderStatus;
  role: 'buyer' | 'supplier';
  onAction: (next: PurchaseOrderStatus) => void;
  disabled?: boolean;
  poTotalAmount?: number;
}) {
  const [acknowledgedFee, setAcknowledgedFee] = useState(false);

  if (role === 'supplier' && status === 'ISSUED') {
    const feeRate = 0.5;
    const estFee = Math.round((poTotalAmount * feeRate) / 100);
    const estNet = Math.max(0, poTotalAmount - estFee);

    return (
      <div className="rounded-xl border-2 border-primary/50 bg-primary/5 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>⚡</span> Commercial Purchase Order Issued by Buyer
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Please review platform fee terms and accept this purchase order to begin milestone delivery tracking.
            </p>
          </div>
        </div>

        {/* Phase 5C.5 Commercial Fee Disclosure */}
        <div className="rounded-lg border bg-card p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between border-b pb-1.5">
            <span className="font-bold text-foreground flex items-center gap-1">
              <span>🛡️</span>
              <span>OTP Platform Fee at Settlement Disclosure</span>
            </span>
            <span className="font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
              {feeRate.toFixed(2)}% Rate
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Suppliers pay <strong>₹0 upfront</strong>. Platform fee is deducted only upon settlement payout:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
            <div className="bg-muted/40 p-2 rounded border">
              <span className="text-[10px] text-muted-foreground block font-sans">Gross Settlement</span>
              <span className="font-bold text-foreground">₹{poTotalAmount.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-200 text-amber-800 dark:text-amber-300">
              <span className="text-[10px] block font-sans">Est. Platform Fee (0.5%)</span>
              <span className="font-bold">-₹{estFee.toLocaleString('en-IN')}</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2 rounded border border-emerald-200 text-emerald-800 dark:text-emerald-300">
              <span className="text-[10px] block font-sans">Est. Net Payout</span>
              <span className="font-bold">₹{estNet.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <label className="flex items-start gap-2 pt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={acknowledgedFee}
              onChange={(e) => setAcknowledgedFee(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-[11px] text-foreground leading-tight">
              I acknowledge the OTP commercial fee policy ({feeRate}% deduction at settlement). I agree to receive net settlement upon milestone delivery verification.
            </span>
          </label>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            disabled={disabled || !acknowledgedFee}
            onClick={() => onAction('ACCEPTED')}
            className="min-h-[44px] rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-md hover:bg-primary/90 active:scale-[0.98] disabled:opacity-40 transition flex items-center gap-1.5 mobile-touch-target"
          >
            <span>{disabled ? 'Accepting PO…' : '⚡ Accept Purchase Order & Acknowledge Terms'}</span>
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
          className="min-h-[44px] rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 transition mobile-touch-target"
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
