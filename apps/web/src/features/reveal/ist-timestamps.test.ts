import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatDateTimeIST } from '@/lib/date-utils';

const DATE_LOCALE_CALL = /\.(toLocaleDateString|toLocaleTimeString)\(|Date\([^)]*\)\.toLocaleString\(/;

describe('reveal and decision receipt surfaces use the canonical IST formatter (issue 19)', () => {
  it.each(['pages/SupplierRevealPage.tsx', 'components/DecisionReceiptCard.tsx'])('%s formats dates only via date-utils', (rel) => {
    const src = readFileSync(resolve(__dirname, rel), 'utf8');
    expect(src).toMatch(/from '@\/lib\/date-utils'/);
    expect(src).not.toMatch(DATE_LOCALE_CALL);
  });

  it('decision receipt award time includes the date and the IST zone, not a bare local time', () => {
    const src = readFileSync(resolve(__dirname, 'components/DecisionReceiptCard.tsx'), 'utf8');
    expect(src).toContain('formatDateTimeIST(timestamps.awardedAt)');
    expect(formatDateTimeIST('2026-09-26T04:05:00Z')).toBe('26 Sep 2026, 09:35 IST');
  });
});
