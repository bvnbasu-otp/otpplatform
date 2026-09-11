import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  CORE_PROCUREMENT_STATES,
  CHRONOLOGICAL_STAGES,
  LINEAR_PROCUREMENT_STEPS,
  PROCUREMENT_STEP_NUMBERS,
  deriveLinearStepNumber,
  getLinearStepState,
  resolveLinearStepUrl,
  getStageStepState,
  resolveStageNavigationUrl,
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
  currentStage = 'DRAFT',
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
  const activeStepDesc = LINEAR_PROCUREMENT_STEPS[activeLinearStep];
  const activeLegacyDesc = CORE_PROCUREMENT_STATES[currentStage];

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
      ? `Order has been inactive at Step ${activeLinearStep} (${activeStepDesc.shortLabel}) for ${Math.floor(idleHours)} hours.`
      : `Order has exceeded time threshold (>24h) at Step ${activeLinearStep} (${activeStepDesc.shortLabel}).`);

  return (
    <div data-testid="procurement-stage-navigator">
      {/* 1. Ultra-Slim Top Breadcrumb & Action Bar */}
      <div className="mb-2.5 rounded-lg border border-border bg-card/95 px-3 py-1.5 text-xs shadow-2xs backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Link
              to={resolvedBackUrl}
              className="flex items-center gap-1 font-semibold text-muted-foreground hover:text-primary transition shrink-0"
            >
              <span>←</span>
              <span className="hidden sm:inline">{backToLabel}</span>
            </Link>
            <span className="text-muted-foreground/40 shrink-0">/</span>
            <span className="font-bold text-foreground truncate max-w-[180px] sm:max-w-xs text-xs">
              {orderReference ? `${orderReference} · ` : ''}
              {orderTitle || 'Procurement Order'}
            </span>
            <span className="text-muted-foreground/40 shrink-0">/</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold shadow-2xs border shrink-0 ${activeStepDesc.badgeClass}`}
            >
              {activeStepDesc.icon} Step {activeLinearStep}/15: {activeStepDesc.shortLabel}
            </span>
          </div>

          {/* Right side controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isStalled && (
              <button
                type="button"
                onClick={() => setShowStalledDrawer((v) => !v)}
                className="flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 px-2 py-0.5 text-[10px] font-black text-red-900 dark:text-red-200 shadow-2xs hover:bg-red-200 transition"
                title="Click to view stall diagnostics and unblocking actions"
              >
                <span>⚠️ STALLED</span>
                <span className="underline">{showStalledDrawer ? '▲' : '▼'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowSubTabs((v) => !v)}
              className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              {showSubTabs ? '▲ Hide Steps' : '⚡ 15 Steps'}
            </button>
          </div>
        </div>

        {/* STALLED Exception & Diagnostic Drawer */}
        {isStalled && showStalledDrawer && (
          <div className="mt-2 border-t border-red-200 dark:border-red-900 bg-red-50/90 dark:bg-red-950/40 p-2 rounded-md animate-in fade-in-50">
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
                  className="rounded bg-red-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-2xs hover:bg-red-700 transition shrink-0"
                >
                  ⚡ {stalledActionLabel}
                </button>
              )}
            </div>
          </div>
        )}

        {/* 15-Step Linear Traversal Quick Ribbon */}
        {showSubTabs && (
          <div className="mt-1.5 border-t border-border/80 pt-1.5 flex flex-wrap items-center gap-1 text-[10px] animate-in fade-in-50">
            <span className="font-bold uppercase tracking-wider text-muted-foreground mr-1 text-[9px]">
              Pipeline:
            </span>

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
                  className={`rounded border px-1.5 py-0.5 text-[9px] font-medium transition flex items-center gap-1 ${
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
        )}
      </div>

      {/* 2. Fixed/Sticky Bottom Lifecycle Progress Bar (15 Linear Steps) */}
      <aside className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 shadow-md backdrop-blur transition-all" aria-label="Procurement Progress">
        {/* Expanded Drawer (Upward) */}
        {isBottomBarExpanded && (
          <div className="border-b border-border bg-card/98 p-3 shadow-inner max-h-[50vh] overflow-y-auto animate-in slide-in-from-bottom-5">
            <div className="mx-auto max-w-7xl">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Strict 15-Step Linear Procurement Pipeline
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
                            className="block focus:outline-none rounded-lg"
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
        <div className="mx-auto max-w-7xl px-3 py-1 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-foreground flex items-center gap-1 text-xs">
              <span>{activeStepDesc.icon}</span>
              <span className="hidden sm:inline">Step {activeLinearStep}/15:</span>
              <span className="text-primary font-black truncate max-w-[140px] sm:max-w-[220px]">
                {activeStepDesc.title}
              </span>
            </span>

            {/* Mini 15 Progress Dots */}
            <div className="flex items-center gap-1 pl-2 border-l border-border">
              {PROCUREMENT_STEP_NUMBERS.map((stepNum) => {
                const desc = LINEAR_PROCUREMENT_STEPS[stepNum];
                const stepState = getLinearStepState(stepNum, activeLinearStep);
                const isCurrent = stepState === 'CURRENT';
                const isDone = stepState === 'DONE';
                const targetUrl = resolveLinearStepUrl(stepNum, ids);
                const isClickable = isDone || isCurrent;

                const dot = (
                  <span
                    key={stepNum}
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-black transition ${
                      isCurrent
                        ? 'bg-primary text-primary-foreground ring-1 ring-primary/40'
                        : isDone
                        ? 'bg-emerald-600 text-white'
                        : 'bg-muted/70 text-muted-foreground'
                    }`}
                    title={`Step ${stepNum}: ${desc.title} (${isCurrent ? 'Active' : isDone ? 'Done' : 'Pending'})`}
                  >
                    {isDone ? '✓' : stepNum}
                  </span>
                );

                return isClickable ? (
                  <Link key={stepNum} to={targetUrl} className="hover:scale-110 transition">
                    {dot}
                  </Link>
                ) : (
                  <span key={stepNum}>{dot}</span>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden lg:inline text-[10px] text-muted-foreground truncate max-w-xs">
              {activeStepDesc.description}
            </span>
            <button
              type="button"
              onClick={() => setIsBottomBarExpanded((v) => !v)}
              className="rounded border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-bold text-foreground hover:bg-muted transition flex items-center gap-1"
            >
              <span>{isBottomBarExpanded ? '▼ Collapse' : '▲ 15 Steps'}</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
