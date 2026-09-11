import type {
  ApprovalPolicyConfig,
  ApprovalPolicyService,
} from '../interfaces/approval-policy-service';

/** Default COMMUNITY_SIMPLE_MAJORITY policy aligned with supabase seed. */
export const DEFAULT_APPROVAL_POLICY: ApprovalPolicyConfig = {
  policyCode: 'COMMUNITY_SIMPLE_MAJORITY',
  rules: {
    minQuotesRequired: 1,
    quoteDeadlineRequired: true,
    committeeVoteRequired: true,
    minCommitteeVotes: 2,
    conflictDeclarationRequired: true,
    awardRequiresJustification: true,
    finalAwardRoles: ['OWNER', 'MANAGER', 'APPROVER'],
    revealOnAward: true,
  },
};

export class DefaultApprovalPolicyService implements ApprovalPolicyService {
  async getPolicyForRfq(_rfqId: string): Promise<ApprovalPolicyConfig> {
    return { ...DEFAULT_APPROVAL_POLICY, rules: { ...DEFAULT_APPROVAL_POLICY.rules } };
  }

  canAward(actorRole: string, policy: ApprovalPolicyConfig): boolean {
    return policy.rules.finalAwardRoles.includes(actorRole);
  }

  canVote(actorRole: string, policy: ApprovalPolicyConfig): boolean {
    return (
      actorRole === 'COMMITTEE_MEMBER' ||
      actorRole === 'MANAGER' ||
      actorRole === 'OWNER'
    );
  }
}
