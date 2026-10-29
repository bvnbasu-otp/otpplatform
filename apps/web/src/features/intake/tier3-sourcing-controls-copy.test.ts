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

  it('exposes exactly two primary sourcing modes: IDENTITY_PROTECTED and OPEN_RFQ', () => {
    expect(cardSource).toContain('Identity-Protected Sourcing (Recommended & Default)');
    expect(cardSource).toContain('Open RFQ Tender');
  });

  it('exposes orthogonal supplier relationship reach controls independently from geographic scope', () => {
    expect(cardSource).toContain('Supplier Relationship Reach');
    expect(cardSource).toContain('Curated & Verified Suppliers Only');
    expect(cardSource).toContain('Past Successful Suppliers');
    expect(cardSource).toContain('All Eligible Network Suppliers');
    expect(cardSource).toContain('Geographic Sourcing Reach');
  });

  it('exposes natural consumer-style intake stage titles across all cards', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const tier1 = readFileSync(join(dir, 'components', 'Tier1TellOtpCard.tsx'), 'utf8');
    const tier2 = readFileSync(join(dir, 'components', 'Tier2PrecisionScopeCard.tsx'), 'utf8');
    const tier3 = readFileSync(join(dir, 'components', 'Tier3SourcingControlsCard.tsx'), 'utf8');
    const unified = readFileSync(join(dir, 'components', 'UnifiedThreeTierIntake.tsx'), 'utf8');

    expect(tier1).toContain('Stage 1 — What do you need?');
    expect(tier2).toContain('Stage 2 — Item Details &amp; Specifications');
    expect(tier3).toContain('Stage 3 — Supplier &amp; Location Preferences');
    expect(unified).toContain('Submit Request &amp; Get Quotes →');
  });
});

