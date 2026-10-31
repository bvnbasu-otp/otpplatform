import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';
import { RegistrationFrozenAgreementPanel } from '@/features/legal/components/RegistrationFrozenAgreementPanel';
import { useCurrentAgreement } from '@/features/legal/hooks/use-current-agreement';
import {
  FALLBACK_SERVICE_CATEGORIES,
  fetchServiceCategories,
  submitSignupRequest,
  type ServiceCategory,
  type SignupResult,
  type VerificationChannel,
} from '../../api/signup';

export interface WizardStep5SupplierProps {
  primaryChannel: VerificationChannel;
  primaryIdentifier: string;
  secondaryEmail?: string;
  secondaryPhone?: string;
  onSuccess: (result: SignupResult) => void;
  onBack: () => void;
}

export function WizardStep5Supplier({
  primaryChannel,
  primaryIdentifier,
  secondaryEmail,
  secondaryPhone,
  onSuccess,
  onBack,
}: WizardStep5SupplierProps) {
  const [businessName, setBusinessName] = useState('Apex Commercial Solutions');
  const [contactName, setContactName] = useState('Baskar Loganathan');
  const [supplierTypes, setSupplierTypes] = useState<string[]>(['Manufacturer', 'Distributor']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([
    'property_facility_management',
    'electrical_power',
  ]);
  const [categories, setCategories] = useState<ServiceCategory[]>(FALLBACK_SERVICE_CATEGORIES);
  const [isCategoryPickerOpen, setIsCategoryPickerOpen] = useState(false);

  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAgreement = useCurrentAgreement('SUPPLIER');
  const agreementVersion = currentAgreement.phase === 'ready' ? currentAgreement.agreement.version : 'latest';

  useEffect(() => {
    let active = true;
    void fetchServiceCategories().then((res) => {
      if (active && res.ok && res.categories.length > 0) {
        setCategories(res.categories);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const typeOptions = [
    'Manufacturer',
    'Distributor',
    'Retail',
    'Service Provider',
    'Contractor',
  ];

  function toggleSupplierType(t: string) {
    setSupplierTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }

  function toggleCategory(code: string) {
    setSelectedCategories((prev) =>
      prev.includes(code) ? prev.filter((x) => x !== code) : [...prev, code]
    );
  }

  const selectedCategoryNames = categories
    .filter((c) => selectedCategories.includes(c.code))
    .map((c) => c.name);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim()) {
      setError('Business name is required');
      return;
    }
    if (selectedCategories.length === 0) {
      setError('Please select at least one supply category');
      return;
    }
    if (!agreementAccepted) {
      setError('Please review and accept the agreement before proceeding');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const nameParts = contactName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Supplier';
    const lastName = nameParts.slice(1).join(' ') || '';

    const email = primaryChannel === 'EMAIL' ? primaryIdentifier : (secondaryEmail || 'supplier@example.com');
    const phone = primaryChannel === 'WHATSAPP' ? primaryIdentifier : (secondaryPhone || '+919876543210');

    try {
      const res = await submitSignupRequest({
        side: 'SUPPLIER',
        businessName: businessName.trim(),
        contactFirstName: firstName,
        contactLastName: lastName,
        designation: supplierTypes.join(', ') || 'Supplier',
        email,
        phone,
        verificationChannel: primaryChannel,
        categoryCodes: selectedCategories,
        coverageCity: 'Bengaluru',
        coveragePincode: '560001',
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
        <WizardProgress step={5} total={5} label="2 / 4 · Supplier Profile" onBack={onBack} />

        <div className="space-y-1">
          <h2 className="text-xl font-black text-foreground">Supplier Profile</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Verification builds buyer trust.
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

          {/* SUPPLIER TYPE */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              SUPPLIER TYPE
            </label>
            <div className="flex flex-wrap gap-1.5">
              {typeOptions.map((t) => {
                const active = supplierTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleSupplierType(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground shadow-2xs'
                        : 'border-border/80 bg-card text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* DOCUMENTS */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              DOCUMENTS
            </label>
            <div className="space-y-1.5">
              <div className="rounded-xl border border-border/70 bg-card p-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">PAN</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold border border-emerald-500/20">
                  <Icon name="check_circle" size={12} />
                  Uploaded
                </span>
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">GST Certificate</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold border border-emerald-500/20">
                  <Icon name="check_circle" size={12} />
                  Uploaded
                </span>
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground">Bank Proof</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-[10px] font-bold border border-amber-500/20">
                  <Icon name="schedule" size={12} />
                  Pending
                </span>
              </div>
            </div>
          </div>

          {/* Categories Selector */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                Categories · {selectedCategoryNames.slice(0, 2).join(', ')}
                {selectedCategoryNames.length > 2 ? ` +${selectedCategoryNames.length - 2}` : ''}
              </label>
              <button
                type="button"
                onClick={() => setIsCategoryPickerOpen(!isCategoryPickerOpen)}
                className="text-xs font-bold text-primary hover:underline"
              >
                {isCategoryPickerOpen ? 'Done' : 'Change'}
              </button>
            </div>

            {isCategoryPickerOpen && (
              <div className="rounded-xl border border-border bg-card p-3 max-h-48 overflow-y-auto space-y-1.5">
                {categories.map((cat) => {
                  const isChecked = selectedCategories.includes(cat.code);
                  return (
                    <label
                      key={cat.code}
                      className="flex items-center gap-2 p-1.5 hover:bg-muted/40 rounded-lg cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCategory(cat.code)}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="font-medium text-foreground">{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* VERIFICATION STATUS STEPPER */}
          <div className="space-y-2 pt-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
              VERIFICATION STATUS
            </label>
            <div className="grid grid-cols-4 gap-1 text-center">
              {[
                { label: 'Submitted', done: true },
                { label: 'Verifying', done: false, active: true },
                { label: 'Verified', done: false },
                { label: 'Active', done: false },
              ].map((step, idx) => (
                <div key={step.label} className="space-y-1">
                  <div
                    className={`h-1.5 rounded-full ${
                      step.done
                        ? 'bg-primary'
                        : step.active
                        ? 'bg-primary/40 animate-pulse'
                        : 'bg-muted'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-bold block ${
                      step.done || step.active ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Identity Shield Callout */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-3 flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed mt-3">
            <Icon name="shield" size={16} className="text-primary shrink-0 mt-0.5" />
            <p className="text-[11px]">
              Your identity stays hidden from buyers until an award is made.
            </p>
          </div>

          {/* EULA Agreement */}
          <div className="pt-2">
            <RegistrationFrozenAgreementPanel
              side="SUPPLIER"
              state={currentAgreement}
              agreementVersion={agreementVersion}
              agreementAccepted={agreementAccepted}
              onAgreementAcceptedChange={setAgreementAccepted}
              checkboxTestId="supplier-frozen-agreement-checkbox"
              panelTestId="supplier-frozen-agreement-panel"
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
