import { useEffect, useState } from 'react';
import type { AttributeDef, AttributeValue } from '@otp/domain';
import { Button, Card, Checkbox, Field, Input, NumberInput, Textarea } from '@/components/ui';
import { AttributeFields } from '../AttributeFields';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface ScopeAndSpecificationsStepProps {
  draft: IntakeDraft;
  requiredAttributes: AttributeDef[];
  optionalAttributes: AttributeDef[];
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

const COMMON_UNITS = ['PCS', 'KG', 'UNITS', 'SETS', 'METERS', 'SQFT', 'HOURS'];

const WARRANTY_PRESETS = [
  { label: 'None', months: null },
  { label: '6 Months', months: 6 },
  { label: '12 Months', months: 12 },
  { label: '24 Months', months: 24 },
];

export function ScopeAndSpecificationsStep({
  draft,
  requiredAttributes,
  optionalAttributes,
  isBusy,
  onBack,
  onSubmit,
}: ScopeAndSpecificationsStepProps) {
  const [quantity, setQuantity] = useState<number | null>(draft.quantity ?? null);
  const [unit, setUnit] = useState<string>(draft.unit ?? 'PCS');
  const [values, setValues] = useState<Record<string, AttributeValue>>(draft.attributes ?? {});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Quality & Warranty state
  const [warrantyMonths, setWarrantyMonths] = useState<number | null>(
    draft.quality.warrantyMonths ?? null,
  );
  const [certifications, setCertifications] = useState(
    (draft.quality.certifications ?? []).join(', '),
  );
  const [inspectionRequired, setInspectionRequired] = useState(
    draft.quality.inspectionRequired ?? false,
  );
  const [sampleRequired, setSampleRequired] = useState(
    draft.quality.sampleRequired ?? false,
  );
  const [qualityNotes, setQualityNotes] = useState(draft.quality.notes ?? '');

  useEffect(() => {
    if (draft.attributes) {
      setValues((prev) => ({ ...draft.attributes, ...prev }));
    }
  }, [draft.attributes]);

  function handleAttributeChange(code: string, value: AttributeValue | null) {
    setValues((current) => {
      if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        const { [code]: _cleared, ...rest } = current;
        return rest;
      }
      return { ...current, [code]: value };
    });
    setErrors((current) => {
      const { [code]: _resolved, ...rest } = current;
      return rest;
    });
  }

  function handleSubmit() {
    const missing: Record<string, string> = {};
    for (const attribute of requiredAttributes) {
      if (
        attribute.isRequired &&
        (values[attribute.code] === undefined || values[attribute.code] === '')
      ) {
        missing[attribute.code] = 'Suppliers need this specification to provide an accurate quote.';
      }
    }

    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }

    setErrors({});
    onSubmit({
      quantity,
      unit: unit.trim() || null,
      attributes: values,
      quality: {
        warrantyMonths,
        certifications: certifications
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        inspectionRequired,
        sampleRequired,
        notes: qualityNotes.trim() || null,
      },
    });
  }

  return (
    <div className="space-y-4" data-testid="scope-and-specifications-step">
      {/* 1. Quantity & Units */}
      <Card
        title="Quantity & Units"
        description="Specify the procurement quantity and unit of measure."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quantity" help="Leave blank if scope is ad-hoc or turnkey service">
            {({ id, describedBy }) => (
              <NumberInput
                id={id}
                aria-describedby={describedBy}
                min={1}
                placeholder="e.g. 100"
                value={quantity}
                onValueChange={setQuantity}
              />
            )}
          </Field>

          <Field label="Unit of Measure" help="Select or enter unit">
            {({ id, describedBy }) => (
              <div className="space-y-1.5">
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  placeholder="PCS"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value.toUpperCase())}
                />
                <div className="flex flex-wrap gap-1 items-center pt-0.5">
                  <span className="text-[10px] text-muted-foreground font-semibold">Quick:</span>
                  {COMMON_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                        unit === u
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>
        </div>
      </Card>

      {/* 2. Mandatory Technical Specifications */}
      <Card
        title="Essential Technical Specifications"
        description="These category-specific parameters are required for suppliers to compute exact technical and commercial quotes."
      >
        {requiredAttributes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
            ✓ Standard category defaults apply. No additional mandatory parameters required.
          </p>
        ) : (
          <AttributeFields
            attributes={requiredAttributes}
            values={values}
            errors={errors}
            onChange={handleAttributeChange}
          />
        )}
      </Card>

      {/* 3. Optional Specifications (Collapsible) */}
      {optionalAttributes.length > 0 && (
        <details
          className="group rounded-xl border bg-card p-4 transition-all duration-200 open:shadow-sm"
          open={optionalAttributes.length <= 3}
        >
          <summary className="flex cursor-pointer items-center justify-between text-xs font-bold text-foreground select-none">
            <span className="flex items-center gap-2">
              <span>📋 Supplementary Technical Details (Optional)</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground font-normal">
                {optionalAttributes.length} fields
              </span>
            </span>
            <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">
              ▼
            </span>
          </summary>
          <div className="pt-4 border-t mt-3">
            <p className="text-xs text-muted-foreground mb-3">
              Provide additional technical specifications to help suppliers offer tighter margins and faster turnaround.
            </p>
            <AttributeFields
              attributes={optionalAttributes}
              values={values}
              errors={errors}
              onChange={handleAttributeChange}
            />
          </div>
        </details>
      )}

      {/* 4. Quality & Warranty Standards */}
      <Card
        title="Quality & Warranty Standards"
        description="Specify warranty expectations, test certifications, and inspection milestones."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Warranty Expected Chips & Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Warranty Expected</label>
            <div className="flex gap-1.5 items-center overflow-x-auto pb-1.5 sm:pb-0 no-scrollbar sm:flex-wrap">
              {WARRANTY_PRESETS.map((preset) => {
                const isSelected = warrantyMonths === preset.months;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setWarrantyMonths(preset.months)}
                    className={`rounded-full border px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold transition active:scale-95 min-h-[40px] shrink-0 mobile-touch-target shadow-2xs whitespace-nowrap ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <NumberInput
              min={0}
              unit="months"
              placeholder="e.g. 12"
              value={warrantyMonths}
              onValueChange={setWarrantyMonths}
            />
          </div>

          <Field
            label="Required Certifications / Test Reports"
            help="Comma-separated (e.g. ISO 9001, CE, BIS, Mill Test Report)"
          >
            {({ id }) => (
              <Input
                id={id}
                placeholder="e.g. ISO 9001, BIS Certificate"
                value={certifications}
                onChange={(e) => setCertifications(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 rounded-xl border bg-muted/20 p-3.5">
          <Checkbox
            label="Pre-Dispatch / Site Inspection Required"
            description="Buyer will inspect parts or workmanship before sign-off."
            checked={inspectionRequired}
            onCheckedChange={setInspectionRequired}
          />
          <Checkbox
            label="Physical Sample Approval Required"
            description="Supplier must submit a physical sample before bulk execution."
            checked={sampleRequired}
            onCheckedChange={setSampleRequired}
          />
        </div>

        <Field label="Quality Remarks / Acceptance Criteria" className="mt-4">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              placeholder="Specific tolerances, surface finish, packaging rules, sign-off criteria..."
              value={qualityNotes}
              onChange={(e) => setQualityNotes(e.target.value)}
            />
          )}
        </Field>
      </Card>

      <div className="mt-5 pt-3 border-t border-border/70 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <Button variant="ghost" onClick={onBack} className="min-h-[48px] mobile-touch-target">
          ← Back
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          busy={isBusy}
          busyLabel="Saving Specifications…"
          className="min-h-[48px] w-full sm:w-auto font-extrabold text-xs sm:text-sm shadow-xs mobile-touch-target"
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
