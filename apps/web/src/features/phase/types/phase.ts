import type { RfqStatus } from '@otp/domain';

/**
 * The phase an enquiry is in, as the server sees it.
 *
 * Two fields here exist because the client must not compute them. `overdue` and
 * `secondsRemaining` are settled server-side against the database clock, because a
 * countdown is the one number where a device set to the wrong time turns into a
 * supplier who believes they still have a day. Everything a screen shows about a
 * deadline traces back to these two, and neither is recalculated from `endsAt`.
 */

export type PhaseOrdinal = 0 | 1 | 2 | 3 | 4;

/** Why quoting is closed, when it is. NULL-equivalent means it is open. */
export type QuotingRefusal =
  | 'NO_SUCH_RFQ'
  | 'NOT_OPEN_YET'
  | 'DEADLINE_PASSED'
  | 'QUOTING_CLOSED';

export interface PhaseSchedule {
  openedAt: string | null;
  quoteDeadline: string | null;
  clarificationAt: string | null;
  revisionDeadline: string | null;
  evaluationAt: string | null;
  evaluationDeadline: string | null;
}

export interface RfqPhase {
  rfqId: string;
  ref: string | null;
  status: RfqStatus;
  ordinal: PhaseOrdinal;
  label: string;
  startsAt: string | null;
  endsAt: string | null;
  overdue: boolean;
  secondsRemaining: number | null;
  schedule: PhaseSchedule;
  quotingOpen: boolean;
  quotingRefusal: QuotingRefusal | null;
}

export interface PhaseStep {
  ordinal: PhaseOrdinal;
  title: string;
  /** What the window is for, in the words a participant would use. */
  purpose: string;
  startsAt: string | null;
  endsAt: string | null;
  state: 'DONE' | 'CURRENT' | 'UPCOMING' | 'SKIPPED';
}

const STEPS: Array<{ ordinal: PhaseOrdinal; title: string; purpose: string }> = [
  { ordinal: 1, title: 'Identity-Protected Quoting', purpose: 'Suppliers price the specification under an alias' },
  {
    ordinal: 2,
    title: 'Clarification and revision',
    purpose: 'Questions through the masked thread, and revised prices',
  },
  {
    ordinal: 3,
    title: 'Evaluation and voting',
    purpose: 'Weighted scoring, then the committee votes on anonymous cards',
  },
  { ordinal: 4, title: 'Award and reveal', purpose: 'Identities are exchanged when the award is locked' },
];

/**
 * The four phases with their windows, for a strip a participant can read.
 *
 * A phase with no window and an enquiry already past it is SKIPPED rather than
 * DONE: an enquiry published without a revision deadline never had a phase 2, and
 * showing it as completed would claim a window that was never offered.
 */
export function phaseSteps(phase: RfqPhase): PhaseStep[] {
  const { schedule, ordinal } = phase;

  const windows: Record<PhaseOrdinal, { startsAt: string | null; endsAt: string | null }> = {
    0: { startsAt: null, endsAt: null },
    1: { startsAt: schedule.openedAt, endsAt: schedule.quoteDeadline },
    2: { startsAt: schedule.clarificationAt, endsAt: schedule.revisionDeadline },
    3: { startsAt: schedule.evaluationAt, endsAt: schedule.evaluationDeadline },
    4: { startsAt: null, endsAt: null },
  };

  return STEPS.map((step) => {
    const window = windows[step.ordinal];
    let state: PhaseStep['state'];

    if (step.ordinal === ordinal) state = 'CURRENT';
    else if (step.ordinal > ordinal) state = 'UPCOMING';
    else if (step.ordinal === 2 && !schedule.clarificationAt) state = 'SKIPPED';
    else state = 'DONE';

    return { ...step, ...window, state };
  });
}

/**
 * A countdown in the units a person would say it in.
 *
 * Rounded down deliberately. "1 day left" with twenty hours on the clock is a
 * supplier who plans for tomorrow morning and misses; "20 hours left" is not.
 */
export function timeRemaining(secondsRemaining: number | null): string | null {
  if (secondsRemaining === null) return null;
  if (secondsRemaining <= 0) return 'Closed';

  const minutes = Math.floor(secondsRemaining / 60);
  if (minutes < 60) return `${Math.max(minutes, 1)} min left`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} left`;

  return `${Math.floor(hours / 24)} days left`;
}

/** Whether a countdown should be shown as pressing rather than merely present. */
export function isClosingSoon(phase: RfqPhase): boolean {
  return (
    !phase.overdue &&
    phase.secondsRemaining !== null &&
    phase.secondsRemaining <= 24 * 3600
  );
}

/** What to tell a supplier who cannot quote right now. */
export function quotingMessage(phase: RfqPhase): string | null {
  if (phase.quotingOpen) return null;

  switch (phase.quotingRefusal) {
    case 'NOT_OPEN_YET':
      return 'This enquiry has not opened for quoting yet.';
    case 'DEADLINE_PASSED':
      return 'The quoting deadline has passed. Ask the buyer to extend it if you still want to quote.';
    case 'QUOTING_CLOSED':
      return 'Quoting has closed for this enquiry.';
    case 'NO_SUCH_RFQ':
      return 'This enquiry is no longer available.';
    default:
      return 'Quoting is closed for this enquiry.';
  }
}

export function formatWindow(startsAt: string | null, endsAt: string | null): string {
  const date = (value: string) =>
    new Date(value).toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST';

  if (startsAt && endsAt) return `${date(startsAt)} — ${date(endsAt)}`;
  if (endsAt) return `Until ${date(endsAt)}`;
  if (startsAt) return `From ${date(startsAt)}`;
  return 'No window set';
}
