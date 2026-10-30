import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QuorumExpiryDecisionCard } from './components/QuorumExpiryDecisionCard';

describe('QuorumExpiryDecisionCard Invariants & Logic', () => {
  it('exports QuorumExpiryDecisionCard component', () => {
    expect(typeof QuorumExpiryDecisionCard).toBe('function');
  });

  it('contains 3-way buyer decision actions and concentric cascade tiers', () => {
    const cardSrc = readFileSync(
      resolve(__dirname, 'components/QuorumExpiryDecisionCard.tsx'),
      'utf8',
    );
    expect(cardSrc).toContain('Quorum Status Check');
    expect(cardSrc).toContain('btn-proceed-with-quotes');
    expect(cardSrc).toContain('btn-extend-deadline');
    expect(cardSrc).toContain('btn-cancel-request');
    expect(cardSrc).toContain('Proceed with');
    expect(cardSrc).toContain('Extend 3 Days (+3D)');
    expect(cardSrc).toContain('Cancel Request');
    expect(cardSrc).toContain('Concentric Discovery Reach:');
    expect(cardSrc).toContain('PIN Code (0–5 km)');
    expect(cardSrc).toContain('10–50 km');
    expect(cardSrc).toContain('ONDC &amp; Google Places');
    expect(cardSrc).toContain('State &amp; Pan-India');
  });
});
