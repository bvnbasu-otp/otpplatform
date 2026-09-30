import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateGstin, type GstTaxpayerInfo, type MsmeBusinessType, MSME_BUSINESS_TYPES } from '@otp/domain';
import { Button } from '@/components/ui';
import { PortalField, useFormText, usePortalControl } from './FormDensity';
import { RoleChoiceField } from './RoleChoiceField';
import { GstinAutofillField } from './GstinAutofillField';
import { PanAutofillField } from './PanAutofillField';
import { RwaRegistrationAgreementModal } from './RwaRegistrationAgreementModal';
import { MsmeRegistrationAgreementModal } from './MsmeRegistrationAgreementModal';
import {
  submitSignupRequest,
  resolveBuyerOrganisation,
  resolveBuyerRoleCode,
  type SignupResult,
  type VerificationChannel,
} from '../api/signup';
import { BUYER_COPY } from '../types/portal';
import { REFERRAL_ATTRIBUTION_NOTE } from '../lib/registration-outcome';
import { VerificationChoice } from './VerificationChoice';
import { queueBuyerPinDiscovery } from '../api/location-discovery';

/**
 * Registering an organisation.
 *
 * Buyer contexts are:
 * 1. INDIVIDUAL (Buying for Myself / Solo Property)
 * 2. MSME (Business / Commercial Enterprise)
 * 3. COMMUNITY (Residential Welfare Association / Housing Society)
 */

const BUYER_TYPES = [
  { value: 'INDIVIDUAL', label: 'Buying for Myself (Individual)' },
  { value: 'MSME', label: 'Business / MSME Enterprise' },
  { value: 'COMMUNITY', label: 'Residential Welfare Association (RWA) / Society' },
];

