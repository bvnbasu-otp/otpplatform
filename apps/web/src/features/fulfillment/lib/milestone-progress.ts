/**
 * Work-order progress moves one 25% milestone at a time: 0 → 25 → 50 → 75 → 100.
 * No skipping, no going backwards, nothing after 100.
 */
export const MILESTONE_STEPS = [0, 25, 50, 75, 100] as const;
export const MILESTONE_STEP_SIZE = 25;

export const MILESTONE_STEP_LABELS: Record<number, string> = {
  25: 'Kickoff & mobilisation done',
  50: 'Material dispatched',
  75: 'Installed & ready for inspection',
  100: 'Work complete — request buyer inspection',
};

/** Snaps an arbitrary stored value down to the milestone actually reached. */
export function reachedMilestone(current: number | null | undefined): number {
  const value = Number.isFinite(current as number) ? Math.max(0, Math.min(100, Number(current))) : 0;
  return Math.floor(value / MILESTONE_STEP_SIZE) * MILESTONE_STEP_SIZE;
}

/** The only percentage that may be recorded next, or null when work is already at 100%. */
export function nextMilestonePercent(current: number | null | undefined): number | null {
  const reached = reachedMilestone(current);
  return reached >= 100 ? null : reached + MILESTONE_STEP_SIZE;
}

export type MilestoneTransitionResult = { ok: true } | { ok: false; error: string };

export function validateMilestoneTransition(
  from: number | null | undefined,
  to: number,
): MilestoneTransitionResult {
  const next = nextMilestonePercent(from);
  if (next === null) {
    return { ok: false, error: 'Work is already recorded as 100% complete.' };
  }
  if (!Number.isInteger(to) || !(MILESTONE_STEPS as readonly number[]).includes(to)) {
    return { ok: false, error: 'Progress can only be recorded in 25% milestones.' };
  }
  if (to <= reachedMilestone(from)) {
    return { ok: false, error: `Progress cannot go back from ${reachedMilestone(from)}% to ${to}%.` };
  }
  if (to !== next) {
    return { ok: false, error: `Complete the ${next}% milestone before recording ${to}%.` };
  }
  return { ok: true };
}
