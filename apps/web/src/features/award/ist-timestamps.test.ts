import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDateIST, formatDateTimeIST } from '@/lib/date-utils';

const DATE_LOCALE_CALL = /\.(toLocaleDateString|toLocaleTimeString)\(|Date\([^)]*\)\.toLocaleString\(/;

describe('award surfaces use the canonical IST formatter (issue 19)', () => {
  it.each(['pages/AwardPage.tsx', 'components/SpendApprovalModal.tsx'])('%s formats dates only via date-utils', (rel) => {
    const src = readFileSync(resolve(__dirname, rel), 'utf8');
    expect(src).toMatch(/from '@\/lib\/date-utils'/);
    expect(src).not.toMatch(DATE_LOCALE_CALL);
  });

  it('award lock time renders as DD MMM YYYY, HH:mm IST regardless of the browser zone', () => {
    expect(formatDateTimeIST('2026-09-26T12:40:00Z')).toBe('26 Sep 2026, 18:10 IST');
    expect(formatDateIST('2026-12-31T19:00:00Z')).toBe('01 Jan 2027');
  });
});
