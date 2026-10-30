import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Intake Layman Simplification & Concentric Sourcing', () => {
  it('Tier 1: auto-prefills address from profile and shows 100% on delivery standard terms', () => {
    const tier1Src = readFileSync(
      resolve(__dirname, 'components/Tier1TellOtpCard.tsx'),
      'utf8',
    );
    expect(tier1Src).toContain('Delivering to:');
    expect(tier1Src).toContain('From Profile');
    expect(tier1Src).toContain('100% on Delivery &amp; Sign-off');
    expect(tier1Src).toContain('Standard Consumer Terms');
    expect(tier1Src).toContain('Change payment terms ▼');
  });

  it('Tier 2: replaces BoQ jargon with consumer photos, bills and drawings upload', () => {
    const tier2Src = readFileSync(
      resolve(__dirname, 'components/Tier2PrecisionScopeCard.tsx'),
      'utf8',
    );
    expect(tier2Src).toContain('Photos, Bills or Drawings (Optional)');
    expect(tier2Src).toContain('Add Details, Photo or Drawing ▼');
    expect(tier2Src).toContain('Take photo or upload item pictures, old bills, broken parts, or architectural drawings');
  });

  it('Tier 3: renders concentric supplier discovery flow across 4 progressive radii', () => {
    const tier3Src = readFileSync(
      resolve(__dirname, 'components/Tier3SourcingControlsCard.tsx'),
      'utf8',
    );
    expect(tier3Src).toContain('Concentric Sourcing');
    expect(tier3Src).toContain('Concentric Supplier Discovery (Progressive Radius)');
    expect(tier3Src).toContain('1. PIN Code');
    expect(tier3Src).toContain('0–5 km Hyperlocal');
    expect(tier3Src).toContain('2. City &amp; Suburbs');
    expect(tier3Src).toContain('10–50 km Corridor');
    expect(tier3Src).toContain('3. ONDC &amp; Google');
    expect(tier3Src).toContain('4. State / Pan-India');
  });
});
