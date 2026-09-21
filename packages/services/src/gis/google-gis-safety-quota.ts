/**
 * Google GIS Safety Quota Guard & Quota Store.
 *
 * Implements strict, server-side authoritative, fail-closed safety budget for Google Maps API:
 * - Daily limit: MAX 1,500 Google requests/day
 * - Monthly limit: MAX 50,000 Google requests/month
 * - Whichever is reached first fails closed: returns DENIED, falls back to ProviderNeutralLocationIntelligence.
 * - Concurrency-safe atomic reservations.
 * - Server-side authoritative (cannot be bypassed or manipulated by client headers/params).
 * - Cache-aware: Cache hits do not consume quota.
 * - Provider isolation: Google quota exhaustion does not throttle local GIS, Haversine, PIN, City, or Mapbox.
 */

export interface GoogleGisQuotaLimits {
  readonly maxDaily: number;
  readonly maxMonthly: number;
}

export const DEFAULT_GOOGLE_GIS_LIMITS: GoogleGisQuotaLimits = {
  maxDaily: 1500,
  maxMonthly: 50000,
} as const;

export interface GoogleGisQuotaUsage {
  readonly dailyCount: number;
  readonly monthlyCount: number;
  readonly dayKey: string; // YYYY-MM-DD (UTC)
  readonly monthKey: string; // YYYY-MM (UTC)
}

export interface GoogleGisReservationResult {
  readonly allowed: boolean;
  readonly reason?: 'DAILY_QUOTA_EXCEEDED' | 'MONTHLY_QUOTA_EXCEEDED' | 'STORE_ERROR' | 'UNCONFIGURED';
  readonly currentUsage: {
    readonly dailyCount: number;
    readonly monthlyCount: number;
    readonly maxDaily: number;
    readonly maxMonthly: number;
  };
}

export interface GoogleGisQuotaStore {
  /**
   * Atomically reserve 1 unit of Google API quota against current daily and monthly windows.
   * If either limit would be exceeded, the reservation fails and counts are not incremented.
   * On store error/exception, callers must fail closed.
   */
  reserveQuota(
    limits: GoogleGisQuotaLimits,
    now?: Date,
  ): Promise<{ success: boolean; dailyCount: number; monthlyCount: number }>;

  /**
   * Get current usage snapshot without incrementing.
   */
  getUsage(now?: Date): Promise<GoogleGisQuotaUsage>;

  /**
   * Reset usage counters (for testing or administrative reconciliation).
   */
  reset(): Promise<void>;
}

export function getUtcDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getUtcMonthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * In-memory thread-safe / atomic Quota Store implementation.
 */
export class InMemoryGoogleGisQuotaStore implements GoogleGisQuotaStore {
  private dayKey: string = '';
  private monthKey: string = '';
  private dailyCount: number = 0;
  private monthlyCount: number = 0;
  private mutex: Promise<void> = Promise.resolve();

  private rollWindows(now: Date): void {
    const currentDay = getUtcDayKey(now);
    const currentMonth = getUtcMonthKey(now);

    if (this.monthKey !== currentMonth) {
      this.monthKey = currentMonth;
      this.monthlyCount = 0;
      this.dayKey = currentDay;
      this.dailyCount = 0;
    } else if (this.dayKey !== currentDay) {
      this.dayKey = currentDay;
      this.dailyCount = 0;
    }
  }

