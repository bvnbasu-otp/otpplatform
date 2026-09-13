import { useEffect, useMemo, useState } from 'react';
import {
  REQUIREMENT_MODE_LABELS,
  RequirementMode,
  type ParsedRequirement,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button, Card, Field, Input, NumberInput, Select, Textarea } from '@/components/ui';
import type { IntakeDraft } from '../../types/intake-draft';
import { VoiceRequirementDictation } from '../VoiceRequirementDictation';

export interface ScopeClassificationStepProps {
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

const EXAMPLES = [
  { label: '⚡ Motor Rewind', text: 'Require 12.5 HP submersible borewell motor rewinding in Bengaluru 560001, needed within 5 days with 6 months warranty.' },
  { label: '⚙️ CNC Shafts', text: 'Supply of 500 pieces EN8 CNC turned shaft 25mm diameter tolerance ±0.05mm, deliver to Coimbatore 641021 in 14 days with 12 months warranty.' },
  { label: '🧵 Cotton Yarn', text: 'Need 2000 kg of 40s combed compact cotton yarn delivered to Tiruppur 641602 within 7 days with test certificate and 3 months warranty.' },
  { label: '📹 CCTV System', text: 'Supply and installation of 8 IP CCTV cameras 4MP with 30-day NVR in Chennai 600028 needed in 10 days with 24 months warranty.' },
];

export function ScopeClassificationStep({
  initialText,
  draft,
  taxonomy,
  parsed: initialParsed,
  isBusy,
  onParse,
  onSubmit,
}: ScopeClassificationStepProps) {
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
    <div className="space-y-6">
      {/* 1. Natural Language Description & AI Parser */}
      <Card
        title="Requirement Description"
        description="Describe your requirement in your own words. Our AI parser will automatically extract technical details and categorize your enquiry."
        action={
          confidence !== null && (
            <Badge tone={confidence >= 0.6 ? 'success' : 'warning'}>
              {confidence >= 0.6 ? 'AI Confident' : 'Please Verify'}
            </Badge>
          )
        }
      >
        <div className="mb-3">
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

        <Field label="Requirement Description" error={error} required>
          {({ id, describedBy, invalid }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              rows={4}
              placeholder="e.g. 12.5 HP borewell submersible motor rewinding at our apartment in Bengaluru, needed this week"
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

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-medium text-muted-foreground">Quick templates:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                className="rounded border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted hover:border-primary/40 transition shadow-2xs"
                onClick={() => {
                  setText(example.text);
                  void runParser(example.text);
                }}
              >
                {example.label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isParsing || text.trim().length < 5}
            busy={isParsing}
            busyLabel="Parsing…"
            onClick={() => void runParser(text.trim())}
          >
            ⚡ Re-Parse with AI
          </Button>
        </div>

        {parsed && (
          <div className="mt-3.5 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-2">
            <div className="flex items-center justify-between font-semibold text-primary">
              <span className="flex items-center gap-1.5">
                <span>⚡</span> AI Auto-Extracted Parameters:
              </span>
              <span className="text-[11px] font-normal text-muted-foreground">
                Pre-populates Technical Specifications &amp; Logistics automatically
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
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
              {parsed.attributes.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-card px-2 py-1 font-medium text-foreground border shadow-2xs">
                  <span>⚙️ Specs:</span> <strong>{parsed.attributes.map(a => `${a.code}: ${a.value}`).join(', ')}</strong>
                </span>
              )}
            </div>
            {parsed.matchedKeywords.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground border-t border-primary/10">
                <span>Matched catalog keywords:</span>
                {parsed.matchedKeywords.map((k) => (
                  <span key={k} className="rounded bg-primary/15 px-1.5 py-0.5 text-primary text-[10px] font-medium">
                    {k}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 2. Structured Classification & Scope */}
      <Card
        title="Classification & Scope"
        description="Verify and adjust the categorized type of work and units of measurement."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Requirement Title" required className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="e.g. 12.5 HP Submersible Motor Rewinding"
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
            label="Type of work (Subcategory)"
            required
            help={
              categoryId
                ? null
                : 'Choosing a type of work automatically selects its parent category.'
            }
          >
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                placeholder="Select the specific work"
                options={(subcategories.length > 0
                  ? subcategories
                  : taxonomy.subcategories
                ).map((s) => ({ value: s.id, label: s.name }))}
                value={subcategoryId}
                onChange={(e) => handleSubcategoryChange(e.target.value)}
              />
            )}
          </Field>

          <Field label="Procurement Mode" required>
            {({ id, describedBy }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                placeholder="Select"
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

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              {({ id, describedBy }) => (
                <NumberInput
                  id={id}
                  aria-describedby={describedBy}
                  min={0}
                  placeholder="e.g. 1"
                  value={quantity}
                  onValueChange={setQuantity}
                />
              )}
            </Field>
            <Field label="Unit" hint="kg, pcs, m, set">
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  placeholder="PCS"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value.toUpperCase())}
                />
              )}
            </Field>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600 font-medium">{error}</p>}

        <div className="mt-6 flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            busy={isBusy || isParsing}
            busyLabel="Saving Scope…"
          >
            Continue to Technical Specifications →
          </Button>
        </div>
      </Card>
    </div>
  );
}
