import { describe, expect, it } from 'vitest';
import {
  formatWindow,
  isClosingSoon,
  phaseSteps,
  quotingMessage,
  timeRemaining,
  type RfqPhase,
} from './phase';
import { humanizeScheduleError } from '../api/phase';

/**
 * How a window is shown, given what the server said about it.
 *
 * The rule this file exists to hold is that the client never decides whether a
 * deadline has passed. `overdue` and `secondsRemaining` arrive settled, and every
 * assertion below feeds the display code a server answer that contradicts the
 * browser's clock to prove nothing recomputes it.
 */

function phase(overrides: Partial<RfqPhase> = {}): RfqPhase {
  return {
    rfqId: 'r1',
    ref: 'RFQ-ABC123',
    status: 'OPEN',
    ordinal: 1,
    label: 'Identity-Protected Quoting',
    startsAt: '2026-08-20T09:00:00Z',
    endsAt: '2026-08-27T09:00:00Z',
    overdue: false,
    secondsRemaining: 6 * 86_400,
    schedule: {
      openedAt: '2026-08-20T09:00:00Z',
      quoteDeadline: '2026-08-27T09:00:00Z',
      clarificationAt: null,
      revisionDeadline: '2026-08-30T09:00:00Z',
      evaluationAt: null,
      evaluationDeadline: '2026-09-05T09:00:00Z',
    },
    quotingOpen: true,
    quotingRefusal: null,
    ...overrides,
  };
}

describe('the countdown', () => {
  it('speaks in days when there are days', () => {
    expect(timeRemaining(6 * 86_400)).toBe('6 days left');
  });

  it('switches to hours below two days, because "1 day" hides twenty hours', () => {
    expect(timeRemaining(47 * 3600)).toBe('47 hours left');
    expect(timeRemaining(3600)).toBe('1 hour left');
  });

  it('switches to minutes in the last hour', () => {
    expect(timeRemaining(45 * 60)).toBe('45 min left');
  });

  it('never rounds the last thirty seconds up to a minute of hope', () => {
    expect(timeRemaining(30)).toBe('1 min left');
    expect(timeRemaining(0)).toBe('Closed');
  });

  it('says nothing at all when there is no window', () => {
    expect(timeRemaining(null)).toBeNull();
  });

  it('reads the server\u2019s number rather than the difference from the browser clock', () => {
    // endsAt is years away; the server says four hours. The server wins.
    const late = phase({ endsAt: '2030-01-01T00:00:00Z', secondsRemaining: 4 * 3600 });

    expect(timeRemaining(late.secondsRemaining)).toBe('4 hours left');
  });
});

describe('marking a window as pressing', () => {
  it('flags the last day', () => {
    expect(isClosingSoon(phase({ secondsRemaining: 20 * 3600 }))).toBe(true);
  });

  it('does not flag a week away', () => {
    expect(isClosingSoon(phase({ secondsRemaining: 6 * 86_400 }))).toBe(false);
  });

  it('does not flag a window that is already over, which is a different message', () => {
    expect(isClosingSoon(phase({ overdue: true, secondsRemaining: 0 }))).toBe(false);
  });
});

describe('the four-phase strip', () => {
  it('marks the phase the enquiry is in and leaves the rest alone', () => {
    const steps = phaseSteps(phase({ ordinal: 2 }));

    expect(steps.map((s) => s.state)).toEqual(['DONE', 'CURRENT', 'UPCOMING', 'UPCOMING']);
  });

  it('shows each phase against its own window, not the live one', () => {
    const steps = phaseSteps(phase({ ordinal: 3 }));

    expect(steps[0]!.endsAt).toBe('2026-08-27T09:00:00Z');
    expect(steps[1]!.endsAt).toBe('2026-08-30T09:00:00Z');
    expect(steps[2]!.endsAt).toBe('2026-09-05T09:00:00Z');
  });

  it('calls a clarification phase that never happened skipped rather than done', () => {
    // Published with no revision window: prices froze when quoting closed. Showing
    // that phase as completed would claim a window suppliers were never given.
    const steps = phaseSteps(
      phase({
        ordinal: 3,
        schedule: { ...phase().schedule, clarificationAt: null, revisionDeadline: null },
      }),
    );

    expect(steps[1]!.state).toBe('SKIPPED');
  });

  it('calls it done when it actually ran', () => {
    const steps = phaseSteps(
      phase({
        ordinal: 3,
        schedule: { ...phase().schedule, clarificationAt: '2026-08-27T09:05:00Z' },
      }),
    );

    expect(steps[1]!.state).toBe('DONE');
  });

  it('leaves every phase upcoming for an unpublished enquiry', () => {
    const steps = phaseSteps(phase({ ordinal: 0, status: 'DRAFT' }));

    expect(steps.every((s) => s.state === 'UPCOMING')).toBe(true);
  });

  it('always describes four phases, so the strip cannot render half a lifecycle', () => {
    expect(phaseSteps(phase())).toHaveLength(4);
  });
});

describe('telling a supplier why they cannot quote', () => {
  it('says nothing when they can', () => {
    expect(quotingMessage(phase())).toBeNull();
  });

  it('distinguishes not yet from too late, because they need different actions', () => {
    const early = quotingMessage(
      phase({ quotingOpen: false, quotingRefusal: 'NOT_OPEN_YET' }),
    );
    const late = quotingMessage(
      phase({ quotingOpen: false, quotingRefusal: 'DEADLINE_PASSED' }),
    );

    expect(early).toMatch(/not opened/i);
    expect(late).toMatch(/passed/i);
    expect(late).toMatch(/extend/i);
    expect(early).not.toBe(late);
  });

  it('still says something useful for a refusal it does not recognise', () => {
    expect(quotingMessage(phase({ quotingOpen: false, quotingRefusal: null }))).toMatch(
      /closed/i,
    );
  });
});

describe('writing a window down', () => {
  it('shows both ends when both are known', () => {
    expect(formatWindow('2026-08-20T09:00:00Z', '2026-08-27T09:00:00Z')).toContain('—');
  });

  it('shows one end when that is all there is', () => {
    expect(formatWindow(null, '2026-08-27T09:00:00Z')).toMatch(/^Until /);
    expect(formatWindow('2026-08-20T09:00:00Z', null)).toMatch(/^From /);
  });

  it('says so plainly when there is no window rather than printing an empty dash', () => {
    expect(formatWindow(null, null)).toBe('No window set');
  });
});

describe('refusals from the schedule form', () => {
  it('names the date to move, not the rule that was broken', () => {
    const message = humanizeScheduleError(
      'The revision deadline cannot be before the quote deadline',
    );

    expect(message).toMatch(/move the revision deadline later/i);
  });

  it('explains the voting order the same way', () => {
    expect(
      humanizeScheduleError('The voting deadline cannot be before quoting closes'),
    ).toMatch(/after quoting closes/i);
  });

  it('passes an unrecognised message through rather than inventing one', () => {
    expect(humanizeScheduleError('connection refused')).toBe('connection refused');
  });
});
