import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('clarification addenda use the canonical IST formatter (issue 19)', () => {
  it('addendum timestamps go through formatDateTimeIST', () => {
    const src = readFileSync(resolve(__dirname, 'components/ClarificationWorkbench.tsx'), 'utf8');
    expect(src).toContain('formatDateTimeIST(addendum.createdAt)');
    expect(src).not.toMatch(/\.(toLocaleDateString|toLocaleTimeString)\(/);
  });
});
