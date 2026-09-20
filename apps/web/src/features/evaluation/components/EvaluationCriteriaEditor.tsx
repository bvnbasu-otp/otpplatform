import React, { useMemo, useState } from 'react';
import {
  previewWeightPercentages,
  normalizeEvaluationWeights,
  isEssentialCriterion,
  getCategoryEvaluationProfile,
  applyEvaluationPreset,
  EvaluationPreset,
  EVALUATION_PRESET_OPTIONS,
  type EvaluationPresetKey,
  type EvaluationCriterionDef,
} from '@otp/domain';
import { Badge, Button, Card, Select, WeightSlider } from '@/components/ui';

export interface EvaluationCriteriaEditorProps {
  /** Everything the buyer may choose from. */
  catalog: EvaluationCriterionDef[];
  /** Raw buyer weights keyed by criterion code. They need not total anything. */
  weights: Record<string, number>;
  onWeightsChange: (weights: Record<string, number>) => void;
  /** The category's starting set, restored by Reset. */
  suggested: Record<string, number>;
  /** Whether the current set is still the suggestion or the buyer's own. */
  source: 'SUGGESTED' | 'CUSTOM';
  onSourceChange: (source: 'SUGGESTED' | 'CUSTOM') => void;
  categoryCode?: string | null;
  subcategoryCode?: string | null;
  disabled?: boolean;
}

// Color palette for the visual weight distribution bar
const CRITERION_COLORS: Record<string, string> = {
  price: 'bg-emerald-500',
  delivery_time: 'bg-blue-500',
  warranty: 'bg-purple-500',
  technical_fit: 'bg-amber-500',
  certification: 'bg-teal-500',
  supplier_rating: 'bg-indigo-500',
  on_time_record: 'bg-cyan-500',
  experience: 'bg-rose-500',
  response_time: 'bg-orange-500',
  payment_terms: 'bg-slate-500',
  dispute_history: 'bg-red-500',
};

function getCriterionColor(code: string): string {
  return CRITERION_COLORS[code.toLowerCase()] || 'bg-primary';
}

/**
 * The buyer decides what winning means.
 *
 * Progressive disclosure architecture:
 * 1. Clean essential criteria by default (Price, Delivery, Warranty).
 * 2. 1-tap evaluation strategy presets (Balanced, Lowest Price, Quality & SLA, Fast-Track).
 * 3. Progressive disclosure accordion for advanced category-specific dimensions (Technical fit, Certifications, SLAs).
 * 4. Real-time deterministic 100% weight normalization visualizer.
 */
