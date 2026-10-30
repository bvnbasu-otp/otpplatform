import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Award Page Google Material Symbols', () => {
  it('renders Google Material Symbols for call, chat, share, and pdf actions', () => {
    const awardSrc = readFileSync(
      resolve(__dirname, 'pages/AwardPage.tsx'),
      'utf8',
    );
    expect(awardSrc).toContain('Icon name="call"');
    expect(awardSrc).toContain('Icon name="chat"');
    expect(awardSrc).toContain('Icon name="share"');
    expect(awardSrc).toContain('Icon name="description"');
  });

  it('renders 4-milestone completed procurement checklist in revealed spotlight', () => {
    const awardSrc = readFileSync(
      resolve(__dirname, 'pages/AwardPage.tsx'),
      'utf8',
    );
    expect(awardSrc).toContain('data-testid="award-milestone-checklist"');
    expect(awardSrc).toContain('Requirement Published');
    expect(awardSrc).toContain('Quotes Compared');
    expect(awardSrc).toContain('Voting Completed');
    expect(awardSrc).toContain('Winner Awarded');
  });
});
