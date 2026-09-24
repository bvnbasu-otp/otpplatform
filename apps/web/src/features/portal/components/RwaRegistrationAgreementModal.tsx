import { useState } from 'react';
import {
  compileRwaAgreementMarkdown,
  type RwaCanonicalRole,
  type RwaRegistrationAgreement,
} from '@otp/domain';

export interface RwaRegistrationAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  organizationName: string;
  authorizedOfficerName: string;
  authorizedOfficerRole?: string;
  panOrGstin?: string;
}

export function RwaRegistrationAgreementModal({
  isOpen,
  onClose,
  onAccept,
  organizationName,
  authorizedOfficerName,
  authorizedOfficerRole = 'SECRETARY',
  panOrGstin,
}: RwaRegistrationAgreementModalProps) {
  const [hasAgreed, setHasAgreed] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'full_text'>('summary');

  if (!isOpen) return null;

  const agreementData: RwaRegistrationAgreement = {
    organizationName: organizationName || 'Residential Welfare Association',
    authorizedOfficerName: authorizedOfficerName || 'Authorized Officer',
    authorizedOfficerRole: (authorizedOfficerRole as RwaCanonicalRole) || 'SECRETARY',
    effectiveDate: new Date().toISOString(),
    jurisdictionState: 'India',
    panOrGstin: panOrGstin || 'SOCIETIES REGISTRATION ACT / RWA CHARTER',
    acceptedElectronically: true,
    agreementReference: `OTP-AGR-RWA-${Date.now().toString().slice(-6)}`,
  };

  const agreementMarkdown = compileRwaAgreementMarkdown(agreementData);

  const handleDownloadA4 = () => {
    const element = document.createElement('a');
    const file = new Blob([agreementMarkdown], { type: 'text/markdown;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `OTP-RWA-Agreement-${organizationName.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
      data-testid="rwa-registration-agreement-modal"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 sm:px-6 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-lg">📜</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                RWA Institutional Organization Agreement
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Official registration agreement for residential societies &amp; apartment associations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            aria-label="Close agreement"
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border px-4 sm:px-6 pt-2 gap-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`pb-2 border-b-2 transition ${
              activeTab === 'summary'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            📋 Summary &amp; Key Responsibilities
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('full_text')}
            className={`pb-2 border-b-2 transition ${
              activeTab === 'full_text'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            📄 Full Legal Text (A4 Form)
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs leading-relaxed">
          {activeTab === 'summary' ? (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <span>🏛️</span> Organization Identity &amp; Non-Personal Liability
                </span>
                <p className="text-muted-foreground">
                  The RWA acts as a governed legal entity. Sourcing commitments and purchase orders issued by authorized committee officers bind the association collectively and do not impose personal liability on individual residents.
                </p>
              </div>

              <div className="rounded-xl border border-amber-300/40 bg-amber-500/5 p-3.5 space-y-2">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1.5">
                  <span>🗳️</span> Committee Governance &amp; Manager Separation
                </span>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Estate &amp; Facility Managers:</strong> Authorized for operational drafting, supplier inquiries, and delivery inspection, but hold zero voting authority (<code className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">canVote = false</code>).
                  </li>
                  <li>
                    <strong className="text-foreground">Governing Officers:</strong> President, Secretary, Treasurer, and Committee Members make democratic award determinations with mandatory quorum compliance.
                  </li>
                  <li>
                    <strong className="text-foreground">365-Day Term &amp; Succession:</strong> Officer roles expire on a 365-day annual cycle. Past decisions remain permanently attributed to the historical actor who signed off.
                  </li>
                </ul>
              </div>

              <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>💳</span> Direct Bilateral Contracting &amp; Non-Custodial Model
                </span>
                <p className="text-muted-foreground">
                  All commercial agreements are executed directly between your RWA and the awarded supplier. OTP operates as an execution OS and does not hold procurement payments in escrow or charge hidden commissions.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-muted/20 p-4 font-mono text-[11px] whitespace-pre-wrap leading-normal text-muted-foreground">
              {agreementMarkdown}
            </div>
          )}
        </div>

        {/* Footer & Acceptance */}
        <div className="border-t border-border/80 p-4 sm:px-6 bg-muted/20 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasAgreed}
              onChange={(e) => setHasAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/20 accent-primary"
              data-testid="rwa-agreement-checkbox"
            />
            <span className="text-xs text-foreground font-medium">
              I certify that I am authorized to register <strong>{organizationName || 'this RWA'}</strong> and agree to the OTP Organization Agreement on behalf of the association.
            </span>
          </label>

          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleDownloadA4}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition min-h-[44px]"
            >
              <span>📥</span>
              <span>Download Printable A4 (.md)</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition min-h-[44px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!hasAgreed}
                onClick={() => {
                  onAccept();
                  onClose();
                }}
                className="w-1/2 sm:w-auto px-5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-xs min-h-[44px]"
                data-testid="rwa-agreement-accept-btn"
              >
                Accept &amp; Continue →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
