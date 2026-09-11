export interface ApprovalPolicyConfig {
  policyCode: string;
  rules: {
    minQuotesRequired: number;
    quoteDeadlineRequired: boolean;
    committeeVoteRequired: boolean;
    minCommitteeVotes: number;
    conflictDeclarationRequired: boolean;
    awardRequiresJustification: boolean;
    finalAwardRoles: string[];
    revealOnAward: boolean;
  };
}

export interface ApprovalPolicyService {
  getPolicyForRfq(rfqId: string): Promise<ApprovalPolicyConfig>;
  canAward(actorRole: string, policy: ApprovalPolicyConfig): boolean;
  canVote(actorRole: string, policy: ApprovalPolicyConfig): boolean;
}
