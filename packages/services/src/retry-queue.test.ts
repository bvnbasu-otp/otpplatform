import { describe, expect, it } from 'vitest';

export function calculateExponentialBackoff(
  attempt: number,
  baseDelaySec = 30,
  maxRetries = 5,
): { shouldRetry: boolean; delaySec: number; nextStatus: string } {
  if (attempt >= maxRetries) {
    return { shouldRetry: false, delaySec: 0, nextStatus: 'PERMANENTLY_FAILED' };
  }

  const delaySec = baseDelaySec * Math.pow(2, attempt);
  return { shouldRetry: true, delaySec, nextStatus: 'FAILED' };
}

describe('Notification Retry Queue & Exponential Backoff', () => {
  it('calculates exponential delays correctly (30s, 60s, 120s, 240s, 480s)', () => {
    expect(calculateExponentialBackoff(0).delaySec).toBe(30);
    expect(calculateExponentialBackoff(1).delaySec).toBe(60);
    expect(calculateExponentialBackoff(2).delaySec).toBe(120);
    expect(calculateExponentialBackoff(3).delaySec).toBe(240);
    expect(calculateExponentialBackoff(4).delaySec).toBe(480);
  });

  it('marks as PERMANENTLY_FAILED when max retries exceeded', () => {
    const res = calculateExponentialBackoff(5, 30, 5);
    expect(res.shouldRetry).toBe(false);
    expect(res.nextStatus).toBe('PERMANENTLY_FAILED');
  });
});
