import React, { useMemo, useState } from 'react';
import {
  normalizeEvaluationWeights,
  getCategoryEvaluationProfile,
  type EvaluationCriterionDef,
  type SourcingMode,
} from '@otp/domain';
import { Badge, Button, Card, Field, Input, NumberInput, RadioCardGroup, Textarea } from '@/components/ui';
import { EvaluationCriteriaEditor } from '@/features/evaluation/components/EvaluationCriteriaEditor';

export interface Tier3SourcingControlsCardProps {
  sourcingMode: SourcingMode | string;
  minQuotes: number | null;
  deadlineDays: number | null;
  geographicReach: 'PAN_INDIA' | 'LOCAL' | 'STATE';
  evaluationWeights: Record<string, number>;
  evaluationWeightsSource: 'SUGGESTED' | 'CUSTOM';
  criteria: EvaluationCriterionDef[];
  suggestedWeights: Record<string, number>;
  siteNotes: string;
  line1: string;
  isFullGovernance: boolean;
  isExpanded: boolean;
  errors: Record<string, string>;
  categoryCode?: string | null;
  subcategoryCode?: string | null;
  onToggleExpand: () => void;
  onSourcingModeChange: (mode: SourcingMode) => void;
  onMinQuotesChange: (min: number | null) => void;
  onDeadlineDaysChange: (days: number | null) => void;
  onGeographicReachChange: (reach: 'PAN_INDIA' | 'LOCAL' | 'STATE') => void;
  onWeightsChange: (weights: Record<string, number>) => void;
  onWeightsSourceChange: (source: 'SUGGESTED' | 'CUSTOM') => void;
  onSiteNotesChange: (notes: string) => void;
  onLine1Change: (line1: string) => void;
}

const SOURCING_OPTIONS = [
  {
    value: 'IDENTITY_PROTECTED',
    label: '🛡️ Identity-Protected (Recommended)',
    description:
      'Suppliers quote with sealed identity protection on technical and commercial merit. Identity is only revealed upon final award confirmation.',
  },
  {
    value: 'OPEN_RFQ',
    label: '📢 Open RFQ Tender',
    description: 'Your organization name and requirement are visible upfront to all verified suppliers.',
  },
  {
    value: 'INVITE_SELECTED',
    label: '🎯 Direct Curated Invite',
    description: 'Manually invite specific verified suppliers on the discovery screen.',
  },
  {
    value: 'PREVIOUS_SUPPLIERS',
    label: '🤝 Existing Supplier Network',
    description: 'Limit invitations exclusively to suppliers who have delivered for your organization before.',
  },
];

const GEOGRAPHIC_REACH_OPTIONS = [
  {
    value: 'LOCAL',
    label: '📍 Local City / District Only (Recommended)',
    description: 'Strictly limit to suppliers with physical presence/shops in your city.',
  },
  {
    value: 'STATE',
    label: '🗺️ State / Regional Reach',
    description: 'Allow suppliers across your state and adjacent industrial corridors.',
  },
  {
    value: 'PAN_INDIA',
    label: '🌐 PAN-India Reach',
    description: 'Allow verified suppliers nationwide to quote if they ship/deliver to your destination (lowest prices & maximum competition).',
  },
];

