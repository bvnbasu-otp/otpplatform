import { describe, expect, it } from 'vitest';

export interface AuditRecord {
  readonly id: string;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly actorId: string | null;
  readonly organizationId: string | null;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface CommitteeVoteRecord {
  readonly id: string;
  readonly rfqId: string;
  readonly profileId: string;
  readonly recommendedQuoteId: string | null;
  readonly choice: 'RECOMMEND' | 'OPPOSE' | 'ABSTAIN';
  readonly votingPower: number;
  readonly castAt: string;
  readonly supersedesVoteId: string | null;
}

export function assertMonotonicVoteSequence(votes: CommitteeVoteRecord[]): void {
  for (let i = 1; i < votes.length; i++) {
    const prev = new Date(votes[i - 1]!.castAt).getTime();
    const curr = new Date(votes[i]!.castAt).getTime();
    if (curr <= prev) {
      throw new Error(`Monotonicity violation: vote ${votes[i]!.id} castAt (${votes[i]!.castAt}) must be strictly after previous vote (${votes[i - 1]!.castAt})`);
    }
  }
}

export function getLatestEffectiveVotes(votes: CommitteeVoteRecord[]): Map<string, CommitteeVoteRecord> {
  const latestByMember = new Map<string, CommitteeVoteRecord>();
  // Sort ascending by castAt
  const sorted = [...votes].sort((a, b) => new Date(a.castAt).getTime() - new Date(b.castAt).getTime());
  for (const vote of sorted) {
    latestByMember.set(vote.profileId, vote);
  }
  return latestByMember;
}

export function calculateWeightedTally(effectiveVotes: CommitteeVoteRecord[]): {
  totalVotes: number;
  totalWeight: number;
  recommendWeightByQuote: Record<string, number>;
  opposeCount: number;
  abstainCount: number;
} {
  let totalWeight = 0;
  let opposeCount = 0;
  let abstainCount = 0;
  const recommendWeightByQuote: Record<string, number> = {};

  for (const v of effectiveVotes) {
    totalWeight += v.votingPower;
    if (v.choice === 'OPPOSE') {
      opposeCount++;
    } else if (v.choice === 'ABSTAIN') {
      abstainCount++;
    } else if (v.choice === 'RECOMMEND' && v.recommendedQuoteId) {
      recommendWeightByQuote[v.recommendedQuoteId] = (recommendWeightByQuote[v.recommendedQuoteId] ?? 0) + v.votingPower;
    }
  }

  return {
    totalVotes: effectiveVotes.length,
    totalWeight,
    recommendWeightByQuote,
    opposeCount,
    abstainCount,
  };
}

describe('Phase 30 — Governance Audit & Immutability Verification Engine', () => {
  describe('Audit Event Immutability & Structure', () => {
    it('creates immutable audit event representations with frozen payload', () => {
      const event: AuditRecord = Object.freeze({
        id: 'audit-001',
        eventType: 'award.recorded',
        entityType: 'rfq',
        entityId: 'rfq-101',
        actorId: 'profile-mgr-01',
        organizationId: 'org-durga',
        payload: Object.freeze({ quoteId: 'quote-002', totalCost: 7800 }),
        occurredAt: '2026-09-18T10:00:00.000Z',
      });

      expect(event.eventType).toBe('award.recorded');
      expect(event.payload.quoteId).toBe('quote-002');
      expect(() => {
        (event as any).eventType = 'mutated';
      }).toThrow();
    });
  });

  describe('Committee Vote Monotonicity & Superseding Invariant', () => {
    const member1 = 'profile-comm-01';
    const member2 = 'profile-comm-02';
    const rfqId = 'rfq-test-borewell';

    it('preserves complete voting history across position revisions without destructive updates', () => {
      const voteHistory: CommitteeVoteRecord[] = [
        {
          id: 'v-001',
          rfqId,
          profileId: member1,
          recommendedQuoteId: 'quote-a',
          choice: 'RECOMMEND',
          votingPower: 3,
          castAt: '2026-09-18T10:00:00.000Z',
          supersedesVoteId: null,
        },
        {
          id: 'v-002',
          rfqId,
          profileId: member2,
          recommendedQuoteId: 'quote-b',
          choice: 'RECOMMEND',
          votingPower: 3,
          castAt: '2026-09-18T10:05:00.000Z',
          supersedesVoteId: null,
        },
        // Member 1 revises their position to quote-b
        {
          id: 'v-003',
          rfqId,
          profileId: member1,
          recommendedQuoteId: 'quote-b',
          choice: 'RECOMMEND',
          votingPower: 3,
          castAt: '2026-09-18T10:10:00.000Z',
          supersedesVoteId: 'v-001',
        },
      ];

      expect(() => assertMonotonicVoteSequence(voteHistory)).not.toThrow();
      expect(voteHistory.length).toBe(3); // All 3 records preserved in history

      const effective = getLatestEffectiveVotes(voteHistory);
      expect(effective.size).toBe(2);
      expect(effective.get(member1)?.recommendedQuoteId).toBe('quote-b');
      expect(effective.get(member1)?.supersedesVoteId).toBe('v-001');
      expect(effective.get(member2)?.recommendedQuoteId).toBe('quote-b');

      const tally = calculateWeightedTally(Array.from(effective.values()));
      expect(tally.totalVotes).toBe(2);
      expect(tally.totalWeight).toBe(6);
      expect(tally.recommendWeightByQuote['quote-b']).toBe(6);
      expect(tally.recommendWeightByQuote['quote-a']).toBeUndefined();
    });

    it('detects timestamp monotonicity violations', () => {
      const invalidHistory: CommitteeVoteRecord[] = [
        {
          id: 'v-001',
          rfqId,
          profileId: member1,
          recommendedQuoteId: 'quote-a',
          choice: 'RECOMMEND',
          votingPower: 3,
          castAt: '2026-09-18T10:15:00.000Z',
          supersedesVoteId: null,
        },
        {
          id: 'v-002',
          rfqId,
          profileId: member1,
          recommendedQuoteId: 'quote-b',
          choice: 'RECOMMEND',
          votingPower: 3,
          castAt: '2026-09-18T10:00:00.000Z', // In the past!
          supersedesVoteId: 'v-001',
        },
      ];

      expect(() => assertMonotonicVoteSequence(invalidHistory)).toThrow(/Monotonicity violation/);
    });
  });
});
