import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const profilePage = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'pages', 'ProfilePage.tsx'),
  'utf8',
);

function sliceBetween(source: string, startAnchor: string, endAnchor: string): string {
  const start = source.indexOf(startAnchor);
  expect(start, `anchor not found: ${startAnchor}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endAnchor, start + startAnchor.length);
  expect(end, `anchor not found after ${startAnchor}: ${endAnchor}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('ProfilePage customer contract', () => {
  it('keeps the quorum sentence on Community and Institution organizations', () => {
    const quorumLine = profilePage
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.includes('Quorum of 2+'));

    expect(quorumLine).toBe(
      '<li>Quorum of 2+ votes required for Community and Institution organizations.</li>',
    );
    expect(quorumLine).toContain('Community and Institution organizations');
    expect(quorumLine).not.toContain('Institution, and Enterprise');
  });

  it('badges the WhatsApp channel as Verification', () => {
    const badge = sliceBetween(
      profilePage,
      'WhatsApp Channel',
      'text-[11px] text-muted-foreground leading-snug mt-0.5',
    );

    expect(badge).toContain('Verification');
    expect(badge).not.toContain('Instant');
  });

  it('says WhatsApp invites and order alerts are planned but not yet live', () => {
    const body = sliceBetween(
      profilePage,
      'WhatsApp Channel',
      '</button>',
    );
    const copy = sliceBetween(
      body,
      'text-[11px] text-muted-foreground leading-snug mt-0.5',
      '</p>',
    );

    expect(copy).toContain('planned but not yet live');
    expect(copy).not.toContain(
      'Receive 1-tap OTP logins, RFQ quotation invites, and purchase order status alerts directly on WhatsApp.',
    );
  });
});
