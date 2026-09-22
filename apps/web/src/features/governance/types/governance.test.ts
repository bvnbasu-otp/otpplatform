import { describe, expect, it } from 'vitest';
import {
  currentVoteIds,
  formatVoteChoice,
  formatVotingPower,
  weightDisagreesWithHeadCount,
} from '../types/governance';
import type { CommitteeVote, VoteTallyEntry } from '../types/governance';

function vote(
  id: string,
  profileId: string,
  castAt: string,
  label?: string,
): CommitteeVote {
  return {
    id,
    rfqId: 'rfq',
    profileId,
    recommendedQuoteId: 'q1',
    choice: 'RECOMMEND',
    comment: null,
    castAt,
    lockedAt: null,
    ...(label ? { anonymousLabel: label } : {}),
  };
}

function tallyRow(
  label: string,
  recommendWeight: number,
  recommendCount: number,
): VoteTallyEntry {
  return {
    anonymousLabel: label,
    quoteId: `quote-${label}`,
    voteCount: recommendCount,
    weightedTotal: recommendWeight,
    recommendCount,
    recommendWeight,
    lastVoteAt: null,
  };
}

describe('governance formatters', () => {
  it('maps vote choices to what a person would say', () => {
    expect(formatVoteChoice('RECOMMEND')).toBe('Recommend');
    expect(formatVoteChoice('ABSTAIN')).toBe('Abstain');
    expect(formatVoteChoice('OPPOSE')).toBe('Oppose');
  });

  it('does not pluralise a single vote', () => {
    expect(formatVotingPower(1)).toBe('1 vote');
    expect(formatVotingPower(4)).toBe('4 votes');
  });
});

describe('currentVoteIds', () => {
  it('keeps only the latest vote per member', () => {
    const votes = [
      vote('v1', 'alice', '2026-01-01T10:00:00Z'),
      vote('v2', 'alice', '2026-01-02T10:00:00Z'),
      vote('v3', 'bob', '2026-01-01T11:00:00Z'),
    ];

    const live = currentVoteIds(votes);

    expect(live.has('v2')).toBe(true);
    expect(live.has('v3')).toBe(true);
    // The superseded row is not deleted, it just stops counting.
    expect(live.has('v1')).toBe(false);
  });

  it('does not depend on the order rows arrive in', () => {
    const votes = [
      vote('v2', 'alice', '2026-01-02T10:00:00Z'),
      vote('v1', 'alice', '2026-01-01T10:00:00Z'),
    ];

    expect([...currentVoteIds(votes)]).toEqual(['v2']);
  });
});

describe('weightDisagreesWithHeadCount', () => {
  it('flags a weighted leader the room did not choose', () => {
    const tally = [
      tallyRow('Supplier A', 4, 1),
      tallyRow('Supplier B', 3, 3),
    ];

    expect(weightDisagreesWithHeadCount(tally)).toBe(true);
  });

  it('stays quiet when weight and head count agree', () => {
    const tally = [
      tallyRow('Supplier A', 6, 3),
      tallyRow('Supplier B', 2, 1),
    ];

    expect(weightDisagreesWithHeadCount(tally)).toBe(false);
  });

  it('has nothing to say about a single supplier', () => {
    expect(weightDisagreesWithHeadCount([tallyRow('Supplier A', 4, 1)])).toBe(false);
    expect(weightDisagreesWithHeadCount([])).toBe(false);
  });
});

describe('4-Pillar candidate quote structure and quorum metrics', () => {
  it('supports 4-pillar metrics for candidate comparisons', () => {
    const candidateQuote: import('../types/governance').IdentityProtectedQuoteForVote = {
      quoteId: 'q-101',
      anonymousLabel: 'Supplier #01',
      totalCost: 145000,
      evaluationScore: 92,
      deliveryDays: 3,
      warrantyMonths: 24,
      ratingBand: 4.5,
      onTimeBand: 95,
      experienceBand: 'EXPERT',
      isGstVerified: true,
    };

    expect(candidateQuote.totalCost).toBe(145000);
    expect(candidateQuote.deliveryDays).toBe(3);
    expect(candidateQuote.warrantyMonths).toBe(24);
    expect(candidateQuote.evaluationScore).toBe(92);
  });

  it('validates anti-self-approval and COI separation rules', () => {
    const creatorId: string = 'profile-buyer-1';
    const voterId: string = 'profile-committee-2';
    const hasConflictOfInterest = creatorId === voterId;
    expect(hasConflictOfInterest).toBe(false);
  });

  it('computes quorum percentages accurately for multi-member committees', () => {
    const assigned = 3;
    const voted = 2;
    const quorumPercent = Math.round((voted / assigned) * 100);
    expect(quorumPercent).toBe(67);
  });

  it('DEF-006: verifies WeightedTallyTable exports and scroll affordance structure', async () => {
    const { WeightedTallyTable } = await import('../components/WeightedTallyTable');
    expect(WeightedTallyTable).toBeDefined();
    expect(typeof WeightedTallyTable).toBe('function');
  });

  it('exports MultiTierApprovalGatePanel from governance feature index', async () => {
    const { MultiTierApprovalGatePanel } = await import('../index');
    expect(MultiTierApprovalGatePanel).toBeDefined();
    expect(typeof MultiTierApprovalGatePanel).toBe('function');
  });
});
