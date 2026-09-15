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

const TEMPLATE_CHIPS = [
  {
    icon: '⚡',
    label: 'Motor Rewind',
    text: 'Require 12.5 HP submersible borewell motor rewinding in Bengaluru 560001, needed within 5 days with 6 months warranty.',
  },
  {
    icon: '🏊',
    label: 'Pool Overhaul',
    text: 'Swimming pool renovation and overhaul with waterproofing, tile replacement and pump maintenance in Chennai 600028, needed in 30 days.',
  },
  {
    icon: '⚙️',
    label: 'CNC Machining',
    text: 'Supply of 500 pieces EN8 CNC turned shaft 25mm diameter tolerance ±0.05mm, deliver to Coimbatore 641021 in 14 days with 12 months warranty.',
  },
  {
    icon: '🏗️',
    label: 'Waterproofing',
    text: 'Commercial terrace waterproofing 5000 sq ft with elastomeric membrane coating in Mumbai 400001 within 15 days.',
  },
  {
    icon: '📦',
    label: 'Packaging',
    text: 'Custom printed 5-ply corrugated shipping boxes 1000 units in Pune 411001 within 10 days.',
  },
];

export function WhatDoYouNeedStep({
  initialText,
  draft,
  taxonomy,
  parsed: initialParsed,
  isBusy,
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
        title="What do you need?"
        description="Describe your procurement requirement in your own words. Our AI parser extracts specifications, quantity, and categories automatically."
        action={
          confidence !== null && (
            <Badge tone={confidence >= 0.6 ? 'success' : 'warning'}>
              {confidence >= 0.6 ? '⚡ AI Confident' : '⚠️ Please Check'}
            </Badge>
          )
        }
      >
        {/* Quick 1-Tap Template Chips */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              ⚡ 1-Tap Quick Templates:
            </span>
            <button
              type="button"
              onClick={() => setShowVoiceDictation(!showVoiceDictation)}
              className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
            >
              <span>{showVoiceDictation ? '✕ Close Voice' : '🎙️ Voice Dictate (Tamil · Hindi · English)'}</span>
            </button>
          </div>
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar sm:flex-wrap">
            {TEMPLATE_CHIPS.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold text-foreground hover:border-primary hover:bg-primary/10 transition shadow-2xs active:scale-95 min-h-[40px] shrink-0 mobile-touch-target whitespace-nowrap"
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
              placeholder="e.g. 50kW Rooftop Solar Installation with net metering in Bangalore, needed within 30 days"
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
            Include quantities, dimensions, timeline, and location for best AI extraction.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isParsing || text.trim().length < 5}
            busy={isParsing}
            busyLabel="Analyzing with AI…"
            onClick={() => void runParser(text.trim())}
          >
            ⚡ Re-Extract with AI
          </Button>
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

        <div className="mt-5 pt-3 border-t border-border/70 flex items-center justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            busy={isBusy || isParsing}
            busyLabel="Saving Requirement…"
            className="min-h-[46px] w-full sm:w-auto font-bold text-xs sm:text-sm shadow-xs"
          >
            Continue to Location →
          </Button>
        </div>
      </Card>
    </div>
  );
}
