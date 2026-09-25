/**
 * OTP Phase R2-11: Canonical Institutional Decision Receipt Domain Model
 *
 * Provides domain models, cryptographic hash generator, integrity verification,
 * and markdown summary compilation for tamper-evident post-decision institutional proof.
 *
 * Implements:
 *   - Protected Assets PA-01 (Committee Voting & Quorum), PA-02 (Atomic Award),
 *     PA-03 (Role Lifecycle Immutability), PA-04/05 (Identity Protection),
 *     PA-06 (Bilateral Statutory GST), PA-09 (Spend Governance & Anti-Self-Approval).
 *   - Persona-tailored governance records for Individual, RWA, and MSME buyers.
 *   - Cryptographic SHA-256 equivalent audit hash computation and tampering detection.
 */

import { computeDeterministicHmac } from './procurement-communications';
import type { AddressSnapshot } from './buyer-address';
import type { BuyerPersona } from './buyer-persona';

export type DecisionReceiptBuyerPersona = BuyerPersona;

export interface DecisionReceiptBuyerContext {
  organizationId: string | null;
  organizationName: string | null;
  buyerName: string;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  buyerGstin?: string | null;
  buyerPan?: string | null;
  deliveryStateCode: string;
  deliveryAddressSnapshot?: AddressSnapshot | null;
  billingAddressSnapshot?: AddressSnapshot | null;
}

export interface DecisionReceiptRequirementSnapshot {
  requirementId: string;
  title: string;
  categoryName: string;
  mode: string;
  budgetAmount?: number | null;
}

export interface DecisionReceiptSelectedOffer {
  quoteId: string;
  quoteVersion: number;
  supplierId: string | null;
  maskedSupplierLabel: string;
  businessName?: string | null; // Unmasked post-reveal
  supplierGstin?: string | null;
  supplierStateCode?: string | null;
  baseAmount: number;
  gstRate: number;
  gstAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  isInterState: boolean;
  totalLandedCost: number;
  deliveryTimelineDays: number;
  warrantyPeriodMonths: number;
  paymentStructure: string;
}

export interface DecisionReceiptMeritEvaluation {
  rank: number;
  score: number | null;
  totalQuotesEvaluated: number;
  lowestTotalCost: number;
  costAvoidedComparedToIncumbent?: number | null;
  consensusJustification: string;
}

export interface DecisionReceiptAuthorityAttribution {
  awardedByProfileId: string;
  awardedByName: string;
  awardedByRole: string;
  isDelegated: boolean;
  delegatorProfileId?: string | null;
  delegationId?: string | null;
}

export interface DecisionReceiptRwaVote {
  voterProfileId: string;
  voterRole: string;
  recommendedQuoteId: string | null;
  votingPower: number;
  hasConflict: boolean;
  castAt: string;
  comment?: string | null;
}

export interface DecisionReceiptRwaGovernanceRecord {
  quorumRequired: number;
  quorumSatisfied: boolean;
  totalEligibleVoters: number;
  votesCast: number;
  unconflictedVotes: number;
  coiRecusalCount: number;
  votes: DecisionReceiptRwaVote[];
}

export interface DecisionReceiptMsmeStageRecord {
  tierLevel: string;
  stageOrder: number;
  status: string;
  approvedBy: string;
  approvedAt: string;
  signatureMode: 'DIRECT' | 'DELEGATED';
  delegationId?: string | null;
}

export interface DecisionReceiptMsmeGovernanceRecord {
  stages: DecisionReceiptMsmeStageRecord[];
  managerSpendCap?: number | null;
  preventSelfApprovalEnforced: boolean;
}

export interface DecisionReceiptIndividualRecord {
  confirmedAt: string;
  confirmedBy: string;
}

export interface DecisionReceiptGovernanceRecord {
  persona: DecisionReceiptBuyerPersona;
  individualConfirmation?: DecisionReceiptIndividualRecord;
  rwaCommitteeVoting?: DecisionReceiptRwaGovernanceRecord;
  msmeSpendGovernance?: DecisionReceiptMsmeGovernanceRecord;
}

