import { useEffect, useState } from 'react';
import { AttachmentScope, type AttributeDef, type AttributeValue } from '@otp/domain';
import { Badge, Card, Checkbox, Field, Input, NumberInput, Textarea } from '@/components/ui';
import { AttachmentUploader } from '@/features/attachments';
import { AttributeFields } from './AttributeFields';

export interface Tier2PrecisionScopeCardProps {
  quantity: number | null;
  unit: string;
  attributes: Record<string, AttributeValue>;
  requiredAttributes: AttributeDef[];
  optionalAttributes: AttributeDef[];
  warrantyMonths: number | null;
  certifications: string;
  inspectionRequired: boolean;
  sampleRequired: boolean;
  qualityNotes: string;
  requirementId: string | null;
  isBusy: boolean;
  errors: Record<string, string>;
  onQuantityChange: (qty: number | null) => void;
  onUnitChange: (unit: string) => void;
  onAttributeChange: (code: string, value: AttributeValue | null) => void;
  onWarrantyChange: (months: number | null) => void;
  onCertificationsChange: (certifications: string) => void;
  onInspectionChange: (required: boolean) => void;
  onSampleChange: (required: boolean) => void;
  onQualityNotesChange: (notes: string) => void;
}

const COMMON_UNITS = ['UNITS', 'PCS', 'KG', 'SETS', 'METERS', 'SQFT', 'HOURS', 'JOB'];

const WARRANTY_PRESETS = [
  { label: 'None', months: null },
  { label: '6 Months', months: 6 },
  { label: '12 Months', months: 12 },
  { label: '24 Months', months: 24 },
];

