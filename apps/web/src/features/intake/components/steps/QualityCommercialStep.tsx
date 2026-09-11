import { useState } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  NumberInput,
  Textarea,
} from '@/components/ui';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface QualityCommercialStepProps {
  draft: IntakeDraft;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

/**
 * The terms that decide whether two quotes are comparable.
 *
 * Stating warranty, inspection and what a price is expected to include here
 * means suppliers quote on the same basis, which is what makes the identity-protected
 * comparison later on an honest one.
 */
export function QualityCommercialStep({
  draft,
  isBusy,
  onBack,
  onSubmit,
}: QualityCommercialStepProps) {
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

  const [budgetAmount, setBudgetAmount] = useState<number | null>(
    draft.commercial.budgetAmount ?? null,
  );
  const [paymentTerms, setPaymentTerms] = useState(draft.commercial.paymentTerms ?? '');
  const [includesTransport, setIncludesTransport] = useState(
    draft.commercial.priceIncludesTransport ?? false,
  );
  const [includesGst, setIncludesGst] = useState(
    draft.commercial.priceIncludesGst ?? false,
  );
  const [commercialNotes, setCommercialNotes] = useState(
    draft.commercial.notes ?? '',
  );

  function handleSubmit() {
    onSubmit({
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
    <div className="space-y-4">
      <Card
        title="Quality"
        description="What the work has to satisfy before you would accept it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Warranty expected">
            {({ id }) => (
              <NumberInput
                id={id}
                min={0}
                unit="months"
                value={warrantyMonths}
                onValueChange={setWarrantyMonths}
              />
            )}
          </Field>

          <Field
            label="Certifications"
            help="Comma separated, e.g. ISI, ISO 9001, test certificate"
          >
            {({ id }) => (
              <Input
                id={id}
                placeholder="ISI, test certificate"
                value={certifications}
                onChange={(e) => setCertifications(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <Checkbox
            label="Inspection before acceptance"
            description="We will inspect the work or goods before signing off."
            checked={inspectionRequired}
            onCheckedChange={setInspectionRequired}
          />
          <Checkbox
            label="Sample required first"
            description="Supplier must send a sample before bulk supply."
            checked={sampleRequired}
            onCheckedChange={setSampleRequired}
          />
        </div>

        <Field label="Quality notes" className="mt-4">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={qualityNotes}
              onChange={(e) => setQualityNotes(e.target.value)}
            />
          )}
        </Field>
      </Card>

      <Card
        title="Commercial"
        description="Set the basis every supplier must quote on, so the numbers can be compared."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Budget" help="Never shown to suppliers." hint="₹">
            {({ id }) => (
              <NumberInput
                id={id}
                min={0}
                value={budgetAmount}
                onValueChange={setBudgetAmount}
              />
            )}
          </Field>

          <Field label="Payment terms" help="e.g. 30 days from invoice">
            {({ id }) => (
              <Input
                id={id}
                placeholder="30 days from invoice"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <Checkbox
            label="Quoted price includes transport"
            checked={includesTransport}
            onCheckedChange={setIncludesTransport}
          />
          <Checkbox
            label="Quoted price includes GST"
            checked={includesGst}
            onCheckedChange={setIncludesGst}
          />
        </div>

        <Field label="Commercial notes" className="mt-4">
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={commercialNotes}
              onChange={(e) => setCommercialNotes(e.target.value)}
            />
          )}
        </Field>
      </Card>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleSubmit} busy={isBusy}>
          Continue
        </Button>
      </div>
    </div>
  );
}
