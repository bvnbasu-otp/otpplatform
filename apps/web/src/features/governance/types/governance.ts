import type {
  CoiStatus,
  OrganizationType,
  RfqStatus,
  VoteChoice,
} from '@otp/domain';

export interface CoiDeclaration {
  id: string;
  rfqId: string;
  profileId: string;
  status: CoiStatus;
  description: string | null;
  declaredAt: string;
}

export interface CommitteeVote {
  id: string;
  rfqId: string;
  profileId: string;
  recommendedQuoteId: string | null;
  choice: VoteChoice;
  comment: string | null;
  castAt: string;
  lockedAt: string | null;
  voterName?: string;
  anonymousLabel?: string;
}

export interface IdentityProtectedQuoteForVote {
  quoteId: string;
  anonymousLabel: string;
  totalCost: number;
  evaluationScore: number | null;
  deliveryDays: number | null;
}

// Legacy alias
export type BlindQuoteForVote = IdentityProtectedQuoteForVote;

export interface RfqGovernanceStatus {
  rfqId: string;
  rfqStatus: RfqStatus;
  requirementStatus: string;
  isEvaluating: boolean;
}

export function formatVoteChoice(choice: VoteChoice): string {
  switch (choice) {
    case 'RECOMMEND':
      return 'Recommend';
    case 'ABSTAIN':
      return 'Abstain';
    case 'OPPOSE':
      return 'Oppose';
    default:
      return choice;
  }
}

/**
 * One supplier's standing in the vote, keyed by alias.
 *
 * Weight and head count are both reported because they can disagree, and when
 * they do the committee deserves to see it rather than be handed a winner.
 */
export interface VoteTallyEntry {
  anonymousLabel: string;
  quoteId: string | null;
  voteCount: number;
  weightedTotal: number;
  recommendCount: number;
  recommendWeight: number;
  lastVoteAt: string | null;
}

export interface VotingSummary {
  assignedMembers: number;
  membersVoted: number;
  pendingMembers: number;
  weightCast: number;
  abstained: number;
  opposed: number;
  votesLockedAt: string | null;
  votingOpen: boolean;
  quorumRequired?: number;
  quorumMet?: boolean;
  leader: {
    anonymousLabel: string;
    quoteId: string | null;
    recommendWeight: number;
    recommendCount: number;
  } | null;
}

/** The caller's own current vote, which they may revise until the award locks. */
export interface MyVote {
  voteId: string;
  recommendedQuoteId: string | null;
  recommendedAlias: string | null;
  choice: VoteChoice;
  comment: string | null;
  votingPower: number;
  buyerType: OrganizationType | null;
  castAt: string;
}

/**
 * The ids of the votes that still count.
 *
 * committee_votes is append-only: revising is a new row, not an edit. The
 * earlier rows stay visible so the trail shows a member changed their mind,
 * but only the latest per member counts toward the result.
 */
export function currentVoteIds(votes: CommitteeVote[]): Set<string> {
  const latest = new Map<string, CommitteeVote>();

  for (const vote of votes) {
    const held = latest.get(vote.profileId);
    if (!held || vote.castAt >= held.castAt) latest.set(vote.profileId, vote);
  }

  return new Set([...latest.values()].map((v) => v.id));
}

export function formatVotingPower(power: number): string {
  return power === 1 ? '1 vote' : `${power} votes`;
}

/**
 * True when weight and head count point at different suppliers.
 *
 * A chair about to lock an award on weight alone should know that the room
 * would have chosen someone else.
 */
export function weightDisagreesWithHeadCount(tally: VoteTallyEntry[]): boolean {
  if (tally.length < 2) return false;

  const byWeight = [...tally].sort(
    (a, b) => b.recommendWeight - a.recommendWeight,
  )[0];
  const byCount = [...tally].sort((a, b) => b.recommendCount - a.recommendCount)[0];

  return (
    byWeight !== undefined &&
    byCount !== undefined &&
    byWeight.anonymousLabel !== byCount.anonymousLabel
  );
}
