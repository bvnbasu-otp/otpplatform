import { useState } from 'react';
import { validateGstin, type GstTaxpayerInfo } from '@otp/domain';
import { Button } from '@/components/ui';
import { PortalField, useFormText, usePortalControl } from './FormDensity';
import { RoleChoiceField } from './RoleChoiceField';
import { GstinAutofillField } from './GstinAutofillField';
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
 * Buyer type is asked for because it decides how the platform behaves for this
 * account: an individual decides alone, a residents' association decides by
 * committee and each of its members carries the weight of many households. It
 * is the one question here whose answer changes the product.
 */

const BUYER_TYPES = [
  { value: 'INDIVIDUAL', label: 'Buying for Myself' },
  { value: 'MSME', label: 'Business Or MSME' },
  { value: 'COMMUNITY', label: 'Residential Welfare Association OR Society' },
  { value: 'ENTERPRISE', label: 'Enterprise with a Procurement Committee' },
  { value: 'INSTITUTION', label: 'Institutions or Trusts with a Committee' },
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

  const isIndividual = buyerType === 'INDIVIDUAL';

  function handleBuyerTypeChange(selectedType: string) {
    setBuyerType(selectedType);
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
    Boolean(phone.trim());
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
                  : 'Sunrise Residency Owners Association'
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
              }}
            />
          )}
        </PortalField>

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
    </div>
  );
}
