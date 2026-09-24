import React, { useState } from 'react';
import type {
  ApprovalTierLevel,
  OrganizationDelegation,
  MsmeSpendDecisionEvaluation,
} from '@otp/domain';
import { evaluateMsmeSpendDecisionState } from '@otp/domain';

export interface SpendApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  rfqId: string;
  rfqTitle?: string;
  procurementAmount: number;
  tierLevel: ApprovalTierLevel;
  stageOrder?: number;
  actorProfileId: string;
  actorRole: string;
  rfqCreatorProfileId: string;
  activeDelegations?: OrganizationDelegation[];
  onConfirmApproval: (params: {
    tierLevel: ApprovalTierLevel;
    notes?: string;
    delegationId?: string | null;
  }) => Promise<{ ok: boolean; message?: string; error?: string }>;
}

export function SpendApprovalModal({
  isOpen,
  onClose,
  rfqId,
  rfqTitle = 'Procurement Requirement',
  procurementAmount,
  tierLevel,
  stageOrder = 1,
  actorProfileId,
  actorRole,
  rfqCreatorProfileId,
  activeDelegations = [],
  onConfirmApproval,
}: SpendApprovalModalProps) {
  const [notes, setNotes] = useState('');
  const [selectedDelegationId, setSelectedDelegationId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeDelegation = activeDelegations.find((d) => d.id === selectedDelegationId) || activeDelegations[0] || null;

  // Evaluate decision state dynamically
  const decision: MsmeSpendDecisionEvaluation = evaluateMsmeSpendDecisionState({
    actorProfileId,
    actorRole,
    rfqCreatorProfileId,
    procurementAmount,
    activeDelegation,
  });

  const isDelegatedMode = Boolean(selectedDelegationId || (activeDelegations.length > 0 && actorRole !== 'PRIMARY' && actorRole !== 'OWNER'));

  const handleApprove = async () => {
    if (!decision.canApprove) {
      setErrorMessage(decision.userMessage || 'Approval blocked by governance policies.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await onConfirmApproval({
      tierLevel,
      notes: notes.trim() || undefined,
      delegationId: isDelegatedMode ? (selectedDelegationId || activeDelegation?.id || null) : null,
    });

    setIsSubmitting(false);
    if (result.ok) {
      onClose();
    } else {
      setErrorMessage(result.error || result.message || 'Failed to submit approval.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
      data-testid="msme-spend-approval-modal"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 sm:px-6 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚖️</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                MSME Spend Governance Sign-off
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Formal digital approval for RFQ contract award
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
          {/* RFQ & Commercial Summary */}
          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Requirement</span>
              <span className="font-bold text-foreground truncate max-w-[200px]">{rfqTitle}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-[11px] text-muted-foreground">Procurement Total</span>
              <span className="font-extrabold text-sm text-foreground">
                ₹{procurementAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border/40 pt-2">
              <span className="text-[11px] text-muted-foreground">Approval Tier</span>
              <span className="font-bold text-primary">{tierLevel.replace(/_/g, ' ')}</span>
            </div>
          </div>

          {/* Decision Status Badge */}
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 ${
              decision.badgeVariant === 'urgent'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-900 dark:text-amber-200'
                : decision.badgeVariant === 'warning'
                ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 text-orange-900 dark:text-orange-200'
                : decision.badgeVariant === 'danger'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-300 text-red-900 dark:text-red-200'
                : 'bg-muted/40 border-border text-muted-foreground'
            }`}
          >
            <span className="text-base mt-0.5">
              {decision.badgeVariant === 'urgent' ? '⚡' : decision.badgeVariant === 'warning' ? '⚠️' : '🛡️'}
            </span>
            <div>
              <span className="font-bold block">{decision.badgeLabel}</span>
              <p className="text-[11px] mt-0.5 leading-relaxed">{decision.userMessage}</p>
            </div>
          </div>

          {/* Delegation Proxy Selector (if multiple delegations active) */}
          {activeDelegations.length > 1 && (
            <div className="space-y-1.5">
              <label className="font-bold text-foreground block">
                Select Delegation Authority
              </label>
              <select
                value={selectedDelegationId}
                onChange={(e) => setSelectedDelegationId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs min-h-[44px]"
              >
                {activeDelegations.map((d) => (
                  <option key={d.id} value={d.id}>
                    Delegated Cap: {d.spendCapAmount ? `₹${d.spendCapAmount.toLocaleString('en-IN')}` : 'Unlimited'} (Expires: {new Date(d.expiresAt).toLocaleDateString('en-IN')})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes / Commercial Justification */}
          <div className="space-y-1.5">
            <label className="font-bold text-foreground block">
              Approval Remarks / Justification (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Rate verified against current market index; within budgeted allocation."
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-foreground text-xs leading-relaxed"
            />
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 text-xs font-semibold" role="alert">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/80 p-4 sm:px-6 bg-muted/20 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!decision.canApprove || isSubmitting}
            onClick={handleApprove}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition min-h-[44px] cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            {isSubmitting ? 'Signing off…' : isDelegatedMode ? '✍️ Sign Off via Proxy' : '✓ Approve & Authorize Award'}
          </button>
        </div>
      </div>
    </div>
  );
}
