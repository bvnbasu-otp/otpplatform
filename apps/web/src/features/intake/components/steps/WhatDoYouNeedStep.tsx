import { useEffect, useMemo, useState } from 'react';
import {
  REQUIREMENT_MODE_LABELS,
  RequirementMode,
  type ParsedRequirement,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import type { IntakeDraft } from '../../types/intake-draft';
import { VoiceRequirementDictation } from '../VoiceRequirementDictation';

export interface WhatDoYouNeedStepProps {
  initialText: string;
  draft: IntakeDraft | null;
  taxonomy: TaxonomySnapshot;
  parsed: ParsedRequirement | null;
  isBusy: boolean;
  onClearDraft?: () => void;
  onParse: (text: string) => Promise<ParsedRequirement>;
  onSubmit: (payload: {
    title: string;
    originalText: string;
    categoryId: string | null;
    subcategoryId: string;
    requirementMode: RequirementMode;
    quantity: number | null;
    unit: string | null;
    parsed?: ParsedRequirement;
  }) => void;
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

export function WhatDoYouNeedStep({
  initialText,
  draft,
  taxonomy,
  parsed: initialParsed,
  isBusy,
  onClearDraft,
  onParse,
  onSubmit,
}: WhatDoYouNeedStepProps) {
  const [text, setText] = useState(draft?.originalText ?? initialText);
  const [title, setTitle] = useState(draft?.title ?? '');
  const [categoryId, setCategoryId] = useState(draft?.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(draft?.subcategoryId ?? '');
  const [mode, setMode] = useState<string>(draft?.requirementMode ?? '');
  const [quantity, setQuantity] = useState<number | null>(draft?.quantity ?? null);
  const [unit, setUnit] = useState(draft?.unit ?? '');
  const [parsed, setParsed] = useState<ParsedRequirement | null>(initialParsed);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVoiceDictation, setShowVoiceDictation] = useState(false);

  const subcategories = useMemo(
    () => taxonomy.subcategories.filter((s) => s.categoryId === categoryId),
    [taxonomy.subcategories, categoryId],
  );

  useEffect(() => {
    if (text.trim().length >= 10 && !subcategoryId && !draft) {
      void runParser(text.trim());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runParser(rawText: string) {
    setIsParsing(true);
    try {
      const result = await onParse(rawText);
      setParsed(result);
      if (result.title) {
        setTitle(result.title);
      } else if (!title || title === initialText.slice(0, 80)) {
        setTitle(rawText.slice(0, 80));
      }
      if (result.subcategoryCode) {
        const found = taxonomy.subcategories.find((s) => s.code === result.subcategoryCode);
        if (found) {
          setSubcategoryId(found.id);
          setCategoryId(found.categoryId);
          if (result.requirementMode) {
            setMode(result.requirementMode);
          } else if (found.defaultRequirementMode) {
            setMode(found.defaultRequirementMode);
          }
        }
      }
      if (result.quantity !== null) {
        setQuantity(result.quantity);
      }
      if (result.unit) {
        setUnit(result.unit);
      }
    } finally {
      setIsParsing(false);
    }
  }

  function handleCategoryChange(nextCategoryId: string) {
    setError(null);
    setCategoryId(nextCategoryId);
    const stillValid = taxonomy.subcategories.some(
      (s) => s.id === subcategoryId && s.categoryId === nextCategoryId,
    );
    if (!stillValid) setSubcategoryId('');
  }

  function handleSubcategoryChange(nextSubcategoryId: string) {
    setError(null);
    setSubcategoryId(nextSubcategoryId);

    const subcategory = taxonomy.subcategories.find((s) => s.id === nextSubcategoryId);
    if (!subcategory) return;

    setCategoryId(subcategory.categoryId);
    if (!mode && subcategory.defaultRequirementMode) {
      setMode(subcategory.defaultRequirementMode);
    }
  }

  function handleSubmit() {
    const trimmedText = text.trim();
    if (trimmedText.length < 5) {
      setError('Please describe your requirement in a sentence or two.');
      return;
    }
    if (!title.trim()) {
      setError('Give the requirement a short title.');
      return;
    }
    if (!subcategoryId) {
      setError('Choose what kind of work this is, so we know which suppliers to reach.');
      return;
    }
    if (!mode) {
      setError('Tell us whether you are buying, hiring, repairing, or seeking a rate contract.');
      return;
    }

    setError(null);
    onSubmit({
      title: title.trim(),
      originalText: trimmedText,
      categoryId: categoryId || null,
      subcategoryId,
      requirementMode: mode as RequirementMode,
      quantity,
      unit: unit.trim() || null,
      parsed: parsed ?? undefined,
    });
  }

  const confidence = parsed?.confidence ?? null;

  return (
    <div className="space-y-4" data-testid="what-do-you-need-step">
      {/* 1. Conversational Prompt & Large Clean Input */}
      <Card
        title="What do you need to buy?"
        description="Describe your requirement in plain words. Our parser extracts specifications, quantity, and categories automatically."
        action={
          confidence !== null && (
            <Badge tone={confidence >= 0.6 ? 'success' : 'warning'}>
              {confidence >= 0.6 ? '⚡ AI Confident' : '⚠️ Please Check'}
            </Badge>
          )
        }
      >
        {/* Quick 1-Tap Category Suggestions */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              ⚡ Quick Suggestions:
            </span>
            <button
              type="button"
              onClick={() => setShowVoiceDictation(!showVoiceDictation)}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline min-h-[36px] py-1 px-1.5"
            >
              <span>{showVoiceDictation ? '✕ Close Voice' : '🎙️ Voice Dictate (Tamil · Hindi · English)'}</span>
            </button>
          </div>
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar sm:flex-wrap">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3.5 py-2 text-xs font-semibold text-foreground hover:border-primary hover:bg-primary/10 transition shadow-2xs active:scale-95 min-h-[44px] shrink-0 mobile-touch-target whitespace-nowrap"
                onClick={() => {
                  setError(null);
                  setText(chip.text);
                  void runParser(chip.text);
                }}
              >
                <span>{chip.icon}</span>
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Voice Dictation Drawer */}
        {showVoiceDictation && (
          <div className="mb-4">
            <VoiceRequirementDictation
              onTranscript={(dictatedText) => {
                setError(null);
                setText(dictatedText);
                if (dictatedText.trim().length >= 8) {
                  void runParser(dictatedText.trim());
                }
              }}
            />
          </div>
        )}

        <Field label="Requirement Description" error={error} required>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              rows={3}
              placeholder="e.g. Borewell motor repair in Bengaluru within 5 days with 6 months warranty..."
              value={text}
              onChange={(e) => {
                setError(null);
                setText(e.target.value);
              }}
              onBlur={() => {
                if (text.trim().length >= 10 && !subcategoryId) {
                  void runParser(text.trim());
                }
              }}
            />
          )}
        </Field>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            Include item name, quantity, timeline, and city for instant extraction.
          </p>
          <div className="flex items-center gap-2">
            {(text.trim().length > 0 || title.trim().length > 0) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setText('');
                  setTitle('');
                  setCategoryId('');
                  setSubcategoryId('');
                  setMode('');
                  setQuantity(null);
                  setUnit('');
                  setError(null);
                  onClearDraft?.();
                }}
                className="min-h-[40px] px-3 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
              >
                🗑️ Clear Input
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isParsing || text.trim().length < 5}
              busy={isParsing}
              busyLabel="Analyzing with AI…"
              onClick={() => void runParser(text.trim())}
              className="min-h-[40px] px-3.5"
              data-testid="re-extract-btn"
            >
              ⚡ Re-Extract with AI
            </Button>
          </div>
        </div>

        {/* AI Auto-Extracted Parameters Banner */}
        {parsed && (
          <div className="mt-3.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-primary">
              <span className="flex items-center gap-1.5">
                <span>⚡</span> AI Auto-Extracted Parameters:
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Pre-populates subsequent steps automatically
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {parsed.title && (
                <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 font-medium text-foreground border shadow-2xs">
                  <span>📝 Title:</span> <strong>{parsed.title}</strong>
                </span>
              )}
              {parsed.deliveryCity && (
                <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 font-medium text-foreground border shadow-2xs">
                  <span>📍 City:</span> <strong>{parsed.deliveryCity}</strong>
                </span>
              )}
              {parsed.deliveryPincode && (
                <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 font-medium text-foreground border shadow-2xs">
                  <span>📮 PIN:</span> <strong>{parsed.deliveryPincode}</strong>
                </span>
              )}
              {(parsed.timing.requiredByDays !== null || parsed.timing.isImmediate) && (
                <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 font-medium text-foreground border shadow-2xs">
                  <span>⏱️ Timeline:</span> <strong>{parsed.timing.isImmediate ? 'Immediate' : `${parsed.timing.requiredByDays} days`}</strong>
                </span>
              )}
              {parsed.warrantyMonths !== null && (
                <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 font-medium text-foreground border shadow-2xs">
                  <span>🛡️ Warranty:</span> <strong>{parsed.warrantyMonths} months</strong>
                </span>
              )}
              {parsed.quantity !== null && (
                <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 font-medium text-foreground border shadow-2xs">
                  <span>🔢 Quantity:</span> <strong>{parsed.quantity} {parsed.unit || 'units'}</strong>
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* 2. Structured Classification & Title */}
      <Card
        title="Categorization & Procurement Mode"
        description="Verify or adjust the categorized vertical and procurement type for precise supplier routing."
      >
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <Field label="Requirement Title" required className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="e.g. 50kW Rooftop Solar Installation"
                value={title}
                onChange={(e) => {
                  setError(null);
                  setTitle(e.target.value);
                }}
              />
            )}
          </Field>

          <Field label="Category" required>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                placeholder="Select a category"
                options={taxonomy.categories.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                value={categoryId}
                onChange={(e) => handleCategoryChange(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Type of Work (Subcategory)"
            required
            help={
              categoryId
                ? null
                : 'Selecting a type of work automatically assigns its parent category.'
            }
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                placeholder="Select the specific vertical"
                options={(subcategories.length > 0
                  ? subcategories
                  : taxonomy.subcategories
                ).map((s) => ({ value: s.id, label: s.name }))}
                value={subcategoryId}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
              />
            )}
          </Field>

          <Field label="Procurement Mode" required className="sm:col-span-2">
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                placeholder="Select procurement mode"
                options={Object.entries(REQUIREMENT_MODE_LABELS).map(
                  ([value, label]) => ({ value, label }),
                )}
                value={mode}
                onChange={(e) => {
                  setError(null);
                  setMode(e.target.value);
                }}
              />
            )}
          </Field>
        </div>

        {error && <p className="mt-3 text-sm text-red-600 font-medium">{error}</p>}

        {/* Action bar with mobile sticky clearance */}
        <div className="mt-5 pt-3 border-t border-border/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sticky bottom-0 sm:static z-20 bg-card/95 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none p-2 sm:p-0 rounded-b-xl sm:rounded-none">
          <div className="hidden sm:block text-[11px] text-muted-foreground">
            Step 1 of 6: Classification &amp; Scope
          </div>
          <Button
            type="button"
            onClick={handleSubmit}
            busy={isBusy || isParsing}
            busyLabel="Saving Requirement…"
            className="min-h-[48px] w-full sm:w-auto font-extrabold text-xs sm:text-sm shadow-md mobile-touch-target"
            data-testid="continue-step-btn"
          >
            Continue →
          </Button>
        </div>
      </Card>
    </div>
  );
}
