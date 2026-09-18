import React from 'react';
import type { RfqApprovalStage, TierApprovalStatus } from '@otp/domain';

export interface MultiTierApprovalGatePanelProps {
  stages: RfqApprovalStage[];
  procurementAmount: number;
  currentUserId: string;
  currentUserRoles: string[];
  rfqCreatorId: string;
  onApproveStage?: (stageOrder: number, comments?: string) => Promise<void>;
  onRejectStage?: (stageOrder: number, comments?: string) => Promise<void>;
  className?: string;
}

export function MultiTierApprovalGatePanel({
  stages,
  procurementAmount,
  currentUserId,
  currentUserRoles,
  rfqCreatorId,
  onApproveStage,
  onRejectStage,
  className = '',
}: MultiTierApprovalGatePanelProps) {
  const isCreator = currentUserId === rfqCreatorId;

  const getStatusBadge = (status: TierApprovalStatus) => {
    switch (status) {
      case 'APPROVED':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
      case 'REJECTED':
        return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
      case 'PENDING':
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
    }
  };

  return (
    <div
      data-testid="multi-tier-approval-panel"
      className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Multi-Tier Threshold Governance & Enterprise Approval Matrix
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Procurement Value: ₹{procurementAmount.toLocaleString('en-IN')} — {stages.length} Approval Tier(s) Required
          </p>
        </div>
      </div>

      {isCreator && (
        <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
          ⚠️ <strong>Anti-Bypass Protection Active:</strong> As the procurement creator, you cannot approve your own RFQ tiers. An independent manager or director must sign off.
        </div>
      )}

      <div className="mt-4 space-y-3">
        {stages.map((stage) => {
          const isPending = stage.status === 'PENDING';
          const canAct = isPending && !isCreator;

          return (
            <div
              key={stage.id}
              className="flex items-center justify-between p-3.5 rounded-lg border border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/30"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Tier {stage.stageOrder}: {stage.tierLevel.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadge(
                      stage.status
                    )}`}
                  >
                    {stage.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Threshold: ₹{stage.thresholdMinAmount.toLocaleString('en-IN')}{' '}
                  {stage.thresholdMaxAmount ? `to ₹${stage.thresholdMaxAmount.toLocaleString('en-IN')}` : '+'}
                  {stage.approverRole && ` • Signed by ${stage.approverRole}`}
                </div>
              </div>

              {canAct && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onApproveStage?.(stage.stageOrder)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectStage?.(stage.stageOrder)}
                    className="px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-600 text-white hover:bg-rose-700 transition"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
