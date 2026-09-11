import { describe, expect, it } from 'vitest';

export interface RateLimitEntry {
  clientKey: string;
  endpoint: string;
  timestamp: number;
}

export class SlidingWindowRateLimiter {
  private requests: RateLimitEntry[] = [];

  constructor(private readonly maxRequests: number, private readonly windowMs: number) {}

  checkAndRecord(clientKey: string, endpoint: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfterMs?: number } {
    const windowStart = now - this.windowMs;
    // Filter to requests in current window
    this.requests = this.requests.filter((r) => r.timestamp >= windowStart);

    const clientRequests = this.requests.filter((r) => r.clientKey === clientKey && r.endpoint === endpoint);

    if (clientRequests.length >= this.maxRequests) {
      const oldestInWindow = clientRequests[0]?.timestamp ?? now;
      const retryAfterMs = Math.max(0, oldestInWindow + this.windowMs - now);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    this.requests.push({ clientKey, endpoint, timestamp: now });
    return { allowed: true, remaining: this.maxRequests - (clientRequests.length + 1) };
  }
}

describe('Sliding-Window Rate Limiter Engine', () => {
  it('allows requests up to the max threshold within window', () => {
    const limiter = new SlidingWindowRateLimiter(3, 60000); // 3 reqs per minute
    const client = 'ip_192.168.1.1';
    const endpoint = '/api/quotes/submit';

    const r1 = limiter.checkAndRecord(client, endpoint);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.checkAndRecord(client, endpoint);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.checkAndRecord(client, endpoint);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = limiter.checkAndRecord(client, endpoint);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets capacity after the time window slides past', () => {
    const limiter = new SlidingWindowRateLimiter(2, 1000); // 2 reqs per second
    const client = 'profile_buyer_123';
    const endpoint = '/api/votes/cast';
    const t0 = 1000000;

    expect(limiter.checkAndRecord(client, endpoint, t0).allowed).toBe(true);
    expect(limiter.checkAndRecord(client, endpoint, t0 + 100).allowed).toBe(true);
    expect(limiter.checkAndRecord(client, endpoint, t0 + 200).allowed).toBe(false);

    // After 1001ms, window has passed
    expect(limiter.checkAndRecord(client, endpoint, t0 + 1101).allowed).toBe(true);
  });
});
