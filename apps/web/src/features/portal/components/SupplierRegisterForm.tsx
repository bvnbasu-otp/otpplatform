import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateGstin, type GstTaxpayerInfo } from '@otp/domain';
import { Button } from '@/components/ui';
import { PortalField, useFormText, usePortalControl } from './FormDensity';
import { GstinAutofillField } from './GstinAutofillField';
import {
  fetchServedCities,
  fetchServiceCategories,
  submitSignupRequest,
  sendWhatsAppNotification,
  type ServiceCategory,
  type SignupResult,
  type VerificationChannel,
} from '../api/signup';
import { RoleChoiceField } from './RoleChoiceField';
import { SUPPLIER_COPY } from '../types/portal';
import { VerificationChoice } from './VerificationChoice';

/**
 * Registering a business or individual service contractor.
 * Supports both GST-registered enterprises and non-GST micro-contractors/individual service providers.
 */
export function SupplierRegisterForm({
  onSuccess,
  onSignIn,
  /** Off where the page already carries the title as its own heading. */
  showHeading = true,
}: {
  onSuccess: (result: SignupResult) => void;
  onSignIn: () => void;
  showHeading?: boolean;
}) {
  const [searchParams] = useSearchParams();
  const urlReferral = searchParams.get('ref') || searchParams.get('referral') || '';

  const control = usePortalControl();
  const text = useFormText();
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [cities, setCities] = useState<string[]>([]);

  const [businessType, setBusinessType] = useState<'GST_REGISTERED' | 'MICRO_CONTRACTOR'>('GST_REGISTERED');
  const [business, setBusiness] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [taxId, setTaxId] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [referral, setReferral] = useState(urlReferral);
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [channel, setChannel] = useState<VerificationChannel>('WHATSAPP');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [catalog, served] = await Promise.all([
        fetchServiceCategories(),
        fetchServedCities(),
      ]);
      if (catalog.ok) setCategories(catalog.categories);
      setCities(served);
    })();
  }, []);

  const complete =
    business.trim() &&
    chosen.length > 0 &&
    firstName.trim() &&
    lastName.trim() &&
    email.trim() &&
    phone.trim() &&
    (city.trim() || pincode.trim());

  function toggleCategory(code: string) {
    setChosen((current) =>
      current.includes(code) ? current.filter((c) => c !== code) : [...current, code],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const finalTaxId = businessType === 'GST_REGISTERED' ? taxId.trim() : panNumber.trim();

    const result = await submitSignupRequest({
      side: 'SUPPLIER',
      businessName: business.trim(),
      contactFirstName: firstName.trim(),
      contactLastName: lastName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      verificationChannel: channel,
      roleCode: roleCode || undefined,
      categoryCodes: chosen,
      referralCode: referral.trim() || undefined,
      taxRegistrationId: finalTaxId || undefined,
      coverageCity: city.trim() || undefined,
      coveragePincode: pincode.trim() || undefined,
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (channel === 'WHATSAPP' && phone.trim()) {
      void sendWhatsAppNotification(
        phone,
        `[OTP Platform] Registration Received\n\nHello ${firstName.trim()},\nYour supplier registration for *${business.trim()}* has been received.\n\n*Reference:* ${result.result.reference}\n*Status:* ${result.result.status}\n\nOur operations team will verify your business and activate your account. You will receive notifications here on WhatsApp for new RFQs in your category.`,
      );
    }

    onSuccess(result.result);
  }

  return (
    <div data-testid="supplier-register-form">
      {showHeading && (
        <>
          <h2 className={`font-semibold text-navy ${text.heading}`}>
            {SUPPLIER_COPY.registerTitle}
          </h2>
          <p className={`mt-1 leading-snug text-slate-soft ${text.note}`}>
            {SUPPLIER_COPY.registerSubtitle}
          </p>
        </>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        className={`${showHeading ? 'mt-4' : ''} ${text.stack}`}
      >
        {/* Business Entity Type Selector (GST Enterprise vs. Micro-Contractor) */}
        <div className="rounded-xl border border-primary/20 bg-muted/20 p-2.5">
          <label className="block text-[11px] font-bold text-foreground mb-1.5 uppercase tracking-wider">
            Business Structure / Tax Registration
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setBusinessType('GST_REGISTERED')}
              className={`flex flex-col items-start rounded-lg border p-2 text-left transition ${
                businessType === 'GST_REGISTERED'
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                  : 'border-muted bg-card text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <span className="text-primary font-extrabold">{businessType === 'GST_REGISTERED' ? '●' : '○'}</span>
                <span>GST Registered</span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                Companies, LLPs &amp; Taxable Entities
              </span>
            </button>

            <button
              type="button"
              onClick={() => setBusinessType('MICRO_CONTRACTOR')}
              className={`flex flex-col items-start rounded-lg border p-2 text-left transition ${
                businessType === 'MICRO_CONTRACTOR'
                  ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                  : 'border-muted bg-card text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <span className="text-primary font-extrabold">{businessType === 'MICRO_CONTRACTOR' ? '●' : '○'}</span>
                <span>Micro-Contractor</span>
              </div>
              <span className="text-[10px] text-muted-foreground mt-0.5">
                Non-GST / Exemption Threshold (&lt; ₹20L/₹40L)
              </span>
            </button>
          </div>
        </div>

        <PortalField label="Business / Contractor Name" required>
          {({ id, invalid }) => (
            <input
              id={id}
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder={businessType === 'GST_REGISTERED' ? 'Aqua Prime Borewell Works Pvt Ltd' : 'Kovai Motor Winding & Services'}
              autoComplete="organization"
              className={control(invalid)}
              required
            />
          )}
        </PortalField>

        <PortalField
          label="What work do you take on?"
          help="Pick every category you genuinely cover. Requests reach you by these."
          required
        >
          {({ describedBy }) => (
            <div
              aria-describedby={describedBy}
              className="mt-1 flex flex-wrap gap-2"
              data-testid="category-picker"
            >
              {categories.length === 0 ? (
                <p className={`text-slate-soft ${text.body}`}>Loading Categories…</p>
              ) : (
                categories.map((category) => {
                  const selected = chosen.includes(category.code);
                  return (
                    <button
                      key={category.code}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category.code)}
                      title={category.description ?? undefined}
                      className={`rounded-full border px-3 py-1.5 font-bold transition min-h-[44px] mobile-touch-target flex items-center ${text.chip} ${
                        selected
                          ? 'border-action bg-action text-action-foreground'
                          : 'bg-card text-foreground hover:bg-muted'
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </PortalField>

        <div className={`grid sm:grid-cols-2 ${text.grid}`}>
          <PortalField label="Contact first name" required>
            {({ id, invalid }) => (
              <input
                id={id}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                className={control(invalid)}
                required
              />
            )}
          </PortalField>
          <PortalField label="Contact last name" required>
            {({ id, invalid }) => (
              <input
                id={id}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                className={control(invalid)}
                required
              />
            )}
          </PortalField>
        </div>

        <RoleChoiceField side="SUPPLIER" value={roleCode} onChange={setRoleCode} />

        <PortalField label="Work email" required>
          {({ id, invalid }) => (
            <input
              id={id}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={control(invalid)}
              required
            />
          )}
        </PortalField>

        <PortalField label="Phone number" help="Used for verification and WhatsApp RFQ alerts." required>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              autoComplete="tel"
              aria-describedby={describedBy}
              className={control(invalid)}
              required
            />
          )}
        </PortalField>

        <VerificationChoice value={channel} onChange={setChannel} />

        {/* Dynamic Tax / Identity Input based on Business Type */}
        {businessType === 'GST_REGISTERED' ? (
          <PortalField
            label="GSTIN / Tax Registration"
            hint="recommended"
            help="Enter 15-digit GSTIN to auto-populate legal name & registered address, unlocking instant Verified Seller badge."
          >
            {({ id, describedBy, invalid }) => (
              <GstinAutofillField
                id={id}
                value={taxId}
                onChange={setTaxId}
                describedBy={describedBy}
                className={control(invalid)}
                onAutofill={(details: GstTaxpayerInfo) => {
                  if (details.legalName && !business.trim()) {
                    setBusiness(details.legalName);
                  }
                  if (details.principalAddress?.city && !city.trim()) {
                    setCity(details.principalAddress.city);
                  }
                  if (details.principalAddress?.pincode && !pincode.trim()) {
                    setPincode(details.principalAddress.pincode);
                  }
                }}
              />
            )}
          </PortalField>
        ) : (
          <PortalField
            label="PAN Card Number (Optional)"
            hint="optional"
            help="Non-GST service providers can quote on local service orders. You can add a GSTIN later anytime."
          >
            {({ id, describedBy, invalid }) => (
              <div className="space-y-1.5">
                <input
                  id={id}
                  value={panNumber}
                  maxLength={10}
                  onChange={(e) => {
                    const nextVal = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
                    setPanNumber(nextVal);
                  }}
                  placeholder="ABCDE1234F"
                  aria-describedby={describedBy}
                  className={`${control(invalid)} font-mono uppercase tracking-wider`}
                />
                <div className="flex items-center gap-1.5 text-xs text-blue-800 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded px-2.5 py-1.5">
                  <span>ℹ️</span>
                  <span>Registered as individual contractor / micro-service provider. Eligible for RFQ quotes up to statutory limits.</span>
                </div>
              </div>
            )}
          </PortalField>
        )}

        <div className={`grid sm:grid-cols-[1fr_8rem] ${text.grid}`}>
          <PortalField label="City you work in" required>
            {({ id, invalid }) => (
              <input
                id={id}
                list="served-cities"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Bengaluru"
                autoComplete="address-level2"
                className={control(invalid)}
              />
            )}
          </PortalField>
          <PortalField label="Pin code" hint="optional">
            {({ id, invalid }) => (
              <input
                id={id}
                inputMode="numeric"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="560001"
                autoComplete="postal-code"
                className={control(invalid)}
              />
            )}
          </PortalField>
        </div>
        <datalist id="served-cities">
          {cities.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <PortalField label="Referral code" hint={referral ? 'applied' : 'optional'}>
          {({ id, invalid }) => (
            <div className="space-y-1">
              <input
                id={id}
                value={referral}
                onChange={(e) => setReferral(e.target.value.toUpperCase())}
                placeholder="e.g. OTP-XXXXXX or BNI-BLR-014"
                className={control(invalid)}
              />
              {referral && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <span>✓</span>
                  <span>Referral applied: 10% platform credit program linked.</span>
                </p>
              )}
            </div>
          )}
        </PortalField>

        {error && (
          <p className={`text-red-600 ${text.body}`} role="alert" data-testid="register-error">
            {error}
          </p>
        )}

        <Button
          type="submit"
          variant="action"
          className="w-full"
          disabled={!complete}
          busy={busy}
          busyLabel="Submitting…"
        >
          Register as Supplier
        </Button>
      </form>

      <p className={`mt-3 text-slate-soft ${text.note}`}>
        Already registered?{' '}
        <button
          type="button"
          onClick={onSignIn}
          className="font-medium text-action hover:underline"
        >
          Sign in
        </button>
      </p>
    </div>
  );
}
