import { useState } from 'react';
import { AttachmentScope, type AttributeDef, type AttributeValue } from '@otp/domain';
import { Button, Card } from '@/components/ui';
import { AttachmentUploader } from '@/features/attachments';
import { AttributeFields } from '../AttributeFields';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface AttributesStepProps {
  title: string;
  description: string;
  attributes: AttributeDef[];
  draft: IntakeDraft;
  /** Block the step until every required attribute has an answer. */
  enforceRequired: boolean;
  /**
   * A drawing often says more than any attribute schema can. Offered on the
   * optional step, where the buyer is already adding what they want to add.
   */
  allowAttachments?: boolean;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

/**
 * The schema-driven detail steps.
 *
 * Used twice: once for the handful of answers a supplier cannot quote without,
 * and again for the optional detail that sharpens a quote. Both render from the
 * same attribute definitions, so they can never drift apart.
 */
export function AttributesStep({
  title,
  description,
  attributes,
  draft,
  enforceRequired,
  allowAttachments = false,
  isBusy,
  onBack,
  onSubmit,
}: AttributesStepProps) {
  const [values, setValues] = useState<Record<string, AttributeValue>>(
    draft.attributes,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    if (enforceRequired) {
      const missing: Record<string, string> = {};
      for (const attribute of attributes) {
        if (attribute.isRequired && values[attribute.code] === undefined) {
          missing[attribute.code] = 'Suppliers need this to quote.';
        }
      }
      if (Object.keys(missing).length > 0) {
        setErrors(missing);
        return;
      }
    }

    setErrors({});
    onSubmit({ attributes: values });
  }

  return (
    <Card title={title} description={description}>
      {attributes.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nothing else to ask about this kind of work.
        </p>
      ) : (
        <AttributeFields
          attributes={attributes}
          values={values}
          errors={errors}
          onChange={change}
        />
      )}

      {allowAttachments && (
        <section className="mt-6 border-t pt-6">
          <h3 className="text-sm font-medium">Drawings, photos or a voice note</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Suppliers invited to quote can open these. They never see your filenames.
          </p>
          <AttachmentUploader
            scope={AttachmentScope.REQUIREMENT}
            requirementId={draft.requirementId}
            disabled={isBusy}
          />
        </section>
      )}

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
