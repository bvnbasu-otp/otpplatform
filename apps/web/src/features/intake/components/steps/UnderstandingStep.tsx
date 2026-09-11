import { useMemo, useState } from 'react';
import {
  REQUIREMENT_MODE_LABELS,
  RequirementMode,
  type ParsedRequirement,
  type TaxonomySnapshot,
} from '@otp/domain';
import { Badge, Button, Card, Field, Input, NumberInput, Select } from '@/components/ui';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface UnderstandingStepProps {
  draft: IntakeDraft;
  taxonomy: TaxonomySnapshot;
  /** What the parser made of the text, or null when the draft was resumed. */
  parsed: ParsedRequirement | null;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

/**
 * Step two shows its working.
 *
 * Everything the platform inferred is on screen and editable, with the words
 * that led to the classification named underneath. A buyer should never have to
 * wonder why their motor repair was filed where it was.
 */
export function UnderstandingStep({
  draft,
  taxonomy,
  parsed,
  isBusy,
  onBack,
  onSubmit,
}: UnderstandingStepProps) {
  const [title, setTitle] = useState(draft.title);
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? '');
  const [subcategoryId, setSubcategoryId] = useState(draft.subcategoryId ?? '');
  const [mode, setMode] = useState<string>(draft.requirementMode ?? '');
  const [quantity, setQuantity] = useState<number | null>(draft.quantity);
  const [unit, setUnit] = useState(draft.unit ?? '');
  const [error, setError] = useState<string | null>(null);

  const subcategories = useMemo(
    () => taxonomy.subcategories.filter((s) => s.categoryId === categoryId),
    [taxonomy.subcategories, categoryId],
  );

  const confidence = parsed?.confidence ?? null;

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
    if (!title.trim()) {
      setError('Give the requirement a short title.');
      return;
    }
    if (!subcategoryId) {
      setError('Choose what kind of work this is, so we know who can do it.');
      return;
    }
    if (!mode) {
      setError('Tell us whether you are buying, hiring or repairing.');
      return;
    }

    setError(null);
    onSubmit({
      title: title.trim(),
      categoryId: categoryId || null,
      subcategoryId,
      requirementMode: mode as RequirementMode,
      quantity,
      unit: unit.trim() || null,
    });
  }

  return (
    <Card
      title="This is what we understood"
      description="Correct anything that is wrong. Nothing goes to a supplier until you publish."
      action={
        confidence !== null && (
          <Badge tone={confidence >= 0.6 ? 'success' : 'warning'}>
            {confidence >= 0.6 ? 'Confident' : 'Please check'}
          </Badge>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" required className="sm:col-span-2">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
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
          label="Type of work"
          required
          help={
            categoryId
              ? null
              : 'Every type of work is listed here. Choosing one sets its category for you.'
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

        <Field label="What are you doing?" required>
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
                value={quantity}
                onValueChange={setQuantity}
              />
            )}
          </Field>
          <Field label="Unit" hint="kg, pcs, m">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                placeholder="KG"
                value={unit}
                onChange={(e) => setUnit(e.target.value.toUpperCase())}
              />
            )}
          </Field>
        </div>
      </div>

      {parsed && parsed.matchedKeywords.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Matched on {parsed.matchedKeywords.map((k) => `"${k}"`).join(', ')} in what
          you wrote.
        </p>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSubmit} busy={isBusy}>
          Continue
        </Button>
      </div>
    </Card>
  );
}
