import type { RequirementStatus } from '../enums/procurement';

const ALLOWED: Partial<Record<RequirementStatus, readonly RequirementStatus[]>> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['RFQ_CREATED', 'CANCELLED'],
  RFQ_CREATED: ['QUOTING', 'CANCELLED'],
  QUOTING: ['NEGOTIATION', 'EVALUATION', 'CANCELLED'],
  NEGOTIATION: ['EVALUATION', 'CANCELLED'],
  EVALUATION: ['AWARDED', 'CANCELLED'],
  AWARDED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
};

export function canTransitionRequirement(
  from: RequirementStatus,
  to: RequirementStatus,
): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
