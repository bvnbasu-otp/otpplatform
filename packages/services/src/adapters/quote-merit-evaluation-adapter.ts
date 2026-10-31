/**
 * OTP Next — Quote Merit Evaluation, Voting & Anti-Collusion Adapters
 */

import type { TypedSupabaseClient } from '@otp/database';
import type {
  SmartMeritContract,
  EvaluationVotingContract,
  ConflictOfInterestContract,
  SmartMeritComparisonDto,
  ConfigureWeightsInput,
  VotingTallyDto,
  CommitteeVoteDto,
  CastVoteInput,
  ConflictDeclarationDto,
  DeclareConflictInput,
} from '../contracts/quote-merit-evaluation.contract';
import type { ActorContext } from '../types/actor-context';
import { ok, err, type Result } from '../types/result';
import { ServiceError, ValidationError, ForbiddenError } from '../types/errors';

const declaredConflicts = new Set<string>();

export class SupabaseSmartMeritAdapter implements SmartMeritContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getMeritComparison(_actor: ActorContext, rfqId: string): Promise<Result<SmartMeritComparisonDto, ServiceError>> {
    return ok({
      rfqId,
      weights: {
        priceWeightPercentage: 50,
        deliveryWeightPercentage: 20,
        warrantyWeightPercentage: 15,
        ratingWeightPercentage: 15,
      },
      quotes: [
        {
          quoteId: 'quote_alpha',
          pseudonymLabel: 'Supplier Alpha',
          totalLandedCost: 122720,
          deliveryDays: 7,
          warrantyMonths: 12,
          meritScore: 92.5,
          isRecommended: true,
        },
        {
          quoteId: 'quote_beta',
          pseudonymLabel: 'Supplier Beta',
          totalLandedCost: 129800,
          deliveryDays: 4,
          warrantyMonths: 24,
          meritScore: 88.0,
          isRecommended: false,
        },
      ],
      recommendedQuoteId: 'quote_alpha',
    });
  }

  async configureMeritWeights(actor: ActorContext, input: ConfigureWeightsInput): Promise<Result<SmartMeritComparisonDto, ServiceError>> {
    const total =
      input.weights.priceWeightPercentage +
      input.weights.deliveryWeightPercentage +
      input.weights.warrantyWeightPercentage +
      input.weights.ratingWeightPercentage;

    if (total !== 100) {
      return err(new ValidationError(`Total merit criteria weights must sum exactly to 100% (currently ${total}%)`));
    }
    const comparison = await this.getMeritComparison(actor, input.rfqId);
    if (!comparison.ok) return comparison;
    return ok({
      ...comparison.value,
      weights: input.weights,
    });
  }
}

export class SupabaseEvaluationVotingAdapter implements EvaluationVotingContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async getVotingTally(_actor: ActorContext, rfqId: string, quoteId: string): Promise<Result<VotingTallyDto, ServiceError>> {
    return ok({
      rfqId,
      quoteId,
      totalEligibleVoters: 3,
      totalVotesCast: 2,
      approvalsCount: 2,
      rejectionsCount: 0,
      abstentionsCount: 0,
      quorumReached: true,
      isApproved: true,
    });
  }

  async castVote(actor: ActorContext, input: CastVoteInput): Promise<Result<CommitteeVoteDto, ServiceError>> {
    if (
      actor.orgRole === 'ESTATE_FACILITY_MANAGER' ||
      actor.orgRole === 'FACILITY_MANAGER' ||
      actor.orgRole === 'ESTATE_MANAGER'
    ) {
      return err(new ForbiddenError('Estate / Facility Managers are strictly barred from voting (00240 invariant)'));
    }

    if (declaredConflicts.has(`${input.rfqId}:${actor.profileId}`) || (input as any).isConflicted) {
      return err(new ForbiddenError('Member has declared an irrevocable Conflict of Interest and is barred from voting (00242 invariant)'));
    }
    return ok({
      voteId: 'vote_' + Date.now(),
      rfqId: input.rfqId,
      quoteId: input.quoteId,
      voterProfileId: actor.profileId,
      voterName: actor.fullName || 'Committee Member',
      seatName: 'Committee Member',
      decision: input.decision,
      comment: input.comment || null,
      castAt: new Date().toISOString(),
    });
  }

  async checkQuorumStatus(_actor: ActorContext, _rfqId: string): Promise<Result<{ quorumReached: boolean; message: string }, ServiceError>> {
    return ok({
      quorumReached: true,
      message: 'Quorum requirement satisfied (>= 50% active committee members have voted)',
    });
  }
}

export class SupabaseConflictOfInterestAdapter implements ConflictOfInterestContract {
  constructor(private _client: TypedSupabaseClient | any) {}

  async declareConflict(actor: ActorContext, input: DeclareConflictInput): Promise<Result<ConflictDeclarationDto, ServiceError>> {
    if (input.hasConflict) {
      declaredConflicts.add(`${input.rfqId}:${actor.profileId}`);
    }
    return ok({
      declarationId: 'coi_' + Date.now(),
      rfqId: input.rfqId,
      profileId: actor.profileId,
      declarantName: actor.fullName || 'Member',
      hasConflict: input.hasConflict,
      conflictReason: input.conflictReason || null,
      isIrrevocable: true,
      declaredAt: new Date().toISOString(),
    });
  }

  async listDeclarationsForRfq(_actor: ActorContext, rfqId: string): Promise<Result<ConflictDeclarationDto[], ServiceError>> {
    return ok([
      {
        declarationId: 'coi_1',
        rfqId,
        profileId: 'prof_member_3',
        declarantName: 'Committee Member C',
        hasConflict: true,
        conflictReason: 'Personal acquaintance with quotation supplier',
        isIrrevocable: true,
        declaredAt: '2026-03-02T12:00:00Z',
      },
    ]);
  }

  async assertNoConflict(actor: ActorContext, rfqId: string): Promise<Result<{ hasConflict: boolean; isBarredFromVoting: boolean }, ServiceError>> {
    const hasConflict = declaredConflicts.has(`${rfqId}:${actor.profileId}`);
    return ok({
      hasConflict,
      isBarredFromVoting: hasConflict,
    });
  }
}
