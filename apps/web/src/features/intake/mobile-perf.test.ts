import { describe, expect, it } from 'vitest';
import type { AttributeDef, AttributeValue } from '@otp/domain';

export function groupAttributesForMobile<T extends { isRequired: boolean }>(
  attributes: T[],
): { mandatory: T[]; optional: T[] } {
  const mandatory = attributes.filter((a) => a.isRequired);
  const optional = attributes.filter((a) => !a.isRequired);
  return { mandatory, optional };
}

describe('Mobile Intake Form Specifications Virtualization', () => {
  const sampleAttrs: Array<Pick<AttributeDef, 'code' | 'label' | 'isRequired' | 'dataType'>> = [
    { code: 'attr_1', label: 'Thickness (mm)', isRequired: true, dataType: 'NUMBER' },
    { code: 'attr_2', label: 'Material Grade', isRequired: true, dataType: 'TEXT' },
    { code: 'attr_3', label: 'Color Code', isRequired: false, dataType: 'TEXT' },
    { code: 'attr_4', label: 'Packaging Type', isRequired: false, dataType: 'TEXT' },
    { code: 'attr_5', label: 'Brand Preference', isRequired: false, dataType: 'TEXT' },
  ];

  it('separates mandatory from optional attributes for collapsible rendering', () => {
    const { mandatory, optional } = groupAttributesForMobile(sampleAttrs);
    expect(mandatory.length).toBe(2);
    expect(optional.length).toBe(3);
  });

  it('validates all mandatory fields before progressing to commercial terms', () => {
    const { mandatory } = groupAttributesForMobile(sampleAttrs);
    const incompleteValues: Record<string, AttributeValue> = { attr_1: 12 };

    const missing = mandatory.filter((m) => incompleteValues[m.code] === undefined);
    expect(missing.length).toBe(1);
    expect(missing[0]?.code).toBe('attr_2');
  });
});
