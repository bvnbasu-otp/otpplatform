import React, { useEffect, useMemo, useState } from 'react';
import type { EvaluationCriterionDef } from '@otp/domain';
import { Badge, Button, Card } from '@/components/ui';
import type { QuoteEvaluation, CriterionScore } from '../types/quote-evaluation';

export interface CriterionBreakdownTableProps {
  evaluations: QuoteEvaluation[];
  criteria: EvaluationCriterionDef[];
  isLoading?: boolean;
  isRecomputing?: boolean;
  error?: string | null;
  onRecompute?: () => void;
}

function formatRawMetric(code: string, raw: number | null): string {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return '—';
  const cleanCode = code.toLowerCase();
  if (cleanCode.includes('price') || cleanCode.includes('cost')) {
    return `₹${Math.round(raw).toLocaleString('en-IN')}`;
  }
  if (cleanCode.includes('delivery') || cleanCode.includes('days') || cleanCode.includes('time')) {
    return `${raw} Days`;
  }
  if (cleanCode.includes('warranty')) {
    return `${raw} Months`;
  }
  if (cleanCode.includes('rating')) {
    return `${raw.toFixed(1)} / 5.0`;
  }
  if (cleanCode.includes('percent') || cleanCode.includes('record')) {
    return `${raw}%`;
  }
  if (cleanCode.includes('hours') || cleanCode.includes('response')) {
    return `${raw} hrs`;
  }
  return String(raw);
}

/**
 * Why each quote scored what it did, criterion by criterion.
 *
 * Provides a transparent, explainable breakdown per pseudonymized supplier:
 * Criterion -> Weight -> Normalized Supplier Value -> Contribution -> Composite Merit Score (0-100).
 * Supports responsive mobile-first cards for 320px–430px screens alongside desktop matrix view.
 */
