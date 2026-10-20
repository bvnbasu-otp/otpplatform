/**
 * Work-order progress steps align with the PO payment plan (mirrors private.po_progress_step_targets).
 */

export const DEFAULT_MILESTONE_STEPS = [0, 25, 50, 75, 100] as const;

export type PaymentScheduleEntry = { percentage?: number | null; label?: string | null };

export function progressStepTargets(
  paymentStructure?: string | null,
  schedule?: PaymentScheduleEntry[] | null,
): number[] {
  if (paymentStructure === 'SINGLE_PAYMENT') return [100];
  if (paymentStructure === 'THREE_PART_PAYMENT') return [30, 80, 100];
  if (paymentStructure === 'MILESTONE_BASED') return [25, 50, 75, 100];
  if (paymentStructure === 'CUSTOM_TERMS' && Array.isArray(schedule) && schedule.length > 0) {
    let cum = 0;
    const steps: number[] = [];
    for (const entry of schedule) {
      cum += Number(entry.percentage ?? 0);
      steps.push(Math.min(100, Math.max(1, Math.round(cum))));
    }
    if (steps.length > 0 && steps[steps.length - 1] !== 100) {
      steps[steps.length - 1] = 100;
    }
    return steps;
  }
  return [25, 50, 75, 100];
}

export const MILESTONE_STEPS = DEFAULT_MILESTONE_STEPS;
export const MILESTONE_STEP_SIZE = 25;

export const MILESTONE_STEP_LABELS: Record<number, string> = {
  25: 'Kickoff & mobilisation done',
  50: 'Material dispatched',
  75: 'Installed & ready for inspection',
  100: 'Work complete — request buyer inspection',
};

export function reachedMilestone(
  current: number | null | undefined,
  paymentStructure?: string | null,
  schedule?: PaymentScheduleEntry[] | null,
): number {
  const value = Number.isFinite(current as number) ? Math.max(0, Math.min(100, Number(current))) : 0;
  const steps = progressStepTargets(paymentStructure, schedule);
  let reached = 0;
  for (const step of steps) {
    if (value >= step) reached = step;
  }
  return reached;
}

export function nextMilestonePercent(
  current: number | null | undefined,
  paymentStructure?: string | null,
  schedule?: PaymentScheduleEntry[] | null,
): number | null {
  const steps = progressStepTargets(paymentStructure, schedule);
  const reached = reachedMilestone(current, paymentStructure, schedule);
  if (reached >= 100) return null;
  for (const step of steps) {
    if (step > reached) return step;
  }
  return null;
}

export type MilestoneTransitionResult = { ok: true } | { ok: false; error: string };

export type PlanMilestoneDef = {
  id: number;
  title: string;
  stageName: string;
  targetPercent: number;
  payoutPercent: number;
  description: string;
};

/** Build display milestones from PO payment plan (physical progress targets, not payment status). */
export function buildPlanMilestoneDefs(
  paymentStructure?: string | null,
  schedule?: PaymentScheduleEntry[] | null,
): PlanMilestoneDef[] {
  const steps = progressStepTargets(paymentStructure, schedule);
  if (paymentStructure === 'SINGLE_PAYMENT') {
    return [
      {
        id: 1,
        title: 'Milestone: Delivery & sign-off',
        stageName: 'Complete scope',
        targetPercent: 100,
        payoutPercent: 100,
        description: 'Single-payment plan: record 100% work completion, then request buyer inspection.',
      },
    ];
  }
  if (paymentStructure === 'THREE_PART_PAYMENT') {
    const labels = ['Mobilization (30%)', 'Delivery & installation (50%)', 'Final acceptance (20%)'];
    const pcts = [30, 50, 20];
    return pcts.map((p, i) => {
      const target = steps[i] ?? steps[steps.length - 1] ?? 100;
      const label = labels[i] ?? `Stage ${i + 1}`;
      return {
        id: i + 1,
        title: `Stage ${i + 1}: ${label}`,
        stageName: label,
        targetPercent: target,
        payoutPercent: p,
        description: `Work progress checkpoint at ${target}% (payment tranche ${p}% per plan).`,
      };
    });
  }
  if (paymentStructure === 'CUSTOM_TERMS' && Array.isArray(schedule) && schedule.length > 0) {
    return schedule.map((entry, i) => {
      const pct = Number(entry.percentage ?? 0);
      const cum = progressStepTargets('CUSTOM_TERMS', schedule.slice(0, i + 1));
      const target = cum[cum.length - 1] ?? 100;
      const label = (entry as { label?: string }).label || `Custom stage ${i + 1}`;
      return {
        id: i + 1,
        title: `Stage ${i + 1}: ${label}`,
        stageName: label,
        targetPercent: target,
        payoutPercent: pct,
        description: `Custom plan checkpoint at ${target}% cumulative work progress.`,
      };
    });
  }
  const defaultLabels = [
    'Kickoff & mobilization',
    'Dispatch & in-transit',
    'Installation & QA',
    'Final acceptance',
  ];
  return steps.map((target, i) => ({
    id: i + 1,
    title: `Milestone ${i + 1}: ${defaultLabels[i] ?? `Stage ${i + 1}`}`,
    stageName: defaultLabels[i] ?? `Stage ${i + 1}`,
    targetPercent: target,
    payoutPercent:
      i < steps.length - 1
        ? target - (i > 0 ? (steps[i - 1] ?? 0) : 0)
        : 100 - (steps[i - 1] ?? 0),
    description: MILESTONE_STEP_LABELS[target] || `Record work progress at ${target}%.`,
  }));
}

export function validateMilestoneTransition(
  from: number | null | undefined,
  to: number,
  paymentStructure?: string | null,
  schedule?: PaymentScheduleEntry[] | null,
): MilestoneTransitionResult {
  const steps = progressStepTargets(paymentStructure, schedule);
  const next = nextMilestonePercent(from, paymentStructure, schedule);
  if (next === null) {
    return { ok: false, error: 'Work is already recorded as 100% complete.' };
  }
  if (!Number.isInteger(to) || !steps.includes(to)) {
    return {
      ok: false,
      error: paymentStructure === 'SINGLE_PAYMENT'
        ? 'Progress for a single-payment plan is recorded at 100% only.'
        : `Progress must match payment-plan milestones (${steps.join(' → ')}).`,
    };
  }
  const reached = reachedMilestone(from, paymentStructure, schedule);
  if (to <= reached) {
    return { ok: false, error: `Progress cannot go back from ${reached}% to ${to}%.` };
  }
  if (to !== next) {
    return { ok: false, error: `Complete the ${next}% milestone before recording ${to}%.` };
  }
  return { ok: true };
}
