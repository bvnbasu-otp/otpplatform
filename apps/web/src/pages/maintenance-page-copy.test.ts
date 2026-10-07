import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'MaintenancePage.tsx'), 'utf8');

describe('MaintenancePage footer', () => {
  it('does not tell a visitor that OTP takes zero commission', () => {
    expect(page).toContain('A 0.5% supplier platform fee is defined and is not charged during this pilot');
    expect(page).toContain('Identity-Protected Competitive Sourcing');
    expect(page).not.toMatch(/zero commission/i);
  });
});
