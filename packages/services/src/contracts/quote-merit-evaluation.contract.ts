/**
 * OTP Next — Quote Merit Evaluation, Voting & Anti-Collusion Contracts
 * Modules 14, 15, 16
 */

import type { Result } from '../types/result';
import type { ServiceError } from '../types/errors';
import type { ActorContext } from '../types/actor-context';

// ==========================================
// Module 14: Quote Comparison & Smart Merit
// ==========================================

export interface MeritWeightsDto {
  priceWeightPercentage: number; // e.g. 50%
  deliveryWeightPercentage: number; // e.g. 20%
  warrantyWeightPercentage: number; // e.g. 15%
  ratingWeightPercentage: number; // e.g. 15%
}

export interface QuoteComparisonRowDto {
  quoteId: string;
  pseudonymLabel: string;
  totalLandedCost: number;
  deliveryDays: number;
  warrantyMonths: number;
  meritScore: number; // 0 to 100
  isRecommended: boolean;
}

export interface SmartMeritComparisonDto {
  rfqId: string;
  weights: MeritWeightsDto;
  quotes: QuoteComparisonRowDto[];
  recommendedQuoteId: string | null;
}

export interface ConfigureWeightsInput {
  rfqId: string;
  weights: MeritWeightsDto;
}

export interface SmartMeritContract {
  getMeritComparison(actor: ActorContext, rfqId: string): Promise<Result<SmartMeritComparisonDto, ServiceError>>;
  configureMeritWeights(actor: ActorContext, input: ConfigureWeightsInput): Promise<Result<SmartMeritComparisonDto, ServiceError>>;
}

// ==========================================
// Module 15: Evaluation & Voting
// ==========================================

export type VoteDecision = 'APPROVE' | 'REJECT' | 'ABSTAIN';

export interface CommitteeVoteDto {
  voteId: string;
  rfqId: string;
  quoteId: string;
  voterProfileId: string;
  voterName: string;
  seatName: string;
  decision: VoteDecision;
  comment?: string | null;
  castAt: string;
}

export interface VotingTallyDto {
  rfqId: string;
  quoteId: string;
  totalEligibleVoters: number;
  totalVotesCast: number;
  approvalsCount: number;
  rejectionsCount: number;
  abstentionsCount: number;
  quorumReached: boolean;
  isApproved: boolean;
}

export interface CastVoteInput {
  rfqId: string;
  quoteId: string;
  decision: VoteDecision;
  comment?: string;
}

export interface EvaluationVotingContract {
  getVotingTally(actor: ActorContext, rfqId: string, quoteId: string): Promise<Result<VotingTallyDto, ServiceError>>;
  castVote(actor: ActorContext, input: CastVoteInput): Promise<Result<CommitteeVoteDto, ServiceError>>;
  checkQuorumStatus(actor: ActorContext, rfqId: string): Promise<Result<{ quorumReached: boolean; message: string }, ServiceError>>;
}

// ==========================================
// Module 16: Conflict of Interest & Anti-Self-Approval
// ==========================================

export interface ConflictDeclarationDto {
  declarationId: string;
  rfqId: string;
  profileId: string;
  declarantName: string;
  hasConflict: boolean;
  conflictReason?: string | null;
  isIrrevocable: boolean;
  declaredAt: string;
}

export interface DeclareConflictInput {
  rfqId: string;
  hasConflict: boolean;
  conflictReason?: string;
}

export interface ConflictOfInterestContract {
  declareConflict(actor: ActorContext, input: DeclareConflictInput): Promise<Result<ConflictDeclarationDto, ServiceError>>;
  listDeclarationsForRfq(actor: ActorContext, rfqId: string): Promise<Result<ConflictDeclarationDto[], ServiceError>>;
  assertNoConflict(actor: ActorContext, rfqId: string): Promise<Result<{ hasConflict: boolean; isBarredFromVoting: boolean }, ServiceError>>;
}
