import type {
  InvoiceStatus,
  PaymentStatus,
  PurchaseOrderStatus,
  RequirementStatus,
  RfqRevealStatus,
  RfqStatus,
  WorkOrderStatus,
} from '@otp/domain';

export const LIFECYCLE_STAGES = [
  { id: 'REQUIREMENT', label: 'Requirement' },
  { id: 'SOURCING', label: 'Discovery & RFQ' },
  { id: 'QUOTING', label: 'Initial quotes' },
  { id: 'CLARIFICATION', label: 'Negotiation & Q&A' },
  { id: 'EVALUATION', label: 'Identity-Protected Comparison & Vote' },
  { id: 'AWARD', label: 'Award & reveal' },
  { id: 'PURCHASE_ORDER', label: 'Purchase order' },
  { id: 'FULFILLMENT', label: 'Work order & delivery' },
  { id: 'PAYMENT', label: 'Invoice & remittance' },
] as const;

export type LifecycleStageId = (typeof LIFECYCLE_STAGES)[number]['id'];

export type LifecycleStageState = 'DONE' | 'CURRENT' | 'PENDING' | 'CANCELLED';

export interface LifecycleStage {
  id: LifecycleStageId;
  label: string;
  state: LifecycleStageState;
}

export interface MacroPhaseDefinition {
  id: 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_4';
  number: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  stageIds: LifecycleStageId[];
}

export const MACRO_PHASE_DEFINITIONS: MacroPhaseDefinition[] = [
  {
    id: 'PHASE_1',
    number: 1,
    title: 'Sourcing & Requirement',
    description: 'Requirement definition, specification authoring, and supplier network discovery.',
    stageIds: ['REQUIREMENT', 'SOURCING'],
  },
  {
    id: 'PHASE_2',
    number: 2,
    title: 'Selection & Award',
    description: 'Initial quote reception, anonymous negotiation, identity-protected comparison, committee voting, and award reveal.',
    stageIds: ['QUOTING', 'CLARIFICATION', 'EVALUATION', 'AWARD'],
  },
  {
    id: 'PHASE_3',
    number: 3,
    title: 'Order Execution',
    description: 'Purchase order acceptance, delivery milestone progress tracking (0–100%), and quality inspection sign-off.',
    stageIds: ['PURCHASE_ORDER', 'FULFILLMENT'],
  },
  {
    id: 'PHASE_4',
    number: 4,
    title: 'Financial Settlement',
    description: 'GST invoice verification, audit trail sign-off, and direct UPI remittance payout.',
    stageIds: ['PAYMENT'],
  },
];

export interface MacroPhase {
  id: 'PHASE_1' | 'PHASE_2' | 'PHASE_3' | 'PHASE_4';
  number: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  state: LifecycleStageState;
  progressPercent: number;
  stages: LifecycleStage[];
}

/** Status snapshot across the golden path; absent entities are simply null. */
export interface LifecycleSignals {
  requirementStatus?: RequirementStatus | null;
  rfqStatus?: RfqStatus | null;
  revealStatus?: RfqRevealStatus | null;
  poStatus?: PurchaseOrderStatus | null;
  workOrderStatus?: WorkOrderStatus | null;
  workOrderProgressPercent?: number | null;
  invoiceStatus?: InvoiceStatus | null;
  paymentStatus?: PaymentStatus | null;
}

function reachedStageIndex(s: LifecycleSignals): number {
  if (s.paymentStatus || s.invoiceStatus === 'PAID') return 8;
  if (
    s.workOrderStatus ||
    s.invoiceStatus ||
    s.poStatus === 'ACCEPTED' ||
    s.poStatus === 'IN_PROGRESS' ||
    s.poStatus === 'COMPLETED'
  ) {
    return 7;
  }
  if (s.poStatus) return 6;
  if (
    s.rfqStatus === 'AWARDED' ||
    s.revealStatus === 'REVEALED' ||
    s.requirementStatus === 'AWARDED' ||
    s.requirementStatus === 'IN_PROGRESS' ||
    s.requirementStatus === 'COMPLETED'
  ) {
    return 5;
  }
  if (
    s.rfqStatus === 'EVALUATING' ||
    s.rfqStatus === 'CLOSED' ||
    s.requirementStatus === 'EVALUATION'
  ) {
    return 4;
  }
  if (s.rfqStatus === 'CLARIFICATION' || s.requirementStatus === 'NEGOTIATION') return 3;
  if (s.rfqStatus === 'OPEN' || s.requirementStatus === 'QUOTING') return 2;
  if (s.rfqStatus || s.requirementStatus === 'SUBMITTED' || s.requirementStatus === 'RFQ_CREATED') {
    return 1;
  }
  return 0;
}

function isComplete(s: LifecycleSignals): boolean {
  return s.requirementStatus === 'COMPLETED' || s.paymentStatus === 'VERIFIED';
}

function isCancelled(s: LifecycleSignals): boolean {
  return (
    s.requirementStatus === 'CANCELLED' ||
    s.rfqStatus === 'CANCELLED' ||
    s.poStatus === 'CANCELLED'
  );
}

export function deriveLifecycleStages(signals: LifecycleSignals): LifecycleStage[] {
  const reached = reachedStageIndex(signals);
  const complete = isComplete(signals);
  const cancelled = isCancelled(signals);

  return LIFECYCLE_STAGES.map((stage, index) => {
    let state: LifecycleStageState;
    if (index < reached || complete) {
      state = 'DONE';
    } else if (index === reached) {
      state = cancelled ? 'CANCELLED' : 'CURRENT';
    } else {
      state = 'PENDING';
    }
    return { id: stage.id, label: stage.label, state };
  });
}

export function deriveMacroPhases(
  stages: LifecycleStage[],
  signals?: LifecycleSignals,
): MacroPhase[] {
  return MACRO_PHASE_DEFINITIONS.map((def) => {
    const macroStages = stages.filter((s) => def.stageIds.includes(s.id));
    const doneCount = macroStages.filter((s) => s.state === 'DONE').length;
    const hasCurrent = macroStages.some((s) => s.state === 'CURRENT');
    const hasCancelled = macroStages.some((s) => s.state === 'CANCELLED');

    let state: LifecycleStageState = 'PENDING';
    if (doneCount === macroStages.length) {
      state = 'DONE';
    } else if (hasCancelled) {
      state = 'CANCELLED';
    } else if (hasCurrent || doneCount > 0) {
      state = 'CURRENT';
    }

    let progressPercent =
      macroStages.length === 0 ? 0 : Math.round((doneCount / macroStages.length) * 100);

    if (def.id === 'PHASE_3') {
      if (signals?.workOrderProgressPercent != null && signals.workOrderProgressPercent > 0) {
        progressPercent = signals.workOrderProgressPercent;
      } else if (signals?.workOrderStatus === 'COMPLETED' || signals?.invoiceStatus) {
        progressPercent = 100;
      }
    }

    return {
      id: def.id,
      number: def.number,
      title: def.title,
      description: def.description,
      state,
      progressPercent,
      stages: macroStages,
    };
  });
}

export function currentLifecycleStage(stages: LifecycleStage[]): LifecycleStage | null {
  return (
    stages.find((s) => s.state === 'CURRENT' || s.state === 'CANCELLED') ??
    stages[stages.length - 1] ??
    null
  );
}

export function currentMacroPhase(macroPhases: MacroPhase[]): MacroPhase | null {
  return (
    macroPhases.find((p) => p.state === 'CURRENT' || p.state === 'CANCELLED') ??
    macroPhases[macroPhases.length - 1] ??
    null
  );
}

export * from './procurement-state';
