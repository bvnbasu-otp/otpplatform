import type { TaxonomySnapshot } from './types';
import type { CanonicalTaxonomyNode } from './canonical-taxonomy';

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class InMemoryTaxonomyCache {
  private cache: Map<string, CacheEntry<TaxonomySnapshot>> = new Map();
  private nodeCache: Map<string, CacheEntry<readonly CanonicalTaxonomyNode[]>> = new Map();

  constructor(private readonly defaultTtlMs = 3600000) {} // 1 hour default

  get(key = 'canonical_taxonomy'): TaxonomySnapshot | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key = 'canonical_taxonomy', data: TaxonomySnapshot, ttlMs = this.defaultTtlMs): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  getNodes(key = 'canonical_nodes'): readonly CanonicalTaxonomyNode[] | null {
    const entry = this.nodeCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.nodeCache.delete(key);
      return null;
    }

    return entry.data;
  }

  setNodes(
    key = 'canonical_nodes',
    nodes: readonly CanonicalTaxonomyNode[],
    ttlMs = this.defaultTtlMs,
  ): void {
    this.nodeCache.set(key, {
      data: nodes,
      expiresAt: Date.now() + ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
    this.nodeCache.clear();
  }
}

export const globalTaxonomyCache = new InMemoryTaxonomyCache();
