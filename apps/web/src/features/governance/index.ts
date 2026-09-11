export { CommitteeVotePage } from './pages/CommitteeVotePage';
export { WeightedTallyTable } from './components/WeightedTallyTable';
export {
  currentVoteIds,
  formatVoteChoice,
  formatVotingPower,
  weightDisagreesWithHeadCount,
} from './types/governance';
export type {
  CoiDeclaration,
  CommitteeVote,
  IdentityProtectedQuoteForVote,
  BlindQuoteForVote, // Legacy alias
  MyVote,
  RfqGovernanceStatus,
  VoteTallyEntry,
  VotingSummary,
} from './types/governance';
export {
  castVote,
  fetchMyVote,
  fetchVotes,
  fetchVoteTally,
  fetchVotingSummary,
} from './api/committee-votes';
