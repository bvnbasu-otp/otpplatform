/**
 * OTP Stage R2-12: TRACK — 5-Point Milestone Stepper, Inspection, Progressive GST Invoice & Double-Entry Settlement
 *
 * Supreme Domain Specification:
 *   - Canonical 5-point milestone stepper (Requirement -> Offers -> Decision -> Purchase -> Delivery & Settlement)
 *   - Canonical 7-state golden progression: DRAFT -> QUOTING -> EVALUATING -> AWARDED -> PO ISSUED -> INVOICED -> SETTLED (with STALLED exception)
 *   - Zero competing state machines; deterministic projection from backend states
 *   - Progressive Bilateral GST Invoice (PA-06) state tracking
 *   - Double-Entry GAAP Financial Settlement (PA-07) verification & triple financial segregation
 *   - Persona-tailored tracking for Individual, RWA, and MSME buyers
 *   - Cryptographic inspection digital sign-off and tamper detection
 */

import { computeDeterministicHmac } from './procurement-communications';
import type { BuyerPersona } from './buyer-persona';
import type { PurchaseOrderStatus } from '../enums/procurement';
import type { InspectionStatus, InspectionItemCategory, InspectionItemStatus } from './milestone-inspection';
import type { TaxSnapshot } from '../tax/tax-snapshot';

export type CustomerMilestoneKey =
  | 'REQUIREMENT'
  | 'OFFERS'
  | 'DECISION'
  | 'PURCHASE'
  | 'DELIVERY_SETTLEMENT';

export const CUSTOMER_MILESTONE_KEYS: readonly CustomerMilestoneKey[] = [
  'REQUIREMENT',
  'OFFERS',
  'DECISION',
  'PURCHASE',
  'DELIVERY_SETTLEMENT',
] as const;

export type MilestoneStepStatus =
  | 'COMPLETED'
  | 'IN_PROGRESS'
  | 'PENDING'
  | 'STALLED';

export type CanonicalGoldenState =
  | 'DRAFT'
  | 'QUOTING'
  | 'EVALUATING'
  | 'AWARDED'
  | 'PO_ISSUED'
  | 'INVOICED'
  | 'SETTLED'
  | 'STALLED';

export const CANONICAL_GOLDEN_STATES: readonly CanonicalGoldenState[] = [
  'DRAFT',
  'QUOTING',
  'EVALUATING',
  'AWARDED',
  'PO_ISSUED',
  'INVOICED',
  'SETTLED',
  'STALLED',
] as const;

export interface CustomerMilestoneItem {
  milestoneNumber: number; // 1 to 5
  key: CustomerMilestoneKey;
  label: string;
  tagline: string;
  status: MilestoneStepStatus;
  isCurrent: boolean;
  isCompleted: boolean;
  actionUrl: string;
  actionLabel: string;
  completedAt?: string | null;
  summaryNote?: string | null;
  badgeText: string;
}

export interface FivePointMilestoneSummary {
  goldenState: CanonicalGoldenState;
  activeMilestoneKey: CustomerMilestoneKey;
  activeMilestoneNumber: number;
  overallProgressPercent: number;
  isStalled: boolean;
  stalledReason?: string | null;
  milestones: [
    CustomerMilestoneItem,
    CustomerMilestoneItem,
    CustomerMilestoneItem,
    CustomerMilestoneItem,
    CustomerMilestoneItem,
  ];
  buyerPersona: BuyerPersona;
  contextSummary: {
    rfqId?: string | null;
    poId?: string | null;
    supplierAccepted: boolean;
    workOrderProgressPercent: number;
    inspectionPassed: boolean;
    invoiceStatus: 'PENDING' | 'ISSUED' | 'PAID';
    settlementCompleted: boolean;
  };
}

export interface DeriveFivePointMilestoneParams {
  rfqStatus?: string | null;
  rfqId?: string | null;
  awardStatus?: string | null;
  poStatus?: PurchaseOrderStatus | string | null;
  poId?: string | null;
  supplierAcceptedAt?: string | null;
  workOrderStatus?: string | null;
  workOrderProgressPercent?: number | null;
  inspectionStatus?: InspectionStatus | string | null;
  inspectionPassed?: boolean | null;
  invoices?: Array<{ id: string; status: string; amount: number }> | null;
  isSettled?: boolean | null;
  isStalled?: boolean | null;
  stalledReason?: string | null;
  buyerPersona?: BuyerPersona | null;
  role?: 'buyer' | 'supplier' | 'admin';
}

