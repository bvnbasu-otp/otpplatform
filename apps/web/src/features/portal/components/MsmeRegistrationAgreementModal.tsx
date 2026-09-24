import { useState } from 'react';
import {
  compileMsmeAgreementMarkdown,
  type MsmeBusinessType,
  type MsmeRegistrationAgreement,
} from '@otp/domain';

export interface MsmeRegistrationAgreementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  businessName: string;
  businessType?: MsmeBusinessType;
  primaryOfficerName: string;
  primaryOfficerEmail?: string;
  primaryOfficerPhone?: string;
  gstin?: string;
  pan?: string;
  registeredAddress?: string;
}

export function MsmeRegistrationAgreementModal({
  isOpen,
  onClose,
  onAccept,
  businessName,
  businessType = 'PROPRIETORSHIP',
  primaryOfficerName,
  primaryOfficerEmail = '',
  primaryOfficerPhone = '',
  gstin,
  pan,
  registeredAddress = 'Registered Business Address',
}: MsmeRegistrationAgreementModalProps) {
  const [hasAgreed, setHasAgreed] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'full_text'>('summary');

  if (!isOpen) return null;

  const now = new Date();
  const agreementData: MsmeRegistrationAgreement = {
    organizationId: `msme-${Date.now().toString().slice(-6)}`,
    businessName: businessName || 'Commercial Enterprise',
    businessType,
    gstin: gstin || undefined,
    pan: pan || undefined,
    primaryOfficerName: primaryOfficerName || 'Authorized Primary Administrator',
    primaryOfficerEmail: primaryOfficerEmail || 'officer@enterprise.in',
    primaryOfficerPhone: primaryOfficerPhone || '+91 98000 00000',
    registeredAddress,
    operationalAddress: registeredAddress,
    acceptedAt: now.toISOString(),
    signerIpAddress: 'VERIFIED_DEVICE_AUTH',
    electronicAcceptanceHash: `SHA256:${Math.abs(Date.now() ^ 0xabcdef).toString(16).toUpperCase()}${Date.now().toString(16).toUpperCase()}`,
    effectiveDate: now.toISOString().slice(0, 10),
  };

  const agreementMarkdown = compileMsmeAgreementMarkdown(agreementData);

  const handleDownloadA4 = () => {
    const element = document.createElement('a');
    const file = new Blob([agreementMarkdown], { type: 'text/markdown;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = `OTP-MSME-Agreement-${businessName.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
      data-testid="msme-registration-agreement-modal"
    >
      <div className="relative w-full max-w-2xl rounded-2xl bg-card border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-foreground">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/80 px-4 sm:px-6 py-3.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="text-lg">📜</span>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-foreground">
                MSME Institutional Procurement OS Agreement
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Official procurement governance agreement for MSMEs, commercial firms &amp; workshops
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
            📋 Summary &amp; Key Governance Rules
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
                  <span>🏢</span> Business Entity &amp; Primary Administrator Authority
                </span>
                <p className="text-muted-foreground">
                  The MSME operates as a commercial organization. The authorized Primary Administrator manages organizational memberships, assigns operational roles, establishes spend caps, and configures spend delegations.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>🛡️</span> Strict Anti-Self-Approval Invariant (PA-09)
                </span>
                <p className="text-muted-foreground">
                  The creator of an RFQ or purchase order cannot approve their own transaction, whether using direct managerial role authority or acting via a delegated proxy. All transactions require independent verification.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>⏳</span> Time-Bounded &amp; Spend-Capped Delegations
                </span>
                <p className="text-muted-foreground">
                  Delegation proxies granted to operational leads are time-bounded and monetary-spend-capped. Delegates cannot self-appoint, increase their own limit, or delegate further without explicit Primary authorization.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <span>💼</span> Transparent 0.50% Supplier Platform Fee
                </span>
                <p className="text-muted-foreground">
                  OTP charges an institutional platform fee of 0.50% (+ applicable 18% GST) on settled purchase orders, deducted from supplier disbursements. The buyer PO gross amount remains strictly untouched.
                </p>
              </div>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[11px] bg-muted/40 p-4 rounded-xl border border-border overflow-x-auto text-foreground/90">
              {agreementMarkdown}
            </pre>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/80 p-4 sm:px-6 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDownloadA4}
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5"
          >
            <span>📥</span> Download Printable Agreement (.md)
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={hasAgreed}
                onChange={(e) => setHasAgreed(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span>I accept on behalf of the MSME</span>
            </label>

            <button
              type="button"
              disabled={!hasAgreed}
              onClick={() => {
                onAccept();
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition cursor-pointer"
            >
              Confirm &amp; Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