export function Tier3SourcingControlsCard({
  sourcingMode,
  minQuotes,
  deadlineDays,
  geographicReach,
  evaluationWeights,
  evaluationWeightsSource,
  criteria,
  suggestedWeights,
  siteNotes,
  line1,
  isFullGovernance,
  isExpanded,
  errors,
  categoryCode,
  subcategoryCode,
  onToggleExpand,
  onSourcingModeChange,
  onMinQuotesChange,
  onDeadlineDaysChange,
  onGeographicReachChange,
  onWeightsChange,
  onWeightsSourceChange,
  onSiteNotesChange,
  onLine1Change,
}: Tier3SourcingControlsCardProps) {
  const [showWeightSliders, setShowWeightSliders] = useState(false);

  const categoryProfile = useMemo(
    () => getCategoryEvaluationProfile(categoryCode, subcategoryCode),
    [categoryCode, subcategoryCode],
  );

  const quorumHelper = useMemo(() => {
    switch (sourcingMode) {
      case 'IDENTITY_PROTECTED':
        return '🛡️ Identity-Protected Quorum: Minimum 3 sealed quotes recommended for unbiased commercial & technical merit evaluation before unsealing.';
      case 'OPEN_RFQ':
        return '📢 Open RFQ Quorum: Minimum 3 quotes recommended (up to 5) for healthy competitive tender benchmarking across verified suppliers.';
      case 'INVITE_SELECTED':
        return '🎯 Direct Curated Quorum: Minimum 2–3 quotes recommended from specifically invited suppliers.';
      case 'PREVIOUS_SUPPLIERS':
        return '🤝 Network Quorum: Minimum 1–2 quotes required from your verified past supplier relationships.';
      default:
        return 'Optimal competitive pricing is achieved with 3+ quotes.';
    }
  }, [sourcingMode]);

  const criterionName = useMemo(
    () => new Map(criteria.map((c) => [c.code, c.name])),
    [criteria],
  );

  const normalizedWeights = useMemo(() => {
    try {
      return normalizeEvaluationWeights(evaluationWeights).weights;
    } catch {
      return {};
    }
  }, [evaluationWeights]);

  return (
    <Card
      title={
        <button
          type="button"
          className="flex w-full flex-wrap items-center justify-between gap-2 cursor-pointer select-none text-left p-0 border-0 bg-transparent"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
          aria-controls="tier-3-sourcing-controls-body"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary font-black text-xs">
              3
            </span>
            <span className="font-extrabold text-sm sm:text-base text-foreground">
              Tier 3 — Sourcing Controls (Progressive Disclosure Accordion)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral">⚙️ Optional Sourcing Controls</Badge>
            <span className="text-xs font-bold text-primary">
              {isExpanded ? 'Collapse ▲' : 'Expand ▼'}
            </span>
          </div>
        </button>
      }
      description="Customize supplier identity shielding, competitive quote quorum, deadlines, evaluation criteria weights, and private site access notes."
      data-testid="tier-3-sourcing-controls-card"
    >
      <div className="space-y-4" id="tier-3-sourcing-controls-body">
        {/* Accordion Toggle Bar if Collapsed */}
        {!isExpanded && (
          <div
            className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-3.5 text-center cursor-pointer hover:bg-muted/40 transition mobile-touch-target"
            onClick={onToggleExpand}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleExpand();
              }
            }}
          >
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground font-semibold">
              <span>Defaults Active:</span>
              <span className="text-foreground">🛡️ Shielded Identities</span>
              <span>·</span>
              <span className="text-foreground">3 Quotes Quorum</span>
              <span>·</span>
              <span className="text-foreground">{deadlineDays ?? 7} Days Window</span>
              <span>·</span>
              <span className="text-foreground">{geographicReach === 'LOCAL' ? '📍 Local' : geographicReach === 'STATE' ? '🗺️ State' : '🌐 PAN-India'}</span>
              <span className="text-primary font-bold ml-1">Tap to Customize →</span>
            </div>
          </div>
        )}

        {/* Expanded Progressive Disclosure Body */}
        {isExpanded && (
          <div className="space-y-4 pt-1 animate-in fade-in-50">
            {/* 1. Sourcing Privacy Mode */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-foreground block">
                Sourcing Privacy &amp; Anonymity Protocol
              </label>
              <RadioCardGroup
                legend="Sourcing Mode"
                options={SOURCING_OPTIONS}
                value={sourcingMode}
                onValueChange={(val) => onSourcingModeChange(val as SourcingMode)}
              />
            </div>

            {/* 2. Quorum & Quote Deadline */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/60">
              <Field
                label="Target Competitive Quotes (Quorum)"
                error={errors.minQuotes}
                help={quorumHelper}
              >
                {({ id }) => (
                  <div className="space-y-1.5">
                    <NumberInput
                      id={id}
                      min={1}
                      value={minQuotes}
                      onValueChange={onMinQuotesChange}
                    />
                    <div
                      className="rounded-lg border border-primary/20 bg-primary/5 p-2 text-[11px] text-foreground flex items-start gap-1.5"
                      data-testid="quorum-explanation-badge"
                    >
                      <span className="shrink-0 mt-0.5">ℹ️</span>
                      <span className="leading-snug">{quorumHelper}</span>
                    </div>
                  </div>
                )}
              </Field>

              <Field
                label="Quote Submission Deadline Window"
                error={errors.deadlineDays}
                hint="days from publishing"
              >
                {({ id }) => (
                  <NumberInput
                    id={id}
                    min={1}
                    unit="days"
                    value={deadlineDays}
                    onValueChange={onDeadlineDaysChange}
                  />
                )}
              </Field>
            </div>

            {/* 3. Geographic Sourcing Reach */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <label className="text-xs font-bold text-foreground block">
                Geographic Sourcing Reach
              </label>
              <RadioCardGroup
                legend="Geographic Reach"
                options={GEOGRAPHIC_REACH_OPTIONS}
                value={geographicReach}
                onValueChange={(val) => onGeographicReachChange(val as 'PAN_INDIA' | 'LOCAL' | 'STATE')}
              />
            </div>

            {/* 4. Full Governance Notice if Applicable */}
            {isFullGovernance && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-primary">
                  <span>🏛️</span> Full Governance &amp; Multi-Member Committee:
                </div>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  As an RWA / Enterprise buyer, sealed quotes will be aggregated transparently for multi-member committee evaluation and audit recording following the quote submission deadline.
                </p>
              </div>
            )}

            {/* 5. Category-Specific Evaluation Scoring Weights */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span>⚖️</span> Merit Evaluation Weights
                    <span className="text-[10px] text-primary font-semibold">
                      ({categoryProfile.categoryName})
                    </span>
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Quotes are evaluated transparently against these merit weights.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowWeightSliders(!showWeightSliders)}
                  className="text-xs min-h-[44px] mobile-touch-target font-bold"
                  data-testid="toggle-customize-weights-btn"
                >
                  {showWeightSliders ? 'Hide Sliders ▲' : '⚙️ Customize Weights ▼'}
                </Button>
              </div>

              {/* Quick Merit Formula Badges */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(normalizedWeights).map(([code, weight]) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-3 py-1 text-xs font-semibold text-foreground shadow-2xs"
                  >
                    <span>{criterionName.get(code) ?? code}:</span>
                    <strong className="text-primary">{Math.round(weight > 1 ? weight : weight * 100)}%</strong>
                  </span>
                ))}
              </div>

              {showWeightSliders && (
                <div className="mt-2 rounded-2xl border bg-card p-3.5 space-y-3">
                  <EvaluationCriteriaEditor
                    catalog={criteria}
                    weights={evaluationWeights}
                    onWeightsChange={onWeightsChange}
                    suggested={suggestedWeights}
                    source={evaluationWeightsSource}
                    onSourceChange={onWeightsSourceChange}
                    categoryCode={categoryCode}
                    subcategoryCode={subcategoryCode}
                  />
                </div>
              )}
            </div>

            {/* 6. Special Buyer Instructions & Site Notes (Buyer-Private) */}
            <div className="space-y-3 pt-2 border-t border-border/60">
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>🔒</span> Confidential Buyer Site Notes &amp; Logistics
              </h4>

              <Field
                label="Street Address / Facility Line 1 (Private)"
                help="🔒 Encrypted & confidential. Only shown to the single awarded supplier after deal confirmation."
              >
                {({ id }) => (
                  <Input
                    id={id}
                    placeholder="e.g. Unit 4B, Phase 2 Industrial Corridor"
                    value={line1}
                    onChange={(e) => onLine1Change(e.target.value)}
                  />
                )}
              </Field>

              <Field
                label="Site Access Instructions & Logistics Notes (Private)"
                help="🔒 Details on gates, security passes, hoists, power availability, or unloading restrictions."
              >
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={2}
                    placeholder="e.g. Heavy vehicle entry before 8 AM only, loading dock 4, service elevator available..."
                    value={siteNotes}
                    onChange={(e) => onSiteNotesChange(e.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