/**
 * Derives the canonical 5-point milestone stepper deterministically as a pure projection
 * of database records and golden state progression.
 */
export function deriveFivePointMilestoneProjection(
  params: DeriveFivePointMilestoneParams,
): FivePointMilestoneSummary {
  const persona: BuyerPersona = params.buyerPersona || 'INDIVIDUAL';
  const role = params.role || 'buyer';
  const rfqId = params.rfqId || null;
  const poId = params.poId || null;
  const supplierAccepted = Boolean(params.supplierAcceptedAt || (params.poStatus && ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(params.poStatus)));
  const woPercent = params.workOrderProgressPercent ?? 0;
  const inspPassed = Boolean(params.inspectionPassed || params.inspectionStatus === 'APPROVED');
  const invoices = params.invoices || [];
  const hasInvoices = invoices.length > 0;
  const allInvoicesPaid = hasInvoices && invoices.every((i) => i.status === 'PAID');
  const isSettled = Boolean(params.isSettled || (allInvoicesPaid && (params.poStatus === 'COMPLETED' || params.workOrderStatus === 'COMPLETED')));

  // Determine Canonical Golden State
  let goldenState: CanonicalGoldenState = 'DRAFT';

  if (params.isStalled) {
    goldenState = 'STALLED';
  } else if (isSettled) {
    goldenState = 'SETTLED';
  } else if (allInvoicesPaid || (hasInvoices && invoices.some((i) => i.status === 'APPROVED' || i.status === 'PAID'))) {
    goldenState = 'INVOICED';
  } else if (params.poStatus === 'ISSUED' || params.poStatus === 'ACCEPTED' || params.poStatus === 'IN_PROGRESS' || params.poStatus === 'COMPLETED' || Boolean(poId)) {
    if (woPercent >= 100 && (inspPassed || hasInvoices)) {
      goldenState = 'INVOICED';
    } else {
      goldenState = 'PO_ISSUED';
    }
  } else if (params.rfqStatus === 'AWARDED' || params.awardStatus === 'REVEALED' || params.awardStatus === 'AWARDED') {
    goldenState = 'AWARDED';
  } else if (params.rfqStatus === 'EVALUATING' || params.rfqStatus === 'UNDER_EVALUATION') {
    goldenState = 'EVALUATING';
  } else if (params.rfqStatus === 'PUBLISHED' || params.rfqStatus === 'QUOTING' || params.rfqStatus === 'OPEN') {
    goldenState = 'QUOTING';
  } else {
    goldenState = 'DRAFT';
  }

  // URLs resolution
  const requirementUrl = rfqId ? `/requirements/${rfqId}` : '/intake';
  const offersUrl = rfqId ? `/rfq/${rfqId}/evaluation` : '/dashboard';
  const decisionUrl = rfqId ? `/rfq/${rfqId}/committee` : '/dashboard';
  const purchaseUrl = poId ? `/purchase-orders/${poId}` : (rfqId ? `/rfq/${rfqId}/award` : '/purchase-orders');
  const deliveryUrl = poId ? `/purchase-orders/${poId}?tab=milestones` : (rfqId ? `/rfq/${rfqId}/track` : '/purchase-orders');

  // Milestone 1: Requirement (DRAFT)
  const m1Done = goldenState !== 'DRAFT';
  const m1Current = goldenState === 'DRAFT';
  const m1: CustomerMilestoneItem = {
    milestoneNumber: 1,
    key: 'REQUIREMENT',
    label: 'Requirement',
    tagline: 'Specification authoring & budget definition',
    status: m1Done ? 'COMPLETED' : m1Current ? 'IN_PROGRESS' : 'PENDING',
    isCurrent: m1Current,
    isCompleted: m1Done,
    actionUrl: requirementUrl,
    actionLabel: m1Done ? 'View Requirement' : 'Complete Intake',
    badgeText: m1Done ? 'Completed' : 'Drafting',
  };

  // Milestone 2: Offers (QUOTING)
  const m2Done = ['EVALUATING', 'AWARDED', 'PO_ISSUED', 'INVOICED', 'SETTLED'].includes(goldenState);
  const m2Current = goldenState === 'QUOTING';
  const m2: CustomerMilestoneItem = {
    milestoneNumber: 2,
    key: 'OFFERS',
    label: 'Offers',
    tagline: 'Supplier discovery, RFQ publication & sealed quotes',
    status: m2Done ? 'COMPLETED' : m2Current ? 'IN_PROGRESS' : 'PENDING',
    isCurrent: m2Current,
    isCompleted: m2Done,
    actionUrl: offersUrl,
    actionLabel: m2Done ? 'View Offers' : 'Review Quotes',
    badgeText: m2Done ? 'Quotes Received' : m2Current ? 'Sourcing Quotes' : 'Pending',
  };

  // Milestone 3: Decision (EVALUATING, AWARDED)
  const m3Done = ['PO_ISSUED', 'INVOICED', 'SETTLED'].includes(goldenState);
  const m3Current = goldenState === 'EVALUATING' || goldenState === 'AWARDED';
  const m3: CustomerMilestoneItem = {
    milestoneNumber: 3,
    key: 'DECISION',
    label: 'Decision',
    tagline: 'Merit evaluation, quorum voting & atomic award lock',
    status: m3Done ? 'COMPLETED' : m3Current ? 'IN_PROGRESS' : 'PENDING',
    isCurrent: m3Current,
    isCompleted: m3Done,
    actionUrl: decisionUrl,
    actionLabel: m3Done ? 'View Decision Receipt' : 'Sign Off Award',
    badgeText: m3Done ? 'Award Locked' : m3Current ? 'Decision Required' : 'Pending',
  };

  // Milestone 4: Purchase (PO_ISSUED)
  const m4Done = Boolean(supplierAccepted && (goldenState === 'INVOICED' || goldenState === 'SETTLED' || woPercent > 0 || params.poStatus === 'ACCEPTED' || params.poStatus === 'IN_PROGRESS' || params.poStatus === 'COMPLETED'));
  const m4Current = !m4Done && (goldenState === 'PO_ISSUED' || (goldenState === 'AWARDED' && !poId));
  const m4: CustomerMilestoneItem = {
    milestoneNumber: 4,
    key: 'PURCHASE',
    label: 'Purchase',
    tagline: 'Official PO, 0.50% fee disclosure & supplier acceptance',
    status: m4Done ? 'COMPLETED' : m4Current ? 'IN_PROGRESS' : 'PENDING',
    isCurrent: m4Current,
    isCompleted: m4Done,
    actionUrl: purchaseUrl,
    actionLabel: m4Done ? 'View Purchase Order' : (role === 'supplier' ? 'Accept Purchase Order' : 'Track Order'),
    badgeText: m4Done ? 'PO Accepted' : (supplierAccepted ? 'Supplier Accepted' : 'Awaiting Supplier Acceptance'),
  };

  // Milestone 5: Delivery & Settlement (INVOICED, SETTLED)
  const m5Done = goldenState === 'SETTLED';
  const m5Current = goldenState === 'INVOICED' || (goldenState === 'PO_ISSUED' && supplierAccepted && woPercent > 0);
  const m5: CustomerMilestoneItem = {
    milestoneNumber: 5,
    key: 'DELIVERY_SETTLEMENT',
    label: 'Delivery & Settlement',
    tagline: '5-point QA inspection, progressive GST invoice & ledger settlement',
    status: m5Done ? 'COMPLETED' : m5Current ? 'IN_PROGRESS' : 'PENDING',
    isCurrent: m5Current,
    isCompleted: m5Done,
    actionUrl: deliveryUrl,
    actionLabel: m5Done ? 'View Settlement Certificate' : (woPercent < 100 ? 'Milestone Progress' : !inspPassed ? 'Sign Off Inspection' : 'Review Invoices & Settle'),
    badgeText: m5Done ? 'Fully Settled' : (inspPassed ? 'QA Approved' : `${woPercent}% Delivered`),
  };

  // Active Milestone Index & Key
  let activeKey: CustomerMilestoneKey = 'REQUIREMENT';
  let activeNum = 1;
  let overallPercent = 10;

  if (goldenState === 'SETTLED') {
    activeKey = 'DELIVERY_SETTLEMENT';
    activeNum = 5;
    overallPercent = 100;
  } else if (goldenState === 'INVOICED') {
    activeKey = 'DELIVERY_SETTLEMENT';
    activeNum = 5;
    overallPercent = 85;
  } else if (goldenState === 'PO_ISSUED') {
    if (woPercent > 0) {
      activeKey = 'DELIVERY_SETTLEMENT';
      activeNum = 5;
      overallPercent = 60 + Math.floor((woPercent / 100) * 20);
    } else {
      activeKey = 'PURCHASE';
      activeNum = 4;
      overallPercent = 60;
    }
  } else if (goldenState === 'AWARDED') {
    activeKey = 'PURCHASE';
    activeNum = 4;
    overallPercent = 50;
  } else if (goldenState === 'EVALUATING') {
    activeKey = 'DECISION';
    activeNum = 3;
    overallPercent = 40;
  } else if (goldenState === 'QUOTING') {
    activeKey = 'OFFERS';
    activeNum = 2;
    overallPercent = 25;
  } else {
    activeKey = 'REQUIREMENT';
    activeNum = 1;
    overallPercent = 10;
  }

  const invoiceStage: 'PENDING' | 'ISSUED' | 'PAID' = allInvoicesPaid ? 'PAID' : hasInvoices ? 'ISSUED' : 'PENDING';

  return {
    goldenState,
    activeMilestoneKey: activeKey,
    activeMilestoneNumber: activeNum,
    overallProgressPercent: overallPercent,
    isStalled: Boolean(params.isStalled),
    stalledReason: params.stalledReason || null,
    milestones: [m1, m2, m3, m4, m5],
    buyerPersona: persona,
    contextSummary: {
      rfqId,
      poId,
      supplierAccepted,
      workOrderProgressPercent: woPercent,
      inspectionPassed: inspPassed,
      invoiceStatus: invoiceStage,
      settlementCompleted: isSettled,
    },
  };
}

