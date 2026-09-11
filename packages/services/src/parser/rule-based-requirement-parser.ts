import type { RequirementType } from '@otp/domain';
import type {
  RequirementParserInput,
  RequirementParserService,
  StructuredSpecs,
} from '../interfaces/requirement-parser-service';

const BOREWELL_PATTERNS = [
  /\b(\d+)\s*hp\b/i,
  /borewell/i,
  /motor\s*winding/i,
  /submersible/i,
];

export class RuleBasedRequirementParser implements RequirementParserService {
  parse(input: RequirementParserInput): StructuredSpecs {
    const text = `${input.description} ${JSON.stringify(input.hints ?? {})}`;
    const fields: Record<string, unknown> = { ...(input.hints ?? {}) };

    const hpMatch = text.match(/\b(\d+)\s*hp\b/i);
    if (hpMatch) {
      fields.motorCapacityHp = Number(hpMatch[1]);
    }

    if (/borewell/i.test(text)) fields.serviceCategory = 'Borewell';
    if (/motor\s*winding|winding/i.test(text)) fields.service = 'motor_winding';

    let category = 'General';
    if (fields.serviceCategory === 'Borewell' || /motor winding/i.test(text)) {
      category = 'Borewell / Motor Winding';
    }

    return {
      category,
      requirementType: input.requirementType,
      fields,
    };
  }
}

export function isBorewellLike(description: string): boolean {
  return BOREWELL_PATTERNS.some((p) => p.test(description));
}
