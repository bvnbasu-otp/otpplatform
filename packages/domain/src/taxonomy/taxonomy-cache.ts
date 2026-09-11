import type { TaxonomySnapshot } from './types';

export interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class InMemoryTaxonomyCache {
  private cache: Map<string, CacheEntry<TaxonomySnapshot>> = new Map();

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

  clear(): void {
    this.cache.clear();
  }
}

export const globalTaxonomyCache = new InMemoryTaxonomyCache();
