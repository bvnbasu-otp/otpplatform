/**
 * 15-Step Strict Linear Procurement Workflow Specification
 *
 * Each procurement requirement strictly advances through steps 1 to 15 monotonically.
 * Zero duplicate steps, zero out-of-order jumps, single-instance components.
 */

export const PROCUREMENT_STEP_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15
] as const;

export type ProcurementStepNumber = typeof PROCUREMENT_STEP_NUMBERS[number];

export const ProcurementStepCode = {
  STEP_1_SPEC_SUBMITTED: 'STEP_1_SPEC_SUBMITTED',
  STEP_2_SEND_ENQUIRY: 'STEP_2_SEND_ENQUIRY',
  STEP_3_MARKET_INTELLIGENCE: 'STEP_3_MARKET_INTELLIGENCE',
  STEP_4_START_NEGOTIATION_QA: 'STEP_4_START_NEGOTIATION_QA',
  STEP_5_CLOSE_NEGOTIATION_QA: 'STEP_5_CLOSE_NEGOTIATION_QA',
  STEP_6_COMPARE_QUOTES: 'STEP_6_COMPARE_QUOTES',
  STEP_7_VOTING_ROOM: 'STEP_7_VOTING_ROOM',
  STEP_8_CAST_VOTE: 'STEP_8_CAST_VOTE',
  STEP_9_AWARD_JUSTIFICATION: 'STEP_9_AWARD_JUSTIFICATION',
  STEP_10_LOCK_AWARD_DECISION: 'STEP_10_LOCK_AWARD_DECISION',
  STEP_11_CONTRACT_GATE: 'STEP_11_CONTRACT_GATE',
  STEP_12_REVEAL_WINNING_SUPPLIER: 'STEP_12_REVEAL_WINNING_SUPPLIER',
  STEP_13_VIEW_PO: 'STEP_13_VIEW_PO',
  STEP_14_MARK_PROGRESS: 'STEP_14_MARK_PROGRESS',
  STEP_15_STAR_RATING_JUSTIFICATION: 'STEP_15_STAR_RATING_JUSTIFICATION',
} as const;

export type ProcurementStepCode = typeof ProcurementStepCode[keyof typeof ProcurementStepCode];

export interface LinearStepDescriptor {
  stepNumber: ProcurementStepNumber;
  code: ProcurementStepCode;
  title: string;
  shortLabel: string;
  description: string;
  icon: string;
  badgeClass: string;
  routePath: string;
  allowedRoles: ('BUYER' | 'PROPERTY_OWNER' | 'SUPPLIER' | 'COMPLIANCE_OFFICER' | 'FINANCE_LEAD')[];
  singleInstanceOnly?: boolean;
}

