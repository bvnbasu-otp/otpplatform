import { describe, expect, it } from 'vitest';
import {
  applySerializedRfqPublications,
  authoritativeYearlyBonusApplies,
  countUtcCalendarQuarterBonusUsed,
  evaluatePilotRfqAllowance,
  type StoredSubscriptionSnapshot,
} from './pilot-allowance';

const NOW_JAN = '2026-01-15T12:00:00.000Z';
const NOW_FEB = '2026-02-10T12:00:00.000Z';
const NOW_APR = '2026-04-02T12:00:00.000Z';

const JAN = [
  '2026-01-05T00:00:00.000Z',
  '2026-01-06T00:00:00.000Z',
  '2026-01-07T00:00:00.000Z',
  '2026-01-08T00:00:00.000Z',
];

function stored(overrides: StoredSubscriptionSnapshot = {}): StoredSubscriptionSnapshot {
  return {
    subscriptionPlan: 'YEARLY',
    subscriptionStatus: 'ACTIVE',
    subscriptionExpiresAt: '2027-01-01T00:00:00.000Z',
    orgType: 'INDIVIDUAL',
    ...overrides,
  };
}

function allowance(
  monthlyUsed: number,
  bonusUsed: number,
  now: string,
  snapshot: StoredSubscriptionSnapshot = stored(),
) {
  return evaluatePilotRfqAllowance({
    rfqsPublishedThisMonth: monthlyUsed,
    quarterlyBonusUsedInCurrentQuarter: bonusUsed,
    storedSubscriptionPlan: snapshot.subscriptionPlan,
    subscriptionStatus: snapshot.subscriptionStatus,
    subscriptionExpiresAt: snapshot.subscriptionExpiresAt,
    orgType: snapshot.orgType,
    now,
  });
}

