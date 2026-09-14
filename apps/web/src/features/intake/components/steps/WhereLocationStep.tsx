import { useEffect, useState } from 'react';
import type { FulfilmentMode, TaxonomySnapshot } from '@otp/domain';
import { Button, Card, Field, Input, RadioCardGroup, Select, Textarea } from '@/components/ui';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface WhereLocationStepProps {
  draft: IntakeDraft;
  taxonomy: TaxonomySnapshot;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

const POPULAR_CITIES = [
  'Bangalore',
  'Chennai',
  'Mumbai',
  'Delhi',
  'Hyderabad',
  'Pune',
  'Kolkata',
  'Ahmedabad',
];

const GEOGRAPHIC_REACH_OPTIONS = [
  {
    value: 'LOCAL',
    label: '📍 Local City / District Only (Recommended)',
    description: 'Strictly limit to suppliers with physical presence/shops in your city.',
  },
  {
    value: 'STATE',
    label: '🗺️ State / Regional Reach',
    description: 'Allow suppliers across your state and adjacent industrial corridors.',
  },
  {
    value: 'PAN_INDIA',
    label: '🌐 PAN-India Reach',
    description: 'Allow verified suppliers nationwide to quote if they ship/deliver to your destination (lowest prices & maximum competition).',
  },
];

const FULFILMENT_OPTIONS = [
  { value: 'SUPPLIER_DELIVERY', label: 'Supplier delivers to our site' },
  { value: 'BUYER_PICKUP', label: 'Buyer pickup / collection' },
  { value: 'SUPPLIER_ONSITE', label: 'Supplier executes work onsite' },
  { value: 'REMOTE', label: 'Remote service / digital deliverable' },
  { value: 'LOGISTICS_REQUIRED', label: 'Requires 3rd-party logistics' },
];

export function WhereLocationStep({
  draft,
  taxonomy,
  isBusy,
  onBack,
  onSubmit,
}: WhereLocationStepProps) {
  const [city, setCity] = useState(draft.deliveryCity ?? '');
  const [pincode, setPincode] = useState(draft.deliveryPincode ?? '');
  const [line1, setLine1] = useState(draft.deliveryLine1 ?? '');
  const [siteNotes, setSiteNotes] = useState(draft.siteNotes ?? '');
  const [fulfilment, setFulfilment] = useState<string>(
    draft.fulfilmentMode ?? 'SUPPLIER_DELIVERY',
  );
  const [geographicReach, setGeographicReach] = useState<'PAN_INDIA' | 'LOCAL' | 'STATE'>(
    draft.sourcing?.geographicReach ?? 'LOCAL',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.deliveryCity && !city) setCity(draft.deliveryCity);
    if (draft.deliveryPincode && !pincode) setPincode(draft.deliveryPincode);
    if (draft.deliveryLine1 && !line1) setLine1(draft.deliveryLine1);
    if (draft.siteNotes && !siteNotes) setSiteNotes(draft.siteNotes);
    if (draft.fulfilmentMode) setFulfilment(draft.fulfilmentMode);
    if (draft.sourcing?.geographicReach) {
      setGeographicReach(draft.sourcing.geographicReach);
    }
  }, [draft]);

  const cities = taxonomy.cities ?? [];

  function handleSubmit() {
    if (!city.trim()) {
      setError('Please select or enter your delivery/service city.');
      return;
    }
    if (!pincode.trim()) {
      setError('Postal PIN code is required.');
      return;
    }
    if (!/^[0-9]{6}$/.test(pincode.trim())) {
      setError('Postal PIN code must be a valid 6-digit number.');
      return;
    }

    setError(null);
    onSubmit({
      deliveryCity: city.trim(),
      deliveryPincode: pincode.trim(),
      deliveryLine1: line1.trim() || null,
      siteNotes: siteNotes.trim() || null,
      fulfilmentMode: fulfilment as FulfilmentMode,
      sourcing: {
        ...draft.sourcing,
        geographicReach,
      },
    });
  }

  return (
    <div className="space-y-4" data-testid="where-location-step">
      <Card
        title="Where is this needed?"
        description="Suppliers in your target city will be matched first. Your detailed street address and site instructions remain strictly private until award."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {/* 1-Tap City Pills + Custom City Field */}
          <Field label="City / Service Location" required className="sm:col-span-2">
            {({ id, describedBy, invalid }) => (
              <div className="space-y-2">
                {/* 1-Tap City Pills */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[11px] font-semibold text-muted-foreground mr-1">
                    ⚡ 1-Tap City:
                  </span>
                  {POPULAR_CITIES.map((c) => {
                    const isSelected = city.toLowerCase() === c.toLowerCase() ||
                      (c === 'Bangalore' && city.toLowerCase() === 'bengaluru');
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          setError(null);
                          setCity(c === 'Bangalore' ? 'Bengaluru' : c);
                        }}
                        className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition active:scale-95 min-h-[44px] mobile-touch-target shadow-2xs ${
                          isSelected
                            ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                            : 'border-border bg-card text-foreground hover:border-primary/60 hover:bg-muted'
                        }`}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>

                <Input
                  id={id}
                  list="where-cities-list"
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="Or enter city name (e.g. Coimbatore, Salem, Kochi)"
                  value={city}
                  onChange={(e) => {
                    setError(null);
                    setCity(e.target.value);
                  }}
                />
                <datalist id="where-cities-list">
                  {cities.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            )}
          </Field>

          {/* Postal PIN Code */}
          <Field label="Postal PIN Code" required help="6-digit postal code for accurate freight & transit matching.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                inputMode="numeric"
                maxLength={6}
                aria-describedby={describedBy}
                invalid={invalid}
                placeholder="e.g. 560001"
                value={pincode}
                onChange={(e) => {
                  setError(null);
                  setPincode(e.target.value.replace(/\D/g, ''));
                }}
              />
            )}
          </Field>

          {/* Fulfilment Mode */}
          <Field label="Fulfilment / Execution Mode" required>
            {({ id }) => (
              <Select
                id={id}
                options={FULFILMENT_OPTIONS}
                value={fulfilment}
                onChange={(e) => setFulfilment(e.target.value)}
              />
            )}
          </Field>

          {/* Street Address & Site Access Notes (Private) */}
          <Field
            label="Street Address / Facility (Private)"
            className="sm:col-span-2"
            help="🔒 Encrypted & confidential. Only shown to the single awarded supplier after deal confirmation."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                placeholder="Plot / Door No, Street, Industrial Area / Landmark"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Site Access Instructions (Private)"
            className="sm:col-span-2"
            help="Gate entry guidelines, unloading facilities, timings (private until award)."
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                placeholder="e.g. Loading dock open 9 AM - 6 PM, crane available on site, gate pass required at entry"
                value={siteNotes}
                onChange={(e) => setSiteNotes(e.target.value)}
              />
            )}
          </Field>
        </div>

        {/* Geographic Sourcing Reach Selector */}
        <div className="mt-5 border-t pt-4">
          <RadioCardGroup
            legend="Geographic Sourcing Reach"
            options={GEOGRAPHIC_REACH_OPTIONS}
            value={geographicReach}
            onValueChange={(val) => setGeographicReach(val as 'PAN_INDIA' | 'LOCAL' | 'STATE')}
          />

          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
            <div className="flex items-start gap-2">
              <span className="text-base leading-none">💡</span>
              <p className="text-muted-foreground leading-relaxed">
                <strong>Tip:</strong> Selecting <strong>PAN-India Reach</strong> allows competitive verified suppliers nationwide to ship to your city PIN code for best prices.
              </p>
            </div>
          </div>
        </div>

        {error && <p className="mt-4 text-sm text-red-600 font-medium">{error}</p>}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBack} className="min-h-[44px]">
            ← Back to Requirement
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            busy={isBusy}
            busyLabel="Saving Location…"
            className="min-h-[44px] w-full sm:w-auto"
          >
            Continue to When &amp; Budget →
          </Button>
        </div>
      </Card>
    </div>
  );
}