export function EvaluationCriteriaEditor({
  catalog,
  weights,
  onWeightsChange,
  suggested,
  source,
  onSourceChange,
  categoryCode,
  subcategoryCode,
  disabled = false,
}: EvaluationCriteriaEditorProps) {
  const [pendingCode, setPendingCode] = useState('');
  const [showAdvancedControls, setShowAdvancedControls] = useState(false);
  const [activePreset, setActivePreset] = useState<EvaluationPresetKey | 'CUSTOM'>(() =>
    source === 'SUGGESTED' ? EvaluationPreset.CATEGORY_DEFAULT : 'CUSTOM',
  );

  const categoryProfile = useMemo(
    () => getCategoryEvaluationProfile(categoryCode, subcategoryCode),
    [categoryCode, subcategoryCode],
  );

  const byCode = useMemo(
    () => new Map(catalog.map((c) => [c.code, c])),
    [catalog],
  );

  const chosen = useMemo(
    () =>
      Object.keys(weights)
        .map((code) => byCode.get(code))
        .filter((c): c is EvaluationCriterionDef => Boolean(c))
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [weights, byCode],
  );

  const available = useMemo(
    () => catalog.filter((c) => !(c.code in weights)),
    [catalog, weights],
  );

  const percentages = useMemo(() => previewWeightPercentages(weights), [weights]);

  const isSuggestion =
    source === 'SUGGESTED' && sameWeights(weights, suggested);

  // Group chosen criteria into Essential vs Advanced
  const essentialChosen = useMemo(
    () => chosen.filter((c) => isEssentialCriterion(c.code)),
    [chosen],
  );

  const advancedChosen = useMemo(
    () => chosen.filter((c) => !isEssentialCriterion(c.code)),
    [chosen],
  );

  function change(next: Record<string, number>, newPreset?: EvaluationPresetKey | 'CUSTOM') {
    onWeightsChange(next);
    const isNowSuggested = sameWeights(next, suggested);
    onSourceChange(isNowSuggested ? 'SUGGESTED' : 'CUSTOM');
    setActivePreset(newPreset ?? (isNowSuggested ? EvaluationPreset.CATEGORY_DEFAULT : 'CUSTOM'));
  }

  function setWeight(code: string, value: number) {
    change({ ...weights, [code]: value }, 'CUSTOM');
  }

  function remove(code: string) {
    const { [code]: _removed, ...rest } = weights;
    change(rest, 'CUSTOM');
  }

  function add() {
    if (!pendingCode) return;
    change({ ...weights, [pendingCode]: 1 }, 'CUSTOM');
    setPendingCode('');
  }

  function handleSelectPreset(presetKey: EvaluationPresetKey) {
    if (presetKey === EvaluationPreset.CATEGORY_DEFAULT) {
      if (Object.keys(suggested).length > 0) {
        change({ ...suggested }, EvaluationPreset.CATEGORY_DEFAULT);
      } else {
        const profileWeights = applyEvaluationPreset(EvaluationPreset.CATEGORY_DEFAULT, categoryProfile);
        change(profileWeights, EvaluationPreset.CATEGORY_DEFAULT);
      }
      return;
    }

    const presetWeights = applyEvaluationPreset(presetKey, categoryProfile);
    change(presetWeights, presetKey);
  }

  return (
    <Card
      title="How quotes will be judged"
      description="Set what matters to you. The percentages update in real-time and always add up to exactly 100%."
      action={
        <div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
          {isSuggestion ? (
            <Badge tone="info">Suggested for {categoryProfile.categoryName}</Badge>
          ) : (
            <Badge tone="neutral">Custom Criteria</Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || (Object.keys(suggested).length === 0 && !categoryProfile)}
            onClick={() => {
              if (Object.keys(suggested).length > 0) {
                onWeightsChange({ ...suggested });
              } else {
                onWeightsChange(applyEvaluationPreset(EvaluationPreset.CATEGORY_DEFAULT, categoryProfile));
              }
              onSourceChange('SUGGESTED');
              setActivePreset(EvaluationPreset.CATEGORY_DEFAULT);
            }}
            className="min-h-[44px] mobile-touch-target"
          >
            Reset
          </Button>
        </div>
      }
      data-testid="evaluation-criteria-editor"
    >
      <div className="space-y-4">
        {/* 1. Category Guidance Context Banner */}
        <div
          className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground flex items-start gap-2.5"
          data-testid="category-criteria-rationale-badge"
        >
          <span className="text-base shrink-0 mt-0.5">🎯</span>
          <div className="space-y-0.5">
            <span className="font-bold text-primary block">
              {categoryProfile.categoryName} Scoring Benchmark
            </span>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {categoryProfile.rationale}
            </p>
          </div>
        </div>

        {/* 2. 1-Tap Strategy Presets Bar */}
        <div className="space-y-1.5" data-testid="evaluation-presets-container">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
            Quick Strategy Presets:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {EVALUATION_PRESET_OPTIONS.map((opt) => {
              const isSelected = activePreset === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectPreset(opt.key)}
                  className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold border transition min-h-[44px] mobile-touch-target ${
                    isSelected
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-muted/30 text-foreground border-border hover:bg-muted/60'
                  }`}
                  data-testid={`preset-btn-${opt.key.toLowerCase()}`}
                  title={opt.description}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Real-Time 100% Weight Distribution Bar */}
        <div className="space-y-1.5 pt-1" data-testid="weight-distribution-bar-container">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground">Scoring Formula Distribution</span>
            <span className="font-mono font-bold text-primary">100% Total</span>
          </div>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted border border-border/80"
            role="progressbar"
            aria-valuenow={100}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Evaluation weights breakdown bar"
          >
            {chosen.map((criterion) => {
              const pct = percentages[criterion.code] ?? 0;
              if (pct <= 0) return null;
              return (
                <div
                  key={criterion.code}
                  style={{ width: `${pct}%` }}
                  className={`${getCriterionColor(criterion.code)} transition-all duration-300 relative group`}
                  title={`${criterion.name}: ${pct}%`}
                />
              );
            })}
          </div>
          {/* Legend Badges */}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {chosen.map((criterion) => {
              const pct = percentages[criterion.code] ?? 0;
              return (
                <span
                  key={criterion.code}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                >
                  <span className={`inline-block h-2 w-2 rounded-full ${getCriterionColor(criterion.code)}`} />
                  <span>{criterion.name}:</span>
                  <strong className="text-foreground font-mono">{pct}%</strong>
                </span>
              );
            })}
          </div>
        </div>

        {/* 4. Essential Criteria Section (Primary View) */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>⚖️</span> Essential Evaluation Dimensions
            </h4>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
              {essentialChosen.length} Active
            </span>
          </div>

          {essentialChosen.length === 0 ? (
            <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              No essential criteria active. Add Price, Delivery Time, or Warranty below.
            </p>
          ) : (
            <div className="space-y-2">
              {essentialChosen.map((criterion) => (
                <WeightSlider
                  key={criterion.code}
                  label={criterion.name}
                  description={criterion.description}
                  value={weights[criterion.code] ?? 0}
                  percent={percentages[criterion.code] ?? 0}
                  disabled={disabled}
                  onValueChange={(value) => setWeight(criterion.code, value)}
                  onRemove={() => remove(criterion.code)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 5. Progressive Disclosure: Advanced Category-Specific Dimensions */}
        <div className="pt-2 border-t border-border/60 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdvancedControls((prev) => !prev)}
              aria-expanded={showAdvancedControls}
              aria-controls="advanced-criteria-accordion"
              className="flex items-center gap-2 text-xs font-extrabold text-primary hover:underline min-h-[44px] mobile-touch-target text-left"
              data-testid="toggle-advanced-criteria-btn"
            >
              <span>{showAdvancedControls ? '▼ Hide Advanced Dimensions' : '▶ Advanced Category Dimensions'}</span>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                {advancedChosen.length} Active
              </span>
            </button>
            <span className="text-[10px] text-muted-foreground">
              Technical, Certifications &amp; SLAs
            </span>
          </div>

          {showAdvancedControls && (
            <div
              id="advanced-criteria-accordion"
              role="region"
              aria-label="Advanced Category Evaluation Dimensions"
              className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-3 sm:p-4 animate-in fade-in-50"
              data-testid="advanced-criteria-accordion"
            >
              <div className="text-xs text-muted-foreground">
                Tune deep technical specifications, ISO/BIS compliance, and response SLA penalties.
              </div>

              {advancedChosen.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border bg-card p-3 text-xs text-muted-foreground">
                  No advanced dimensions added yet. Use the dropdown below to add Technical Fit, Certifications, or SLAs.
                </p>
              ) : (
                <div className="space-y-2">
                  {advancedChosen.map((criterion) => (
                    <WeightSlider
                      key={criterion.code}
                      label={criterion.name}
                      description={criterion.description}
                      value={weights[criterion.code] ?? 0}
                      percent={percentages[criterion.code] ?? 0}
                      disabled={disabled}
                      onValueChange={(value) => setWeight(criterion.code, value)}
                      onRemove={() => remove(criterion.code)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. Add Dimension Selector */}
        {available.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-end gap-2 pt-2 border-t border-border/60">
            <Select
              className="flex-1 min-h-[44px]"
              aria-label="Add a criterion"
              placeholder="Add another criterion dimension…"
              disabled={disabled}
              options={available.map((c) => ({
                value: c.code,
                label: `${c.name} (${isEssentialCriterion(c.code) ? 'Essential' : 'Advanced'})`,
              }))}
              value={pendingCode}
              onChange={(e) => setPendingCode(e.target.value)}
              data-testid="add-criterion-select"
            />
            <Button
              variant="secondary"
              disabled={disabled || !pendingCode}
              onClick={add}
              className="min-h-[44px] mobile-touch-target font-bold"
              data-testid="add-criterion-btn"
            >
              + Add Dimension
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function sameWeights(a: Record<string, number>, b: Record<string, number>): boolean {
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, i) => key === bKeys[i] && a[key] === b[key]);
}
