import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const list = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components/SupplierInvitationList.tsx'),
  'utf8',
);

describe('SupplierInvitationList pilot fee copy', () => {
  it('keeps neutral quote review and does not claim zero commission', () => {
    expect(list).toContain('Neutral quote review');
    expect(list).toContain('A 0.5% platform fee is defined and is not charged during this pilot.');
    expect(list).toContain('Quote recorded under sealed evaluation');
    expect(list).not.toMatch(/zero commission/i);
  });
});