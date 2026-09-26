import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PUBLIC_SOURCES = [
  'components/mobile-showcase/MobileScreensShowcase.tsx',
  'components/layout/MobileSimulatorFrame.tsx',
  'components/layout/SiteFooter.tsx',
  'features/portal/pages/LegalPage.tsx',
].map((rel) => [rel, readFileSync(resolve(__dirname, '..', rel), 'utf8')] as const);

describe('public chrome outside the site pages uses plain language and the canonical brand', () => {
  it.each(PUBLIC_SOURCES)('%s has no cockpit label or crypto/audit jargon', (_rel, src) => {
    expect(src).not.toMatch(/Procurement Cockpit/i);
    expect(src).not.toMatch(/cryptograph/i);
    expect(src).not.toMatch(/\bsalt\b/i);
    expect(src).not.toMatch(/Immutable (Audit|Vote)/i);
  });

  it('showcase makes no response-time promise', () => {
    const [, showcase] = PUBLIC_SOURCES[0]!;
    expect(showcase).not.toMatch(/quote within 30 minutes/i);
  });

  it('simulator frame footer uses the canonical positioning, not the retired product line', () => {
    const [, frame] = PUBLIC_SOURCES[1]!;
    expect(frame).not.toContain('Built 100% Mobile-First');
    expect(frame).toContain('Identity-Protected Competitive Sourcing');
  });
});