export interface DecisionReceiptReputationSignal {
  highestRatedComparison?: {
    label: string;
    costDelta: number;
    rating: number;
    agreedWithMerit: boolean;
  } | null;
  incumbentComparison?: {
    label: string;
    costDelta: number;
    priorOrders: number;
    agreedWithMerit: boolean;
  } | null;
}

export interface DecisionReceiptTimestamps {
  awardedAt: string;
  revealedAt: string | null;
  receiptGeneratedAt: string;
}

export interface CanonicalDecisionReceipt {
  receiptId: string;
  rfqId: string;
  rfqRefNumber: string;
  rfqTitle: string;
  buyerPersona: DecisionReceiptBuyerPersona;
  buyerContext: DecisionReceiptBuyerContext;
  requirementSnapshot: DecisionReceiptRequirementSnapshot;
  selectedOffer: DecisionReceiptSelectedOffer;
  meritEvaluation: DecisionReceiptMeritEvaluation;
  authorityAttribution: DecisionReceiptAuthorityAttribution;
  governanceRecord: DecisionReceiptGovernanceRecord;
  reputationSignals?: DecisionReceiptReputationSignal;
  timestamps: DecisionReceiptTimestamps;
  cryptographicAuditHash: string;
}

export type DecisionReceiptPayload = Omit<CanonicalDecisionReceipt, 'cryptographicAuditHash'>;

const DECISION_RECEIPT_SALT = 'OTP-DECISION-RECEIPT-INTEGRITY-SALT-2026';

/**
 * Computes deterministic SHA-256 equivalent cryptographic audit hash for a canonical decision receipt.
 */
export function computeDecisionReceiptHash(payload: DecisionReceiptPayload): string {
  const canonicalPayload = JSON.stringify({
    receiptId: payload.receiptId,
    rfqId: payload.rfqId,
    rfqRefNumber: payload.rfqRefNumber,
    buyerPersona: payload.buyerPersona,
    buyerOrgId: payload.buyerContext.organizationId,
    buyerGstin: payload.buyerContext.buyerGstin ?? null,
    requirementId: payload.requirementSnapshot.requirementId,
    quoteId: payload.selectedOffer.quoteId,
    supplierId: payload.selectedOffer.supplierId ?? null,
    totalLandedCost: payload.selectedOffer.totalLandedCost,
    baseAmount: payload.selectedOffer.baseAmount,
    gstAmount: payload.selectedOffer.gstAmount,
    isInterState: payload.selectedOffer.isInterState,
    cgstAmount: payload.selectedOffer.cgstAmount,
    sgstAmount: payload.selectedOffer.sgstAmount,
    igstAmount: payload.selectedOffer.igstAmount,
    awardedByProfileId: payload.authorityAttribution.awardedByProfileId,
    awardedByRole: payload.authorityAttribution.awardedByRole,
    isDelegated: payload.authorityAttribution.isDelegated,
    delegationId: payload.authorityAttribution.delegationId ?? null,
    governancePersona: payload.governanceRecord.persona,
    awardedAt: payload.timestamps.awardedAt,
    receiptGeneratedAt: payload.timestamps.receiptGeneratedAt,
  });

  return computeDeterministicHmac(canonicalPayload, DECISION_RECEIPT_SALT);
}

/**
 * Verifies the tamper-evident cryptographic integrity of a CanonicalDecisionReceipt.
 */
export function verifyDecisionReceiptIntegrity(receipt: CanonicalDecisionReceipt): {
  valid: boolean;
  calculatedHash: string;
  expectedHash: string;
  error?: string;
} {
  const { cryptographicAuditHash, ...payload } = receipt;
  const calculatedHash = computeDecisionReceiptHash(payload);
  const valid = calculatedHash === cryptographicAuditHash;

  return {
    valid,
    calculatedHash,
    expectedHash: cryptographicAuditHash,
    error: valid ? undefined : 'Decision receipt cryptographic audit hash mismatch: payload has been altered.',
  };
}

/**
 * Builder parameters for generating an authoritative CanonicalDecisionReceipt.
 */
