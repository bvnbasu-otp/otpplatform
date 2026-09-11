import { useEffect, useState } from 'react';
import { AttachmentScope, type AttributeDef, type AttributeValue } from '@otp/domain';
import { Button, Card } from '@/components/ui';
import { AttachmentUploader } from '@/features/attachments';
import { AttributeFields } from '../AttributeFields';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface TechnicalSpecificationsStepProps {
  draft: IntakeDraft;
  requiredAttributes: AttributeDef[];
  optionalAttributes: AttributeDef[];
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

export function TechnicalSpecificationsStep({
  draft,
  requiredAttributes,
  optionalAttributes,
  isBusy,
  onBack,
  onSubmit,
}: TechnicalSpecificationsStepProps) {
  const [values, setValues] = useState<Record<string, AttributeValue>>(draft.attributes);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (draft.attributes) {
      setValues((prev) => ({ ...draft.attributes, ...prev }));
    }
  }, [draft.attributes]);

  function change(code: string, value: AttributeValue | null) {
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
      if (attribute.isRequired && (values[attribute.code] === undefined || values[attribute.code] === '')) {
        missing[attribute.code] = 'Suppliers need this specification to provide an accurate quote.';
      }
    }

    if (Object.keys(missing).length > 0) {
      setErrors(missing);
      return;
    }

    setErrors({});
    onSubmit({ attributes: values });
  }

  return (
    <div className="space-y-6">
      {/* 1. Mandatory Specifications */}
      <Card
        title="Mandatory Technical Specifications"
        description="These parameters are required for suppliers in this category to calculate precise technical and commercial quotes."
      >
        {requiredAttributes.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No mandatory custom parameters required for this category.
          </p>
        ) : (
          <AttributeFields
            attributes={requiredAttributes}
            values={values}
            errors={errors}
            onChange={change}
          />
        )}
      </Card>

      {/* 2. Optional Specifications */}
      {optionalAttributes.length > 0 && (
        <details className="group rounded-xl border bg-card p-4 transition-all duration-200 open:shadow-sm" open={optionalAttributes.length <= 4}>
          <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-foreground select-none">
            <span className="flex items-center gap-2">
              <span>📋 Additional Specifications (Optional)</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground font-normal">
                {optionalAttributes.length} fields
              </span>
            </span>
            <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="pt-4 border-t mt-3">
            <p className="text-xs text-muted-foreground mb-4">
              Provide supplementary technical details to help suppliers offer tighter margins and faster turnaround.
            </p>
            <AttributeFields
              attributes={optionalAttributes}
              values={values}
              errors={errors}
              onChange={change}
            />
          </div>
        </details>
      )}

      {/* 3. Drawings & Attachments */}
      <Card
        title="Drawings, Technical Datasheets & BoQ Attachments"
        description="Upload technical drawings (CAD/PDF), site photos, spec sheets, or BoQ spreadsheets. Invited suppliers can view these securely."
      >
        <AttachmentUploader
          scope={AttachmentScope.REQUIREMENT}
          requirementId={draft.requirementId}
          disabled={isBusy}
        />
      </Card>

      <div className="flex justify-between items-center pt-2">
        <Button variant="ghost" onClick={onBack}>
          ← Back to Scope
        </Button>
        <Button onClick={handleSubmit} busy={isBusy} busyLabel="Saving Specifications…">
          Continue to Logistics & Commercial Terms →
        </Button>
      </div>
    </div>
  );
}
