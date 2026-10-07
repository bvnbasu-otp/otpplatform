import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('individual buyer decision copy', () => {
  it('does not tell a solo buyer that a committee quorum is satisfied', () => {
    const cockpit = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'components', 'EvaluationDecisionCockpit.tsx'),
      'utf8',
    );
    expect(cockpit).toContain('You decide directly. No committee vote and no quorum.');
    expect(cockpit).toContain("buyerType === 'INDIVIDUAL'");
    expect(cockpit).not.toContain('100% quorum satisfied');
    expect(cockpit).toContain('Committee Quorum Met');
    expect(cockpit).toContain('Committee Quorum Pending');
  });
});
