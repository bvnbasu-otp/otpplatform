import { describe, expect, it } from 'vitest';
import { formatDeliveryDelta } from '../types/performance';

describe('formatDeliveryDelta', () => {
  it('describes early, on-time, and late delivery', () => {
    expect(formatDeliveryDelta(4, 3)).toBe('1 day(s) early');
    expect(formatDeliveryDelta(4, 4)).toBe('On time');
    expect(formatDeliveryDelta(4, 6)).toBe('2 day(s) late');
    expect(formatDeliveryDelta(4, null)).toBe('—');
  });
});
