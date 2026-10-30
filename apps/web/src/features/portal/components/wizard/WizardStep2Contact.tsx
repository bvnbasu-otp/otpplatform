import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { WizardProgress } from './WizardProgress';
import type { VerificationChannel } from '../../api/signup';

export interface WizardStep2ContactProps {
  primaryChannel: VerificationChannel;
  primaryIdentifier: string;
  onNext: (secondaryEmail?: string, secondaryPhone?: string) => void;
  onBack: () => void;
}

export function WizardStep2Contact({
  primaryChannel,
  primaryIdentifier,
  onNext,
  onBack,
}: WizardStep2ContactProps) {
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [isSameAsRegistered, setIsSameAsRegistered] = useState(true);

  function handleContinue() {
    const email = primaryChannel === 'EMAIL' ? primaryIdentifier : secondaryEmail.trim();
    const phone = primaryChannel === 'WHATSAPP'
      ? primaryIdentifier
      : (isSameAsRegistered ? primaryIdentifier : secondaryPhone.trim());

    onNext(email || undefined, phone || undefined);
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground justify-between p-4 sm:p-6 max-w-md mx-auto w-full">
      <div>
        <WizardProgress step={2} total={5} label="Contact Details" onBack={onBack} />

        <div className="space-y-1 mb-6">
          <h2 className="text-xl font-black text-foreground">Contact Details</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We&apos;ll use this to keep you updated about your procurement activities.
          </p>
        </div>

        <div className="space-y-4">
          {/* Primary Verified Channel */}
          <div className="rounded-xl border border-border/80 bg-card p-3.5 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {primaryChannel === 'WHATSAPP' ? 'Registered Mobile Number' : 'Registered Email Address'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 text-[10px] font-bold border border-emerald-500/20">
                <Icon name="check_circle" size={12} />
                Verified
              </span>
            </div>
            <p className="text-sm font-bold text-foreground font-mono">{primaryIdentifier}</p>
          </div>

          {/* Secondary Channel Inputs */}
          {primaryChannel === 'WHATSAPP' ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground block">
                Email Address
              </label>
              <div className="relative flex items-center">
                <Icon name="mail" size={18} className="absolute left-3.5 text-muted-foreground" />
                <input
                  type="email"
                  value={secondaryEmail}
                  onChange={(e) => setSecondaryEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Needed for formal purchase orders, quotations, and audit documentation.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="same-phone"
                  checked={isSameAsRegistered}
                  onChange={(e) => setIsSameAsRegistered(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="same-phone" className="text-xs font-medium text-foreground cursor-pointer">
                  My WhatsApp number is the same as my registered number
                </label>
              </div>

              {!isSameAsRegistered && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-foreground block">
                    WhatsApp Number
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-3.5 text-xs font-bold text-muted-foreground select-none">
                      +91 ▾
                    </span>
                    <input
                      type="tel"
                      value={secondaryPhone}
                      onChange={(e) => setSecondaryPhone(e.target.value)}
                      placeholder="98765 43210"
                      className="w-full pl-16 pr-4 py-2.5 rounded-xl border border-border bg-card text-xs font-semibold text-foreground focus:ring-2 focus:ring-primary focus:outline-none transition"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Information & Consent Notes */}
          <div className="rounded-xl bg-muted/40 border border-border/60 p-3 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
            <div className="flex items-start gap-2">
              <Icon name="shield" size={16} className="text-primary shrink-0 mt-0.5" />
              <p>
                You&apos;ll receive transactional updates on WhatsApp and email. Marketing messages need separate consent.
              </p>
            </div>
            <div className="flex items-start gap-2 pt-1 border-t border-border/40 text-[10px]">
              <Icon name="tune" size={14} className="text-muted-foreground shrink-0 mt-0.5" />
              <p>
                You can update these anytime from Profile → Contact Details.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-6 pb-4">
        <Button
          type="button"
          onClick={handleContinue}
          className="w-full py-3.5 text-sm font-bold shadow-sm"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
