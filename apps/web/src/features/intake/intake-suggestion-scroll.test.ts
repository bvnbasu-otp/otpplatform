import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relPath: string) => readFileSync(resolve(relPath), 'utf8');

describe('intake suggestions scrollbar and accessibility', () => {
  it('keeps requirement suggestions container accessible and scrollable', () => {
    const card = read('apps/web/src/features/intake/components/Tier1TellOtpCard.tsx');
    expect(card).toContain('overflow-x-auto scrollbar-thin py-1');
    expect(card).toContain('tabIndex={0}');
    expect(card).toContain('aria-label="Requirement suggestions"');
  });
});
