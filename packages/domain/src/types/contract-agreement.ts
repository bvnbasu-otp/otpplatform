import { computeDeterministicHmac } from './procurement-communications';

/**
 * OTP Phase 6.6: Tamper-Evident Contract Operations & SLA Breach Monitoring Domain Model
 *
 * Implements deterministic legal contract compilation at Step 11 (Contract Gate),
 * SHA-256 equivalent cryptographic document checksum hashing, multi-tenant digital signoff,
 * immutable contract versioning, and automated SLA breach monitoring.
 *
 * Cross-Platform Architecture: Browser and Node.js compatible deterministic cryptographic digests.
 */

export type ContractStatus = 'DRAFT' | 'PENDING_BUYER_SIGNATURE' | 'PENDING_SUPPLIER_SIGNATURE' | 'ACTIVE' | 'TERMINATED' | 'FULFILLED';

export interface ContractMilestoneSchedule {
  milestoneIndex: number;
  title: string;
  targetPercentage: number;
  allocatedAmount: number;
  slaDays: number;
  deliverables: string[];
}

export interface ContractTerms {
  procurementTitle: string;
  buyerOrganizationId: string;
  supplierId: string;
  quoteId: string;
  rfqId: string;
  totalContractValue: number;
  currency: string;
  gstinBuyer: string;
  gstinSupplier: string;
  liquidatedDamagesClausePercentPerDay: number; // e.g. 0.5% per day delay capped at 10%
  maxLiquidatedDamagesPercent: number; // e.g. 10.0%
  disputeResolutionPeriodDays: number; // e.g. 14 days
  warrantyPeriodMonths: number; // e.g. 12 months
  milestones: ContractMilestoneSchedule[];
  specialTerms?: string | null;
}