// -----------------------------------------------------------------------------
// Progressive Bilateral GST Invoice State & Tax Integrity (PA-06)
// -----------------------------------------------------------------------------

export type ProgressiveInvoiceState =
  | 'PENDING_DELIVERY'
  | 'INVOICE_PENDING'
  | 'INVOICE_ISSUED'
  | 'INVOICE_AVAILABLE'
  | 'INVOICE_PAID';

export interface ProgressiveInvoiceTaxValidation {
  taxableAmount: number;
  gstRate: number;
  gstAmount: number;
  isInterState: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  placeOfSupplyStateCode: string;
}

export function deriveProgressiveInvoiceStage(params: {
  deliveryPercent: number;
  inspectionPassed: boolean;
  invoiceStatus?: string | null;
  isPaid?: boolean;
}): ProgressiveInvoiceState {
  if (params.isPaid || params.invoiceStatus === 'PAID') {
    return 'INVOICE_PAID';
  }
  if (params.invoiceStatus === 'APPROVED' || params.invoiceStatus === 'AVAILABLE') {
    return 'INVOICE_AVAILABLE';
  }
  if (params.invoiceStatus === 'SUBMITTED' || params.invoiceStatus === 'ISSUED') {
    return 'INVOICE_ISSUED';
  }
  if (params.inspectionPassed || params.deliveryPercent >= 100) {
    return 'INVOICE_PENDING';
  }
  return 'PENDING_DELIVERY';
}

