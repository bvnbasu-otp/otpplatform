import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Screen 7: MobileVotingCard Candidate Radio Selection', () => {
  it('implements selectable radio cards for candidate quotes matching Infographic Screen 7', () => {
    const filePath = resolve(__dirname, 'components/MobileVotingCard.tsx');
    const content = readFileSync(filePath, 'utf8');

    expect(content).toContain('data-testid="voting-candidate-radio-cards"');
    expect(content).toContain('Cast Your Vote — Candidate Options');
    expect(content).toContain('Selected');
  });
});
