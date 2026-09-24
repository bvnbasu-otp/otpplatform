import { useEffect, useMemo, useState } from 'react';
import {
  REQUIREMENT_MODE_LABELS,
  RequirementMode,
  type FulfilmentMode,
  type ParsedRequirement,
  type RequiredByMode,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button, Card, Field, Input, NumberInput, Select, Textarea } from '@/components/ui';
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities';
import { VoiceRequirementDictation } from './VoiceRequirementDictation';

export interface Tier1TellOtpCardProps {
  text: string;
  title: string;
  categoryId: string;
  subcategoryId: string;
  mode: RequirementMode | '';
  city: string;
  pincode: string;
  fulfilment: FulfilmentMode | string;
  timing: RequiredByMode | string;
  days: number | null;
  date: string;
  budgetAmount: number | null;
  paymentTerms?: string | null;
  taxonomy: TaxonomySnapshot;
  parsed: ParsedRequirement | null;
  isParsing: boolean;
  errors: Record<string, string>;
  onTextChange: (text: string) => void;
  onTitleChange: (title: string) => void;
  onCategoryChange: (categoryId: string) => void;
  onSubcategoryChange: (subcategoryId: string) => void;
  onModeChange: (mode: RequirementMode) => void;
  onCityChange: (city: string) => void;
  onPincodeChange: (pincode: string) => void;
  onFulfilmentChange: (fulfilment: FulfilmentMode) => void;
  onTimingChange: (timing: RequiredByMode, days?: number | null, date?: string | null) => void;
  onBudgetChange: (amount: number | null) => void;
  onPaymentTermsChange?: (terms: string | null) => void;
  onParse: (text: string) => Promise<ParsedRequirement>;
  onClearInput?: () => void;
  onOpenTemplates?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

const SUGGESTION_CHIPS = [
  {
    icon: '⚡',
    label: 'Borewell',
    text: 'Require 10 HP submersible borewell motor rewinding in Bengaluru 560001, needed within 5 days with 6 months warranty.',
  },
  {
    icon: '💡',
    label: 'Electrical',
    text: 'Industrial electrical panel wiring, busbar installation and LT breaker maintenance in Chennai 600001 within 7 days.',
  },
  {
    icon: '🔧',
    label: 'Plumbing',
    text: 'Commercial building booster pump overhaul, valve fitting and pipe replacement in Hyderabad 500001 within 5 days.',
  },
  {
    icon: '🛡️',
    label: 'Security',
    text: '8-Channel HD CCTV camera installation with 2TB NVR recording and smartphone remote monitoring in Pune 411001.',
  },
  {
    icon: '🧹',
    label: 'Cleaning',
    text: 'Deep cleaning and sanitization for 10,000 sq ft commercial facility in Mumbai 400001 within 3 days.',
  },
  {
    icon: '🏗️',
    label: 'Civil work',
    text: 'Commercial terrace waterproofing 5000 sq ft with elastomeric membrane coating in Mumbai 400001 within 15 days.',
  },
  {
    icon: '⚙️',
    label: 'Maintenance',
    text: 'Annual diesel generator DG set servicing, oil filter replacement and preventative maintenance in Coimbatore 641001.',
  },
  {
    icon: '📦',
    label: 'Packaging',
    text: 'Custom printed 5-ply corrugated shipping boxes 1000 units in Delhi NCR within 10 days.',
  },
];

const POPULAR_CITIES = [
  'Bengaluru',
  'Chennai',
  'Mumbai',
  'Delhi',
  'Hyderabad',
  'Pune',
  'Kolkata',
  'Ahmedabad',
];

const TAT_CHIPS = [
  { label: '⚡ ASAP / Immediate', mode: 'IMMEDIATE' as const, days: null },
  { label: '⏱️ This week (7 days)', mode: 'WITHIN_DAYS' as const, days: 7 },
  { label: '⏱️ Within 15 days', mode: 'WITHIN_DAYS' as const, days: 15 },
  { label: '📅 This month (30 days)', mode: 'WITHIN_DAYS' as const, days: 30 },
  { label: '🤝 Flexible', mode: 'FLEXIBLE' as const, days: null },
];

const BUDGET_PRESETS = [
  { label: '₹1L–5L', amount: 250000 },
  { label: '₹5L–10L', amount: 750000 },
  { label: '₹10L–25L', amount: 1500000 },
  { label: '₹25L+', amount: 5000000 },
];

export interface PaymentPreset {
  id: string;
  label: string;
  sublabel: string;
  description: string;
  value: string;
  splits: Array<{ label: string; pct: number }>;
}

export const PAYMENT_PRESETS: PaymentPreset[] = [
  {
    id: 'SINGLE',
    label: '1️⃣ Single Payment',
    sublabel: '100% on delivery / completion',
    description: 'Full payment released upon delivery inspection and mutual acceptance sign-off.',
    value: '100% on delivery',
    splits: [{ label: '100% On Delivery & Sign-off', pct: 100 }],
  },
  {
    id: 'THREE_SPLIT',
    label: '3️⃣ 3-Stage Split',
    sublabel: '30% Advance · 50% Delivery · 20% Sign-off',
    description: 'Balanced cash flow with mobilization advance, delivery payout, and final warranty sign-off.',
    value: '30% Advance, 50% on Delivery, 20% on Acceptance',
    splits: [
      { label: 'Stage 1: Mobilization Advance', pct: 30 },
      { label: 'Stage 2: Material Dispatch & Delivery', pct: 50 },
      { label: 'Stage 3: Testing & Final Acceptance', pct: 20 },
    ],
  },
  {
    id: 'MILESTONES',
    label: '📊 Milestone-Based',
    sublabel: '4 Milestones (25% / 25% / 25% / 25%)',
    description: 'Progressive milestone disbursements released in 25% increments as work scope completes.',
    value: '25% Kickoff, 25% Dispatch, 25% Installation, 25% Sign-off',
    splits: [
      { label: 'Milestone 1: Kickoff & Mobilization', pct: 25 },
      { label: 'Milestone 2: Dispatch & In-Transit', pct: 25 },
      { label: 'Milestone 3: Installation & Inspection', pct: 25 },
      { label: 'Milestone 4: Final Sign-off & Warranty', pct: 25 },
    ],
  },
];

const FULFILMENT_OPTIONS = [
  { value: 'SUPPLIER_DELIVERY', label: 'Supplier delivers to our site' },
  { value: 'BUYER_PICKUP', label: 'Buyer pickup / collection' },
  { value: 'SUPPLIER_ONSITE', label: 'Supplier executes work onsite' },
  { value: 'REMOTE', label: 'Remote service / digital deliverable' },
  { value: 'LOGISTICS_REQUIRED', label: 'Requires 3rd-party logistics' },
];

export function Tier1TellOtpCard({
  text,
  title,
  categoryId,
  subcategoryId,
  mode,
  city,
  pincode,
  fulfilment,
  timing,
  days,
  date,
  budgetAmount,
  paymentTerms = '100% on delivery',
  taxonomy,
  parsed,
  isParsing,
  errors,
  onTextChange,
  onTitleChange,
  onCategoryChange,
  onSubcategoryChange,
  onModeChange,
  onCityChange,
  onPincodeChange,
  onFulfilmentChange,
  onTimingChange,
  onBudgetChange,
  onPaymentTermsChange,
  onParse,
  onClearInput,
  onOpenTemplates,
  isExpanded = true,
  onToggleExpand,
}: Tier1TellOtpCardProps) {
  const [showVoiceDictation, setShowVoiceDictation] = useState(false);
  const [isCustomTerms, setIsCustomTerms] = useState(false);
  const { isLocating, locationError, requestCurrentLocation } = useDeviceCapabilities();

  const subcategories = useMemo(
    () => taxonomy.subcategories.filter((s) => s.categoryId === categoryId),
    [taxonomy.subcategories, categoryId],
  );

  const activeSubcategory = useMemo(
    () => taxonomy.subcategories.find((s) => s.id === subcategoryId),
    [taxonomy.subcategories, subcategoryId],
  );

  const activePreset = useMemo(() => {
    return (
      PAYMENT_PRESETS.find(
        (p) =>
          p.value === paymentTerms ||
          (p.id === 'THREE_SPLIT' && paymentTerms?.includes('30%')) ||
          (p.id === 'MILESTONES' && paymentTerms?.includes('25%')) ||
          (!paymentTerms && p.id === 'SINGLE'),
      ) || null
    );
  }, [paymentTerms]);

  const confidence = parsed?.confidence ?? null;

  async function handleAutoDetectLocation() {
    const loc = await requestCurrentLocation();
    if (loc && !loc.error) {
      if (!city) onCityChange('Bengaluru');
      if (!pincode) onPincodeChange('560001');
    }
  }

  function handleCategorySelect(newCatId: string) {
    onCategoryChange(newCatId);
    const stillValid = taxonomy.subcategories.some(
      (s) => s.id === subcategoryId && s.categoryId === newCatId,
    );
    if (!stillValid) onSubcategoryChange('');
  }

  function handleSubcategorySelect(newSubCatId: string) {
    onSubcategoryChange(newSubCatId);
    const found = taxonomy.subcategories.find((s) => s.id === newSubCatId);
    if (!found) return;

    if (!categoryId || categoryId !== found.categoryId) {
      onCategoryChange(found.categoryId);
    }
    if (!mode && found.defaultRequirementMode) {
      onModeChange(found.defaultRequirementMode as RequirementMode);
    }
  }

  return (
    <Card
      title={
        onToggleExpand ? (
          <button
            type="button"
            className="flex w-full flex-wrap items-center justify-between gap-2 cursor-pointer select-none text-left p-0 border-0 bg-transparent"
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            aria-controls="stage-1-scope-body"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary font-black text-xs">
                1
              </span>
              <span className="font-extrabold text-sm sm:text-base text-foreground">
                Stage 1 — Requirement Scope &amp; Logistics
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="info">⚡ Essential Sourcing Basis</Badge>
              <span className="text-xs font-bold text-primary">
                {isExpanded ? 'Collapse ▲' : 'Expand ▼'}
              </span>
            </div>
          </button>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary font-black text-xs">
                1
              </span>
              <span className="font-extrabold text-sm sm:text-base text-foreground">
                Stage 1 — Requirement Scope &amp; Logistics
              </span>
            </div>
            <Badge tone="info">⚡ Essential Sourcing Basis</Badge>
          </div>
        )
      }
      description="Describe what you need in plain words or voice. Our AI automatically extracts vertical categories, location, turnaround time, and technical parameters."
      data-testid="tier-1-tell-otp-card"
    >
      {!isExpanded ? (
        <div
          className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-3 text-center cursor-pointer hover:bg-muted/40 transition mobile-touch-target"
          onClick={onToggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleExpand?.();
            }
          }}
        >
          <p className="text-xs font-semibold text-foreground">
            {title ? <strong className="text-primary mr-1.5">{title}</strong> : <span>Scope: </span>}
            {activeSubcategory ? ` · ${activeSubcategory.name}` : ''}
            {city ? ` · 📍 ${city} ${pincode ? `(${pincode})` : ''}` : ''}
            {budgetAmount ? ` · ₹${budgetAmount.toLocaleString('en-IN')}` : ''}
            {paymentTerms ? ` · 💳 ${paymentTerms}` : ''}
            <span className="text-primary font-bold ml-1.5 underline">Customize Scope &amp; Logistics ▼</span>
          </p>
        </div>
      ) : (
        <div className="space-y-4" id="stage-1-scope-body">
        {/* 1. Natural Language Prompt + Voice & Templates Controls */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>✨</span> Speak or Type Requirement:
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                AI Parser Ready
              </span>
              {onOpenTemplates && (
                <button
                  type="button"
                  onClick={onOpenTemplates}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground bg-muted/60 hover:bg-muted border border-border/80 px-2.5 py-1 rounded-lg transition min-h-[36px]"
                >
                  <span>📚</span>
                  <span>Templates</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowVoiceDictation(!showVoiceDictation)}
                className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline min-h-[36px] py-1 px-1.5"
              >
                <span>{showVoiceDictation ? '✕ Close' : '🎙️ Voice'}</span>
              </button>
            </div>
          </div>

          {/* Quick 1-Tap Category Suggestion Chips */}
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar sm:flex-wrap">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary hover:bg-primary/10 transition shadow-2xs active:scale-95 min-h-[40px] shrink-0 mobile-touch-target whitespace-nowrap"
                onClick={() => {
                  onTextChange(chip.text);
                  void onParse(chip.text);
                }}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>

          {/* Voice Dictation Drawer */}
          {showVoiceDictation && (
            <div className="mt-2">
              <VoiceRequirementDictation
                onTranscript={(dictatedText) => {
                  onTextChange(dictatedText);
                  if (dictatedText.trim().length >= 8) {
                    void onParse(dictatedText.trim());
                  }
                }}
              />
            </div>
          )}

          <Field label="Requirement Description" error={errors.originalText || errors.text} required>
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                rows={3}
                placeholder="e.g. 10 HP submersible motor rewinding in Bengaluru within 5 days with 6 months warranty..."
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                onBlur={() => {
                  if (text.trim().length >= 10 && !subcategoryId) {
                    void onParse(text.trim());
                  }
                }}
              />
            )}
          </Field>

          {/* Re-Extract & Clear Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <p className="text-[11px] text-muted-foreground">
              Include item name, quantity, timeline, and city for instant extraction.
            </p>
            <div className="flex items-center gap-2">
              {(text.trim().length > 0 || title.trim().length > 0) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClearInput}
                  className="min-h-[38px] px-2.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                >
                  🗑️ Clear
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isParsing || text.trim().length < 5}
                busy={isParsing}
                busyLabel="Analyzing…"
                onClick={() => void onParse(text.trim())}
                className="min-h-[38px] px-3 text-xs font-bold"
                data-testid="re-extract-btn"
              >
                ⚡ Re-Extract with AI
              </Button>
            </div>
          </div>

          {/* AI Auto-Extracted Parameters Banner */}
          {parsed && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between font-semibold text-primary">
                <span className="flex items-center gap-1.5">
                  <span>⚡</span> AI Auto-Extracted Parameters:
                </span>
                {confidence !== null && (
                  <Badge tone={confidence >= 0.6 ? 'success' : 'warning'}>
                    {confidence >= 0.6 ? 'AI Confident' : 'Please Verify'}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {parsed.title && (
                  <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 font-medium text-foreground border shadow-2xs">
                    <span>📝 Title:</span> <strong>{parsed.title}</strong>
                  </span>
                )}
                {parsed.deliveryCity && (
                  <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 font-medium text-foreground border shadow-2xs">
                    <span>📍 City:</span> <strong>{parsed.deliveryCity}</strong>
                  </span>
                )}
                {parsed.deliveryPincode && (
                  <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 font-medium text-foreground border shadow-2xs">
                    <span>📮 PIN:</span> <strong>{parsed.deliveryPincode}</strong>
                  </span>
                )}
                {(parsed.timing.requiredByDays !== null || parsed.timing.isImmediate) && (
                  <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 font-medium text-foreground border shadow-2xs">
                    <span>⏱️ Timeline:</span> <strong>{parsed.timing.isImmediate ? 'Immediate' : `${parsed.timing.requiredByDays} days`}</strong>
                  </span>
                )}
                {parsed.warrantyMonths !== null && (
                  <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 font-medium text-foreground border shadow-2xs">
                    <span>🛡️ Warranty:</span> <strong>{parsed.warrantyMonths} mo</strong>
                  </span>
                )}
                {parsed.quantity !== null && (
                  <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-0.5 font-medium text-foreground border shadow-2xs">
                    <span>🔢 Quantity:</span> <strong>{parsed.quantity} {parsed.unit || 'units'}</strong>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Title & Category Classification Grid */}
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 pt-2 border-t border-border/60">
          <Field label="Requirement Title" error={errors.title} required className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="e.g. 10 HP Submersible Borewell Motor Rewinding"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
              />
            )}
          </Field>

          <Field label="Category" error={errors.categoryId} required>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="Select category"
                options={[
                  ...taxonomy.categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                  { value: 'OTHER', label: 'Not listed? Tell us what you need' },
                ]}
                value={categoryId}
                onChange={(e) => handleCategorySelect(e.target.value)}
              />
            )}
          </Field>

          <Field label="Type of Work (Subcategory)" error={errors.subcategoryId} required>
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="Select specific vertical"
                options={[
                  ...(subcategories.length > 0
                    ? subcategories
                    : taxonomy.subcategories
                  ).map((s) => ({ value: s.id, label: s.name })),
                  { value: 'OTHER', label: 'Not listed? (Custom Specification)' },
                ]}
                value={subcategoryId}
                onChange={(e) => handleSubcategorySelect(e.target.value)}
              />
            )}
          </Field>

