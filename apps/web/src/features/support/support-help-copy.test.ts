import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const modalSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components', 'SupportHelpButtonModal.tsx'),
  'utf8',
);

describe('Support help customer copy', () => {
  it('labels commercial help as plans, pricing, and GST verification', () => {
    expect(modalSource).toContain('Plans, pricing &amp; GST verification');
    expect(modalSource).not.toContain('Enterprise fleet');
  });
});