describe('ENT-01 yearly quarterly RFQ bonus', () => {
  it('gives a monthly plan 3 publishes and rejects the 4th', () => {
    for (const used of [0, 1, 2]) {
      const res = allowance(used, 0, NOW_JAN, stored({ subscriptionPlan: 'MONTHLY' }));
      expect(res.canPublish).toBe(true);
      expect(res.effectivePlan).toBe('MONTHLY');
      expect(res.quarterlyBonusAllowance).toBe(0);
      expect(res.remaining).toBe(3 - used);
    }
    const fourth = allowance(3, 0, NOW_JAN, stored({ subscriptionPlan: 'MONTHLY' }));
    expect(fourth.canPublish).toBe(false);
    expect(fourth.quarterlyBonusRemaining).toBe(0);
  });

  it('lets a yearly buyer publish the first 3 and exactly one bonus, then rejects the 5th', () => {
    for (const used of [0, 1, 2]) {
      expect(allowance(used, 0, NOW_JAN).canPublish).toBe(true);
    }
    const bonus = allowance(3, 0, NOW_JAN);
    expect(bonus.effectivePlan).toBe('YEARLY');
    expect(bonus.canPublish).toBe(true);
    expect(bonus.remaining).toBe(0);
    expect(bonus.quarterlyBonusAllowance).toBe(1);
    expect(bonus.quarterlyBonusRemaining).toBe(1);
    expect(bonus.label).toContain('quarterly bonus 1 of 1');

    const fifth = allowance(4, 1, NOW_JAN);
    expect(fifth.canPublish).toBe(false);
    expect(fifth.quarterlyBonusRemaining).toBe(0);
  });

  it('rejects a 5th even when the quarter counter is under-reported', () => {
    expect(allowance(4, 0, NOW_JAN).canPublish).toBe(false);
  });

  it('restores 3 the next month and does not restore the consumed quarterly bonus', () => {
    const february = allowance(0, countUtcCalendarQuarterBonusUsed(JAN, NOW_FEB), NOW_FEB);
    expect(february.remaining).toBe(3);
    expect(february.quarterlyBonusRemaining).toBe(0);
    expect(february.canPublish).toBe(true);

    const fourthInFebruary = allowance(3, 1, NOW_FEB);
    expect(fourthInFebruary.canPublish).toBe(false);
  });

  it('grants one new bonus in the next calendar quarter', () => {
    expect(countUtcCalendarQuarterBonusUsed(JAN, NOW_APR)).toBe(0);
    const aprilBonus = allowance(3, 0, NOW_APR);
    expect(aprilBonus.canPublish).toBe(true);
    expect(aprilBonus.quarterlyBonusRemaining).toBe(1);
    expect(allowance(4, 1, NOW_APR).canPublish).toBe(false);
  });

  it('uses UTC calendar quarters, not a rolling 3-month window', () => {
    expect(countUtcCalendarQuarterBonusUsed(['2026-03-31T23:59:59.999Z'], '2026-03-31T23:59:59.999Z')).toBe(0);
    const fourInMarch = Array.from({ length: 4 }, (_, i) => `2026-03-${10 + i}T00:00:00.000Z`);
    expect(countUtcCalendarQuarterBonusUsed(fourInMarch, '2026-03-20T00:00:00.000Z')).toBe(1);
    expect(countUtcCalendarQuarterBonusUsed(fourInMarch, '2026-04-01T00:00:00.000Z')).toBe(0);
    expect(countUtcCalendarQuarterBonusUsed(['2026-01-02T00:00:00.000Z'], NOW_JAN)).toBe(0);
  });

  it.each(['INDIVIDUAL', 'COMMUNITY', 'RWA', 'MSME'] as const)(
    'grants the bonus to yearly %s buyers',
    (orgType) => {
      const res = allowance(3, 0, NOW_JAN, stored({ orgType }));
      expect(res.canPublish).toBe(true);
      expect(res.quarterlyBonusRemaining).toBe(1);
    },
  );

  it.each(['ENTERPRISE', 'INSTITUTION', 'SOCIETY', '', null] as const)(
    'does not grant the bonus to non-customer org type %s',
    (orgType) => {
      expect(allowance(3, 0, NOW_JAN, stored({ orgType })).canPublish).toBe(false);
    },
  );

  it.each(['MONTHLY', 'PILOT_FREE', 'ANNUAL', 'YEAR', 'UNKNOWN', '', null, 'YEARLY-PLUS'] as const)(
    'does not grant the bonus for stored plan %s',
    (subscriptionPlan) => {
      expect(authoritativeYearlyBonusApplies(stored({ subscriptionPlan }), NOW_JAN)).toBe(false);
      expect(allowance(3, 0, NOW_JAN, stored({ subscriptionPlan })).canPublish).toBe(false);
    },
  );

  it('accepts the same YEARLY token the payment writer stores, including trim and case', () => {
    expect(authoritativeYearlyBonusApplies(stored({ subscriptionPlan: ' yearly ' }), NOW_JAN)).toBe(true);
    expect(authoritativeYearlyBonusApplies(stored({ subscriptionPlan: 'Yearly' }), NOW_JAN)).toBe(true);
  });

  it('does not let a client-supplied YEARLY override a stored monthly plan', () => {
    const clientSuppliedPlan = 'YEARLY';
    const res = allowance(3, 0, NOW_JAN, stored({ subscriptionPlan: 'MONTHLY' }));
    expect(clientSuppliedPlan).toBe('YEARLY');
    expect(res.effectivePlan).toBe('MONTHLY');
    expect(res.canPublish).toBe(false);
  });

  it('withholds the bonus when the stored yearly plan is expired or not ACTIVE', () => {
    expect(
      allowance(3, 0, NOW_JAN, stored({ subscriptionExpiresAt: '2025-12-31T23:59:59.999Z' })).canPublish,
    ).toBe(false);
    expect(allowance(3, 0, NOW_JAN, stored({ subscriptionExpiresAt: NOW_JAN })).canPublish).toBe(true);
    expect(allowance(3, 0, NOW_JAN, stored({ subscriptionStatus: 'EXPIRED' })).canPublish).toBe(false);
    expect(allowance(3, 0, NOW_JAN, stored({ subscriptionStatus: 'TRIAL' })).canPublish).toBe(false);
    expect(allowance(3, 0, NOW_JAN, stored({ subscriptionStatus: 'GRACE' })).canPublish).toBe(false);
    expect(allowance(3, 0, NOW_JAN, stored({ subscriptionStatus: null })).canPublish).toBe(true);
    expect(allowance(3, 0, NOW_JAN, stored({ subscriptionExpiresAt: null })).canPublish).toBe(true);
    expect(allowance(3, 0, NOW_JAN, stored({ subscriptionExpiresAt: 'not-a-date' })).canPublish).toBe(false);
  });

  it('does not multiply the bonus by sourcing mode or duplicate payment rows', () => {
    const created = JAN.slice(0, 4);
    const sourcingModes = ['OPEN_RFQ', 'IDENTITY_PROTECTED', 'DIRECT', 'OPEN_RFQ', 'DIRECT', 'DIRECT'];
    const paymentRows = ['pay-1', 'pay-1-duplicate', 'pay-2'];
    expect(sourcingModes.length).toBeGreaterThan(created.length);
    expect(paymentRows.length).toBeGreaterThan(1);
    expect(countUtcCalendarQuarterBonusUsed(created, NOW_JAN)).toBe(1);
    expect(allowance(created.length, 1, NOW_JAN).canPublish).toBe(false);
    expect(allowance(3, 0, NOW_JAN).quarterlyBonusAllowance).toBe(1);
  });

  it('lets exactly one of two serialized final-bonus attempts succeed', () => {
    const existing = JAN.slice(0, 3);
    const race = applySerializedRfqPublications({
      existingCreatedAts: existing,
      now: '2026-01-20T00:00:00.000Z',
      attempts: 2,
      stored: stored(),
    });
    expect(race.successes).toBe(1);
    expect(race.failures).toBe(1);
    expect(existing).toHaveLength(3);
    expect(race.committedCreatedAts).toHaveLength(4);
    expect(countUtcCalendarQuarterBonusUsed(race.committedCreatedAts, NOW_JAN)).toBe(1);
  });

  it('serializes the last monthly slot so two racers do not both pass a monthly cap', () => {
    const existing = JAN.slice(0, 2);
    const race = applySerializedRfqPublications({
      existingCreatedAts: existing,
      now: NOW_JAN,
      attempts: 2,
      stored: stored({ subscriptionPlan: 'MONTHLY' }),
    });
    expect(race.successes).toBe(1);
    expect(race.failures).toBe(1);
  });

  it('does not burn the bonus when the winning insert is discarded', () => {
    const existing = JAN.slice(0, 3);
    const attempted = applySerializedRfqPublications({
      existingCreatedAts: existing,
      now: '2026-01-20T00:00:00.000Z',
      attempts: 1,
      stored: stored(),
    });
    expect(attempted.successes).toBe(1);
    const afterRollback = applySerializedRfqPublications({
      existingCreatedAts: existing,
      now: '2026-01-20T00:00:00.000Z',
      attempts: 1,
      stored: stored(),
    });
    expect(afterRollback.successes).toBe(1);
    expect(existing).toHaveLength(3);
  });

  it('counts the same published rows once when the check is repeated', () => {
    const first = countUtcCalendarQuarterBonusUsed(JAN, NOW_JAN);
    const second = countUtcCalendarQuarterBonusUsed(JAN, NOW_JAN);
    expect(first).toBe(1);
    expect(second).toBe(first);
    expect(allowance(4, first, NOW_JAN).canPublish).toBe(false);
    expect(allowance(4, second, NOW_JAN).canPublish).toBe(false);
  });
});