// -----------------------------------------------------------------------------
// Double-Entry GAAP Financial Settlement & Segregation (PA-07)
// -----------------------------------------------------------------------------

export interface DoubleEntryValidationResult {
  isBalanced: boolean;
  totalDebits: number;
  totalCredits: number;
  delta: number;
  entriesCount: number;
  error?: string;
}

export interface JournalLineItem {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  narration?: string;
}

/**
 * Validates double-entry mathematical integrity: sum of debits strictly equals sum of credits.
 */
export function validateDoubleEntryLedgerBalance(lines: JournalLineItem[]): DoubleEntryValidationResult {
  if (!lines || lines.length === 0) {
    return {
      isBalanced: false,
      totalDebits: 0,
      totalCredits: 0,
      delta: 0,
      entriesCount: 0,
      error: 'Journal entry must contain at least two balanced lines',
    };
  }

  let totalDebits = 0;
  let totalCredits = 0;

  for (const line of lines) {
    totalDebits += Math.round((line.debit || 0) * 100);
    totalCredits += Math.round((line.credit || 0) * 100);
  }

  const debits = totalDebits / 100;
  const credits = totalCredits / 100;
  const delta = Math.abs(debits - credits);
  const isBalanced = delta < 0.01;

  return {
    isBalanced,
    totalDebits: debits,
    totalCredits: credits,
    delta,
    entriesCount: lines.length,
    error: isBalanced ? undefined : `Debit/Credit mismatch: Debits (₹${debits}) != Credits (₹${credits})`,
  };
}

export const OTP_PLATFORM_FEE_RATE = 0.005; // 0.50% supplier side
export const OTP_BUYER_REWARD_RATE = 0.001; // 0.10% buyer reward

