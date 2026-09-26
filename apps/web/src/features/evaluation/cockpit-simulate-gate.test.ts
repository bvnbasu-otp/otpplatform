import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const cockpitSrc = readFileSync(resolve(__dirname, 'components/EvaluationDecisionCockpit.tsx'), 'utf8');

describe('Evaluation cockpit simulator entry points (REAL PILOT RFQ = ZERO SYNTHETIC QUOTES)', () => {
  it('passes onSimulateQuotes to the comparison table only in demo builds', () => {
    const propLines = cockpitSrc.split('\n').filter((l) => l.includes('onSimulateQuotes='));
    expect(propLines.length).toBeGreaterThan(0);
    for (const line of propLines) {
      expect(line).toMatch(/onSimulateQuotes=\{isDemoMode \? .* : undefined\}/);
    }
  });

  it('every simulate button click handler sits inside an isDemoMode block', () => {
    const lines = cockpitSrc.split('\n');
    lines.forEach((line, idx) => {
      if (!line.includes('onClick={() => void handleSimulateQuotes()}')) return;
      const window = lines.slice(Math.max(0, idx - 8), idx).join('\n');
      expect(window).toMatch(/\{isDemoMode && \(/);
    });
  });
});
