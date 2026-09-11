import { describe, expect, it } from 'vitest';
import { formatVotingPower, isBehindTarget, stageProgress } from './demo';

describe('voting power in words', () => {
  it('says one vote in the singular', () => {
    expect(formatVotingPower(1)).toBe('1 vote');
  });

  it('says what a heavier seat carries', () => {
    expect(formatVotingPower(4)).toBe('4 votes');
  });

  it('does not pretend a supplier votes', () => {
    expect(formatVotingPower(null)).toBe('no vote');
  });
});

describe('scenario progress', () => {
  it('places an unpublished scenario at the start and a revealed one at the end', () => {
    expect(stageProgress('DRAFT')).toBe(0);
    expect(stageProgress('REVEALED')).toBe(1);
  });

  it('advances monotonically through the lifecycle', () => {
    const stages = ['DRAFT', 'SOURCING', 'QUOTING', 'EVALUATION', 'AWARDED', 'REVEALED'] as const;
    const values = stages.map(stageProgress);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
  });
});

describe('whether a scenario needs catching up', () => {
  it('flags one that has not reached where it was staged', () => {
    expect(isBehindTarget({ actualStage: 'QUOTING', targetStage: 'AWARDED' })).toBe(true);
  });

  it('does not flag one sitting exactly where it should be', () => {
    expect(isBehindTarget({ actualStage: 'AWARDED', targetStage: 'AWARDED' })).toBe(false);
  });

  it('does not flag a presenter who drove the demo forward', () => {
    expect(isBehindTarget({ actualStage: 'REVEALED', targetStage: 'AWARDED' })).toBe(false);
  });
});