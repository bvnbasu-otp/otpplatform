import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Requirement Detail Specification Editing Support', () => {
  it('provides an Edit & Refine Specifications link preserving form values without reset', () => {
    const pagePath = resolve(__dirname, 'pages/RequirementDetailPage.tsx');
    const content = readFileSync(pagePath, 'utf8');

    expect(content).toContain('/intake?draft=');
    expect(content).toContain('data-testid="edit-requirement-btn"');
    expect(content).toContain('Edit &amp; Refine Specifications');
  });
});
