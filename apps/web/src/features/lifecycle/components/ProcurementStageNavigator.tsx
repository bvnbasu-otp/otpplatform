import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  CORE_PROCUREMENT_STATES,
  CHRONOLOGICAL_STAGES,
  GOLDEN_PATH_STATES,
  LINEAR_PROCUREMENT_STEPS,
  PROCUREMENT_STEP_NUMBERS,
  deriveLinearStepNumber,
  getLinearStepState,
  resolveLinearStepUrl,
  getStageStepState,
  resolveStageNavigationUrl,
  mapLinearStepToCoreState,
  type CoreProcurementState,
  type ProcurementStepNumber,
} from '../types/procurement-state';

export interface ProcurementStageNavigatorProps {
  currentStage?: CoreProcurementState;
  currentLinearStep?: ProcurementStepNumber;
  orderTitle?: string;
  orderReference?: string;
  requirementId?: string | null;
  rfqId?: string | null;
  poId?: string | null;
  role?: 'buyer' | 'supplier' | 'admin';
  isStalled?: boolean;
  stalledReason?: string;
  stalledActionLabel?: string;
  onStalledAction?: () => void;
  idleHours?: number;
  backToUrl?: string;
  backToLabel?: string;
  compact?: boolean;
}

export function ProcurementStageNavigator({
  currentStage,
  currentLinearStep,
  orderTitle,
  orderReference,
  requirementId,
  rfqId,
  poId,
  role = 'buyer',
  isStalled = false,
  stalledReason,
  stalledActionLabel,
  onStalledAction,
  idleHours,
  backToUrl,
  backToLabel = 'Procurement Pipeline',
  compact = false,
}: ProcurementStageNavigatorProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [showStalledDrawer, setShowStalledDrawer] = useState(isStalled);
  const [showSubTabs, setShowSubTabs] = useState(false);
  const [isBottomBarExpanded, setIsBottomBarExpanded] = useState(false);

  // Derive exact linear step (1..15)
  const activeLinearStep: ProcurementStepNumber =
    currentLinearStep ?? deriveLinearStepNumber(null, location.pathname);
  const activeStepDesc = LINEAR_PROCUREMENT_STEPS[activeLinearStep] || LINEAR_PROCUREMENT_STEPS[13];

  // Derive 7-State Golden Path stage
  const effectiveStage: CoreProcurementState =
    isStalled
      ? 'STALLED'
      : currentStage ?? mapLinearStepToCoreState(activeLinearStep);

  const activeStageDesc =
    CORE_PROCUREMENT_STATES[effectiveStage] ||
    CORE_PROCUREMENT_STATES['PO_ISSUED'] ||
    CORE_PROCUREMENT_STATES['DRAFT'];

  const ids = { requirementId, rfqId, poId };

  // Calculate default back URL
  const resolvedBackUrl =
    backToUrl ||
    (role === 'supplier'
      ? '/dashboard'
      : role === 'admin'
      ? '/admin'
      : '/dashboard');

  const defaultStalledReason =
    stalledReason ||
    (idleHours && idleHours > 24
      ? `Order has been inactive at Stage ${activeStageDesc.shortLabel} for ${Math.floor(idleHours)} hours.`
      : `Order has exceeded time threshold (>24h) at Stage ${activeStageDesc.shortLabel}.`);

  return (
    <div data-testid="procurement-stage-navigator" className="space-y-2 mb-3">
      {/* 1. Primary Buyer-Facing 7-State Golden Path Stepper Card */}
      <div className="rounded-2xl border border-border bg-card/95 p-2.5 sm:p-3 text-xs shadow-2xs backdrop-blur space-y-2">
        {/* Top bar: Breadcrumb & Actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              to={resolvedBackUrl}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-muted/40 hover:bg-muted px-2.5 py-1.5 text-xs font-bold text-foreground hover:text-primary transition shrink-0 min-h-[44px] mobile-touch-target shadow-2xs"
            >
              <span className="text-sm">←</span>
              <span>Back</span>
              <span className="hidden md:inline font-normal text-muted-foreground">({backToLabel})</span>
            </Link>
            <span className="text-muted-foreground/40 shrink-0">/</span>
            <span className="font-bold text-foreground truncate max-w-[100px] xs:max-w-[150px] sm:max-w-xs text-xs">
              {orderReference ? `${orderReference} · ` : ''}
              {orderTitle || 'Procurement Order'}
            </span>
            <span className="text-muted-foreground/40 shrink-0">/</span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold shadow-2xs border shrink-0 ${activeStageDesc.badgeClass}`}
            >
              <span>{activeStageDesc.icon} </span>
              <span>Stage {activeStageDesc.stepNumber || 0}/6: {activeStageDesc.shortLabel}</span>
            </span>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isStalled && (
              <button
                type="button"
                onClick={() => setShowStalledDrawer((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 px-2.5 py-1 text-[10px] font-black text-red-900 dark:text-red-200 shadow-2xs hover:bg-red-200 transition min-h-[32px] mobile-touch-target"
                title="Click to view stall diagnostics and unblocking actions"
              >
                <span>⚠️ STALLED</span>
                <span className="underline">{showStalledDrawer ? '▲' : '▼'}</span>
              </button>
            )}

            {role === 'admin' && (
              <button
                type="button"
                onClick={() => setShowSubTabs((v) => !v)}
                className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition min-h-[32px] mobile-touch-target"
                title="Toggle granular 15-step technical telemetry pipeline"
                data-testid="admin-telemetry-toggle"
              >
                {showSubTabs ? '▲ Hide 15 Steps' : '⚡ 15 Steps'}
              </button>
            )}
          </div>
        </div>

        {/* 6-State Golden Path Navigation Stepper Bar */}
        <nav aria-label="6-State Golden Path Procurement Pipeline" className="pt-1 border-t border-border/60">
          <ol className="flex items-center justify-between gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {GOLDEN_PATH_STATES.map((stageKey, idx) => {
              const stageDesc = CORE_PROCUREMENT_STATES[stageKey];
              const stepState = getStageStepState(stageKey, effectiveStage);
              const isCurrent = stepState === 'CURRENT';
              const isDone = stepState === 'DONE';
              const targetUrl = resolveStageNavigationUrl(stageKey, ids, role);
              const isClickable = isDone || isCurrent;

              const stageBadge = (
                <div
                  className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1 sm:py-1.5 rounded-xl border transition select-none shrink-0 ${
                    isCurrent
                      ? 'bg-primary text-primary-foreground font-black border-primary shadow-xs ring-2 ring-primary/30'
                      : isDone
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800 font-bold hover:border-emerald-500'
                      : 'bg-muted/30 text-muted-foreground border-border/50 opacity-60'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black ${
                      isCurrent
                        ? 'bg-white text-primary'
                        : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isDone ? '✓' : idx + 1}
                  </span>
                  <span className="text-xs shrink-0">{stageDesc.icon}</span>
                  <span
                    className={`text-[11px] font-bold whitespace-nowrap truncate max-w-[90px] sm:max-w-none ${
                      isCurrent ? 'inline' : 'hidden sm:inline'
                    }`}
                  >
                    {stageDesc.shortLabel}
                  </span>
                </div>
              );

              return (
                <li key={stageKey} className="shrink-0 sm:flex-1">
                  {isClickable ? (
                    <Link
                      to={targetUrl}
                      className="block focus:outline-none rounded-xl"
                      title={`${idx + 1}. ${stageDesc.title} (${isCurrent ? 'Active' : isDone ? 'Completed' : 'Pending'})`}
                    >
                      {stageBadge}
                    </Link>
                  ) : (
                    <div title={`${idx + 1}. ${stageDesc.title} (Pending)`}>
                      {stageBadge}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* STALLED Exception & Diagnostic Drawer */}
        {isStalled && showStalledDrawer && (
          <div className="mt-2 border-t border-red-200 dark:border-red-900 bg-red-50/90 dark:bg-red-950/40 p-2.5 rounded-xl animate-in fade-in-50">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm">🚨</span>
                <p className="text-xs text-red-800 dark:text-red-300 truncate">
                  <strong className="text-red-900 dark:text-red-200">SLA Alert:</strong> {defaultStalledReason}
                </p>
              </div>

              {stalledActionLabel && onStalledAction && (
                <button
                  type="button"
                  onClick={onStalledAction}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-700 transition shrink-0 min-h-[36px] mobile-touch-target"
                >
                  ⚡ {stalledActionLabel}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 15-Step Linear Telemetry Traversal Quick Ribbon (Collapsible - Admin Only) */}
        {showSubTabs && role === 'admin' && (
          <div className="mt-2 border-t border-border/80 pt-2 space-y-1.5 animate-in fade-in-50">
            <div className="flex items-center justify-between">
              <span className="font-bold uppercase tracking-wider text-muted-foreground text-[9px]">
                Detailed Technical Pipeline Telemetry (15 Steps):
              </span>
              <span className="text-[10px] font-semibold text-primary">
                Current Step: {activeLinearStep}/15 ({activeStepDesc.title})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1 text-[10px]">
              {PROCUREMENT_STEP_NUMBERS.map((stepNum) => {
                const desc = LINEAR_PROCUREMENT_STEPS[stepNum];
                const stepState = getLinearStepState(stepNum, activeLinearStep);
                const isCurrent = stepState === 'CURRENT';
                const isDone = stepState === 'DONE';
                const targetUrl = resolveLinearStepUrl(stepNum, ids);

                return (
                  <Link
                    key={stepNum}
                    to={targetUrl}
                    className={`rounded-md border px-1.5 py-0.5 text-[9px] font-medium transition flex items-center gap-1 min-h-[28px] ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground font-bold border-primary shadow-2xs'
                        : isDone
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
                        : 'bg-card/50 text-muted-foreground hover:text-foreground hover:bg-card border-border/60 opacity-70'
                    }`}
                    title={`${stepNum}. ${desc.title} (${isCurrent ? 'Active' : isDone ? 'Completed' : 'Pending'})`}
                  >
                    <span>{isDone ? '✓' : desc.icon}</span>
                    <span className="truncate max-w-[80px]">{desc.shortLabel}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 2. Fixed/Sticky Bottom Lifecycle Progress Bar (Admin 15-Step Linear Telemetry) */}
      {role === 'admin' && (
        <aside className="fixed sm:absolute bottom-0 inset-x-0 z-30 border-t border-border bg-card/95 shadow-md backdrop-blur transition-all pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))]" aria-label="Procurement Progress">
          {/* Expanded Drawer (Upward - Admin Only) */}
          {isBottomBarExpanded && (
            <div className="border-b border-border bg-card/98 p-3 shadow-inner max-h-[50vh] overflow-y-auto animate-in slide-in-from-bottom-5">
              <div className="mx-auto max-w-7xl space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Complete 15-Step Linear Procurement Pipeline
                  </p>
                  <span className="text-xs font-semibold text-primary">
                    Step {activeLinearStep} of 15: {activeStepDesc.title}
                  </span>
                </div>

                <nav aria-label="Procurement Lifecycle Stages Full">
                  <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-5">
                    {PROCUREMENT_STEP_NUMBERS.map((stepNum) => {
                      const desc = LINEAR_PROCUREMENT_STEPS[stepNum];
                      const stepState = getLinearStepState(stepNum, activeLinearStep);
                      const isCurrent = stepState === 'CURRENT';
                      const isDone = stepState === 'DONE';
                      const targetUrl = resolveLinearStepUrl(stepNum, ids);
                      const isClickable = isDone || isCurrent;

                      const content = (
                        <div
                          className={`group relative flex flex-col justify-between rounded-lg border p-2 text-left transition ${
                            isCurrent
                              ? 'border-primary ring-1 ring-primary/30 bg-primary/5 shadow-2xs font-bold'
                              : isDone
                              ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-500 cursor-pointer'
                              : 'border-border/60 bg-muted/20 opacity-60 cursor-not-allowed'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                                isCurrent
                                  ? 'bg-primary text-primary-foreground'
                                  : isDone
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {isDone ? '✓' : stepNum}
                            </span>

                            <span
                              className={`text-[8px] font-bold ${
                                isCurrent
                                  ? 'text-primary'
                                  : isDone
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {isCurrent ? 'ACTIVE' : isDone ? 'DONE' : 'PENDING'}
                            </span>
                          </div>

                          <div className="mt-1">
                            <p
                              className={`text-[11px] font-bold truncate ${
                                isCurrent
                                  ? 'text-foreground'
                                  : isDone
                                  ? 'text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {desc.icon} {desc.shortLabel}
                            </p>
                            <p className="mt-0.5 text-[9px] text-muted-foreground line-clamp-1 leading-tight">
                              {desc.description}
                            </p>
                          </div>
                        </div>
                      );

                      return (
                        <li key={stepNum}>
                          {isClickable ? (
                            <Link
                              to={targetUrl}
                              title={`Navigate to Step ${stepNum}: ${desc.title}`}
                              className="block focus:outline-none rounded-lg min-h-[44px] mobile-touch-target"
                              onClick={() => setIsBottomBarExpanded(false)}
                            >
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </nav>
              </div>
            </div>
          )}

          {/* Compact Docked Bottom Bar */}
          <div className="mx-auto max-w-7xl px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground flex items-center gap-1.5 text-xs min-w-0">
                <span>{activeStageDesc.icon}</span>
                <span className="hidden sm:inline">Stage {activeStageDesc.stepNumber || 0}/6:</span>
                <span className="text-primary font-black truncate max-w-[120px] xs:max-w-[160px] sm:max-w-[240px]">
                  {activeStageDesc.title}
                </span>
              </span>

              {/* Mobile Progress Pill */}
              <div className="flex sm:hidden items-center gap-1.5 pl-1.5 border-l border-border">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {Math.round(((activeStageDesc.stepNumber || 1) / 6) * 100)}%
                </span>
                <div className="w-10 xs:w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${((activeStageDesc.stepNumber || 1) / 6) * 100}%` }}
                  />
                </div>
              </div>

              {/* Desktop / Tablet 6-Stage Progress Nodes */}
              <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-border">
                {GOLDEN_PATH_STATES.map((stageKey, idx) => {
                  const desc = CORE_PROCUREMENT_STATES[stageKey];
                  const stepState = getStageStepState(stageKey, effectiveStage);
                  const isCurrent = stepState === 'CURRENT';
                  const isDone = stepState === 'DONE';
                  const targetUrl = resolveStageNavigationUrl(stageKey, ids, role);
                  const isClickable = isDone || isCurrent;

                  const dot = (
                    <span
                      key={stageKey}
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black transition ${
                        isCurrent
                          ? 'bg-primary text-primary-foreground ring-1 ring-primary/40'
                          : isDone
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted/70 text-muted-foreground'
                      }`}
                      title={`Stage ${idx + 1}: ${desc.title} (${isCurrent ? 'Active' : isDone ? 'Done' : 'Pending'})`}
                    >
                      {isDone ? '✓' : idx + 1}
                    </span>
                  );

                  return isClickable ? (
                    <Link key={stageKey} to={targetUrl} className="hover:scale-110 transition">
                      {dot}
                    </Link>
                  ) : (
                    <span key={stageKey}>{dot}</span>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden lg:inline text-[10px] text-muted-foreground truncate max-w-xs">
                {activeStageDesc.description}
              </span>
              <button
                type="button"
                onClick={() => setIsBottomBarExpanded((v) => !v)}
                className="rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-bold text-foreground hover:bg-muted transition flex items-center gap-1 min-h-[32px] mobile-touch-target"
                data-testid="admin-bottom-telemetry-toggle"
              >
                <span>{isBottomBarExpanded ? '▼ Collapse' : '▲ 15 Steps'}</span>
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