          <Field label="Procurement Mode" error={errors.requirementMode} required className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="Select procurement mode"
                options={Object.entries(REQUIREMENT_MODE_LABELS).map(
                  ([value, label]) => ({ value, label }),
                )}
                value={mode}
                onChange={(e) => onModeChange(e.target.value as RequirementMode)}
              />
            )}
          </Field>
        </div>

        {/* 3. Delivery Location & PIN Code */}
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 pt-2 border-t border-border/60">
          <Field label="Delivery / Service City" error={errors.deliveryCity} required className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <div className="space-y-2">
                {/* 1-Tap City Pills & GPS Location Auto-Detect (Screen 03) */}
                <div className="flex gap-1.5 items-center justify-between overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar sm:flex-wrap">
                  <div className="flex gap-1.5 items-center overflow-x-auto no-scrollbar">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
                      DELIVERY LOCATION (1-TAP):
                    </span>
                    {['Bengaluru', 'Chennai', 'Coimbatore', 'Hyderabad', 'Mumbai'].map((c) => {
                      const isSelected = city.toLowerCase() === c.toLowerCase() ||
                        (c === 'Bangalore' && city.toLowerCase() === 'bengaluru');
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            onCityChange(c === 'Bangalore' ? 'Bengaluru' : c);
                            if (c === 'Bengaluru') onPincodeChange('560001');
                            else if (c === 'Chennai') onPincodeChange('600001');
                            else if (c === 'Coimbatore') onPincodeChange('641001');
                            else if (c === 'Hyderabad') onPincodeChange('500001');
                            else if (c === 'Mumbai') onPincodeChange('400001');
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition active:scale-95 min-h-[38px] shrink-0 mobile-touch-target shadow-2xs whitespace-nowrap ${
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                              : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-muted'
                          }`}
                        >
                          {c}{isSelected ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={isLocating}
                    onClick={handleAutoDetectLocation}
                    className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 transition shrink-0 inline-flex items-center gap-1 min-h-[36px]"
                  >
                    <span>📍</span>
                    <span>{isLocating ? 'Detecting…' : 'GPS'}</span>
                  </button>
                </div>

                {locationError && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ℹ️ {locationError}
                  </p>
                )}

                <Input
                  id={id}
                  list="tier1-cities-list"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="Enter city (e.g. Coimbatore, Salem, Kochi, Pune)"
                  value={city}
                  onChange={(e) => onCityChange(e.target.value)}
                />
                <datalist id="tier1-cities-list">
                  {(taxonomy.cities ?? []).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            )}
          </Field>

          {/* Scoring Weights (Auto-Optimized): Standard Merit (Screen 03) */}
          <div className="rounded-xl border bg-muted/25 p-3 space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-foreground">Scoring Weights (Auto-Optimized):</span>
              <span className="text-[11px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">Standard Merit</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
              <div className="rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-300/60 p-2">
                💰 Price 40%
              </div>
              <div className="rounded-lg bg-blue-500/10 text-blue-800 dark:text-blue-300 border border-blue-300/60 p-2">
                🚚 Speed 35%
              </div>
              <div className="rounded-lg bg-purple-500/10 text-purple-800 dark:text-purple-300 border border-purple-300/60 p-2">
                🛡️ SLA 25%
              </div>
            </div>
          </div>

          <Field label="Postal PIN Code" error={errors.deliveryPincode} required help="6-digit postal PIN for freight & local supplier distance calculation.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                maxLength={6}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="e.g. 560001"
                value={pincode}
                onChange={(e) => onPincodeChange(e.target.value.replace(/\D/g, ''))}
              />
            )}
          </Field>

          <Field label="Fulfilment / Execution Mode">
            {({ id }) => (
              <Select
                id={id}
                options={FULFILMENT_OPTIONS}
                value={fulfilment}
                onChange={(e) => onFulfilmentChange(e.target.value as FulfilmentMode)}
              />
            )}
          </Field>
        </div>

        {/* 4. Turnaround Urgency & Indicative Budget */}
        <div className="space-y-3 pt-2 border-t border-border/60">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-foreground flex items-center justify-between">
              <span>Required Delivery Turnaround / Urgency</span>
              <span className="text-[11px] font-normal text-muted-foreground">
                {timing === 'IMMEDIATE' ? '⚡ Emergency / Immediate' : timing === 'WITHIN_DAYS' ? `⏱️ Within ${days ?? 7} days` : timing === 'SPECIFIC_DATE' ? `📅 By ${date || 'target date'}` : '🤝 Flexible'}
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {TAT_CHIPS.map((chip) => {
                const isSelected = timing === chip.mode && (chip.days === null || days === chip.days);
                return (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => onTimingChange(chip.mode, chip.days, null)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 min-h-[40px] mobile-touch-target shadow-2xs whitespace-nowrap ${
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

            {timing === 'WITHIN_DAYS' && (
              <div className="pt-2 max-w-xs">
                <Field label="Custom Turnaround (Days)" error={errors.requiredByDays}>
                  {({ id }) => (
                    <NumberInput
                      id={id}
                      min={1}
                      value={days}
                      onValueChange={(v) => onTimingChange('WITHIN_DAYS', v, null)}
                      unit="days"
                    />
                  )}
                </Field>
              </div>
            )}

            {timing === 'SPECIFIC_DATE' && (
              <div className="pt-2 max-w-xs">
                <Field label="Specific Calendar Date" error={errors.requiredByDate}>
                  {({ id }) => (
                    <Input
                      id={id}
                      type="date"
                      value={date}
                      onChange={(e) => onTimingChange('SPECIFIC_DATE', null, e.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}
          </div>

          {/* Indicative Target Budget */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>Indicative Target Budget</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground border">
                  🔒 Private to Buyer
                </span>
              </label>
              {budgetAmount !== null && (
                <span className="text-xs sm:text-sm font-extrabold text-primary">
                  ₹{budgetAmount.toLocaleString('en-IN')}
                </span>
              )}
            </div>

            <div className="flex gap-2 items-center overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar sm:flex-wrap">
              {BUDGET_PRESETS.map((preset) => {
                const isSelected = budgetAmount === preset.amount;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onBudgetChange(preset.amount)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition active:scale-95 min-h-[38px] shrink-0 mobile-touch-target shadow-2xs whitespace-nowrap ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
              {budgetAmount !== null && (
                <button
                  type="button"
                  onClick={() => onBudgetChange(null)}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-rose-600 underline px-2 py-1"
                >
                  Clear Budget
                </button>
              )}
            </div>

            <div className="max-w-xs">
              <NumberInput
                min={0}
                placeholder="Or enter custom budget (e.g. 50000)"
                unit="₹ INR"
                value={budgetAmount}
                onValueChange={onBudgetChange}
              />
            </div>
          </div>

          {/* 5. Payment Structure & Terms */}
          <div className="space-y-2.5 pt-3 border-t border-border/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>💳 Payment Structure &amp; Schedule</span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary border border-primary/20">
                  Cash Flow Terms
                </span>
              </label>
              <span className="text-[11px] text-muted-foreground font-medium truncate max-w-[200px]">
                {paymentTerms || '100% on delivery'}
              </span>
            </div>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PAYMENT_PRESETS.map((preset) => {
                const isSelected =
                  paymentTerms === preset.value ||
                  (!paymentTerms && preset.id === 'SINGLE') ||
                  (preset.id === 'THREE_SPLIT' && paymentTerms?.includes('30%')) ||
                  (preset.id === 'MILESTONES' && paymentTerms?.includes('25%'));
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onPaymentTermsChange?.(preset.value);
                      setIsCustomTerms(false);
                    }}
                    className={`rounded-2xl border p-3 text-left transition flex flex-col justify-between space-y-1.5 min-h-[72px] mobile-touch-target ${
                      isSelected
                        ? 'border-primary bg-primary/10 dark:bg-primary/20 shadow-2xs'
                        : 'border-border bg-card hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold text-foreground">{preset.label}</span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {preset.sublabel}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Custom Payment Terms Toggle Button */}
            <div className="flex items-center justify-between pt-0.5">
              <button
                type="button"
                onClick={() => setIsCustomTerms(!isCustomTerms)}
                className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span>✏️</span>
                <span>{isCustomTerms ? 'Hide Custom Terms' : 'Need custom payment split or credit terms?'}</span>
              </button>
            </div>

            {/* Custom Terms Text Input */}
            {isCustomTerms && (
              <div className="pt-1">
                <input
                  type="text"
                  placeholder="e.g. 20% advance, 70% delivery, 10% 30-day retention"
                  value={paymentTerms || ''}
                  onChange={(e) => onPaymentTermsChange?.(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary min-h-[44px]"
                />
              </div>
            )}

            {/* Dynamic Rupee Split Breakdown Table (When Preset is Selected) */}
            {activePreset && activePreset.splits.length > 0 && (
              <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5 space-y-1.5 text-xs animate-in fade-in-50">
                <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  <span>Payment Schedule Stages:</span>
                  <span>{budgetAmount ? `Allocated from ₹${budgetAmount.toLocaleString('en-IN')}` : 'Percentage Split'}</span>
                </div>
                <div className="space-y-1">
                  {activePreset.splits.map((s, idx) => {
                    const splitRupees = budgetAmount ? Math.round((budgetAmount * s.pct) / 100) : null;
                    return (
                      <div key={idx} className="flex items-center justify-between text-[11px] py-0.5 border-b border-border/30 last:border-0">
                        <span className="text-foreground font-medium flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span>{s.label}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-muted-foreground">{s.pct}%</span>
                          {splitRupees !== null && (
                            <span className="font-mono font-bold text-foreground">
                              ₹{splitRupees.toLocaleString('en-IN')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
  </Card>
  );
}