export function CriterionBreakdownTable({
  evaluations,
  criteria,
  isLoading = false,
  isRecomputing = false,
  error = null,
  onRecompute,
}: CriterionBreakdownTableProps) {
  const [selectedBreakdownEvaluation, setSelectedBreakdownEvaluation] = useState<QuoteEvaluation | null>(null);
  const [viewMode, setViewMode] = useState<'matrix' | 'cards'>('matrix');

  const nameFor = useMemo(
    () => new Map(criteria.map((c) => [c.code, c.name])),
    [criteria],
  );

  const isStale = evaluations.some((e) => e.status === 'STALE');

  // DEF-002: Automatic background score recomputation when quotes are revised and flagged as STALE
  useEffect(() => {
    if (isStale && onRecompute && !isRecomputing && !isLoading) {
      onRecompute();
    }
  }, [isStale, onRecompute, isRecomputing, isLoading]);

  const action = onRecompute && (
    <Button
      variant="secondary"
      size="sm"
      busy={isRecomputing}
      busyLabel="Scoring…"
      onClick={onRecompute}
      className="min-h-[44px] mobile-touch-target"
    >
      Rescore quotes
    </Button>
  );

  if (isLoading) {
    return (
      <Card title="Explainable Score Breakdown" action={action}>
        <div className="py-8 text-center text-xs text-muted-foreground space-y-2" data-testid="breakdown-loading">
          <div className="flex justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
          <p className="font-semibold text-foreground">Computing explainable merit scores…</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Explainable Score Breakdown" action={action}>
        <div
          className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-300"
          data-testid="breakdown-error"
        >
          <span className="font-bold block mb-1">⚠️ Scoring Error</span>
          {error}
        </div>
      </Card>
    );
  }

  if (evaluations.length === 0) {
    return (
      <Card
        title="Explainable Score Breakdown"
        description="Quotes are scored against the merit weights you set on this requirement."
        action={action}
      >
        <p className="text-xs text-muted-foreground py-4 text-center" data-testid="breakdown-empty">
          No quotes have been scored yet. When sealed quotes arrive, their transparent multi-factor breakdown will appear here.
        </p>
      </Card>
    );
  }

  const columns = evaluations[0]?.criteria ?? [];
  const codes = columns.map((c) => c.code);
  const weightFor = new Map(columns.map((c) => [c.code, c.weight]));

  return (
    <Card
      title="Explainable Score Breakdown"
      description="Each cell reveals the quote's score on that dimension, and its exact weighted contribution to the total."
      action={
        <div className="flex items-center gap-2">
          {/* View toggle for mobile/desktop preference */}
          <div className="hidden sm:flex rounded-xl border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('matrix')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                viewMode === 'matrix' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Matrix Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                viewMode === 'cards' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Supplier Cards
            </button>
          </div>
          {action}
        </div>
      }
      padded={false}
      data-testid="criterion-breakdown-card"
    >
      {isStale && (
        <div className="border-b bg-amber-50 dark:bg-amber-950/40 px-4 py-2 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
          <span>⚠️ A quote has been revised since these scores were computed. Rescore before deciding.</span>
          {onRecompute && (
            <button
              type="button"
              onClick={onRecompute}
              disabled={isRecomputing}
              className="text-xs font-bold text-amber-950 dark:text-amber-100 underline shrink-0 min-h-[36px] mobile-touch-target"
            >
              Rescore Now
            </button>
          )}
        </div>
      )}

      {/* 1. Governance Disclaimer */}
      <div className="border-b border-border/60 bg-primary/[0.02] px-4 py-2.5 text-[11px] text-muted-foreground flex items-center gap-2">
        <span className="text-primary font-bold">🔒 Governance Standard:</span>
        <span>
          Scores are relative (0–100) calculated against sealed criteria. Smart Score is an evaluation aid; committee balloting and quorum remain authoritative.
        </span>
      </div>

      {/* 2. Responsive Views: Cards for Mobile & Table for Desktop/Tablet */}
      <div className="block sm:hidden p-3 space-y-3" data-testid="criterion-breakdown-mobile-cards">
        {evaluations.map((evaluation, idx) => {
          const isTop = idx === 0;
          return (
            <div
              key={evaluation.evaluationId}
              className={`rounded-2xl border p-3.5 space-y-3 transition ${
                isTop
                  ? 'border-primary/40 bg-primary/[0.03] shadow-xs'
                  : 'border-border bg-card'
              }`}
              data-testid={`breakdown-card-${evaluation.anonymousLabel.replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-border/60">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-foreground">
                    🔒 {evaluation.anonymousLabel}
                  </span>
                  {isTop && (
                    <span className="rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[9px] font-black uppercase">
                      Top Evaluated
                    </span>
                  )}
                  {evaluation.status === 'STALE' && (
                    <Badge tone="warning">Stale</Badge>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                    Composite Score
                  </span>
                  <span className="font-mono font-black text-sm text-primary">
                    {evaluation.evaluationScore != null ? evaluation.evaluationScore.toFixed(1) : '—'}/100
                  </span>
                </div>
              </div>

              {/* Dimension Progress Bars */}
              <div className="space-y-2">
                {evaluation.criteria.map((score) => {
                  const name = nameFor.get(score.code) ?? score.code;
                  return (
                    <div key={score.code} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground font-medium">
                          {name} ({score.weight}%):
                        </span>
                        <div className="flex items-center gap-1.5 font-mono">
                          {score.raw !== null && (
                            <span className="text-muted-foreground text-[10px]">
                              {formatRawMetric(score.code, score.raw)} ·
                            </span>
                          )}
                          <span className="font-bold text-foreground">
                            {score.neutral ? '50 (neutral)' : `${score.normalized.toFixed(0)} pts`}
                          </span>
                          <span className="text-primary font-bold">
                            (+{score.contribution.toFixed(1)})
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          style={{ width: `${Math.min(100, Math.max(0, score.normalized))}%` }}
                          className={`h-full rounded-full ${
                            score.neutral ? 'bg-muted-foreground/40' : 'bg-primary'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedBreakdownEvaluation(evaluation)}
                  className="w-full text-center text-xs font-bold text-primary hover:underline py-1 min-h-[44px] mobile-touch-target flex items-center justify-center gap-1"
                >
                  <span>🔍 View Mathematical Explanation →</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Matrix Table for Larger Screens or Table View */}
      <div
        className="hidden sm:block relative overflow-hidden group"
        data-testid="criterion-breakdown-container"
      >
        <div className="overflow-x-auto" data-testid="criterion-breakdown-table">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b bg-muted/50 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-bold">Supplier</th>
                {codes.map((code) => (
                  <th key={code} className="px-4 py-3 text-right font-bold">
                    {nameFor.get(code) ?? code}
                    <span className="ml-1 font-normal normal-case text-muted-foreground">
                      ({weightFor.get(code) ?? 0}%)
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-bold">Composite Score</th>
                <th className="px-4 py-3 text-center font-bold">Explain</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((evaluation, index) => (
                <tr
                  key={evaluation.evaluationId}
                  className={`border-b last:border-0 hover:bg-muted/30 transition ${
                    index === 0 ? 'bg-primary/[0.04]' : ''
                  }`}
                  data-testid={`breakdown-row-${evaluation.anonymousLabel.replace(/\s+/g, '-')}`}
                >
                  <td className="px-4 py-3 font-semibold">
                    <div className="flex items-center gap-1.5 font-mono">
                      <span>🔒 {evaluation.anonymousLabel}</span>
                      {index === 0 && (
                        <span className="rounded bg-primary/20 text-primary px-1.5 py-0.2 text-[9px] font-black uppercase">
                          Top
                        </span>
                      )}
                      {evaluation.status === 'STALE' && (
                        <Badge tone="warning">Stale</Badge>
                      )}
                    </div>
                  </td>

                  {codes.map((code) => {
                    const score = evaluation.criteria.find((c) => c.code === code);
                    if (!score) {
                      return (
                        <td key={code} className="px-4 py-3 text-right text-muted-foreground">
                          —
                        </td>
                      );
                    }

                    return (
                      <td key={code} className="px-4 py-3 text-right tabular-nums">
                        <div className="space-y-0.5">
                          <div>
                            <span className={score.neutral ? 'text-muted-foreground' : 'font-medium'}>
                              {score.normalized.toFixed(0)}
                            </span>
                            <span className="ml-1 text-[11px] text-primary font-bold">
                              (+{score.contribution.toFixed(1)})
                            </span>
                          </div>
                          {score.raw !== null && (
                            <span className="block text-[10px] text-muted-foreground font-mono">
                              {formatRawMetric(code, score.raw)}
                            </span>
                          )}
                          {score.neutral && (
                            <span
                              className="block text-[9px] text-muted-foreground"
                              title="Nothing comparable to score, so it scored neutrally"
                            >
                              neutral
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="px-4 py-3 text-right font-mono font-bold text-sm text-foreground tabular-nums">
                    {evaluation.evaluationScore === null
                      ? '—'
                      : evaluation.evaluationScore.toFixed(1)}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => setSelectedBreakdownEvaluation(evaluation)}
                      className="text-xs font-bold text-primary hover:underline min-h-[36px] min-w-[36px] mobile-touch-target"
                      title="Inspect mathematical breakdown"
                    >
                      🔍
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Mathematical Explanation Modal Dialog */}
      {selectedBreakdownEvaluation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-50">
          <div className="w-full max-w-lg rounded-3xl border bg-card p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="text-xl">📊</span>
                <div>
                  <h3 className="text-sm font-black text-foreground">
                    Mathematical Score Decomposition
                  </h3>
                  <span className="font-mono text-xs text-primary font-bold">
                    🔒 {selectedBreakdownEvaluation.anonymousLabel}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBreakdownEvaluation(null)}
                className="rounded-full p-2 text-muted-foreground hover:text-foreground text-xs font-bold min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ✕ Close
              </button>
            </div>

            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
              <span className="font-bold text-primary block">Objective Merit Formula:</span>
              <p className="text-[11px] text-muted-foreground font-mono leading-relaxed">
                Total Score = Σ (Normalized Dimension Score × Buyer Weight %)
              </p>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
                Itemized Dimension Contribution:
              </span>
              <div className="space-y-1.5">
                {selectedBreakdownEvaluation.criteria.map((c) => {
                  const name = nameFor.get(c.code) ?? c.code;
                  return (
                    <div
                      key={c.code}
                      className="rounded-xl border border-border bg-muted/20 p-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <span className="font-bold text-foreground block">{name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Raw: {formatRawMetric(c.code, c.raw)} · Weight: {c.weight}%
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="font-bold text-foreground block">
                          {c.normalized.toFixed(0)}/100 pts
                        </span>
                        <span className="text-primary font-bold text-[11px]">
                          +{c.contribution.toFixed(1)} net points
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-3 flex items-center justify-between">
              <span className="font-bold text-xs text-foreground">Total Evaluated Score:</span>
              <span className="font-mono font-black text-base text-primary">
                {selectedBreakdownEvaluation.evaluationScore != null
                  ? `${selectedBreakdownEvaluation.evaluationScore.toFixed(1)} / 100`
                  : '—'}
              </span>
            </div>

            <Button
              variant="secondary"
              className="w-full min-h-[44px] font-bold"
              onClick={() => setSelectedBreakdownEvaluation(null)}
            >
              Done
            </Button>
          </div>
        </div>
      )}

      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        Scores are relative: 100 is the best offer received on that criterion and 0 the
        worst. A criterion nobody answered scores everyone neutrally rather than
        quietly dropping its weight.
      </p>
    </Card>
  );
}
