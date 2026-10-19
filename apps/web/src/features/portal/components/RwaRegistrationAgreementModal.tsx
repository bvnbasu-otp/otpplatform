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
  /** Worksheet preview. Does not record legal acceptance. */
  viewOnly?: boolean;
  organizationName: string;
  authorizedOfficerName: string;
  authorizedOfficerRole?: string;
  panOrGstin?: string;
}

export function RwaRegistrationAgreementModal({
  isOpen,
  onClose,
  onAccept,
  viewOnly = false,
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

  const handlePrintPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.print();
      return;
    }
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>OTP RWA Agreement - ${agreementData.organizationName}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; line-height: 1.5; font-size: 11pt; padding: 20px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .brand-title { font-size: 18pt; font-weight: 900; text-transform: uppercase; margin: 0; color: #0f172a; }
    .brand-sub { font-size: 10pt; color: #475569; font-weight: 600; margin-top: 4px; }
    .meta-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 20px; font-size: 10pt; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .clause-title { font-size: 12pt; font-weight: bold; margin-top: 16px; margin-bottom: 6px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    .clause-text { font-size: 10pt; color: #334155; margin-bottom: 8px; text-align: justify; }
    .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 9pt; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-weight: 900; font-size: 12pt; color: #0284c7; letter-spacing: 1px;">OPEN TRADE &amp; PROCUREMENT PLATFORM (OTP)</div>
      <h1 class="brand-title">RWA Institutional Governance Agreement</h1>
      <div class="brand-sub">Residential Welfare Association &amp; Housing Society Procurement Charter</div>
    </div>
    <div style="text-align: right; font-size: 9pt; color: #64748b;">
      <strong>Ref:</strong> ${agreementData.agreementReference}<br>
      <strong>Effective Date:</strong> ${agreementData.effectiveDate.slice(0, 10)}
    </div>
  </div>

  <div class="meta-box">
    <div class="meta-grid">
      <div><strong>Association Name:</strong> ${agreementData.organizationName}</div>
      <div><strong>Authorized Representative:</strong> ${agreementData.authorizedOfficerName}</div>
      <div><strong>Governance Role:</strong> ${agreementData.authorizedOfficerRole}</div>
      <div><strong>Charter / PAN / GST:</strong> ${agreementData.panOrGstin}</div>
      <div><strong>Jurisdiction:</strong> ${agreementData.jurisdictionState}</div>
      <div><strong>Electronic Signature:</strong> Authenticated Admin Session</div>
    </div>
  </div>

  <div class="content">
    <div class="clause-title">1. Institutional Purpose and Authority</div>
    <div class="clause-text">This institutional charter empowers the Management Committee of ${agreementData.organizationName} to conduct competitive sourcing, vendor discovery, multi-member quote evaluation, and collective approval on the Open Trade &amp; Procurement Platform (OTP).</div>

    <div class="clause-title">2. Quorum and Weighted Voting Safeguards</div>
    <div class="clause-text">Procurement decisions over defined spend thresholds require quorum participation. Resident owners and committee members cast weighted votes (1–4) according to society bylaws. Estate managers carry operational-only authority without voting or self-approval privileges.</div>

    <div class="clause-title">3. Identity Protection &amp; Anti-Collusion Rules</div>
    <div class="clause-text">Supplier identities and detailed quotes remain sealed until the quotation deadline. Platform operators and committee members cannot access vendor pricing prematurely, eliminating bias, favouritism, and kickbacks.</div>

    <div class="clause-title">4. Direct Settlement &amp; Zero Commission</div>
    <div class="clause-text">All society funds flow directly from the RWA bank account to the selected vendor upon milestone verification. OTP never holds society funds in escrow and extracts 0% transaction commission.</div>

    <div class="clause-title">5. Auditable Ledger for AGM Compliance</div>
    <div class="clause-text">Every RFQ, committee vote, score matrix, and approval is immutably snapshotted and exportable as a signed report for society auditors and the Annual General Body Meeting (AGM).</div>
  </div>

  <div class="footer">
    Open Trade &amp; Procurement Platform (OTP) · Statutory RWA Record · Verifiable at https://otpplatform.com
  </div>
  <script>
    window.onload = function() { window.print(); };
  </script>
</body>
</html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

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
          {!viewOnly && (
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
          )}

          <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={handlePrintPdf}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition min-h-[44px] shadow-2xs cursor-pointer"
              >
                <span>🖨️</span>
                <span>Print / Save PDF (A4)</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadA4}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted text-muted-foreground transition min-h-[44px] cursor-pointer"
              >
                <span>📥</span>
                <span>(.md)</span>
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted text-foreground transition min-h-[44px]"
              >
                Cancel
              </button>
              {!viewOnly && (
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