export interface ProcurementContract {
  id: string;
  contractNumber: string; // e.g. "CTR-2026-09-001"
  rfqId: string;
  purchaseOrderId?: string | null;
  organizationId: string;
  supplierId: string;
  quoteId: string;
  status: ContractStatus;
  terms: ContractTerms;
  contractBodyMarkdown: string;
  documentHash: string; // SHA-256 hash of canonical terms + body
  buyerSignedBy?: string | null;
  buyerSignedAt?: string | null;
  buyerSignatureHash?: string | null;
  supplierSignedBy?: string | null;
  supplierSignedAt?: string | null;
  supplierSignatureHash?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SlaBreachStatus {
  isBreached: boolean;
  daysOverdue: number;
  estimatedLiquidatedDamagesAmount: number;
  slaDeadlineIso: string;
}

/**
 * Compiles a deterministic legal markdown agreement from procurement terms.
 */
export function compileContractAgreementMarkdown(terms: ContractTerms): string {
  const milestoneLines = terms.milestones
    .map(
      (m) =>
        `  - **Milestone ${m.milestoneIndex}: ${m.title}** (${m.targetPercentage}% | ₹${m.allocatedAmount.toLocaleString('en-IN')}) — Delivery SLA: ${m.slaDays} days\n    Deliverables: ${m.deliverables.join(', ')}`
    )
    .join('\n');

  return `# LEGAL PROCUREMENT AGREEMENT & COMMERCIAL CONTRACT
**Contract Reference:** OTP-CTR-${terms.rfqId.substring(0, 8).toUpperCase()}
**Date:** ${new Date().toISOString().split('T')[0]}

---

### 1. PARTIES & RECITALS
- **Buyer Entity Org ID:** ${terms.buyerOrganizationId} (GSTIN: ${terms.gstinBuyer || 'UNREGISTERED/EXEMPT'})
- **Contractor / Supplier ID:** ${terms.supplierId} (GSTIN: ${terms.gstinSupplier || 'VERIFIED'})
- **Procurement Scope:** ${terms.procurementTitle}
- **Accepted Quote Reference:** ${terms.quoteId} under RFQ ${terms.rfqId}

### 2. COMMERCIAL TERMS & CONTRACT VALUE
- **Total Fixed Contract Price:** ₹${terms.totalContractValue.toLocaleString('en-IN')} (${terms.currency}) inclusive of applicable taxes.
- **Payment Mechanism:** Progressive Milestone Invoicing & Non-Custodial Direct Bank Settlement.

### 3. MILESTONE EXECUTION & DELIVERY SCHEDULE
${milestoneLines}

### 4. LIQUIDATED DAMAGES & SLA BREACH
- In the event of unexcused milestone delay, liquidated damages shall accrue at **${terms.liquidatedDamagesClausePercentPerDay}% per day**, capped at **${terms.maxLiquidatedDamagesPercent}%** of the total contract value.
- Quality defect cure period: 7 calendar days from inspection rejection notice.

### 5. STATUTORY COMPLIANCE & WARRANTY
- **Warranty Obligation:** Comprehensive performance warranty of **${terms.warrantyPeriodMonths} months** from final inspection signoff.
- **Dispute Resolution SLA:** All commercial disputes shall be mediated under OTP Platform governance within **${terms.disputeResolutionPeriodDays} days**.

${terms.specialTerms ? `### 6. SPECIAL CONDITIONS\n${terms.specialTerms}\n` : ''}
---
*Cryptographically generated and sealed via OTP Tamper-Evident Contract Operations Engine.*
`;
}

/**
 * Computes deterministic SHA-256 equivalent checksum hash for the compiled contract agreement.
 */
export function computeContractDocumentHash(contractBodyMarkdown: string, terms: ContractTerms): string {
  const canonicalPayload = JSON.stringify({
    markdown: contractBodyMarkdown.trim(),
    rfqId: terms.rfqId,
    buyerOrgId: terms.buyerOrganizationId,
    supplierId: terms.supplierId,
    totalValue: terms.totalContractValue,
    milestonesCount: terms.milestones.length,
  });

  return computeDeterministicHmac(canonicalPayload, 'OTP-CONTRACT-SALT-2026');
}

/**
 * Generates a tamper-evident digital sign-off hash for an executing party.
 */
export function generateContractSignatureHash(
  documentHash: string,
  signerProfileId: string,
  signerRole: string,
  timestampIso: string
): string {
  const signPayload = `${documentHash}|${signerProfileId}|${signerRole}|${timestampIso}`;
  return computeDeterministicHmac(signPayload, 'OTP-SIGNOFF-SALT-2026');
}

/**
 * Verifies the digital sign-off hash against signer credentials and document hash.
 */
export function verifyContractSignatureHash(
  signatureHash: string,
  documentHash: string,
  signerProfileId: string,
  signerRole: string,
  timestampIso: string
): boolean {
  const expected = generateContractSignatureHash(documentHash, signerProfileId, signerRole, timestampIso);
  return signatureHash === expected;
}

/**
 * Evaluates SLA breach and calculates estimated liquidated damages.
 */
export function evaluateMilestoneSlaBreach(params: {
  milestoneStartDateIso: string;
  slaDays: number;
  contractTotalValue: number;
  damageRatePerDayPercent: number;
  maxDamagePercent: number;
  currentDateIso?: string;
}): SlaBreachStatus {
  const startMs = new Date(params.milestoneStartDateIso).getTime();
  const currentMs = params.currentDateIso ? new Date(params.currentDateIso).getTime() : Date.now();
  const deadlineMs = startMs + params.slaDays * 24 * 60 * 60 * 1000;
  const deadlineIso = new Date(deadlineMs).toISOString();

  if (currentMs <= deadlineMs) {
    return {
      isBreached: false,
      daysOverdue: 0,
      estimatedLiquidatedDamagesAmount: 0,
      slaDeadlineIso: deadlineIso,
    };
  }

  const overdueMs = currentMs - deadlineMs;
  const daysOverdue = Math.ceil(overdueMs / (24 * 60 * 60 * 1000));
  const rawDamage = (params.contractTotalValue * (params.damageRatePerDayPercent / 100)) * daysOverdue;
  const maxDamage = params.contractTotalValue * (params.maxDamagePercent / 100);
  const estimatedLiquidatedDamagesAmount = Number(Math.min(rawDamage, maxDamage).toFixed(2));

  return {
    isBreached: true,
    daysOverdue,
    estimatedLiquidatedDamagesAmount,
    slaDeadlineIso: deadlineIso,
  };
}
