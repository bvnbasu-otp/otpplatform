import { describe, expect, it } from 'vitest';
import { formatMoney } from './fulfillment';

describe('formatMoney', () => {
  it('formats INR amounts', () => {
    expect(formatMoney(9204, 'INR')).toMatch(/9,204/);
  });
});