export function BuyerRegisterForm({
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
  const [organisation, setOrganisation] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [designation, setDesignation] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [buyerType, setBuyerType] = useState('');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [referral, setReferral] = useState(urlReferral);
  const [channel, setChannel] = useState<VerificationChannel>('WHATSAPP');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // F-RUN2-VAL-01: field-level messages shown next to the field that needs
  // attention, populated on a submit attempt — see validateBuyerForm below.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [pan, setPan] = useState('');
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);

  // R2-07: Location Pre-Warm & Coverage State
  const [state, setState] = useState('Karnataka');
  const [city, setCity] = useState('Bengaluru');
  const [pincode, setPincode] = useState('');
  const [coverageNotice, setCoverageNotice] = useState<string | null>(null);

  const isRwa = buyerType === 'COMMUNITY';
  const isMsme = buyerType === 'MSME';
  const isIndividual = buyerType === 'INDIVIDUAL';
  const [msmeBusinessType, setMsmeBusinessType] = useState<MsmeBusinessType>('PROPRIETORSHIP');

  const handlePincodeChange = (rawPin: string) => {
    const pin = rawPin.replace(/\D/g, '').slice(0, 6);
    setPincode(pin);
    if (pin.length === 6) {
      setCoverageNotice(
        `Delivery PIN ${pin} recorded for ${city}. Supplier coverage depends on your category and RFQ — OTP does not guarantee suppliers in every PIN.`,
      );
    } else {
      setCoverageNotice(null);
    }
  };

  function handleBuyerTypeChange(selectedType: string) {
    setBuyerType(selectedType);
    setAgreementAccepted(false);
    if (selectedType === 'INDIVIDUAL') {
      setOrganisation('Self');
      setRoleCode('PROPERTY_OWNER');
    } else {
      if (organisation.trim().toLowerCase() === 'self') {
        setOrganisation('');
      }
      if (roleCode === 'PROPERTY_OWNER') {
        setRoleCode('');
      }
    }
  }

  /**
   * F-RUN2-VAL-01: what used to silently disable the submit button, now
   * surfaced as a message next to the field it is about. Role is
   * deliberately absent: the dropdown hides itself if the catalogue cannot
   * be read, and a hidden required field is a form that cannot be
   * submitted for reasons nobody can see.
   */
  function validateBuyerForm(): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!buyerType) errors.buyerType = 'Choose who you are buying for.';
    if (!isIndividual && !organisation.trim()) errors.organisation = 'Organisation name is required.';
    if (!firstName.trim()) errors.firstName = 'First name is required.';
    if (!lastName.trim()) errors.lastName = 'Last name is required.';
    if (!city.trim()) errors.city = 'Operational city is required.';
    if (pincode.trim().length !== 6) errors.pincode = 'Pincode must be 6 digits.';
    if (!email.trim()) errors.email = 'Work email is required.';
    if (!phone.trim()) errors.phone = 'Phone number is required.';
    if ((isRwa || isMsme) && !agreementAccepted) {
      errors.agreement = 'Review and accept the agreement above to continue.';
    }
    return errors;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationErrors = validateBuyerForm();
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setBusy(true);

    const resolvedOrg = resolveBuyerOrganisation(buyerType, organisation);
    const resolvedRole = resolveBuyerRoleCode(buyerType, roleCode);

    const result = await submitSignupRequest({
      side: 'BUYER',
      businessName: resolvedOrg,
      contactFirstName: firstName.trim(),
      contactLastName: lastName.trim(),
      designation: isIndividual ? undefined : (designation.trim() || undefined),
      email: email.trim(),
      phone: phone.trim(),
      verificationChannel: channel,
      roleCode: resolvedRole,
      buyerType,
      taxRegistrationId: taxId.trim() || undefined,
      referralCode: referral.trim() || undefined,
      coverageCity: city.trim(),
      coveragePincode: pincode.trim(),
    });

    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }

    if (pincode.trim().length === 6) {
      queueBuyerPinDiscovery({
        state: state.trim(),
        city: city.trim(),
        pincode: pincode.trim(),
      });
    }

    // B-01: the acknowledgement notice is now a guaranteed server-side send
    // (submitSignupRequest already asked onboarding-notify to send it and
    // put the truthful outcome on result.result.notification) — there is no
    // client-side WhatsApp call left to make here, and no gate on `channel`,
    // since both registration forms require a phone number regardless of
    // the applicant's stated acknowledgement-channel preference.
    setBusy(false);
    onSuccess(result.result);
  }

  return (
    <div data-testid="buyer-register-form">
      {showHeading && (
        <>
          <h2 className={`font-semibold text-navy ${text.heading}`}>
            {BUYER_COPY.registerTitle}
          </h2>
          <p className={`mt-1 leading-snug text-slate-soft ${text.note}`}>
            {BUYER_COPY.registerSubtitle}
          </p>
        </>
      )}

      <form
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        className={`${showHeading ? 'mt-4' : ''} ${text.stack}`}
      >
        <PortalField
          label="Who are you buying for?"
          help="This sets how approvals work for your account, and what a committee vote is worth."
          error={fieldErrors.buyerType}
          required
        >
          {({ id, describedBy, invalid }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              value={buyerType}
              onChange={(e) => handleBuyerTypeChange(e.target.value)}
              className={control(invalid)}
              required
            >
              <option value="">Choose…</option>
              {BUYER_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </PortalField>

        <PortalField
          label={
            isIndividual
              ? 'Organisation'
              : buyerType === 'MSME'
              ? 'Organisation / Business name'
              : buyerType === 'COMMUNITY'
              ? 'RWA / Society name'
              : 'Organisation name'
          }
          help={
            isIndividual
              ? 'Personal buyers decide independently with a single direct vote (default: Self).'
              : buyerType === 'MSME'
              ? 'Registered business name. MSME owners decide awards with sovereign spend authority.'
              : buyerType === 'COMMUNITY'
              ? 'Residential Welfare Association or Society. Committee votes require democratic quorum.'
              : 'This sets your buyer organization context for sourcing and procurement.'
          }
          error={fieldErrors.organisation}
          required
        >
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              placeholder={
                isIndividual
                  ? 'Self'
                  : buyerType === 'MSME'
                  ? 'e.g. Acme Precision Engineering / MSME'
                  : 'Durga Rainbow Flat Owner Welfare Association'
              }
              autoComplete="organization"
              aria-describedby={describedBy}
              className={control(invalid)}
              required
              data-testid="signup-organisation"
            />
          )}
        </PortalField>

        <div className={`grid sm:grid-cols-2 ${text.grid}`}>
          <PortalField label="First name" error={fieldErrors.firstName} required>
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
          <PortalField label="Last name" error={fieldErrors.lastName} required>
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

        <div className={`grid sm:grid-cols-2 ${text.grid}`}>
          <PortalField label="Operational City" error={fieldErrors.city} required>
            {({ id, invalid }) => (
              <input
                id={id}
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Bengaluru"
                className={control(invalid)}
                required
              />
            )}
          </PortalField>
          <PortalField
            label="Pincode (6 digits)"
            help="Helps check immediate regional supplier coverage."
            error={fieldErrors.pincode}
            required
          >
            {({ id, invalid }) => (
              <input
                id={id}
                value={pincode}
                onChange={(e) => handlePincodeChange(e.target.value)}
                placeholder="e.g. 560048"
                maxLength={6}
                className={control(invalid)}
                required
              />
            )}
          </PortalField>
        </div>

        {coverageNotice && (
          <div
            className={`rounded-xl border p-3 text-xs font-semibold ${
              coverageNotice.includes('✓')
                ? 'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800'
                : 'bg-blue-50 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-800'
            }`}
            data-testid="onboarding-coverage-banner"
          >
            {coverageNotice}
          </div>
        )}

        {!isIndividual && <RoleChoiceField side="BUYER" value={roleCode} onChange={setRoleCode} />}

        {!isIndividual && (
          <PortalField label="Job title as you write it" hint="optional">
            {({ id, invalid }) => (
              <input
                id={id}
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                placeholder="Secretary, Facility Manager, Procurement Head"
                autoComplete="organization-title"
                className={control(invalid)}
              />
            )}
          </PortalField>
        )}

        <PortalField
          label="GSTIN / Tax Registration"
          hint="optional"
          help="Enter 15-digit GSTIN to auto-populate legal business name, address, and unlock instant verified badge."
        >
          {({ id, describedBy, invalid }) => (
            <GstinAutofillField
              id={id}
              value={taxId}
              onChange={setTaxId}
              describedBy={describedBy}
              className={control(invalid)}
              onAutofill={(details: GstTaxpayerInfo) => {
                if (!isIndividual && details.legalName) {
                  setOrganisation(details.legalName);
                }
                if (details.pan) {
                  setPan(details.pan);
                }
              }}
            />
          )}
        </PortalField>

        {isMsme && (
          <PortalField
            label="Business Constitution Type"
            help="Select the statutory legal structure of your business."
          >
            {({ id, invalid }) => (
              <select
                id={id}
                value={msmeBusinessType}
                onChange={(e) => setMsmeBusinessType(e.target.value as MsmeBusinessType)}
                className={control(invalid)}
              >
                {MSME_BUSINESS_TYPES.map((bt) => (
                  <option key={bt} value={bt}>
                    {bt.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            )}
          </PortalField>
        )}

        {(isRwa || isMsme) && (
          <PortalField
            label="Permanent Account Number (PAN)"
            hint="optional"
            help={isMsme ? "Business or Proprietor's PAN for statutory verification." : "Registered PAN of the Association or Society for statutory compliance."}
          >
            {({ id, describedBy, invalid }) => (
              <PanAutofillField
                id={id}
                value={pan}
                onChange={setPan}
                describedBy={describedBy}
                className={control(invalid)}
              />
            )}
          </PortalField>
        )}

        {isRwa && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 text-xs" data-testid="rwa-agreement-prompt">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <span>📜</span> RWA Organization Agreement
              </span>
              {agreementAccepted ? (
                <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold border border-emerald-300">
                  ✓ Accepted
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-extrabold border border-amber-300">
                  Mandatory for Society
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Review and electronically accept the OTP RWA Institutional Agreement detailing non-personal liability, committee voting rules, and annual officer term limits.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full text-xs font-bold"
              onClick={() => setIsAgreementModalOpen(true)}
            >
              {agreementAccepted ? 'View / Download Accepted Agreement' : 'Review & Accept RWA Agreement →'}
            </Button>
            {fieldErrors.agreement && (
              <p className="text-red-600 text-[11px] font-semibold" role="alert">
                {fieldErrors.agreement}
              </p>
            )}
          </div>
        )}

        {isMsme && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 text-xs" data-testid="msme-agreement-prompt">
            <div className="flex items-center justify-between">
              <span className="font-bold text-foreground flex items-center gap-1.5">
                <span>📜</span> MSME Institutional Agreement
              </span>
              {agreementAccepted ? (
                <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold border border-emerald-300">
                  ✓ Accepted
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 text-[10px] font-extrabold border border-amber-300">
                  Mandatory for Business
                </span>
              )}
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Review and electronically accept the OTP MSME Procurement OS Agreement detailing Primary authority, spend delegations, anti-self-approval, and 0.50% supplier fee disclosure.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-full text-xs font-bold"
              onClick={() => setIsAgreementModalOpen(true)}
            >
              {agreementAccepted ? 'View / Download Accepted Agreement' : 'Review & Accept MSME Agreement →'}
            </Button>
            {fieldErrors.agreement && (
              <p className="text-red-600 text-[11px] font-semibold" role="alert">
                {fieldErrors.agreement}
              </p>
            )}
          </div>
        )}

        <PortalField label="Work email" error={fieldErrors.email} required>
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

        <PortalField
          label="Phone number"
          help="Used for verification and nothing else."
          error={fieldErrors.phone}
          required
        >
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
                  <span>{REFERRAL_ATTRIBUTION_NOTE}</span>
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
          busy={busy}
          busyLabel="Submitting…"
        >
          Register
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

      {isRwa && (
        <RwaRegistrationAgreementModal
          isOpen={isAgreementModalOpen}
          onClose={() => setIsAgreementModalOpen(false)}
          onAccept={() => setAgreementAccepted(true)}
          organizationName={organisation || 'Residential Welfare Association'}
          authorizedOfficerName={`${firstName} ${lastName}`.trim() || 'Authorized Officer'}
          authorizedOfficerRole={roleCode || 'SECRETARY'}
          panOrGstin={taxId || pan || undefined}
        />
      )}

      {isMsme && (
        <MsmeRegistrationAgreementModal
          isOpen={isAgreementModalOpen}
          onClose={() => setIsAgreementModalOpen(false)}
          onAccept={() => setAgreementAccepted(true)}
          businessName={organisation || 'Commercial Enterprise'}
          businessType={msmeBusinessType}
          primaryOfficerName={`${firstName} ${lastName}`.trim() || 'Primary Administrator'}
          primaryOfficerEmail={email}
          primaryOfficerPhone={phone}
          gstin={taxId || undefined}
          pan={pan || undefined}
        />
      )}
    </div>
  );
}