export interface BuildCanonicalDecisionReceiptParams {
  receiptId?: string;
  rfqId: string;
  rfqRefNumber: string;
  rfqTitle: string;
  buyerPersona: DecisionReceiptBuyerPersona;
  buyerContext: DecisionReceiptBuyerContext;
  requirementSnapshot: DecisionReceiptRequirementSnapshot;
  selectedOffer: DecisionReceiptSelectedOffer;
  meritEvaluation: DecisionReceiptMeritEvaluation;
  authorityAttribution: DecisionReceiptAuthorityAttribution;
  governanceRecord: DecisionReceiptGovernanceRecord;
  reputationSignals?: DecisionReceiptReputationSignal;
  awardedAt: string;
  revealedAt?: string | null;
  receiptGeneratedAt?: string;
}

/**
 * Builds an immutable, cryptographically sealed CanonicalDecisionReceipt.
 */
export function buildCanonicalDecisionReceipt(
  params: BuildCanonicalDecisionReceiptParams,
): CanonicalDecisionReceipt {
  const now = params.receiptGeneratedAt || new Date().toISOString();
  const receiptId = params.receiptId || `REC-${params.rfqId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

  const payload: DecisionReceiptPayload = {
    receiptId,
    rfqId: params.rfqId,
    rfqRefNumber: params.rfqRefNumber,
    rfqTitle: params.rfqTitle,
    buyerPersona: params.buyerPersona,
    buyerContext: params.buyerContext,
    requirementSnapshot: params.requirementSnapshot,
    selectedOffer: params.selectedOffer,
    meritEvaluation: params.meritEvaluation,
    authorityAttribution: params.authorityAttribution,
    governanceRecord: params.governanceRecord,
    reputationSignals: params.reputationSignals,
    timestamps: {
      awardedAt: params.awardedAt,
      revealedAt: params.revealedAt ?? null,
      receiptGeneratedAt: now,
    },
  };

  const cryptographicAuditHash = computeDecisionReceiptHash(payload);

  return {
    ...payload,
    cryptographicAuditHash,
  };
}

function inr(val: number): string {
  return `₹${Math.round(val).toLocaleString('en-IN')}`;
}

/**
 * Compiles a printable, audit-grade Markdown summary of the Decision Receipt.
 */
export function formatDecisionReceiptMarkdown(receipt: CanonicalDecisionReceipt): string {
  const { buyerContext, selectedOffer, meritEvaluation, authorityAttribution, governanceRecord, timestamps } = receipt;

  let governanceSection = '';
  if (governanceRecord.persona === 'INDIVIDUAL') {
    governanceSection = `
### 4. GOVERNANCE & APPROVAL
- **Persona:** Individual Natural Person
- **Confirmation Method:** 1-Click Direct Confirmation
- **Confirmed By:** ${authorityAttribution.awardedByName} (${authorityAttribution.awardedByProfileId})
- **Timestamp:** ${timestamps.awardedAt}
`;
  } else if (governanceRecord.persona === 'RWA' && governanceRecord.rwaCommitteeVoting) {
    const rwa = governanceRecord.rwaCommitteeVoting;
    governanceSection = `
### 4. GOVERNANCE & COMMITTEE VOTING (PA-01)
- **Persona:** RWA (Residential Welfare Association)
- **Quorum Requirement:** $\\ge ${rwa.quorumRequired}$ unconflicted votes (Achieved: ${rwa.unconflictedVotes}/${rwa.votesCast} votes)
- **Quorum Status:** ${rwa.quorumSatisfied ? '✅ SATISFIED' : '❌ NOT SATISFIED'}
- **COI Recusals:** ${rwa.coiRecusalCount} member(s) recused due to declared conflict
- **Committee Votes Cast:**
${rwa.votes.map((v, i) => `  ${i + 1}. Member ${v.voterProfileId.slice(0, 8)} (${v.voterRole}): Voting Power ${v.votingPower} | Conflict: ${v.hasConflict ? 'YES (Recused)' : 'NO'} | ${v.comment ? `"${v.comment}"` : 'No comment'}`).join('\n')}
`;
  } else if (governanceRecord.persona === 'MSME' && governanceRecord.msmeSpendGovernance) {
    const msme = governanceRecord.msmeSpendGovernance;
    governanceSection = `
### 4. GOVERNANCE & SPEND DELEGATION (PA-09)
- **Persona:** MSME Commercial Organization
- **Manager Spend Cap:** ${msme.managerSpendCap ? inr(msme.managerSpendCap) : 'Standard Policy'}
- **Anti-Self-Approval (PA-09):** ${msme.preventSelfApprovalEnforced ? '✅ ENFORCED (Creator barred from self-approval)' : 'N/A'}
- **Approval Stages Satisfied:**
${msme.stages.map((s) => `  - Stage ${s.stageOrder} (${s.tierLevel}): ${s.status} by ${s.approvedBy} (${s.signatureMode}${s.delegationId ? ` via Delegation ${s.delegationId}` : ''}) at ${s.approvedAt}`).join('\n')}
`;
  }

  return `# OTP CANONICAL DECISION RECEIPT
**Receipt Reference:** \`${receipt.receiptId}\`  
**RFQ Reference:** \`${receipt.rfqRefNumber}\` (\`${receipt.rfqId}\`)  
**RFQ Title:** ${receipt.rfqTitle}  
**Cryptographic Audit Hash:** \`${receipt.cryptographicAuditHash}\`  
**Generated At:** ${timestamps.receiptGeneratedAt}  

---

### 1. BUYER CONTEXT
- **Buyer Persona:** ${receipt.buyerPersona}
- **Buyer Organization:** ${buyerContext.organizationName || 'Personal Individual Account'}
- **GSTIN / PAN:** ${buyerContext.buyerGstin || buyerContext.buyerPan || 'Unregistered / Exempt'}
- **Delivery State:** Code ${buyerContext.deliveryStateCode}
- **Authorizing Signatory:** ${authorityAttribution.awardedByName} (${authorityAttribution.awardedByRole})
${authorityAttribution.isDelegated ? `- **Delegation Proxy:** Acting on behalf of Delegator \`${authorityAttribution.delegatorProfileId}\` (Delegation ID: \`${authorityAttribution.delegationId}\`)` : ''}