export interface TripleFinancialSegregationBreakdown {
  grossProcurementGmv: number;
  otpPlatformFee: number; // 0.50%
  buyerRewardIncentive: number; // 0.10%
  netSupplierDisbursement: number;
}

export function computeTripleFinancialSegregation(grossGmv: number): TripleFinancialSegregationBreakdown {
  const gmv = Math.max(0, grossGmv);
  const platformFee = Math.round(gmv * OTP_PLATFORM_FEE_RATE * 100) / 100;
  const buyerReward = Math.round(gmv * OTP_BUYER_REWARD_RATE * 100) / 100;
  const netDisbursement = Math.round((gmv - platformFee) * 100) / 100;

  return {
    grossProcurementGmv: gmv,
    otpPlatformFee: platformFee,
    buyerRewardIncentive: buyerReward,
    netSupplierDisbursement: netDisbursement,
  };
}

// -----------------------------------------------------------------------------
// 5-Point Delivery Inspection QA Sign-off & Cryptographic Seal
// -----------------------------------------------------------------------------

export const FIVE_POINT_INSPECTION_CATEGORIES: readonly InspectionItemCategory[] = [
  'MATERIALS',
  'COMPLETION',
  'SAFETY',
  'QUALITY',
  'SPECIFICATION',
] as const;

export interface FivePointInspectionItemInput {
  category: InspectionItemCategory;
  description: string;
  status: InspectionItemStatus;
  score: number; // 0..100
  notes?: string;
  evidenceUrls?: string[];
}

export interface FivePointInspectionValidationResult {
  isValid: boolean;
  passed: boolean;
  overallScore: number;
  categoriesCovered: InspectionItemCategory[];
  missingCategories: InspectionItemCategory[];
  digitalSignoffHash?: string;
  error?: string;
}

const INSPECTION_SIGN_SALT = 'OTP-5POINT-INSPECTION-SIGN-SALT-2026';

export function evaluateFivePointInspection(
  items: FivePointInspectionItemInput[],
  context: { workOrderId: string; inspectorId: string; timestamp?: string },
): FivePointInspectionValidationResult {
  if (!items || items.length === 0) {
    return {
      isValid: false,
      passed: false,
      overallScore: 0,
      categoriesCovered: [],
      missingCategories: [...FIVE_POINT_INSPECTION_CATEGORIES],
      error: 'Inspection must contain checklist items',
    };
  }

  const coveredSet = new Set<InspectionItemCategory>(items.map((i) => i.category));
  const covered = Array.from(coveredSet);
  const missing = FIVE_POINT_INSPECTION_CATEGORIES.filter((c) => !coveredSet.has(c));

  let totalScore = 0;
  let hasFailure = false;

  for (const item of items) {
    totalScore += Math.max(0, Math.min(100, item.score));
    if (item.status === 'FAILED') {
      hasFailure = true;
    }
  }

  const averageScore = Math.round(totalScore / items.length);
  const passed = !hasFailure && averageScore >= 80 && missing.length === 0;

  const signTime = context.timestamp || new Date().toISOString();
  const hashPayload = JSON.stringify({
    workOrderId: context.workOrderId,
    inspectorId: context.inspectorId,
    score: averageScore,
    passed,
    itemCount: items.length,
    timestamp: signTime,
  });

  const signoffHash = computeDeterministicHmac(hashPayload, INSPECTION_SIGN_SALT);

  return {
    isValid: missing.length === 0,
    passed,
    overallScore: averageScore,
    categoriesCovered: covered,
    missingCategories: missing,
    digitalSignoffHash: signoffHash,
    error: missing.length > 0 ? `Missing mandatory 5-point inspection categories: ${missing.join(', ')}` : undefined,
  };
}

export function verifyInspectionSignoffIntegrity(params: {
  workOrderId: string;
  inspectorId: string;
  score: number;
  passed: boolean;
  itemCount: number;
  timestamp: string;
  signoffHash: string;
}): { valid: boolean; error?: string } {
  const hashPayload = JSON.stringify({
    workOrderId: params.workOrderId,
    inspectorId: params.inspectorId,
    score: params.score,
    passed: params.passed,
    itemCount: params.itemCount,
    timestamp: params.timestamp,
  });

  const expected = computeDeterministicHmac(hashPayload, INSPECTION_SIGN_SALT);
  const valid = expected === params.signoffHash;

  return {
    valid,
    error: valid ? undefined : 'Inspection digital sign-off cryptographic verification failed: hash mismatch',
  };
}
