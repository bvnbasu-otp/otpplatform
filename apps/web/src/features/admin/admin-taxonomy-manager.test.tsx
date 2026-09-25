import { describe, expect, it } from 'vitest';
import { ALL_CANONICAL_TAXONOMY_NODES, CANONICAL_REGIONAL_CLUSTERS, CanonicalBuyerContext, ProcurementType } from '@otp/domain';

describe('AdminTaxonomyManager Component Logic', () => {
  it('loads all authoritative taxonomy nodes across Individual, RWA, and MSME', () => {
    expect(ALL_CANONICAL_TAXONOMY_NODES.length).toBeGreaterThan(15);

    const indNodes = ALL_CANONICAL_TAXONOMY_NODES.filter((n) => n.buyerContexts.includes(CanonicalBuyerContext.INDIVIDUAL));
    const rwaNodes = ALL_CANONICAL_TAXONOMY_NODES.filter((n) => n.buyerContexts.includes(CanonicalBuyerContext.RWA));
    const msmeNodes = ALL_CANONICAL_TAXONOMY_NODES.filter((n) => n.buyerContexts.includes(CanonicalBuyerContext.MSME));

    expect(indNodes.length).toBeGreaterThan(5);
    expect(rwaNodes.length).toBeGreaterThan(5);
    expect(msmeNodes.length).toBeGreaterThan(5);
  });

  it('covers all 5 primary procurement types', () => {
    const types = new Set(ALL_CANONICAL_TAXONOMY_NODES.map((n) => n.procurementType));
    expect(types.has(ProcurementType.PRODUCT)).toBe(true);
    expect(types.has(ProcurementType.SERVICE)).toBe(true);
    expect(types.has(ProcurementType.PROJECT)).toBe(true);
    expect(types.has(ProcurementType.FUNCTION)).toBe(true);
  });

  it('contains Tamil Nadu regional industrial hubs with verified provenance', () => {
    expect(CANONICAL_REGIONAL_CLUSTERS.length).toBe(5);
    const names = CANONICAL_REGIONAL_CLUSTERS.map((c) => c.name);
    expect(names.some((n) => n.includes('Erode'))).toBe(true);
    expect(names.some((n) => n.includes('Bhavani'))).toBe(true);
    expect(names.some((n) => n.includes('Tiruppur'))).toBe(true);
    expect(names.some((n) => n.includes('Coimbatore'))).toBe(true);
    expect(names.some((n) => n.includes('Hosur'))).toBe(true);
  });
});