export function Tier2PrecisionScopeCard({
  quantity,
  unit,
  attributes,
  requiredAttributes,
  optionalAttributes,
  warrantyMonths,
  certifications,
  inspectionRequired,
  sampleRequired,
  qualityNotes,
  requirementId,
  isBusy,
  errors,
  onQuantityChange,
  onUnitChange,
  onAttributeChange,
  onWarrantyChange,
  onCertificationsChange,
  onInspectionChange,
  onSampleChange,
  onQualityNotesChange,
}: Tier2PrecisionScopeCardProps) {
  const [showOptionalSpecs, setShowOptionalSpecs] = useState(optionalAttributes.length <= 2);

  return (
    <Card
      title={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary font-black text-xs">
              2
            </span>
            <span className="font-extrabold text-sm sm:text-base text-foreground">
              Tier 2 — Precision Scope (Add Precision)
            </span>
          </div>
          <Badge tone="neutral">📐 Technical Precision</Badge>
        </div>
      }
      description="Refine quantities, technical parameters, warranty milestones, and upload drawings or BoQ spreadsheets."
      data-testid="tier-2-precision-scope-card"
    >
      <div className="space-y-4">
        {/* 1. Quantity & Unit of Measure */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quantity" error={errors.quantity} help="Specify exact unit count or leave as 1 for turnkey services">
            {({ id, describedBy, invalid }) => (
              <NumberInput
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                min={1}
                placeholder="1"
                value={quantity}
                onValueChange={onQuantityChange}
              />
            )}
          </Field>

          <Field label="Unit of Measure" error={errors.unit} help="Select standard unit">
            {({ id, describedBy, invalid }) => (
              <div className="space-y-1.5">
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="UNITS"
                  value={unit}
                  onChange={(e) => onUnitChange(e.target.value.toUpperCase())}
                />
                <div className="flex flex-wrap gap-1 items-center pt-0.5">
                  <span className="text-[10px] text-muted-foreground font-semibold">Quick:</span>
                  {COMMON_UNITS.map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => onUnitChange(u)}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold transition ${
                        unit.toUpperCase() === u
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

        {/* 2. Mandatory Technical Specifications from Category Schema */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>⚙️</span> Essential Category Technical Specifications
            </h4>
            {requiredAttributes.length > 0 && (
              <span className="text-[11px] text-muted-foreground font-medium">
                {requiredAttributes.length} required field(s)
              </span>
            )}
          </div>

          {requiredAttributes.length === 0 ? (
            <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground bg-muted/20">
              ✓ Standard industry specifications apply. No additional mandatory category parameters required.
            </p>
          ) : (
            <AttributeFields
              attributes={requiredAttributes}
              values={attributes}
              errors={errors}
              onChange={onAttributeChange}
            />
          )}
        </div>

        {/* 3. Supplementary Technical Details (Collapsible) */}
        {optionalAttributes.length > 0 && (
          <div className="rounded-xl border bg-card/60 p-3.5 space-y-3 transition-all duration-200">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setShowOptionalSpecs(!showOptionalSpecs)}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-foreground">
                  📋 Supplementary Technical Details (Optional)
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-semibold">
                  {optionalAttributes.length} fields
                </span>
              </div>
              <button
                type="button"
                className="text-xs font-bold text-primary hover:underline px-1 py-0.5"
              >
                {showOptionalSpecs ? 'Hide ▲' : 'Show Details ▼'}
              </button>
            </div>

            {showOptionalSpecs && (
              <div className="pt-2 border-t border-border/50 space-y-2 animate-in fade-in-50">
                <p className="text-[11px] text-muted-foreground">
                  Supplying extra technical specs helps suppliers calculate tighter pricing and faster lead times.
                </p>
                <AttributeFields
                  attributes={optionalAttributes}
                  values={attributes}
                  errors={errors}
                  onChange={onAttributeChange}
                />
              </div>
            )}
          </div>
        )}

        {/* 4. Quality & Warranty Standards */}
        <div className="space-y-3 pt-2 border-t border-border/60">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <span>🛡️</span> Quality, Warranty &amp; Acceptance Criteria
          </h4>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Warranty Expected */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Warranty Expected</label>
              <div className="flex gap-1.5 items-center overflow-x-auto pb-1 no-scrollbar sm:flex-wrap">
                {WARRANTY_PRESETS.map((preset) => {
                  const isSelected = warrantyMonths === preset.months;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => onWarrantyChange(preset.months)}
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
              </div>
              <NumberInput
                min={0}
                unit="months"
                placeholder="e.g. 12"
                value={warrantyMonths}
                onValueChange={onWarrantyChange}
              />
            </div>

            <Field
              label="Required Certifications / Test Reports"
              help="e.g. ISO 9001, CE, BIS, Mill Test Report, Megger Report"
            >
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="e.g. ISO 9001, BIS Certificate"
                  value={certifications}
                  onChange={(e) => onCertificationsChange(e.target.value)}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 rounded-xl border bg-muted/20 p-3">
            <Checkbox
              label="Pre-Dispatch / Site Inspection Required"
              description="Buyer will inspect parts or workmanship before final sign-off."
              checked={inspectionRequired}
              onCheckedChange={onInspectionChange}
            />
            <Checkbox
              label="Physical Sample Approval Required"
              description="Supplier must submit a physical sample before bulk execution."
              checked={sampleRequired}
              onCheckedChange={onSampleChange}
            />
          </div>

          <Field label="Quality Remarks / Acceptance Criteria">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                placeholder="Specific tolerances, surface finish, packaging rules, sign-off criteria..."
                value={qualityNotes}
                onChange={(e) => onQualityNotesChange(e.target.value)}
              />
            )}
          </Field>
        </div>

        {/* 5. Drawings, BoQ & Attachments Management */}
        <div className="space-y-2 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>📎</span> Technical Drawings, BoQ &amp; Site Photos (Optional)
            </h4>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-primary">
              <span>🔒</span> 100% Identity-Protected Uploads:
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              All files are stripped of metadata and company headers before sharing. Invited suppliers only see anonymized titles like <em>&ldquo;Drawing 1&rdquo;</em>, <em>&ldquo;Specification 1&rdquo;</em>, or <em>&ldquo;Site Photo 1&rdquo;</em>.
            </p>
          </div>

          {requirementId ? (
            <AttachmentUploader
              scope={AttachmentScope.REQUIREMENT}
              requirementId={requirementId}
              disabled={isBusy}
              label="Drop drawings, BoQ spreadsheets, or site photos here"
              hint="Supports PDF, CAD/DWG, Excel/CSV, JPG, PNG up to 25MB"
              allowVoiceNote={true}
            />
          ) : (
            <div className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground bg-muted/20">
              💡 File upload will be available as soon as your draft initializes.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
