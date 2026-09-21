import React from 'react';
import type { ApprovalRouteEvaluation } from '@otp/domain';

function formatInr(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
  }
}

export interface EvaluationApprovalRouteBannerProps {
  evaluation: ApprovalRouteEvaluation | null;
  procurementAmount: number | null;
  isLoading?: boolean;
}

export function EvaluationApprovalRouteBanner({
  evaluation,
  procurementAmount,
  isLoading = false,
}: EvaluationApprovalRouteBannerProps) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground animate-pulse">
        Evaluating spend approval threshold &amp; governance route…
      </div>
    );
  }

  if (!evaluation) return null;

  const isTier3 = evaluation.requiredApprovalLevel === 'TIER_3_EXECUTIVE';
  const isTier2 = evaluation.requiredApprovalLevel === 'TIER_2_DEPT_HEAD';

  const badgeColor = isTier3
    ? 'bg-purple-100 text-purple-900 dark:bg-purple-950 dark:text-purple-200 border-purple-300 dark:border-purple-800'
    : isTier2
    ? 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200 border-blue-300 dark:border-blue-800'
    : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800';

  return (
    <div
      className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs space-y-2.5"
      data-testid="approval-route-banner"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm">🛡️</span>
          <h3 className="text-xs font-black text-foreground">
            Spend Approval Matrix &amp; Threshold Routing
          </h3>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase border ${badgeColor}`}>
            {isTier3 ? '👑 Tier 3 Executive Gate' : isTier2 ? '⭐ Tier 2 Dept Head / VP' : '✓ Tier 1 Manager Signoff'}
          </span>
          {evaluation.executiveGate && (
            <span className="rounded-full bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 border border-red-300 px-2 py-0.5 text-[9px] font-black uppercase">
              🔒 Executive Gate Active
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-mono">
          <span>Policy v{evaluation.policyVersion}</span>
          <span>·</span>
          <span>{formatInr(procurementAmount)} Landed</span>
        </div>
      </div>

      {/* Threshold Progression Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        {evaluation.applicableTiers.map((tier, idx) => {
          const isHighest = tier.tierLevel === evaluation.requiredApprovalLevel;
          return (
            <div
              key={tier.tierLevel}
              className={`rounded-xl border p-2 space-y-1 transition ${
                isHighest
                  ? 'border-primary/50 bg-primary/5 shadow-2xs'
                  : 'border-border/60 bg-muted/10 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  Stage {idx + 1}: {tier.tierLevel.replace(/_/g, ' ')}
                </span>
                {isHighest && (
                  <span className="rounded bg-primary/20 text-primary text-[9px] font-black px-1.5 py-0.2">
                    TARGET TIER
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-foreground truncate">{tier.tierName}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>
                  {formatInr(tier.minAmount)} – {tier.maxAmount ? formatInr(tier.maxAmount) : '∞'}
                </span>
                <span>{tier.minApproversRequired} Signoff{tier.minApproversRequired > 1 ? 's' : ''}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Route Rationale and Constraints */}
      <div className="rounded-xl bg-muted/20 border border-border/50 p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
        <div className="space-y-0.5">
          <span className="font-extrabold text-foreground block">Evaluation Rationale:</span>
          <p className="text-muted-foreground">{evaluation.evaluationReason}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <span className={`rounded px-2 py-0.5 text-[10px] font-bold border ${
            evaluation.delegationAllowed
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
          }`}>
            {evaluation.delegationAllowed ? '✓ Delegation Allowed' : '⛔ Direct Executive Signoff Only'}
          </span>
          <span className="rounded bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 text-[10px] font-bold">
            🗳️ Merit Quorum Required
          </span>
        </div>
      </div>
    </div>
  );
}
