import React, { useState } from 'react';
import type {
  RfqApprovalStage,
  TierApprovalStatus,
  ApprovalTierLevel,
  OrganizationDelegation,
} from '@otp/domain';

export interface MultiTierApprovalGatePanelProps {
  stages: RfqApprovalStage[];
  procurementAmount: number;
  currentUserId: string;
  currentUserRole?: string;
  currentUserRoles?: string[];
  rfqCreatorId: string;
  delegations?: OrganizationDelegation[];
  onApproveStage?: (
    stageOrder: number,
    options?: { delegationId?: string; notes?: string }
  ) => Promise<void>;
  onRejectStage?: (stageOrder: number, comments?: string) => Promise<void>;
  className?: string;
}

export function MultiTierApprovalGatePanel({
  stages,
  procurementAmount,
  currentUserId,
  currentUserRole = 'BUYER',
  currentUserRoles = [],
  rfqCreatorId,
  delegations = [],
  onApproveStage,
  onRejectStage,
  className = '',
}: MultiTierApprovalGatePanelProps) {
  const [selectedDelegationId, setSelectedDelegationId] = useState<Record<number, string>>({});
  const [stageNotes, setStageNotes] = useState<Record<number, string>>({});
  const [busyStage, setBusyStage] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isCreator = currentUserId === rfqCreatorId;
  const effectiveRoles = currentUserRoles.length > 0 ? currentUserRoles : [currentUserRole];

  // Derive sorted stages
  const sortedStages = [...stages].sort((a, b) => a.stageOrder - b.stageOrder);

  // Check overall satisfaction
  const pendingStages = sortedStages.filter((s) => s.status !== 'APPROVED');
  const isAllApproved = sortedStages.length > 0 && pendingStages.length === 0;

  const getTierDisplayName = (tierLevel: ApprovalTierLevel) => {
    switch (tierLevel) {
      case 'TIER_1_MANAGER':
        return 'Tier 1: Team / Procurement Manager';
      case 'TIER_2_DEPT_HEAD':
        return 'Tier 2: Dept Head / VP';
      case 'TIER_3_EXECUTIVE':
        return 'Tier 3: CFO / Executive Director';
      default:
        return (tierLevel as string).replace(/_/g, ' ');
    }
  };

  const getStatusBadgeClass = (status: TierApprovalStatus, isBlocked: boolean) => {
    if (status === 'APPROVED') {
      return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
    }
    if (status === 'REJECTED') {
      return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800';
    }
    if (isBlocked) {
      return 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700';
    }
    return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800';
  };

  const handleApprove = async (stageOrder: number) => {
    if (!onApproveStage) return;
    setBusyStage(stageOrder);
    setErrorMessage(null);
    try {
      const delId = selectedDelegationId[stageOrder] || undefined;
      const notes = stageNotes[stageOrder] || undefined;
      await onApproveStage(stageOrder, { delegationId: delId, notes });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to approve stage.');
    } finally {
      setBusyStage(null);
    }
  };

  const handleReject = async (stageOrder: number) => {
    if (!onRejectStage) return;
    setBusyStage(stageOrder);
    setErrorMessage(null);
    try {
      const notes = stageNotes[stageOrder] || undefined;
      await onRejectStage(stageOrder, notes);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to reject stage.');
    } finally {
      setBusyStage(null);
    }
  };

  return (
    <div
      data-testid="multi-tier-approval-panel"
      className={`rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm ${className}`}
    >
      {/* Header & Award Lock Gate Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm sm:text-base font-bold text-foreground">
              Multi-Tier Spend Approval & Delegation Signoff Chain
            </h3>
            <span
              data-testid="award-lock-gate-badge"
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black border ${
                isAllApproved
                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300'
                  : 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300'
              }`}
            >
              {isAllApproved ? '🔓 Award Lock [ELIGIBLE]' : '🔒 Award Lock [LOCKED]'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Procurement Value: <strong className="text-foreground">₹{procurementAmount.toLocaleString('en-IN')}</strong> •{' '}
            {stages.length} Required Tier(s) •{' '}
            {isAllApproved
              ? 'All required tiers satisfied. Award locking & PO issuance permitted.'
              : `${pendingStages.length} pending tier(s) blocking award locking.`}
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-3 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium">
          {errorMessage}
        </div>
      )}

      {isCreator && (
        <div className="mt-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <span>⚠️</span>
          <span>
            <strong>Anti-Bypass Protection Active:</strong> As the procurement creator, you cannot sign off or approve your own RFQ tiers directly or via proxy. An independent authority must sign off.
          </span>
        </div>
      )}

      {/* Stage Cards Progression */}
      <div className="mt-4 space-y-3">
        {sortedStages.map((stage, idx) => {
          const priorStages = sortedStages.slice(0, idx);
          const hasPriorPending = priorStages.some((s) => s.status !== 'APPROVED');
          const isPending = stage.status === 'PENDING';
          const isApproved = stage.status === 'APPROVED';
          const isRejected = stage.status === 'REJECTED';
          const isBlocked = isPending && hasPriorPending;

          // Matching active delegation proxies for this user
          const matchingDelegations = delegations.filter((d) => {
            if (!d.isActive || d.revokedAt) return false;
            if (d.delegateeId !== currentUserId) return false;
            if (d.delegatorId === rfqCreatorId) return false; // anti-self-approval via proxy
            if (d.spendCapAmount != null && stage.procurementAmount > d.spendCapAmount) return false;
            return true;
          });

          // Check direct authority
          const hasDirectRole =
            stage.tierLevel === 'TIER_1_MANAGER'
              ? effectiveRoles.some((r) => ['BUYER', 'MANAGER', 'APPROVER', 'OWNER', 'DIRECTOR', 'VP'].includes(r))
              : stage.tierLevel === 'TIER_2_DEPT_HEAD'
              ? effectiveRoles.some((r) => ['MANAGER', 'APPROVER', 'OWNER', 'DIRECTOR', 'VP', 'HEAD_OF_DEPARTMENT'].includes(r))
              : effectiveRoles.some((r) => ['OWNER', 'DIRECTOR', 'EXECUTIVE', 'CFO'].includes(r));

          const canActDirect = isPending && !hasPriorPending && !isCreator && hasDirectRole;
          const canActDelegated =
            isPending &&
            !hasPriorPending &&
            !isCreator &&
            matchingDelegations.length > 0 &&
            (stage.tierLevel !== 'TIER_3_EXECUTIVE' || effectiveRoles.some((r) => ['OWNER', 'DIRECTOR', 'EXECUTIVE', 'CFO'].includes(r)));

          const canAct = canActDirect || canActDelegated;
          const isCurrentBusy = busyStage === stage.stageOrder;

          const displayStatus = isApproved
            ? 'APPROVED'
            : isRejected
            ? 'REJECTED'
            : isBlocked
            ? 'BLOCKED'
            : 'PENDING';

          return (
            <div
              key={stage.id}
              data-testid={`approval-stage-card-${stage.stageOrder}`}
              className={`p-4 rounded-xl border transition-all ${
                isApproved
                  ? 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/20'
                  : isBlocked
                  ? 'border-border/60 bg-muted/40 opacity-80'
                  : 'border-border bg-card shadow-xs'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-foreground">
                      {getTierDisplayName(stage.tierLevel)}
                    </span>
                    <span
                      data-testid={`stage-status-badge-${stage.stageOrder}`}
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black border uppercase ${getStatusBadgeClass(
                        stage.status,
                        isBlocked
                      )}`}
                    >
                      {displayStatus}
                    </span>
                    {stage.signatureMode === 'DELEGATED' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800">
                        DELEGATED PROXY
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>
                      Threshold: ₹{stage.thresholdMinAmount.toLocaleString('en-IN')}{' '}
                      {stage.thresholdMaxAmount ? `to ₹${stage.thresholdMaxAmount.toLocaleString('en-IN')}` : '+'}
                    </span>
                    {stage.approverRole && (
                      <span>• Signed by <strong>{stage.approverRole}</strong></span>
                    )}
                    {stage.approvedAt && (
                      <span>• {new Date(stage.approvedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {isApproved && (
                  <div className="text-right text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 self-start sm:self-center">
                    <span>✓</span>
                    <span>Satisfied</span>
                  </div>
                )}

                {isBlocked && (
                  <div className="text-xs text-muted-foreground italic flex items-center gap-1 self-start sm:self-center">
                    <span>⏳ Waiting on prior tier</span>
                  </div>
                )}

                {canAct && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    {matchingDelegations.length > 0 && (
                      <select
                        aria-label="Select delegation authority"
                        value={selectedDelegationId[stage.stageOrder] || ''}
                        onChange={(e) =>
                          setSelectedDelegationId({
                            ...selectedDelegationId,
                            [stage.stageOrder]: e.target.value,
                          })
                        }
                        className="text-xs rounded-lg border border-border bg-background px-2.5 py-1.5 min-h-[44px] text-foreground"
                      >
                        <option value="">Direct Signature ({currentUserRole})</option>
                        {matchingDelegations.map((del) => (
                          <option key={del.id} value={del.id}>
                            Via Delegation (Cap: ₹{(del.spendCapAmount || 0).toLocaleString('en-IN')})
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      disabled={isCurrentBusy}
                      onClick={() => void handleApprove(stage.stageOrder)}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition min-h-[44px] flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      <span>✓</span>
                      <span>{isCurrentBusy ? 'Signing…' : 'Approve Stage'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isCurrentBusy}
                      onClick={() => void handleReject(stage.stageOrder)}
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95 transition min-h-[44px] flex items-center justify-center gap-1"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>

              {stage.approverComments && (
                <div className="mt-2 text-xs text-muted-foreground border-t border-border/50 pt-1.5">
                  <em>Note: &ldquo;{stage.approverComments}&rdquo;</em>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
