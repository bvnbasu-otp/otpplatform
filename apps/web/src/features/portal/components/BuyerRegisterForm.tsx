import { useState } from 'react';
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
  sendWhatsAppNotification,
  resolveBuyerOrganisation,
  resolveBuyerRoleCode,
  type SignupResult,
  type VerificationChannel,
} from '../api/signup';
import { BUYER_COPY } from '../types/portal';
import { VerificationChoice } from './VerificationChoice';

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
  const [referral, setReferral] = useState('');
  const [channel, setChannel] = useState<VerificationChannel>('WHATSAPP');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (pin.startsWith('560') || pin.startsWith('400') || pin.startsWith('110') || pin.startsWith('600')) {
        setCoverageNotice(`✓ OTP already has active suppliers discovered and ready in your area (${city} ${pin}).`);
      } else {
        setCoverageNotice(`⚡ New Location: Regional suppliers will be pre-warmed for ${city} (${pin}).`);
      }
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

  const complete =
    (isIndividual ? Boolean(organisation.trim() || true) : Boolean(organisation.trim())) &&
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    Boolean(buyerType) &&
    Boolean(email.trim()) &&
    Boolean(phone.trim()) &&
    (!isRwa || agreementAccepted) &&
    (!isMsme || agreementAccepted);
  // Role is deliberately absent from the completeness check: the dropdown hides
  // itself if the catalogue cannot be read, and a hidden required field is a
  // form that cannot be submitted for reasons nobody can see.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

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
    });

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    if (channel === 'WHATSAPP' && phone.trim()) {
      void sendWhatsAppNotification(
        phone,
        `[OTP Platform] Registration Received\n\nHello ${firstName.trim()},\nYour buyer registration for *${resolvedOrg}* has been received.\n\n*Reference:* ${result.result.reference}\n*Status:* ${result.result.status}\n\nOur operations team will verify your business and activate your account. You will receive an update here on WhatsApp.`,
      );
    }

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
        className={`${showHeading ? 'mt-4' : ''} ${text.stack}`}
      >
        <PortalField
          label="Who are you buying for?"
          help="This sets how approvals work for your account, and what a committee vote is worth."
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
              : buyerType === 'ENTERPRISE'
              ? 'Enterprise name'
              : buyerType === 'INSTITUTION'
              ? 'Institution name'
              : 'Organisation name'
          }
          help={
            isIndividual
              ? 'Personal buyers decide independently with a single direct vote (default: Self).'
              : buyerType === 'MSME'
              ? 'Registered business name. MSME owners decide awards with a 2-vote weight.'
              : buyerType === 'COMMUNITY'
              ? 'Residential Welfare Association or Society. Committee votes carry a 3-vote weight.'
              : buyerType === 'ENTERPRISE'
              ? 'Registered corporate entity with delegated procurement committee (4-vote weight).'
              : buyerType === 'INSTITUTION'
              ? 'Educational, healthcare or charitable trust with committee oversight (3-vote weight).'
              : 'This sets how approvals and weighted voting power work for your account.'
          }
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
                  : buyerType === 'ENTERPRISE'
                  ? 'e.g. Apex Industrial Infrastructure Ltd'
                  : buyerType === 'INSTITUTION'
                  ? 'e.g. St. Jude Healthcare & Research Trust'
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
          <PortalField label="First name" required>
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
          <PortalField label="Last name" required>
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
          <PortalField label="Operational City" required>
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
          <PortalField label="Pincode (6 digits)" help="Helps check immediate regional supplier coverage." required>
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
            help="Select the statutory legal structure of your enterprise."
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
          </div>
        )}

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

        <PortalField label="Phone number" help="Used for verification and nothing else." required>
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

        <PortalField label="Referral code" hint="optional">
          {({ id, invalid }) => (
            <input
              id={id}
              value={referral}
              onChange={(e) => setReferral(e.target.value.toUpperCase())}
              placeholder="e.g. BNI-BLR-014"
              className={control(invalid)}
            />
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
