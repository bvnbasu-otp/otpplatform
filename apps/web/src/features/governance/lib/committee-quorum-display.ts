import type { OrganizationType } from '@otp/domain';
import type { VotingSummary } from '../types/governance';

export type CommitteeSummaryLoadState = 'loading' | 'ready' | 'failed';

export interface CommitteeQuorumViewModel {
  mode: 'solo' | 'committee' | 'unavailable';
  assigned?: number;
  votedCount?: number;
  quorumRequired?: number;
  quorumMet?: boolean;
  quorumPercent?: number;
  unavailableReason?: string;
}

export function resolveSoloBuyerMode(input: {
  summaryLoadState: CommitteeSummaryLoadState;
  summary: VotingSummary | null;
  myVoteBuyerType: OrganizationType | null | undefined;
}): boolean {
  if (input.myVoteBuyerType === 'INDIVIDUAL') return true;
  if (input.summaryLoadState === 'ready' && input.summary != null && input.summary.assignedMembers <= 1) {
    return true;
  }
  return false;
}

/**
 * Quorum UI is driven only by an authoritative `rfq_voting_summary` payload.
 * Never invent committee size, thresholds, or quorum-met when summary is missing.
 */
export function buildCommitteeQuorumViewModel(input: {
  summaryLoadState: CommitteeSummaryLoadState;
  summary: VotingSummary | null;
  isSoloBuyer: boolean;
}): CommitteeQuorumViewModel {
  if (input.isSoloBuyer) {
    return { mode: 'solo' };
  }

  if (input.summaryLoadState === 'loading') {
    return {
      mode: 'unavailable',
      unavailableReason: 'Loading committee participation summary…',
    };
  }

  if (input.summaryLoadState === 'failed' || input.summary == null) {
    return {
      mode: 'unavailable',
      unavailableReason: 'Committee quorum summary is unavailable. Refresh or try again before relying on quorum status.',
    };
  }

  const assigned = input.summary.assignedMembers;
  const votedCount = input.summary.membersVoted;
  const quorumRequired = input.summary.quorumRequired ?? 0;
  const quorumMet = input.summary.quorumMet ?? false;
  const quorumPercent =
    assigned > 0 ? Math.min(100, Math.round((votedCount / assigned) * 100)) : 0;

  return {
    mode: 'committee',
    assigned,
    votedCount,
    quorumRequired,
    quorumMet,
    quorumPercent,
  };
}
