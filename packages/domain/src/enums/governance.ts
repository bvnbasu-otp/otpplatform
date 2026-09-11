/** Conflict-of-interest declaration status */
export const CoiStatus = {
  DECLARED_NONE: 'DECLARED_NONE',
  DECLARED_CONFLICT: 'DECLARED_CONFLICT',
  WAIVED: 'WAIVED',
} as const;

export type CoiStatus = (typeof CoiStatus)[keyof typeof CoiStatus];

/** Committee member vote choice */
export const VoteChoice = {
  RECOMMEND: 'RECOMMEND',
  ABSTAIN: 'ABSTAIN',
  OPPOSE: 'OPPOSE',
} as const;

export type VoteChoice = (typeof VoteChoice)[keyof typeof VoteChoice];

/** Org-level approval policy templates */
export const ApprovalPolicyType = {
  COMMUNITY_SIMPLE_MAJORITY: 'COMMUNITY_SIMPLE_MAJORITY',
  UNANIMOUS: 'UNANIMOUS',
  MANAGER_ONLY: 'MANAGER_ONLY',
} as const;

export type ApprovalPolicyType =
  (typeof ApprovalPolicyType)[keyof typeof ApprovalPolicyType];

/** Canonical lifecycle — see OTP-STATE-MACHINES.md#6-approval-instance */
export const ApprovalInstanceStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export type ApprovalInstanceStatus =
  (typeof ApprovalInstanceStatus)[keyof typeof ApprovalInstanceStatus];