export const LINEAR_PROCUREMENT_STEPS: Record<ProcurementStepNumber, LinearStepDescriptor> = {
  1: {
    stepNumber: 1,
    code: ProcurementStepCode.STEP_1_SPEC_SUBMITTED,
    title: 'Once Spec is Submitted',
    shortLabel: '1. Spec Submitted',
    description: 'Procurement specification, commercial baseline, and delivery scope submitted.',
    icon: '📝',
    badgeClass: 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200',
    routePath: '/requirements/:id',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'COMPLIANCE_OFFICER', 'FINANCE_LEAD'],
  },
  2: {
    stepNumber: 2,
    code: ProcurementStepCode.STEP_2_SEND_ENQUIRY,
    title: 'Send Enquiry to Verified Suppliers',
    shortLabel: '2. Send Enquiry',
    description: 'Enquiry broadcast to verified network supplier registries (ONDC, Trade Chambers).',
    icon: '📡',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300',
    routePath: '/requirements/:id/discover',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'COMPLIANCE_OFFICER'],
  },
  3: {
    stepNumber: 3,
    code: ProcurementStepCode.STEP_3_MARKET_INTELLIGENCE,
    title: 'Real-World Market Intelligence Details',
    shortLabel: '3. Market Intelligence',
    description: 'Audited regional cluster benchmarks: Fair Market Price, TAT, Warranty SLA, Reliability Score.',
    icon: '📊',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300',
    routePath: '/requirements/:id/market-intelligence',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'COMPLIANCE_OFFICER', 'FINANCE_LEAD'],
    singleInstanceOnly: true,
  },
  4: {
    stepNumber: 4,
    code: ProcurementStepCode.STEP_4_START_NEGOTIATION_QA,
    title: 'Review Received Quotes, Start Negotiation & QA',
    shortLabel: '4. Negotiation & QA',
    description: 'Review anonymous quotes and run interactive technical/commercial clarifications.',
    icon: '💬',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300',
    routePath: '/rfq/:rfqId/clarification',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'SUPPLIER', 'COMPLIANCE_OFFICER'],
  },
  5: {
    stepNumber: 5,
    code: ProcurementStepCode.STEP_5_CLOSE_NEGOTIATION_QA,
    title: 'Close Negotiation & QA',
    shortLabel: '5. Close Negotiation',
    description: 'Seal quoting window; freeze final anonymous quotes with cryptographic checksums.',
    icon: '🔒',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300',
    routePath: '/rfq/:rfqId/clarification',
    allowedRoles: ['BUYER', 'COMPLIANCE_OFFICER'],
  },
  6: {
    stepNumber: 6,
    code: ProcurementStepCode.STEP_6_COMPARE_QUOTES,
    title: 'Identity-Protected Evaluation',
    shortLabel: '6. Identity Evaluation',
    description: 'Side-by-side identity-protected evaluation matrix on cost, specs, and turnaround under masked supplier aliases.',
    icon: '⚖️',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300',
    routePath: '/rfq/:rfqId/evaluation',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'COMPLIANCE_OFFICER', 'FINANCE_LEAD'],
  },
  7: {
    stepNumber: 7,
    code: ProcurementStepCode.STEP_7_VOTING_ROOM,
    title: 'Committee Voting Room',
    shortLabel: '7. Voting Room',
    description: 'Committee quorum activation and mandatory Conflict of Interest (COI) clearances.',
    icon: '🏛️',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300',
    routePath: '/rfq/:rfqId/committee',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'COMPLIANCE_OFFICER', 'FINANCE_LEAD'],
  },
  8: {
    stepNumber: 8,
    code: ProcurementStepCode.STEP_8_CAST_VOTE,
    title: 'Cast Your Vote',
    shortLabel: '8. Cast Vote',
    description: 'Record weighted committee ballots with mandatory revision & justification criteria.',
    icon: '🗳️',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300',
    routePath: '/rfq/:rfqId/committee',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'FINANCE_LEAD'],
  },
  9: {
    stepNumber: 9,
    code: ProcurementStepCode.STEP_9_AWARD_JUSTIFICATION,
    title: 'Proceed with Award Justification',
    shortLabel: '9. Award Justification',
    description: 'Formulate majority decision receipt, runner-up protocol, and evaluation audit grounds.',
    icon: '📋',
    badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-300',
    routePath: '/rfq/:rfqId/award',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'COMPLIANCE_OFFICER'],
  },
  10: {
    stepNumber: 10,
    code: ProcurementStepCode.STEP_10_LOCK_AWARD_DECISION,
    title: 'Lock Award Decision',
    shortLabel: '10. Lock Award',
    description: 'Final multi-signature decision lock; immutably freezes winning quote selection.',
    icon: '🔐',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300',
    routePath: '/rfq/:rfqId/award',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'FINANCE_LEAD', 'COMPLIANCE_OFFICER'],
  },
  11: {
    stepNumber: 11,
    code: ProcurementStepCode.STEP_11_CONTRACT_GATE,
    title: 'Contract Gate',
    shortLabel: '11. Contract Gate',
    description: 'Statutory GST verification, commercial terms signoff, and milestone payment schedule.',
    icon: '📜',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300',
    routePath: '/rfq/:rfqId/contract',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'FINANCE_LEAD', 'COMPLIANCE_OFFICER'],
  },
  12: {
    stepNumber: 12,
    code: ProcurementStepCode.STEP_12_REVEAL_WINNING_SUPPLIER,
    title: 'Winner Contact & GST Reveal',
    shortLabel: '12. Winner Reveal',
    description: 'Mutual identity unmasking: reveals winning supplier contact & GST details; losing quotes stay anonymous.',
    icon: '🏆',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300',
    routePath: '/rfq/:rfqId/reveal',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'SUPPLIER', 'COMPLIANCE_OFFICER', 'FINANCE_LEAD'],
  },
  13: {
    stepNumber: 13,
    code: ProcurementStepCode.STEP_13_VIEW_PO,
    title: 'View PO',
    shortLabel: '13. View PO',
    description: 'Formal Purchase Order generated and mutually accepted by Buyer and Winning Supplier.',
    icon: '📦',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300',
    routePath: '/purchase-orders/:poId',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'SUPPLIER', 'FINANCE_LEAD'],
  },
  14: {
    stepNumber: 14,
    code: ProcurementStepCode.STEP_14_MARK_PROGRESS,
    title: 'Mark Progress',
    shortLabel: '14. Mark Progress',
    description: 'Execution milestones (0% -> 100%), proof-of-work uploads, and on-site buyer sign-off.',
    icon: '🛠️',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950 dark:text-sky-300',
    routePath: '/purchase-orders/:poId',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'SUPPLIER'],
  },
  15: {
    stepNumber: 15,
    code: ProcurementStepCode.STEP_15_STAR_RATING_JUSTIFICATION,
    title: 'Star Rating with Physical Justification',
    shortLabel: '15. Rating & Closeout',
    description: 'Mandatory 1-5 star supplier performance rating with physical proof notes and final archive.',
    icon: '⭐',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300',
    routePath: '/purchase-orders/:poId',
    allowedRoles: ['BUYER', 'PROPERTY_OWNER', 'COMPLIANCE_OFFICER'],
  },
};

/**
 * Validates whether a step transition is valid.
 * Steps must strictly advance by +1, or stay on the current step.
 * Backward navigation is read-only (viewing prior states), never advancing backward.
 */
export function validateLinearStepTransition(
  currentStep: ProcurementStepNumber,
  targetStep: ProcurementStepNumber
): { valid: boolean; reason?: string } {
  if (targetStep < 1 || targetStep > 15) {
    return { valid: false, reason: `Target step ${targetStep} is out of bounds (1..15)` };
  }

  if (targetStep === currentStep + 1) {
    return { valid: true };
  }

  if (targetStep <= currentStep) {
    return { valid: true, reason: 'Read-only view of historical step' };
  }

  return {
    valid: false,
    reason: `Cannot jump from Step ${currentStep} to Step ${targetStep}. Procurement must advance sequentially.`,
  };
}
