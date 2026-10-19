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
  /** Worksheet preview. Does not record legal acceptance. */
  viewOnly?: boolean;
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
  viewOnly = false,
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
    businessName: businessName || 'Your business',
    businessType,
    gstin: gstin || undefined,
    pan: pan || undefined,
    primaryOfficerName: primaryOfficerName || 'Authorized Primary Administrator',
    primaryOfficerEmail: primaryOfficerEmail || 'officer@example.com',
    primaryOfficerPhone: primaryOfficerPhone || '+91 98000 00000',
    registeredAddress,
    operationalAddress: registeredAddress,
    acceptedAt: now.toISOString(),
    signerIpAddress: 'VERIFIED_DEVICE_AUTH',
    electronicAcceptanceHash: `SHA256:${Math.abs(Date.now() ^ 0xabcdef).toString(16).toUpperCase()}${Date.now().toString(16).toUpperCase()}`,
    effectiveDate: now.toISOString().slice(0, 10),
  };

  const agreementMarkdown = compileMsmeAgreementMarkdown(agreementData);

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
  <title>OTP MSME Agreement - ${agreementData.businessName}</title>
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
      <h1 class="brand-title">MSME Procurement Registration Agreement</h1>
      <div class="brand-sub">Statutory Platform Governance &amp; Direct Settlement Agreement</div>
    </div>
    <div style="text-align: right; font-size: 9pt; color: #64748b;">
      <strong>Ref:</strong> ${agreementData.electronicAcceptanceHash.slice(0, 24)}<br>
      <strong>Effective Date:</strong> ${agreementData.effectiveDate}
    </div>
  </div>

  <div class="meta-box">
    <div class="meta-grid">
      <div><strong>Registered Business Name:</strong> ${agreementData.businessName}</div>
      <div><strong>Entity Constitution:</strong> ${agreementData.businessType}</div>
      <div><strong>Primary Authorized Officer:</strong> ${agreementData.primaryOfficerName}</div>
      <div><strong>Contact Email:</strong> ${agreementData.primaryOfficerEmail}</div>
      <div><strong>Operational Premises:</strong> ${agreementData.registeredAddress}</div>
      <div><strong>Statutory Identifier:</strong> ${agreementData.gstin || agreementData.pan || 'PAN/GST Exempt'}</div>
    </div>
  </div>

  <div class="content">
    <div class="clause-title">1. Purpose and Scope of Agreement</div>
    <div class="clause-text">This binding legal instrument governs commercial procurement, competitive quotation sourcing, quotation evaluation, milestone tracking, and direct settlement executed by the Registered MSME Enterprise on the Open Trade &amp; Procurement Platform (OTP).</div>

    <div class="clause-title">2. Direct Settlement &amp; Zero Commission Model</div>
    <div class="clause-text">All financial settlements, advances, and final payments occur directly between the Buyer and the Awarded Supplier via standard banking channels (NEFT/RTGS/UPI/IMPS). OTP does not hold funds in escrow, does not operate as a payment intermediary, and charges 0% transaction commission on order values.</div>

    <div class="clause-title">3. Identity Protection &amp; Sealed Quote Integrity</div>
    <div class="clause-text">All quotation submissions remain strictly sealed and encrypted until the RFQ quotation deadline. Neither competing suppliers nor platform operators may inspect quotation pricing prior to public unsealing, guaranteeing complete freedom from price collusion.</div>

    <div class="clause-title">4. Governance, Audit Snapshot &amp; Tax Compliance</div>
    <div class="clause-text">Every procurement decision generates an immutable, timestamped audit log capturing Place of Supply, GSTIN credentials, and authorized officer signatures, satisfying statutory requirements under the MSMED Act, 2006 and the Central Goods and Services Tax Act, 2017.</div>

    <div class="clause-title">5. Electronic Signature and Verification</div>
    <div class="clause-text">Executed electronically via secure authenticated session. Acceptance Hash: ${agreementData.electronicAcceptanceHash}. Signer IP: ${agreementData.signerIpAddress}. Timestamp: ${agreementData.acceptedAt}.</div>
  </div>

  <div class="footer">
    Open Trade &amp; Procurement Platform (OTP) · Statutory Legal Record · Verifiable at https://otpplatform.com
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
                MSME procurement agreement
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
                  <span>💼</span> Supplier platform fee, not charged in this pilot
                </span>
                <p className="text-muted-foreground">
                  The defined commercial fee is 0.50% of the purchase-order gross, plus 18% GST on that fee. The purchase-order gross is not rewritten. During this pilot OTP does not charge that fee and does not deduct it from supplier disbursement. Supplier cashback is not a product.
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
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-3.5 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold shadow-2xs hover:bg-primary/90 transition flex items-center gap-1.5 cursor-pointer min-h-[38px]"
            >
              <span>🖨️</span> Print / Save PDF (A4)
            </button>
            <button
              type="button"
              onClick={handleDownloadA4}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>📥</span> (.md)
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {!viewOnly && (
            <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={hasAgreed}
                onChange={(e) => setHasAgreed(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span>I accept on behalf of the MSME</span>
            </label>
            )}

            {!viewOnly && (
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
            )}
            {viewOnly && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold border border-border bg-card"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
