import { useEffect, useState } from 'react';
import type { RequiredByMode } from '@otp/domain';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  NumberInput,
  RadioCardGroup,
  Textarea,
} from '@/components/ui';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface WhenAndBudgetStepProps {
  draft: IntakeDraft;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

const TIMING_OPTIONS = [
  { value: 'IMMEDIATE', label: '⚡ Emergency / Immediate', description: 'Immediate response needed' },
  { value: 'WITHIN_DAYS', label: '⏱️ Target Turnaround Days', description: 'Deliver within a target duration' },
  { value: 'SPECIFIC_DATE', label: '📅 Firm Target Date', description: 'Strict calendar delivery milestone' },
  { value: 'FLEXIBLE', label: '🤝 Flexible Timeline', description: 'Open timeline for most competitive pricing' },
];

const TAT_CHIPS = [
  { label: '⚡ ASAP / Immediate', mode: 'IMMEDIATE', days: null },
  { label: '⏱️ This week (7 days)', mode: 'WITHIN_DAYS', days: 7 },
  { label: 'Within 15 days', mode: 'WITHIN_DAYS', days: 15 },
  { label: '📅 This month (30 days)', mode: 'WITHIN_DAYS', days: 30 },
  { label: '🤝 Flexible', mode: 'FLEXIBLE', days: null },
];

const BUDGET_PRESETS = [
  { label: '₹1L–5L', amount: 250000 },
  { label: '₹5L–10L', amount: 750000 },
  { label: '₹10L–25L', amount: 1500000 },
  { label: '₹25L+', amount: 5000000 },
];

const PAYMENT_PRESETS = [
  {
    type: 'SINGLE',
    label: '💳 100% on Delivery & Inspection',
    terms: '100% upon delivery & inspection sign-off',
  },
  {
    type: 'ADVANCE',
    label: '⚡ 30% Adv + 70% Balance',
    terms: '30% advance with PO, 70% balance upon delivery',
  },
  {
    type: 'MILESTONES',
    label: '🏁 3-Stage Milestones (30/40/30)',
    terms: '30% mobilization, 40% dispatch sign-off, 30% final acceptance',
  },
];

export function WhenAndBudgetStep({
  draft,
  isBusy,
  onBack,
  onSubmit,
}: WhenAndBudgetStepProps) {
  const [timing, setTiming] = useState<string>(draft.requiredByMode ?? 'WITHIN_DAYS');
  const [days, setDays] = useState<number | null>(draft.requiredByDays ?? 15);
  const [date, setDate] = useState(draft.requiredByDate ?? '');
  const [budgetAmount, setBudgetAmount] = useState<number | null>(
    draft.commercial.budgetAmount ?? null,
  );
  const [paymentTerms, setPaymentTerms] = useState(
    draft.commercial.paymentTerms ?? '100% upon delivery & inspection sign-off',
  );
  const [includesTransport, setIncludesTransport] = useState(
    draft.commercial.priceIncludesTransport ?? true,
  );
  const [includesGst, setIncludesGst] = useState(
    draft.commercial.priceIncludesGst ?? true,
  );
  const [commercialNotes, setCommercialNotes] = useState(
    draft.commercial.notes ?? '',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.requiredByMode) setTiming(draft.requiredByMode);
    if (draft.requiredByDays !== null && draft.requiredByDays !== undefined) {
      setDays(draft.requiredByDays);
    }
    if (draft.requiredByDate) setDate(draft.requiredByDate);
    if (draft.commercial.budgetAmount !== null && draft.commercial.budgetAmount !== undefined) {
      setBudgetAmount(draft.commercial.budgetAmount);
    }
  }, [draft]);

  function handleSubmit() {
    if (timing === 'WITHIN_DAYS' && (!days || days < 1)) {
      setError('Please specify target turnaround days.');
      return;
    }
    if (timing === 'SPECIFIC_DATE' && !date) {
      setError('Please pick a required-by calendar date.');
      return;
    }

    setError(null);
    onSubmit({
      requiredByMode: timing as RequiredByMode,
      requiredByDays: timing === 'WITHIN_DAYS' ? days : null,
      requiredByDate: timing === 'SPECIFIC_DATE' ? date : null,
      commercial: {
        budgetAmount,
        paymentTerms: paymentTerms.trim() || null,
        priceIncludesTransport: includesTransport,
        priceIncludesGst: includesGst,
        notes: commercialNotes.trim() || null,
      },
    });
  }

  return (
    <div className="space-y-4" data-testid="when-and-budget-step">
      {/* 1. Target Timeline / Delivery TAT */}
      <Card
        title="When do you need this?"
        description="Set your delivery or completion schedule so suppliers can evaluate their capacity and commit to timelines."
      >
        {/* 1-Tap TAT Chips */}
        <div className="mb-3 space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">
            ⚡ 1-Tap Delivery TAT:
          </span>
          <div className="flex flex-wrap gap-2">
            {TAT_CHIPS.map((chip) => {
              const isSelected =
                timing === chip.mode &&
                (chip.days === null || days === chip.days);
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setError(null);
                    setTiming(chip.mode);
                    if (chip.days !== null) setDays(chip.days);
                  }}
                  className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition active:scale-95 min-h-[44px] mobile-touch-target shadow-2xs ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-muted'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        <RadioCardGroup
          legend="Delivery Schedule Mode"
          options={TIMING_OPTIONS}
          value={timing}
          onValueChange={(val) => {
            setError(null);
            setTiming(val);
          }}
        />

        {timing === 'WITHIN_DAYS' && (
          <Field label="Target Turnaround (Days)" className="mt-3 max-w-xs" required>
            {({ id }) => (
              <NumberInput
                id={id}
                min={1}
                value={days}
                onValueChange={(v) => {
                  setError(null);
                  setDays(v);
                }}
                unit="days"
              />
            )}
          </Field>
        )}

        {timing === 'SPECIFIC_DATE' && (
          <Field label="Target Calendar Date" className="mt-3 max-w-xs" required>
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={date}
                onChange={(e) => {
                  setError(null);
                  setDate(e.target.value);
                }}
              />
            )}
          </Field>
        )}
      </Card>

      {/* 2. Target Budget Range & Commercial Terms */}
      <Card
        title="Target Budget & Commercial Terms"
        description="Define your internal budget ceiling and settlement structure so received quotes are fairly evaluated."
      >
        <div className="space-y-4">
          {/* Target Budget with 1-Tap Chips and Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>Internal Budget Ceiling (Target)</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground border">
                  🔒 Private to Buyer
                </span>
              </label>
              {budgetAmount !== null && (
                <span className="text-sm font-extrabold text-primary">
                  ₹{budgetAmount.toLocaleString('en-IN')}
                </span>
              )}
            </div>

            {/* 1-Tap Budget Range Chips */}
            <div className="flex gap-2 items-center overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar sm:flex-wrap">
              {BUDGET_PRESETS.map((preset) => {
                const isSelected = budgetAmount === preset.amount;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setBudgetAmount(preset.amount)}
                    className={`rounded-full border px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold transition active:scale-95 min-h-[40px] shrink-0 mobile-touch-target shadow-2xs whitespace-nowrap ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {budgetAmount !== null && (
                <button
                  type="button"
                  onClick={() => setBudgetAmount(null)}
                  className="rounded-full border border-dashed border-border px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs text-muted-foreground hover:text-foreground transition min-h-[40px] shrink-0 mobile-touch-target whitespace-nowrap"
                >
                  Clear Budget
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 pt-1">
              <Field label="Exact Budget Amount (₹)" help="Suppliers never see your budget. Used only for internal quote comparisons.">
                {({ id }) => (
                  <NumberInput
                    id={id}
                    min={0}
                    placeholder="e.g. 500000"
                    value={budgetAmount}
                    onValueChange={setBudgetAmount}
                  />
                )}
              </Field>

              {/* Interactive Budget Range Slider */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Quick Range Slider: Up to ₹50,00,000
                </label>
                <input
                  type="range"
                  min={10000}
                  max={5000000}
                  step={10000}
                  value={budgetAmount ?? 250000}
                  onChange={(e) => setBudgetAmount(Number(e.target.value))}
                  className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>₹10K</span>
                  <span>₹10L</span>
                  <span>₹25L</span>
                  <span>₹50L+</span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Terms Presets */}
          <div className="border-t pt-4 space-y-2">
            <label className="block text-xs font-bold text-foreground">
              Payment Terms &amp; Settlement Structure
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PAYMENT_PRESETS.map((preset) => (
                <button
                  key={preset.type}
                  type="button"
                  onClick={() => setPaymentTerms(preset.terms)}
                  className={`rounded-xl border p-2.5 text-left text-xs transition active:scale-95 ${
                    paymentTerms === preset.terms
                      ? 'border-primary bg-primary/10 font-bold text-primary ring-1 ring-primary/30 shadow-2xs'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                  }`}
                >
                  <div className="font-bold text-foreground text-xs">{preset.label}</div>
                  <p className="mt-1 text-[11px] font-normal text-muted-foreground line-clamp-2">
                    {preset.terms}
                  </p>
                </button>
              ))}
            </div>

            <Field label="Customized Payment Terms" help="Specify exact schedule or milestone breakdown">
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="e.g. 100% on delivery, Net 30 days, or 30-40-30 milestones"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                />
              )}
            </Field>
          </div>

          {/* Price Inclusions */}
          <div className="border-t pt-4 grid gap-3 sm:grid-cols-2 rounded-xl border bg-muted/20 p-3.5">
            <Checkbox
              label="Quoted Price Must Include Transport / Freight"
              description="All quotes should reflect landed cost at delivery destination."
              checked={includesTransport}
              onCheckedChange={setIncludesTransport}
            />
            <Checkbox
              label="Quoted Price Must Include Applicable GST"
              description="Quotes will be evaluated inclusive of standard GST rates."
              checked={includesGst}
              onCheckedChange={setIncludesGst}
            />
          </div>

          <Field label="Commercial Remarks / Billing Notes">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                placeholder="Billing preferences, tax invoice expectations, penalty clauses..."
                value={commercialNotes}
                onChange={(e) => setCommercialNotes(e.target.value)}
              />
            )}
          </Field>
        </div>

        {error && <p className="mt-4 text-sm text-red-600 font-medium">{error}</p>}

        <div className="mt-5 pt-3 border-t border-border/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <Button variant="ghost" onClick={onBack} className="min-h-[48px] mobile-touch-target">
            ← Back
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            busy={isBusy}
            busyLabel="Saving Terms…"
            className="min-h-[48px] w-full sm:w-auto font-extrabold text-xs sm:text-sm shadow-xs mobile-touch-target"
          >
            Continue →
          </Button>
        </div>
      </Card>
    </div>
  );
}
