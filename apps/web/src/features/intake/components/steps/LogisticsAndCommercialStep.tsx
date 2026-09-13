import { useEffect, useState } from 'react';
import type { FulfilmentMode, RequiredByMode, TaxonomySnapshot } from '@otp/domain';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  NumberInput,
  RadioCardGroup,
  Select,
  Textarea,
} from '@/components/ui';
import { useRoleContext } from '@/features/roles';
import type { DraftPatch } from '../../api/draft';
import type { IntakeDraft } from '../../types/intake-draft';

export interface LogisticsAndCommercialStepProps {
  draft: IntakeDraft;
  taxonomy: TaxonomySnapshot;
  isBusy: boolean;
  onBack: () => void;
  onSubmit: (patch: DraftPatch) => void;
}

const POPULAR_CITIES = [
  'Bengaluru',
  'Coimbatore',
  'Chennai',
  'Mumbai',
  'Pune',
  'Hyderabad',
  'Delhi NCR',
  'Ahmedabad',
];

const TIMING_OPTIONS = [
  { value: 'IMMEDIATE', label: 'Immediately', description: 'Emergency / urgent turnaround' },
  { value: 'WITHIN_DAYS', label: 'Within Days', description: 'Deliver within a target duration' },
  { value: 'SPECIFIC_DATE', label: 'Specific Target Date', description: 'Firm calendar milestone' },
  { value: 'FLEXIBLE', label: 'Flexible', description: 'Open timeline for best pricing' },
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

export function LogisticsAndCommercialStep({
  draft,
  taxonomy,
  isBusy,
  onBack,
  onSubmit,
}: LogisticsAndCommercialStepProps) {
  const { context } = useRoleContext();
  const isRwaOrEnterprise = context.buyerType === 'COMMUNITY' || context.buyerType === 'ENTERPRISE';
  
  // Logistics & Location
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
  const [geographicReach, setGeographicReach] = useState<'PAN_INDIA' | 'LOCAL' | 'STATE'>(
    draft.sourcing.geographicReach ?? 'LOCAL',
  );

  // Quality & Commercial
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
  const [paymentTerms, setPaymentTerms] = useState(draft.commercial.paymentTerms ?? '100% on delivery');
  const [paymentStructure, setPaymentStructure] = useState<'SINGLE' | 'ADVANCE' | 'MILESTONES'>('SINGLE');
  const [includesTransport, setIncludesTransport] = useState(
    draft.commercial.priceIncludesTransport ?? false,
  );
  const [includesGst, setIncludesGst] = useState(
    draft.commercial.priceIncludesGst ?? false,
  );
  const [commercialNotes, setCommercialNotes] = useState(
    draft.commercial.notes ?? '',
  );

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.deliveryCity && !city) setCity(draft.deliveryCity);
    if (draft.deliveryPincode && !pincode) setPincode(draft.deliveryPincode);
    if (draft.deliveryLine1 && !line1) setLine1(draft.deliveryLine1);
    if (draft.siteNotes && !siteNotes) setSiteNotes(draft.siteNotes);
    if (draft.requiredByMode) setTiming(draft.requiredByMode);
    if (draft.requiredByDays !== null && draft.requiredByDays !== undefined) {
      setDays(draft.requiredByDays);
    }
    if (draft.quality?.warrantyMonths !== null && draft.quality?.warrantyMonths !== undefined && warrantyMonths === null) {
      setWarrantyMonths(draft.quality.warrantyMonths);
    }
    if (draft.sourcing?.geographicReach) {
      setGeographicReach(draft.sourcing.geographicReach);
    }
  }, [draft]);

  const cities = taxonomy.cities ?? [];

  function handleSubmit() {
    if (!city.trim()) {
      setError('Delivery Town / Service City is required.');
      return;
    }
    if (!pincode.trim()) {
      setError('PIN Code is required.');
      return;
    }
    if (!/^[0-9]{6}$/.test(pincode.trim())) {
      setError('Postal PIN code must be a 6-digit number.');
      return;
    }
    if (timing === 'WITHIN_DAYS' && (!days || days < 1)) {
      setError('Please specify target turnaround days.');
      return;
    }
    if (timing === 'SPECIFIC_DATE' && !date) {
      setError('Please pick a required-by date.');
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
      sourcing: {
        ...draft.sourcing,
        geographicReach,
      },
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
    <div className="space-y-6">
      {/* 1. Location & Delivery Logistics */}
      <Card
        title="Location & Delivery Logistics"
        description="Suppliers see the city for matching; your detailed street address and site instructions remain private until award."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Delivery Town / Service City" required>
            {({ id, describedBy, invalid }) => (
              <div className="space-y-1.5">
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="e.g. Bengaluru, Coimbatore, Chennai"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                <div className="flex flex-wrap gap-1 items-center pt-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium">Quick:</span>
                  {POPULAR_CITIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCity(c)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                        city.toLowerCase() === c.toLowerCase()
                          ? 'border-primary bg-primary/10 text-primary font-bold'
                          : 'border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Field>

          <Field label="PIN Code" required help="Filters suppliers within your immediate logistics radius.">
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

          <Field label="Street Address" className="sm:col-span-2" help="Encrypted &amp; private until supplier award.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                placeholder="Unit / Plot No, Street, Industrial Area"
                value={line1}
                onChange={(e) => setLine1(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Site Access Notes"
            className="sm:col-span-2"
            help="Gate entry guidelines, unloading facilities, timings (private until award)."
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                rows={2}
                placeholder="e.g. Loading dock open 9 AM - 6 PM, crane available on site"
                value={siteNotes}
                onChange={(e) => setSiteNotes(e.target.value)}
              />
            )}
          </Field>
        </div>

        {/* Geographic Reach & PAN-India Notice */}
        <div className="mt-5 border-t pt-5">
          <RadioCardGroup
            legend="Geographic Sourcing Reach"
            options={GEOGRAPHIC_REACH_OPTIONS}
            value={geographicReach}
            onValueChange={(val) => setGeographicReach(val as 'PAN_INDIA' | 'LOCAL' | 'STATE')}
          />

          <div className="mt-3.5 rounded-lg border border-primary/20 bg-primary/5 p-3.5 text-xs text-foreground">
            <div className="flex items-start gap-2.5">
              <span className="text-base leading-none">💡</span>
              <div className="space-y-0.5">
                <span className="font-semibold text-primary">Location vs. PAN-India Sourcing:</span>
                <p className="text-muted-foreground leading-relaxed">
                  Specifying your destination city and PIN code provides precise freight &amp; transit calculations, but <strong>will not stop competitive PAN-India suppliers from quoting</strong> when PAN-India reach is selected.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 border-t pt-5">
          <RadioCardGroup
            legend="Required-By Timeline"
            options={TIMING_OPTIONS}
            value={timing}
            onValueChange={setTiming}
          />

          {timing === 'WITHIN_DAYS' && (
            <Field label="Target duration (days)" className="mt-3 max-w-xs">
              {({ id }) => (
                <NumberInput id={id} min={1} value={days} onValueChange={setDays} unit="days" />
              )}
            </Field>
          )}

          {timing === 'SPECIFIC_DATE' && (
            <Field label="Target delivery date" className="mt-3 max-w-xs">
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

        <Field label="Fulfilment Execution Mode" className="mt-5 max-w-sm">
          {({ id }) => (
            <Select
              id={id}
              options={FULFILMENT_OPTIONS}
              value={fulfilment}
              onChange={(e) => setFulfilment(e.target.value)}
            />
          )}
        </Field>
      </Card>

      {/* 2. Quality & Commercial Terms */}
      <Card
        title="Quality, Inspection & Commercial Terms"
        description="Standardize commercial terms so all received quotes can be fairly compared apple-to-apple."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Internal Budget Ceiling" help="Strictly private to your organization. Never shown to suppliers." hint="₹">
            {({ id }) => (
              <NumberInput
                id={id}
                min={0}
                placeholder="e.g. 50000"
                value={budgetAmount}
                onValueChange={setBudgetAmount}
              />
            )}
          </Field>

          <div className="sm:col-span-2 space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Payment Terms &amp; Settlement Structure
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('SINGLE');
                  setPaymentTerms('100% upon delivery & inspection');
                }}
                className={`rounded-lg border p-2.5 text-left text-xs transition ${
                  paymentStructure === 'SINGLE'
                    ? 'border-primary bg-primary/10 font-bold text-primary ring-2 ring-primary/20'
                    : 'border-muted bg-card text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <span>💳</span> Single Payment
                </div>
                <p className="mt-1 text-[11px] font-normal text-muted-foreground">
                  100% on delivery / completion sign-off (e.g. Net 30, immediate)
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('ADVANCE');
                  setPaymentTerms('30% advance with order, 70% balance upon delivery');
                }}
                className={`rounded-lg border p-2.5 text-left text-xs transition ${
                  paymentStructure === 'ADVANCE'
                    ? 'border-primary bg-primary/10 font-bold text-primary ring-2 ring-primary/20'
                    : 'border-muted bg-card text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <span>⚡</span> Advance + Balance
                </div>
                <p className="mt-1 text-[11px] font-normal text-muted-foreground">
                  Part advance payment upfront, remainder upon delivery
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('MILESTONES');
                  setPaymentTerms('30% mobilization, 40% dispatch signoff, 30% final testing signoff');
                }}
                className={`rounded-lg border p-2.5 text-left text-xs transition ${
                  paymentStructure === 'MILESTONES'
                    ? 'border-primary bg-primary/10 font-bold text-primary ring-2 ring-primary/20'
                    : 'border-muted bg-card text-muted-foreground hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <span>🏁</span> Part / Milestone-Based
                </div>
                <p className="mt-1 text-[11px] font-normal text-muted-foreground">
                  Multiple staged milestones (e.g. 30%-40%-30% progress payments)
                </p>
              </button>
            </div>

            <Field label="Customized Payment Terms" help="Specify exact schedule or milestone percentages">
              {({ id }) => (
                <Input
                  id={id}
                  placeholder="e.g. 100% on delivery, 30 days credit, or milestone percentages"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                />
              )}
            </Field>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] text-muted-foreground">Quick presets:</span>
              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('SINGLE');
                  setPaymentTerms('100% upon delivery & inspection');
                }}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                100% on Delivery
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('SINGLE');
                  setPaymentTerms('Net 30 days from tax invoice');
                }}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                Net 30 Days
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('ADVANCE');
                  setPaymentTerms('30% advance with PO, 70% upon delivery');
                }}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                30% Adv / 70% Bal
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('ADVANCE');
                  setPaymentTerms('50% advance, 50% on final handover');
                }}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                50% Adv / 50% Bal
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentStructure('MILESTONES');
                  setPaymentTerms('30% mobilization, 40% dispatch, 30% testing & acceptance');
                }}
                className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition"
              >
                3-Stage Milestones (30/40/30)
              </button>
            </div>
          </div>

          <Field label="Warranty Expected">
            {({ id }) => (
              <NumberInput
                id={id}
                min={0}
                unit="months"
                placeholder="e.g. 12"
                value={warrantyMonths}
                onValueChange={setWarrantyMonths}
              />
            )}
          </Field>

          <Field
            label="Required Certifications / Test Reports"
            help="Comma separated (e.g. ISO 9001, CE, Mill Test Report)"
          >
            {({ id }) => (
              <Input
                id={id}
                placeholder="e.g. ISO 9001, Test Certificate"
                value={certifications}
                onChange={(e) => setCertifications(e.target.value)}
              />
            )}
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 rounded-lg border bg-muted/20 p-3.5">
          <Checkbox
            label="Pre-Dispatch / Site Inspection Required"
            description="We will inspect parts or milestone work before final signoff."
            checked={inspectionRequired}
            onCheckedChange={setInspectionRequired}
          />
          <Checkbox
            label="Sample Approval Required"
            description="Supplier must submit a physical sample before bulk execution."
            checked={sampleRequired}
            onCheckedChange={setSampleRequired}
          />
          <Checkbox
            label="Quoted Price Must Include Transport / Freight"
            description="All quotes should reflect landed cost at delivery site."
            checked={includesTransport}
            onCheckedChange={setIncludesTransport}
          />
          <Checkbox
            label="Quoted Price Must Include GST"
            description="Prices evaluated inclusive of applicable GST."
            checked={includesGst}
            onCheckedChange={setIncludesGst}
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Quality Remarks">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                placeholder="Specific tolerances, surface finish, packaging rules..."
                value={qualityNotes}
                onChange={(e) => setQualityNotes(e.target.value)}
              />
            )}
          </Field>

          <Field label="Commercial Remarks">
            {({ id }) => (
              <Textarea
                id={id}
                rows={2}
                placeholder="Billing preferences, penalty terms, tax invoice expectations..."
                value={commercialNotes}
                onChange={(e) => setCommercialNotes(e.target.value)}
              />
            )}
          </Field>
        </div>
      </Card>

      {/* 4. Committee Configuration (RWA/Enterprise Only) */}
      {isRwaOrEnterprise && (
        <Card
          title="🗳️ Committee & Governance Configuration"
          description="For RWA/Community and Enterprise buyers, committee voting is mandatory to ensure democratic/multi-tier decision-making."
        >
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚖️</span>
                <div className="space-y-1">
                  <h4 className="font-bold text-foreground">
                    {context.buyerType === 'COMMUNITY' ? 'Democratic Committee Voting' : 'Multi-Tier Enterprise Approval'}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {context.buyerType === 'COMMUNITY' 
                      ? 'Committee members will evaluate quotes anonymously and vote on recommendations before final award decision.'
                      : 'Cross-functional stakeholders (Technical, Commercial, Finance) will evaluate and vote before manager award.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-semibold">
                Committee Members (Minimum {context.buyerType === 'COMMUNITY' ? '2' : '3'} required)
              </label>
              <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
                <p className="font-semibold mb-1">ℹ️ Committee members will be invited after RFQ is published.</p>
                <p>
                  You can add committee members from your organization's member list in the next step, or after publishing the RFQ.
                  Each member will independently evaluate quotes (identities hidden) and cast votes before award.
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Voting Threshold:</span>
                  <select
                    value="SIMPLE_MAJORITY"
                    disabled
                    className="w-48 rounded-md border border-input bg-muted/40 px-3 py-1.5 text-xs text-foreground"
                  >
                    <option value="SIMPLE_MAJORITY">
                      {context.buyerType === 'COMMUNITY' ? 'Simple Majority (≥50%)' : 'Cross-Functional Consensus'}
                    </option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">COI Declaration:</span>
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
                    ✓ Mandatory
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-muted-foreground">Award Justification:</span>
                  <span className="text-sm font-semibold">Minimum 50 characters</span>
                </div>
              </div>

              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <strong>📋 Committee Setup:</strong> After publishing this RFQ, you'll be able to:
                <ul className="list-disc list-inside ml-2 mt-1 space-y-0.5">
                  <li>Invite committee members from your organization</li>
                  <li>Set evaluation criteria weights (Price, Delivery, Warranty, Technical)</li>
                  <li>Configure voting rules and quorum requirements</li>
                  <li>Track committee member participation and votes</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

      <div className="flex justify-between items-center pt-2">
        <Button variant="ghost" onClick={onBack}>
          ← Back to Specifications
        </Button>
        <Button onClick={handleSubmit} busy={isBusy} busyLabel="Saving Terms…">
          Continue to Sourcing & Final Review →
        </Button>
      </div>
    </div>
  );
}
