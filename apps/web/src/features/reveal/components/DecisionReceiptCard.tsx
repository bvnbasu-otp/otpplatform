import React, { useState } from 'react';
import type { CanonicalDecisionReceipt } from '@otp/domain';
import { verifyDecisionReceiptIntegrity } from '@otp/domain';

export interface DecisionReceiptCardProps {
  receipt: CanonicalDecisionReceipt;
  showVerificationBadge?: boolean;
  collapsible?: boolean;
  defaultExpanded?: boolean;
}

function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function DecisionReceiptCard({
  receipt,
  showVerificationBadge = true,
  collapsible = false,
  defaultExpanded = true,
}: DecisionReceiptCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const verification = verifyDecisionReceiptIntegrity(receipt);

  const handleCopyHash = () => {
    navigator.clipboard?.writeText(receipt.cryptographicAuditHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const {
    buyerPersona,
    buyerContext,
    selectedOffer,
    meritEvaluation,
    authorityAttribution,
    governanceRecord,
    timestamps,
  } = receipt;

  return (
    <div
      className="rounded-2xl border border-primary/20 bg-card text-card-foreground shadow-sm overflow-hidden"
      data-testid="canonical-decision-receipt-card"
    >
      {/* Header */}
      <div className="bg-primary/5 p-4 sm:p-5 border-b border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-primary/15 text-primary">
              Institutional Decision Receipt
            </span>
            <span className="text-xs font-mono font-bold text-muted-foreground">
              {receipt.receiptId}
            </span>
          </div>

          {showVerificationBadge && (
            <div className="flex items-center gap-1.5">
              {verification.valid ? (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  data-testid="receipt-verification-pass"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  Tamper-Evident SHA-256 Verified
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                  data-testid="receipt-verification-fail"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Integrity Mismatch
                </span>
              )}
            </div>
          )}
        </div>

        <h3 className="mt-2 text-base sm:text-lg font-black text-foreground">
          {receipt.rfqTitle}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Reference: <span className="font-mono">{receipt.rfqRefNumber}</span> · Generated: {new Date(timestamps.receiptGeneratedAt).toLocaleString('en-IN')}
        </p>
      </div>

      {collapsible && (
        <div className="px-4 py-2 border-b bg-muted/20 flex justify-between items-center text-xs">
          <span className="font-semibold text-muted-foreground">Detailed Procurement Audit Artifact</span>
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="text-primary font-bold hover:underline"
          >
            {isExpanded ? '▲ Collapse Receipt' : '▼ Expand Full Proof'}
          </button>
        </div>
      )}

      {isExpanded && (
        <div className="p-4 sm:p-5 space-y-5 text-sm">
          {/* Selected Offer & Commercial Landed Cost */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Selected Winning Offer
                </span>
                <strong className="text-sm font-black text-foreground">
                  {selectedOffer.businessName || `Identity-Protected (${selectedOffer.maskedSupplierLabel})`}
                </strong>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                  Total Landed Cost
                </span>
                <strong className="text-base font-black text-primary">
                  {inr(selectedOffer.totalLandedCost)}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block">Base Amount</span>
                <span className="font-mono font-bold text-foreground">{inr(selectedOffer.baseAmount)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">GST ({selectedOffer.gstRate}%)</span>
                <span className="font-mono font-bold text-foreground">{inr(selectedOffer.gstAmount)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Delivery TAT</span>
                <span className="font-bold text-foreground">{selectedOffer.deliveryTimelineDays} Days</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Warranty</span>
                <span className="font-bold text-foreground">{selectedOffer.warrantyPeriodMonths} Months</span>
              </div>
            </div>

            {selectedOffer.cgstAmount > 0 && (
              <div className="text-[11px] text-muted-foreground bg-background/60 p-2 rounded border border-border/40 flex justify-between">
                <span>Statutory Split (Intra-State):</span>
                <span>CGST: {inr(selectedOffer.cgstAmount)} · SGST: {inr(selectedOffer.sgstAmount)}</span>
              </div>
            )}
            {selectedOffer.igstAmount > 0 && (
              <div className="text-[11px] text-muted-foreground bg-background/60 p-2 rounded border border-border/40 flex justify-between">
                <span>Statutory Split (Inter-State):</span>
                <span>IGST (100%): {inr(selectedOffer.igstAmount)}</span>
              </div>
            )}
          </div>

          {/* Objective Merit Evaluation */}
          <div className="rounded-xl border p-4 space-y-2">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Merit Evaluation & Competitive Tension
            </span>
            <div className="flex flex-wrap items-baseline gap-4 text-xs">
              <div>
                <span className="text-muted-foreground">Rank: </span>
                <strong className="text-foreground">#{meritEvaluation.rank} of {meritEvaluation.totalQuotesEvaluated}</strong>
              </div>
              {meritEvaluation.score !== null && (
                <div>
                  <span className="text-muted-foreground">Merit Score: </span>
                  <strong className="text-foreground">{meritEvaluation.score.toFixed(1)}/10</strong>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Lowest Available: </span>
                <strong className="text-foreground">{inr(meritEvaluation.lowestTotalCost)}</strong>
              </div>
            </div>
            <p className="text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/40">
              <strong className="text-foreground">Consensus Rationale:</strong> {meritEvaluation.consensusJustification}
            </p>
          </div>

          {/* Governance & Authority Attributions */}
          <div className="rounded-xl border p-4 space-y-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Governance & Authority Sign-off
            </span>

            {buyerPersona === 'INDIVIDUAL' && (
              <div className="text-xs space-y-1">
                <p className="text-foreground font-semibold">Individual Personal Procurement</p>
                <p className="text-muted-foreground">
                  Direct 1-click confirmation executed by buyer {authorityAttribution.awardedByName} at {new Date(timestamps.awardedAt).toLocaleTimeString('en-IN')}.
                </p>
              </div>
            )}

            {buyerPersona === 'RWA' && governanceRecord.rwaCommitteeVoting && (
              <div className="text-xs space-y-2">
                <div className="flex justify-between items-center bg-muted/30 p-2 rounded">
                  <span className="font-semibold text-foreground">RWA Democratic Committee Voting (PA-01)</span>
                  <span className="font-bold text-primary">
                    Quorum: {governanceRecord.rwaCommitteeVoting.unconflictedVotes}/{governanceRecord.rwaCommitteeVoting.quorumRequired} (Required &ge; {governanceRecord.rwaCommitteeVoting.quorumRequired})
                  </span>
                </div>
                <div className="space-y-1">
                  {governanceRecord.rwaCommitteeVoting.votes.map((v, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-muted-foreground border-b border-border/30 pb-1">
                      <span>{v.voterRole} ({v.voterProfileId.slice(0, 8)})</span>
                      <span>Power: {v.votingPower} · {v.hasConflict ? 'Recused (COI)' : 'Cleared & Voted'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {buyerPersona === 'MSME' && governanceRecord.msmeSpendGovernance && (
              <div className="text-xs space-y-2">
                <div className="flex justify-between items-center bg-muted/30 p-2 rounded">
                  <span className="font-semibold text-foreground">MSME Spend Governance & Anti-Self-Approval (PA-09)</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">Policy Satisfied</span>
                </div>
                <div className="space-y-1">
                  {governanceRecord.msmeSpendGovernance.stages.map((s, i) => (
                    <div key={i} className="flex justify-between text-[11px] text-muted-foreground border-b border-border/30 pb-1">
                      <span>Stage {s.stageOrder} ({s.tierLevel.replace(/_/g, ' ')})</span>
                      <span>{s.status} by {s.approvedBy.slice(0, 8)} ({s.signatureMode})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Cryptographic Hash & Verification Stamp */}
          <div className="rounded-xl border bg-slate-950 text-slate-100 p-3.5 space-y-2 font-mono text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[10px] uppercase font-bold text-slate-400">Cryptographic Audit Hash (HMAC-SHA256)</span>
              <button
                type="button"
                onClick={handleCopyHash}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors uppercase font-bold"
              >
                {copied ? '✓ Copied' : 'Copy Hash'}
              </button>
            </div>
            <p className="text-[11px] break-all leading-relaxed text-slate-300 select-all" data-testid="receipt-audit-hash">
              {receipt.cryptographicAuditHash}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
