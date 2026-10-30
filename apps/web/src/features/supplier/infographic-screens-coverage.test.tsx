import { describe, expect, it } from 'vitest';
import { getCanonicalOpportunityDetail } from './api/fetch-invitations';
import { CANONICAL_OPPORTUNITIES } from './pages/OpportunitiesBrowsePage';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Infographic Transformation: Supplier Screens 4, 5, 6 Coverage', () => {
  it('Screen 4: CANONICAL_OPPORTUNITIES lists standard category opportunities', () => {
    expect(CANONICAL_OPPORTUNITIES.length).toBeGreaterThanOrEqual(4);
    const plumbing = CANONICAL_OPPORTUNITIES.find((o) => o.id === 'opp-plumbing-01');
    expect(plumbing).toBeDefined();
    expect(plumbing?.title).toBe('Plumbing Services');
    expect(plumbing?.category).toBe('Building');
  });

  it('Screen 5: getCanonicalOpportunityDetail provides full detail for canonical items', () => {
    const detail = getCanonicalOpportunityDetail('opp-plumbing-01');
    expect(detail.rfqTitle).toBe('Plumbing Services');
    expect(detail.category).toBe('Building');
    expect(detail.rfqStatus).toBe('OPEN');
    expect(detail.attributes['Pipe Material'] || detail.attributes['Material / Type']).toBeDefined();
  });

  it('Screen 5: SupplierRequirementPanel includes 3-column key parameters matching Infographic', () => {
    const panelPath = resolve(__dirname, 'components/SupplierRequirementPanel.tsx');
    const content = readFileSync(panelPath, 'utf8');
    expect(content).toContain('data-testid="screen-5-key-parameters"');
    expect(content).toContain('📍 Location');
    expect(content).toContain('💰 Est. Value');
    expect(content).toContain('📋 Requirements');
  });

  it('Screen 6: QuoteForm includes "You can change this later" reassure hint', () => {
    const formPath = resolve(__dirname, 'components/QuoteForm.tsx');
    const content = readFileSync(formPath, 'utf8');
    expect(content).toContain('data-testid="quote-change-later-hint"');
    expect(content).toContain('You can change this later');
  });
});
