import { describe, expect, it } from 'vitest';
import { buildCommitteeQuorumViewModel, resolveSoloBuyerMode } from './committee-quorum-display';
import type { VotingSummary } from '../types/governance';

const committeeSummary: VotingSummary = {
  assignedMembers: 5,
  membersVoted: 2,
  pendingMembers: 3,
  weightCast: 2,
  abstained: 0,
  opposed: 0,
  votesLockedAt: null,
  votingOpen: true,
  quorumRequired: 4,
  quorumMet: false,
  leader: null,
};

describe('committee quorum display integrity', () => {
  it('does not treat missing summary as solo committee with fabricated size', () => {
    const solo = resolveSoloBuyerMode({
      summaryLoadState: 'failed',
      summary: null,
      myVoteBuyerType: 'COMMUNITY',
    });
    expect(solo).toBe(false);

    const view = buildCommitteeQuorumViewModel({
      summaryLoadState: 'failed',
      summary: null,
      isSoloBuyer: false,
    });
    expect(view.mode).toBe('unavailable');
    expect(view.assigned).toBeUndefined();
    expect(view.quorumMet).toBeUndefined();
  });

  it('uses authoritative summary fields when ready', () => {
    const view = buildCommitteeQuorumViewModel({
      summaryLoadState: 'ready',
      summary: committeeSummary,
      isSoloBuyer: false,
    });
    expect(view.mode).toBe('committee');
    expect(view.assigned).toBe(5);
    expect(view.votedCount).toBe(2);
    expect(view.quorumRequired).toBe(4);
    expect(view.quorumMet).toBe(false);
    expect(view.quorumPercent).toBe(40);
  });

  it('marks solo mode from individual buyer type without inventing quorum', () => {
    expect(
      resolveSoloBuyerMode({
        summaryLoadState: 'failed',
        summary: null,
        myVoteBuyerType: 'INDIVIDUAL',
      }),
    ).toBe(true);
    expect(
      buildCommitteeQuorumViewModel({
        summaryLoadState: 'failed',
        summary: null,
        isSoloBuyer: true,
      }).mode,
    ).toBe('solo');
  });

  it('distinguishes loading from failed summary', () => {
    const loading = buildCommitteeQuorumViewModel({
      summaryLoadState: 'loading',
      summary: null,
      isSoloBuyer: false,
    });
    expect(loading.mode).toBe('unavailable');
    expect(loading.unavailableReason).toMatch(/Loading/i);
  });
});
