import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';
import { PanAutofillField } from '../PanAutofillField';
import { GstinAutofillField } from '../GstinAutofillField';
import { RegistrationFrozenAgreementPanel } from '@/features/legal/components/RegistrationFrozenAgreementPanel';
import { useCurrentAgreement } from '@/features/legal/hooks/use-current-agreement';
import { submitSignupRequest, resolveBuyerOrganisation, type SignupResult, type VerificationChannel } from '../../api/signup';

export interface WizardStep5IndividualProps {
  primaryChannel: VerificationChannel;
  primaryIdentifier: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
  onSuccess: (result: SignupResult) => void;
  onBack: () => void;
}

export function WizardStep5Individual({
  primaryChannel,
  primaryIdentifier,
  secondaryEmail,
  secondaryPhone,
  onSuccess,
  onBack,
}: WizardStep5IndividualProps) {
  const [fullName, setFullName] = useState('Ramesh Kumar');
  const [language, setLanguage] = useState('English');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [isTaxOpen, setIsTaxOpen] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAgreement = useCurrentAgreement('BUYER');
  const agreementVersion = currentAgreement.phase === 'ready' ? currentAgreement.agreement.version : 'latest';

  const addresses = [
    {
      id: 'addr-1',
      tag: 'HOME · DEFAULT',
      line1: '12, 4th Cross, Koramangala',
      cityStatePin: 'Bengaluru, Karnataka — 560034',
    },
    {
      id: 'addr-2',
      tag: 'WORK',
      line1: 'Office Tower, MG Road',
      cityStatePin: 'Bengaluru, Karnataka — 560001',
    },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!agreementAccepted) {
      setError('Please review and accept the agreement before proceeding');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const nameParts = fullName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || '';

    const email = primaryChannel === 'EMAIL' ? primaryIdentifier : (secondaryEmail || `${firstName.toLowerCase()}@example.com`);
    const phone = primaryChannel === 'WHATSAPP' ? primaryIdentifier : (secondaryPhone || '+919876543210');

    try {
      const res = await submitSignupRequest({
        side: 'BUYER',
        businessName: resolveBuyerOrganisation('INDIVIDUAL', fullName),
        contactFirstName: firstName,
        contactLastName: lastName,
        email,
        phone,
        verificationChannel: primaryChannel,
        buyerType: 'INDIVIDUAL',
        taxRegistrationId: pan || gstin || undefined,
        coverageCity: 'Bengaluru',
        coveragePincode: '560034',
        eulaAccepted: agreementAccepted,
        eulaVersion: agreementVersion,
        documentHash: currentAgreement.phase === 'ready' ? currentAgreement.agreement.documentHash : '',
      });

      if (!res.ok) {
        setError(res.error || 'Registration submission failed');
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
      <form onSubmit={handleSubmit} className="space-y-5 pb-6">
        <WizardProgress step={5} total={5} label="Individual Profile" onBack={onBack} />

        <div className="space-y-1">
          <h2 className="text-xl font-black text-foreground">Individual Profile</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Tell us about yourself — it stays editable.
          </p>
        </div>

        {/* PERSONAL INFORMATION */}
        <div className="space-y-3 pt-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            PERSONAL INFORMATION
          </label>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Icon name="photo_camera" size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Profile Photo (optional)</p>
                <p className="text-[10px] text-muted-foreground">Helps suppliers recognise you</p>
              </div>
            </div>
            <button
              type="button"
              className="px-3 py-1 rounded-lg border border-border text-xs font-bold hover:bg-muted transition"
            >
              Upload
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Preferred Language *
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            >
              <option value="English">English</option>
              <option value="Hindi">हिंदी (Hindi)</option>
              <option value="Kannada">ಕನ್ನಡ (Kannada)</option>
              <option value="Tamil">தமிழ் (Tamil)</option>
              <option value="Telugu">తెలుగు (Telugu)</option>
            </select>
          </div>
        </div>

        {/* ADDRESSES */}
        <div className="space-y-3 pt-2">
          <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
            ADDRESSES
          </label>

          <div className="space-y-2">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="rounded-xl border border-border/80 bg-card p-3 space-y-1 text-xs shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-primary text-[10px] uppercase tracking-wider">
                    {addr.tag}
                  </span>
                  <Icon name="location_on" size={14} className="text-muted-foreground" />
                </div>
                <p className="font-medium text-foreground">{addr.line1}</p>
                <p className="text-[11px] text-muted-foreground">{addr.cityStatePin}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="w-full py-2.5 rounded-xl border border-dashed border-border hover:border-primary/50 text-xs font-bold text-primary flex items-center justify-center gap-1.5 transition"
          >
            <Icon name="add" size={16} />
            Add Address
          </button>
        </div>

        {/* Collapsible Identity & Tax */}
        <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setIsTaxOpen(!isTaxOpen)}
            className="w-full px-3.5 py-3 flex items-center justify-between text-xs font-bold text-foreground hover:bg-muted/30 transition cursor-pointer"
          >
            <span>Identity &amp; Tax (optional) · PAN · GSTIN</span>
            <Icon name={isTaxOpen ? 'expand_less' : 'expand_more'} size={18} />
          </button>

          {isTaxOpen && (
            <div className="p-3.5 pt-0 space-y-3 border-t border-border/50">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground block">
                  PAN (Permanent Account Number)
                </label>
                <PanAutofillField
                  id="indiv-pan"
                  value={pan}
                  onChange={setPan}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono uppercase"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground block">
                  GSTIN (Optional)
                </label>
                <GstinAutofillField
                  id="indiv-gstin"
                  value={gstin}
                  onChange={setGstin}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono uppercase"
                />
              </div>
            </div>
          )}
        </div>

        {/* EULA Agreement */}
        <div className="pt-2">
          <RegistrationFrozenAgreementPanel
            side="BUYER"
            state={currentAgreement}
            agreementVersion={agreementVersion}
            agreementAccepted={agreementAccepted}
            onAgreementAcceptedChange={setAgreementAccepted}
            buyerPersonaLabel="Individual Buyer"
            checkboxTestId="individual-agreement-checkbox"
            panelTestId="buyer-frozen-agreement-panel"
          />
        </div>

        {error && (
          <p className="text-xs text-destructive font-medium bg-destructive/10 p-2.5 rounded-lg">
            {error}
          </p>
        )}

        <div className="pt-4">
          <Button
            type="submit"
            disabled={isSubmitting || !agreementAccepted}
            className="w-full py-3.5 text-sm font-bold shadow-sm"
          >
            {isSubmitting ? 'Registering…' : 'Next'}
          </Button>
        </div>
      </form>
    </div>
  );
}
