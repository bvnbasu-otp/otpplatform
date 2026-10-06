import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const cardSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'components', 'Tier3SourcingControlsCard.tsx'),
  'utf8',
);

describe('Tier3 sourcing controls customer copy', () => {
  it('addresses an RWA buyer and does not restore Enterprise customer wording', () => {
    expect(cardSource).toContain(
      'As an RWA buyer, sealed quotes will be aggregated transparently for multi-member committee evaluation and audit recording following the quote submission deadline.',
    );
    expect(cardSource).not.toContain('RWA / Enterprise');
  });
});
