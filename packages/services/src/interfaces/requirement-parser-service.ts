import type { RequirementType } from '@otp/domain';

export interface RequirementParserInput {
  description: string;
  requirementType: RequirementType;
  hints?: Record<string, unknown>;
}

export interface StructuredSpecs {
  category: string;
  requirementType: RequirementType;
  fields: Record<string, unknown>;
}

export interface RequirementParserService {
  parse(input: RequirementParserInput): StructuredSpecs;
}
