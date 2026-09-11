import { useState } from 'react';
import type { FulfilmentMode, RequiredByMode, TaxonomySnapshot } from '@otp/domain';
import {
  Button,
  Card,
  Field,
  Input,
  NumberInput,
  RadioCardGroup,
  Select,
  Textarea,
} from '@/components/ui';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface WhereWhenStepProps {
  draft: IntakeDraft;
  taxonomy: TaxonomySnapshot;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

const TIMING_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediately', description: 'As soon as possible' },
  { value: 'WITHIN_DAYS', label: 'Within a number of days', description: null },
  { value: 'SPECIFIC_DATE', label: 'On a specific date', description: null },
  { value: 'FLEXIBLE', label: 'Flexible', description: 'No firm deadline' },
];

const FULFILMENT_OPTIONS = [
  { value: 'SUPPLIER_DELIVERY', label: 'Supplier delivers to us' },
  { value: 'BUYER_PICKUP', label: 'We collect' },
  { value: 'SUPPLIER_ONSITE', label: 'Supplier works at our site' },
  { value: 'REMOTE', label: 'Remote' },
  { value: 'LOGISTICS_REQUIRED', label: 'Needs separate transport' },
];

/**
 * Where the work happens and when it is needed.
 *
 * City drives which suppliers can be reached; the street address and site notes
 * stay buyer-private until an award is revealed.
 */
export function WhereWhenStep({
  draft,
  taxonomy,
  isBusy,
  onBack,
  onSubmit,
}: WhereWhenStepProps) {
  const [city, setCity] = useState(draft.deliveryCity ?? '');
  const [pincode, setPincode] = useState(draft.deliveryPincode ?? '');
  const [line1, setLine1] = useState(draft.deliveryLine1 ?? '');
  const [siteNotes, setSiteNotes] = useState(draft.siteNotes ?? '');
  const [timing, setTiming] = useState<string>(draft.requiredByMode ?? 'WITHIN_DAYS');
  const [days, setDays] = useState<number | null>(draft.requiredByDays ?? 7);
  const [date, setDate] = useState(draft.requiredByDate ?? '');
  const [fulfilment, setFulfilment] = useState<string>(
    draft.fulfilmentMode ?? 'SUPPLIER_DELIVERY',
  );
  const [error, setError] = useState<string | null>(null);

  const cities = taxonomy.cities ?? [];

  function handleSubmit() {
    if (!city.trim()) {
      setError('We need the city to find suppliers who cover you.');
      return;
    }
    if (pincode && !/^[0-9]{6}$/.test(pincode)) {
      setError('A pin code is six digits.');
      return;
    }
    if (timing === 'WITHIN_DAYS' && (!days || days < 1)) {
      setError('How many days do you have?');
      return;
    }
    if (timing === 'SPECIFIC_DATE' && !date) {
      setError('Pick the date you need it by.');
      return;
    }

    setError(null);
    onSubmit({
      deliveryCity: city.trim(),
      deliveryPincode: pincode.trim() || null,
      deliveryLine1: line1.trim() || null,
      siteNotes: siteNotes.trim() || null,
      requiredByMode: timing as RequiredByMode,
      requiredByDays: timing === 'WITHIN_DAYS' ? days : null,
      requiredByDate: timing === 'SPECIFIC_DATE' ? date : null,
      fulfilmentMode: fulfilment as FulfilmentMode,
    });
  }

  return (
    <Card
      title="Where and when"
      description="Suppliers see the city. Your street address and site notes stay private until you award."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" required>
          {({ id, describedBy, invalid }) => (
            <>
              <Input
                id={id}
                list="intake-cities"
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="Coimbatore"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <datalist id="intake-cities">
                {cities.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </>
          )}
        </Field>

        <Field label="Pin code" help="Sharpens which suppliers are nearby.">
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              inputMode="numeric"
              maxLength={6}
              aria-describedby={describedBy}
              invalid={invalid}
              placeholder="641021"
              value={pincode}
              onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>

        <Field label="Address" className="sm:col-span-2" help="Private until award.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              placeholder="Unit 4, Industrial Estate"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
            />
          )}
        </Field>

        <Field
          label="Site notes"
          className="sm:col-span-2"
          help="Access, timings, anything the supplier should know on arrival. Private until award."
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              rows={2}
              value={siteNotes}
              onChange={(e) => setSiteNotes(e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="mt-6">
        <RadioCardGroup
          legend="When do you need it?"
          options={TIMING_OPTIONS}
          value={timing}
          onValueChange={setTiming}
        />

        {timing === 'WITHIN_DAYS' && (
          <Field label="Number of days" className="mt-3 max-w-xs">
            {({ id }) => (
              <NumberInput id={id} min={1} value={days} onValueChange={setDays} unit="days" />
            )}
          </Field>
        )}

        {timing === 'SPECIFIC_DATE' && (
          <Field label="Required by" className="mt-3 max-w-xs">
            {({ id }) => (
              <Input
                id={id}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </Field>
        )}
      </div>

      <Field label="How should it be fulfilled?" className="mt-6 max-w-sm">
        {({ id }) => (
          <Select
            id={id}
            options={FULFILMENT_OPTIONS}
            value={fulfilment}
            onChange={(e) => setFulfilment(e.target.value)}
          />
        )}
      </Field>

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