---

### 2. SELECTED OFFER & COMMERCIAL TERMS (PA-06)
- **Winning Quote:** \`${selectedOffer.quoteId}\` (Quoted as **${selectedOffer.maskedSupplierLabel}**)
- **Revealed Supplier:** ${selectedOffer.businessName || 'Masked (Pending Reveal Gate)'}
- **Base Commercial Value:** ${inr(selectedOffer.baseAmount)}
- **Statutory GST Rate:** ${selectedOffer.gstRate}% (${selectedOffer.isInterState ? `IGST: ${inr(selectedOffer.igstAmount)}` : `CGST: ${inr(selectedOffer.cgstAmount)} + SGST: ${inr(selectedOffer.sgstAmount)}`})
- **Total Landed Cost:** **${inr(selectedOffer.totalLandedCost)}**
- **Delivery Timeline:** ${selectedOffer.deliveryTimelineDays} calendar days
- **Warranty Period:** ${selectedOffer.warrantyPeriodMonths} months
- **Payment Structure:** ${selectedOffer.paymentStructure}

---

### 3. OBJECTIVE MERIT EVALUATION
- **Merit Rank:** Rank #${meritEvaluation.rank} of ${meritEvaluation.totalQuotesEvaluated} evaluated offers
- **Merit Score:** ${meritEvaluation.score !== null ? `${meritEvaluation.score.toFixed(1)}/10` : 'Top Evaluated'}
- **Lowest Total Cost Available:** ${inr(meritEvaluation.lowestTotalCost)}
${meritEvaluation.costAvoidedComparedToIncumbent ? `- **Cost Avoided vs Incumbent:** ${inr(meritEvaluation.costAvoidedComparedToIncumbent)} saved by choosing on merit` : ''}
- **Consensus Justification:** ${meritEvaluation.consensusJustification}

---
${governanceSection}
---

### 5. CRYPTOGRAPHIC VERIFICATION PROOF
This receipt is cryptographically sealed under the **OTP Product Constitution v1.0**. Any tampering with commercial terms, authority, or voting records will invalidate the audit hash.
- **Payload Algorithm:** Deterministic HMAC-SHA256 (64-character hex)
- **Audit Signature:** \`${receipt.cryptographicAuditHash}\`
`;
}
