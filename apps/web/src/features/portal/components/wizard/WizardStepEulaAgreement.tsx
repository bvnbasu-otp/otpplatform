import React, { useState } from 'react';
import { type PersonaType } from './WizardStep4Persona';
import { WizardProgress } from './WizardProgress';

export interface WizardStepEulaAgreementProps {
  side: 'BUYER' | 'SUPPLIER';
  persona: PersonaType;
  onAccept: () => void;
  onBack: () => void;
}

export function WizardStepEulaAgreement({
  side,
  persona,
  onAccept,
  onBack,
}: WizardStepEulaAgreementProps) {
  const [agreed, setAgreed] = useState(false);

  const isSupplier = side === 'SUPPLIER' || persona === 'SUPPLIER';

  const getPersonaEulaDetails = () => {
    if (isSupplier) {
      return {
        title: 'Supplier Terms of Service & EULA',
        subtitle: 'Quoting Charter, Confidentiality & Commercial Merit Policy',
        version: 'v2026.11-SUPPLIER',
        summaryPoints: [
          'Identity Protection: Supplier identities stay strictly hidden from buyers until the winning supplier is selected and awarded.',
          'Sealed Quoting: Quotations submitted are sealed; competitors never see your prices or commercial offers.',
          'Platform Fee & Settlement: A transparent 0.50% platform fee applies upon order acceptance and settlement.',
          'Truth & Warranty: All materials, certifications, and delivery commitments must accurately reflect verified capabilities.',
          'Zero-Tolerance Anti-Collusion: Unfair trade practices, identity spoofing, or off-platform collusion lead to immediate de-listing.',
        ],
      };
    }

    if (persona === 'RWA') {
      return {
        title: 'RWA & Housing Society Governance EULA',
        subtitle: 'Community Procurement Charter & Transparent Committee Voting',
        version: 'v2026.11-RWA',
        summaryPoints: [
          'Fair Commercial Comparison: Competing supplier quotes are evaluated without names or bias, judged solely on merit.',
          'Committee Multi-Signoff: Quorum thresholds and multi-member audit trails are recorded immutably for society governance.',
          'Zero Kickbacks: Identity masking protects the management committee from favouritism and outside lobbying.',
          'Direct Settlement: Society settles payments directly with the verified winning supplier under agreed milestones.',
        ],
      };
    }

    if (persona === 'MSME') {
      return {
        title: 'MSME Enterprise Customer Agreement & EULA',
        subtitle: 'Commercial Sourcing, Purchase Orders & Milestone Terms',
        version: 'v2026.11-MSME',
        summaryPoints: [
          'Dual-Speed Sourcing: Choose between Express Quick Orders for rapid requirements or Governed RFQs for structured jobs.',
          'Identity-Protected Merit: Sealed quotations ensure optimal pricing from local manufacturers and registered vendors.',
          'Statutory Integrity: GSTIN validation, TDS computation, and double-entry reconciliation on purchase orders.',
        ],
      };
    }

    return {
      title: 'Individual Buyer Customer Agreement & EULA',
      subtitle: 'Simple, Fair & Fast Personal Procurement Terms',
      version: 'v2026.11-INDIVIDUAL',
      summaryPoints: [
        'Free 1-Click Sourcing: Raise requirements with simple photos, voice notes, or text description with zero committee overhead.',
        'Identity Shield: Your personal contact information is never sold or shared until you award the order to your chosen vendor.',
        'Trusted Suppliers: Local suppliers are verified by GSTIN, past execution records, and pin code service coverage.',
      ],
    };
  };

  const details = getPersonaEulaDetails();

  return (
    <div className="flex flex-col min-h-full p-4 sm:p-6" data-testid="wizard-step-eula">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
          title="Back to persona selection"
          data-testid="btn-eula-back"
        >
          ←
        </button>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Legal &amp; Platform Policy
        </span>
        <span className="text-xs font-mono font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
          {details.version}
        </span>
      </div>

      <WizardProgress step={6} total={9} onBack={onBack} label="Terms & EULA" />

      <div className="mt-3 text-center sm:text-left">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary text-2xl mb-2">
          📜
        </div>
        <h2 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight">
          {details.title}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {details.subtitle}
        </p>
      </div>

      {/* Scrollable EULA terms box */}
      <div className="mt-4 flex-1 rounded-2xl border border-border bg-muted/30 p-3.5 space-y-3 overflow-y-auto max-h-[300px] text-xs">
        <div className="font-semibold text-foreground text-xs border-b border-border/60 pb-2">
          Key Terms &amp; Conditions Summary
        </div>
        <ul className="space-y-2 text-muted-foreground text-[11px] leading-relaxed">
          {details.summaryPoints.map((point, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">✓</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-border/60 pt-2 text-[10px] text-muted-foreground leading-normal">
          By accepting this agreement, you consent to X2O Platform operating policies, data privacy protocols, and authoritative commercial terms. All dispute resolutions are handled under the X2O Arbitration Guidelines.
        </div>
      </div>

      {/* Agreement Checkbox */}
      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <label className="flex items-start gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
            data-testid="eula-agree-checkbox"
          />
          <span className="text-xs font-medium text-foreground leading-snug">
            I have read, understood, and agree to the <span className="font-bold text-primary">{details.title}</span> and Platform Terms of Use.
          </span>
        </label>
      </div>

      {/* Continue Action */}
      <div className="mt-4 pt-2 border-t border-border/60">
        <button
          type="button"
          onClick={onAccept}
          disabled={!agreed}
          className="w-full inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold shadow-md transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          data-testid="btn-eula-accept"
        >
          <span>Accept &amp; Continue</span>
          <span>→</span>
        </button>
      </div>
    </div>
  );
}
