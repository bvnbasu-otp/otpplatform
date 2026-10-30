import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('EvaluationDecisionCockpit Quorum Fallback Integration', () => {
  it('wires QuorumExpiryDecisionCard to handle quorum shortfall gracefully', () => {
    const cockpitSrc = readFileSync(
      resolve(__dirname, 'components/EvaluationDecisionCockpit.tsx'),
      'utf8',
    );
    expect(cockpitSrc).toContain('QuorumExpiryDecisionCard');
    expect(cockpitSrc).toContain('onProceedWithCurrentQuotes');
    expect(cockpitSrc).toContain('onExtendDeadline');
    expect(cockpitSrc).toContain('onCancelRequest');
  });
});
