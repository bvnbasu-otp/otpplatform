import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';
import { PanAutofillField } from '../PanAutofillField';
import { GstinAutofillField } from '../GstinAutofillField';
import { RegistrationFrozenAgreementPanel } from '@/features/legal/components/RegistrationFrozenAgreementPanel';
import { useCurrentAgreement } from '@/features/legal/hooks/use-current-agreement';
import { submitSignupRequest, type SignupResult, type VerificationChannel } from '../../api/signup';

export interface WizardStep5MSMEProps {
  primaryChannel: VerificationChannel;
  primaryIdentifier: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
  onSuccess: (result: SignupResult) => void;
  onBack: () => void;
}

export function WizardStep5MSME({
  primaryChannel,
  primaryIdentifier,
  secondaryEmail,
  secondaryPhone,
  onSuccess,
  onBack,
}: WizardStep5MSMEProps) {
  const [businessName, setBusinessName] = useState('Bright Enterprises');
  const [legalName, setLegalName] = useState('Bright Enterprises Pvt. Ltd.');
  const [businessType, setBusinessType] = useState('Private Limited');
  const [industry, setIndustry] = useState('Manufacturing');
  const [pan, setPan] = useState('ABCDE1234F');
  const [gstin, setGstin] = useState('29ABCDE1234F1Z5');
  const [udyam, setUdyam] = useState('UDYAM-KR-00123');
  const [estYear, setEstYear] = useState('2015');
  const [address, setAddress] = useState('44, Industrial Area, Peenya, Bengaluru — 58');
  const [contactName, setContactName] = useState('Ramesh Kumar');

  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAgreement = useCurrentAgreement('BUYER');
  const agreementVersion = currentAgreement.phase === 'ready' ? currentAgreement.agreement.version : 'latest';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }
    if (!pan.trim()) {
      setError('PAN is required');
      return;
    }
    if (!agreementAccepted) {
      setError('Please review and accept the agreement before proceeding');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const nameParts = contactName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Business';
    const lastName = nameParts.slice(1).join(' ') || '';

    const email = primaryChannel === 'EMAIL' ? primaryIdentifier : (secondaryEmail || 'business@example.com');
    const phone = primaryChannel === 'WHATSAPP' ? primaryIdentifier : (secondaryPhone || '+919876543210');

    try {
      const res = await submitSignupRequest({
        side: 'BUYER',
        businessName: businessName.trim(),
        contactFirstName: firstName,
        contactLastName: lastName,
        designation: 'Director / Proprietor',
        email,
        phone,
        verificationChannel: primaryChannel,
        buyerType: 'MSME',
        taxRegistrationId: gstin.trim() || pan.trim(),
        coverageCity: 'Bengaluru',
        coveragePincode: '560058',
        eulaAccepted: agreementAccepted,
        eulaVersion: agreementVersion,
        documentHash: currentAgreement.phase === 'ready' ? currentAgreement.agreement.documentHash : '',
      });

      if (!res.ok) {
        setError(res.error || 'Registration failed');
        setIsSubmitting(false);
        return;
      }

      onSuccess(res.result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      <form onSubmit={handleSubmit} className="space-y-4 pb-6">
        <WizardProgress step={5} total={5} label="1 / 3 · Business Profile" onBack={onBack} />

        <div className="space-y-1">
          <h2 className="text-xl font-black text-foreground">Business Profile</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tell us about your business.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Business Name *
            </label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Legal Registered Name *
            </label>
            <input
              type="text"
              required
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Business Type *
              </label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              >
                <option value="Private Limited">Private Limited</option>
                <option value="Proprietorship">Proprietorship</option>
                <option value="Partnership">Partnership</option>
                <option value="LLP">LLP</option>
                <option value="Public Limited">Public Limited</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Industry *
              </label>
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              >
                <option value="Manufacturing">Manufacturing</option>
                <option value="Retail & Trade">Retail &amp; Trade</option>
                <option value="Services & IT">Services &amp; IT</option>
                <option value="Construction">Construction</option>
                <option value="Logistics">Logistics</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                PAN *
              </label>
              <PanAutofillField
                id="msme-pan"
                value={pan}
                onChange={setPan}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs font-mono uppercase"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                GSTIN *
              </label>
              <GstinAutofillField
                id="msme-gstin"
                value={gstin}
                onChange={setGstin}
                className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs font-mono uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Udyam (optional)
              </label>
              <input
                type="text"
                value={udyam}
                onChange={(e) => setUdyam(e.target.value)}
                placeholder="UDYAM-XX-00000"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-mono uppercase text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Year of Establishment
              </label>
              <input
                type="number"
                value={estYear}
                onChange={(e) => setEstYear(e.target.value)}
                placeholder="e.g. 2015"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Registered Business Address *
            </label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Authorised Contact Name *
            </label>
            <input
              type="text"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            />
          </div>

          {/* Info callout */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-3 flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
            <Icon name="shield" size={16} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px]">
              Invite delegates and assign permissions later from your Business Profile.
            </p>
          </div>

          {/* EULA Agreement */}
          <div className="pt-2">
            <RegistrationFrozenAgreementPanel
              side="BUYER"
              state={currentAgreement}
              agreementVersion={agreementVersion}
              agreementAccepted={agreementAccepted}
              onAgreementAcceptedChange={setAgreementAccepted}
              buyerPersonaLabel="MSME / Business"
              checkboxTestId="msme-frozen-agreement-checkbox"
              panelTestId="buyer-frozen-agreement-panel"
            />
          </div>

          {error && (
            <p className="text-xs text-destructive font-medium bg-destructive/10 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              disabled={isSubmitting || !agreementAccepted}
              className="w-full py-3.5 text-sm font-bold shadow-sm"
            >
              {isSubmitting ? 'Registering…' : 'Next'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