  async reserveQuota(
    limits: GoogleGisQuotaLimits,
    now: Date = new Date(),
  ): Promise<{ success: boolean; dailyCount: number; monthlyCount: number }> {
    // Acquire mutex lock to ensure atomic reservation across asynchronous calls
    return new Promise<{ success: boolean; dailyCount: number; monthlyCount: number }>((resolve, reject) => {
      this.mutex = this.mutex.then(async () => {
        try {
          this.rollWindows(now);

          if (this.dailyCount >= limits.maxDaily || this.monthlyCount >= limits.maxMonthly) {
            resolve({
              success: false,
              dailyCount: this.dailyCount,
              monthlyCount: this.monthlyCount,
            });
            return;
          }

          this.dailyCount += 1;
          this.monthlyCount += 1;

          resolve({
            success: true,
            dailyCount: this.dailyCount,
            monthlyCount: this.monthlyCount,
          });
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  async getUsage(now: Date = new Date()): Promise<GoogleGisQuotaUsage> {
    return new Promise<GoogleGisQuotaUsage>((resolve) => {
      this.mutex = this.mutex.then(async () => {
        this.rollWindows(now);
        resolve({
          dailyCount: this.dailyCount,
          monthlyCount: this.monthlyCount,
          dayKey: this.dayKey,
          monthKey: this.monthKey,
        });
      });
    });
  }

  async reset(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.mutex = this.mutex.then(async () => {
        this.dailyCount = 0;
        this.monthlyCount = 0;
        this.dayKey = '';
        this.monthKey = '';
        resolve();
      });
    });
  }
}

/**
 * GoogleGisSafetyQuotaGuard.
 * Authoritative guard that protects Google Maps API consumption.
 */
export class GoogleGisSafetyQuotaGuard {
  private readonly store: GoogleGisQuotaStore;
  private readonly limits: GoogleGisQuotaLimits;

  // Global singleton fallback store across adapter instances in memory
  private static defaultStore: GoogleGisQuotaStore = new InMemoryGoogleGisQuotaStore();

  constructor(options: {
    store?: GoogleGisQuotaStore;
    limits?: Partial<GoogleGisQuotaLimits>;
  } = {}) {
    this.store = options.store ?? GoogleGisSafetyQuotaGuard.defaultStore;
    this.limits = {
      maxDaily: options.limits?.maxDaily ?? DEFAULT_GOOGLE_GIS_LIMITS.maxDaily,
      maxMonthly: options.limits?.maxMonthly ?? DEFAULT_GOOGLE_GIS_LIMITS.maxMonthly,
    };
  }

  static setDefaultStore(store: GoogleGisQuotaStore): void {
    GoogleGisSafetyQuotaGuard.defaultStore = store;
  }

  static getDefaultStore(): GoogleGisQuotaStore {
    return GoogleGisSafetyQuotaGuard.defaultStore;
  }

  /**
   * Atomically evaluates and reserves 1 quota unit.
   * Fail-Closed: If store throws or limits are reached, returns allowed: false.
   */
  async acquireReservation(now: Date = new Date()): Promise<GoogleGisReservationResult> {
    try {
      const reservation = await this.store.reserveQuota(this.limits, now);

      if (!reservation.success) {
        const reason = reservation.dailyCount >= this.limits.maxDaily
          ? 'DAILY_QUOTA_EXCEEDED'
          : 'MONTHLY_QUOTA_EXCEEDED';

        return {
          allowed: false,
          reason,
          currentUsage: {
            dailyCount: reservation.dailyCount,
            monthlyCount: reservation.monthlyCount,
            maxDaily: this.limits.maxDaily,
            maxMonthly: this.limits.maxMonthly,
          },
        };
      }

      return {
        allowed: true,
        currentUsage: {
          dailyCount: reservation.dailyCount,
          monthlyCount: reservation.monthlyCount,
          maxDaily: this.limits.maxDaily,
          maxMonthly: this.limits.maxMonthly,
        },
      };
    } catch {
      // Fail-Closed on any store failure
      return {
        allowed: false,
        reason: 'STORE_ERROR',
        currentUsage: {
          dailyCount: -1,
          monthlyCount: -1,
          maxDaily: this.limits.maxDaily,
          maxMonthly: this.limits.maxMonthly,
        },
      };
    }
  }

  async getUsage(now: Date = new Date()): Promise<GoogleGisQuotaUsage> {
    return this.store.getUsage(now);
  }

  getLimits(): GoogleGisQuotaLimits {
    return this.limits;
  }
}
