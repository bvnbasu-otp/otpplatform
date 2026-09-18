/**
 * ONDC Public-Key Cache & Single-Flight Mutex Resolution
 *
 * Implements high-performance cryptographic key lookups for BAP/BPP webhook verification:
 * - Namespace: `${subscriberId}|${uniqueKeyId}|${algorithm}`
 * - LRU eviction with max capacity (default 500 entries)
 * - 1-hour default TTL (3,600,000 ms)
 * - Single-flight mutex promise cache: concurrent requests for the same keyId execute only ONE fetch
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface OndcPublicKeyCacheOptions {
  maxCapacity?: number;
  ttlMs?: number;
  fetchFn?: (keyId: string) => Promise<string | null>;
}

export class OndcPublicKeyCache {
  private readonly maxCapacity: number;
  private readonly ttlMs: number;
  private readonly fetchFn?: (keyId: string) => Promise<string | null>;

  // In-memory LRU cache map preserving insertion/access order
  private readonly cache = new Map<string, CacheEntry<string>>();
  // Single-flight in-flight lookup promise tracking
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(options: OndcPublicKeyCacheOptions = {}) {
    this.maxCapacity = options.maxCapacity ?? 500;
    this.ttlMs = options.ttlMs ?? 3600000; // 1 hour default TTL
    this.fetchFn = options.fetchFn;
  }

  /**
   * Format or validate canonical ONDC key namespace:
   * `${subscriberId}|${uniqueKeyId}|${algorithm}`
   */
  static formatKeyNamespace(subscriberId: string, uniqueKeyId: string, algorithm = 'ed25519'): string {
    return `${subscriberId}|${uniqueKeyId}|${algorithm}`;
  }

  /**
   * Get cached public key or return null if expired / missing.
   */
  get(keyId: string): string | null {
    const entry = this.cache.get(keyId);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(keyId);
      return null;
    }

    // Refresh LRU order on access
    this.cache.delete(keyId);
    this.cache.set(keyId, entry);
    return entry.value;
  }

  /**
   * Store public key in cache with LRU eviction when capacity is reached.
   */
  set(keyId: string, publicKeyPem: string, customTtlMs?: number): void {
    if (this.cache.has(keyId)) {
      this.cache.delete(keyId);
    } else if (this.cache.size >= this.maxCapacity) {
      // Evict oldest entry (first item in iterator)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const ttl = customTtlMs ?? this.ttlMs;
    this.cache.set(keyId, {
      value: publicKeyPem,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Fetch public key with single-flight deduplication.
   * Concurrent callers requesting the same keyId share the single fetch promise.
   */
  async getOrFetch(
    keyId: string,
    fetchOverride?: (keyId: string) => Promise<string | null>,
  ): Promise<string | null> {
    const cached = this.get(keyId);
    if (cached !== null) {
      return cached;
    }

    const resolver = fetchOverride ?? this.fetchFn;
    if (!resolver) {
      return null;
    }

    // Check if an in-flight fetch already exists for this keyId
    let inflightPromise = this.inFlight.get(keyId);
    if (!inflightPromise) {
      inflightPromise = (async () => {
        try {
          const fetched = await resolver(keyId);
          if (fetched) {
            this.set(keyId, fetched);
          }
          return fetched;
        } finally {
          this.inFlight.delete(keyId);
        }
      })();

      this.inFlight.set(keyId, inflightPromise);
    }

    return inflightPromise;
  }

  /**
   * Check if cache contains unexpired key.
   */
  has(keyId: string): boolean {
    return this.get(keyId) !== null;
  }

  /**
   * Clear all cached keys and inflight state.
   */
  clear(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  /**
   * Current number of cached items (including possibly unpruned expired ones).
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Current number of active in-flight requests.
   */
  get inFlightCount(): number {
    return this.inFlight.size;
  }
}
