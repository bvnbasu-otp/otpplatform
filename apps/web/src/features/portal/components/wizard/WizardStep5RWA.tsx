import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';
import { RegistrationFrozenAgreementPanel } from '@/features/legal/components/RegistrationFrozenAgreementPanel';
import { useCurrentAgreement } from '@/features/legal/hooks/use-current-agreement';
import { submitSignupRequest, type SignupResult, type VerificationChannel } from '../../api/signup';

export interface WizardStep5RWAProps {
  primaryChannel: VerificationChannel;
  primaryIdentifier: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
  onSuccess: (result: SignupResult) => void;
  onBack: () => void;
}

export function WizardStep5RWA({
  primaryChannel,
  primaryIdentifier,
  secondaryEmail,
  secondaryPhone,
  onSuccess,
  onBack,
}: WizardStep5RWAProps) {
  const [associationName, setAssociationName] = useState('Sunrise Apartments Owners Assn.');
  const [registrationNo, setRegistrationNo] = useState('REG/2024/0183');
  const [assocType, setAssocType] = useState('Apartment Assn.');
  const [totalUnits, setTotalUnits] = useState('240');
  const [occupiedUnits, setOccupiedUnits] = useState('218');
  const [address, setAddress] = useState('Bengaluru, Karnataka — 560095');
  const [role, setRole] = useState<'Resident Owner' | 'Committee Member' | 'Estate / Facility Mgr'>('Committee Member');
  const [contactName, setContactName] = useState('Ramesh Kumar');

  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAgreement = useCurrentAgreement('BUYER');
  const agreementVersion = currentAgreement.phase === 'ready' ? currentAgreement.agreement.version : 'latest';

  const roleOptions: ('Resident Owner' | 'Committee Member' | 'Estate / Facility Mgr')[] = [
    'Resident Owner',
    'Committee Member',
    'Estate / Facility Mgr',
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!associationName.trim()) {
      setError('Association name is required');
      return;
    }
    if (!registrationNo.trim()) {
      setError('Registration number is required');
      return;
    }
    if (!agreementAccepted) {
      setError('Please review and accept the agreement before proceeding');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const nameParts = contactName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Member';
    const lastName = nameParts.slice(1).join(' ') || '';

    const email = primaryChannel === 'EMAIL' ? primaryIdentifier : (secondaryEmail || 'rwa@example.com');
    const phone = primaryChannel === 'WHATSAPP' ? primaryIdentifier : (secondaryPhone || '+919876543210');

    try {
      const res = await submitSignupRequest({
        side: 'BUYER',
        businessName: associationName.trim(),
        contactFirstName: firstName,
        contactLastName: lastName,
        designation: role,
        email,
        phone,
        verificationChannel: primaryChannel,
        buyerType: 'COMMUNITY',
        roleCode: role === 'Committee Member' ? 'BUYER_COMMITTEE' : 'BUYER_ADMIN',
        taxRegistrationId: registrationNo.trim(),
        coverageCity: 'Bengaluru',
        coveragePincode: '560095',
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
        <WizardProgress step={5} total={5} label="1 / 3 · Association Profile" onBack={onBack} />

        <div className="space-y-1">
          <h2 className="text-xl font-black text-foreground">Association Profile</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Register your community once — reuse it everywhere.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Association Name *
            </label>
            <input
              type="text"
              required
              value={associationName}
              onChange={(e) => setAssociationName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Registration No. *
              </label>
              <input
                type="text"
                required
                value={registrationNo}
                onChange={(e) => setRegistrationNo(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Type *
              </label>
              <select
                value={assocType}
                onChange={(e) => setAssocType(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              >
                <option value="Apartment Assn.">Apartment Assn.</option>
                <option value="Housing Society">Housing Society</option>
                <option value="Villa Community">Villa Community</option>
                <option value="Cooperative Society">Cooperative Society</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Total Units
              </label>
              <input
                type="number"
                value={totalUnits}
                onChange={(e) => setTotalUnits(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground block">
                Occupied Units
              </label>
              <input
                type="number"
                value={occupiedUnits}
                onChange={(e) => setOccupiedUnits(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-foreground block">
              Association Address *
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
              Contact Person Name *
            </label>
            <input
              type="text"
              required
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
            />
          </div>

          {/* YOUR ROLE IN THE ASSOCIATION */}
          <div className="space-y-2 pt-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              YOUR ROLE IN THE ASSOCIATION
            </label>
            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setRole(opt)}
                  className={`py-2 px-1 text-center rounded-xl text-[11px] font-bold border transition ${
                    role === opt
                      ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                      : 'border-border/80 bg-card text-muted-foreground hover:bg-muted/40'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Info callout */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-3 flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
            <Icon name="shield" size={16} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px]">
              You become the association administrator (after verification). Invite members later — Facility Managers get operations only, never voting rights.
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
              buyerPersonaLabel="RWA / Society"
              checkboxTestId="rwa-frozen-agreement-checkbox"
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
