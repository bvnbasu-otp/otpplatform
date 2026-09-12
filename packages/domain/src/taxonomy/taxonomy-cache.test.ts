import { describe, expect, it } from 'vitest';
import { InMemoryTaxonomyCache } from './taxonomy-cache';
import type { TaxonomySnapshot } from './types';

describe('In-Memory Taxonomy Graph & LRU Cache', () => {
  const dummySnapshot: TaxonomySnapshot = {
    categories: [{ id: 'c1', code: 'PAINT', name: 'Painting', description: null, sortOrder: 1 }],
    subcategories: [],
    capabilities: [],
    attributes: [],
    criteria: [],
  };

  it('stores and retrieves cached taxonomy snapshots within TTL', () => {
    const cache = new InMemoryTaxonomyCache(5000);
    cache.set('canonical_taxonomy', dummySnapshot);

    const retrieved = cache.get('canonical_taxonomy');
    expect(retrieved).toEqual(dummySnapshot);
    expect(retrieved?.categories[0]?.code).toBe('PAINT');
  });

  it('expires cached taxonomy snapshots after TTL lapses', () => {
    const cache = new InMemoryTaxonomyCache(-100); // Expired immediately
    cache.set('canonical_taxonomy', dummySnapshot);

    const retrieved = cache.get('canonical_taxonomy');
    expect(retrieved).toBeNull();
  });

  it('clears cache on demand', () => {
    const cache = new InMemoryTaxonomyCache(5000);
    cache.set('canonical_taxonomy', dummySnapshot);
    cache.clear();

    expect(cache.get('canonical_taxonomy')).toBeNull();
  });
});
