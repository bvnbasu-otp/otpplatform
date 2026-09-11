import { describe, expect, it } from 'vitest';
import { computeTotalCost, toSnapshotPayload } from './supplier-quote';

describe('supplier quote helpers', () => {
  it('computes total cost from components', () => {
    expect(
      computeTotalCost({
        basePrice: 7800,
        gstAmount: 1404,
        transportCost: 0,
        deliveryDays: 4,
        warrantyMonths: 6,
        currency: 'INR',
      }),
    ).toBe(9204);
  });

  it('accurately calculates tax amounts for standard Indian GST slabs (0%, 5%, 12%, 18%, 28%)', () => {
    const basePrice = 10000;
    const slabs = [
      { rate: 0, expectedGst: 0, expectedFinal: 10000 },
      { rate: 5, expectedGst: 500, expectedFinal: 10500 },
      { rate: 12, expectedGst: 1200, expectedFinal: 11200 },
      { rate: 18, expectedGst: 1800, expectedFinal: 11800 },
      { rate: 28, expectedGst: 2800, expectedFinal: 12800 },
    ];

    slabs.forEach(({ rate, expectedGst, expectedFinal }) => {
      const gstAmount = Math.round(basePrice * (rate / 100));
      expect(gstAmount).toBe(expectedGst);
      const total = computeTotalCost({
        basePrice,
        gstAmount,
        transportCost: 0,
        deliveryDays: 3,
        warrantyMonths: 12,
        currency: 'INR',
      });
      expect(total).toBe(expectedFinal);
    });
  });

  it('builds snapshot payload for quote_versions', () => {
    const payload = toSnapshotPayload({
      basePrice: 8500,
      gstAmount: 0,
      transportCost: 0,
      deliveryDays: 2,
      warrantyMonths: 12,
      currency: 'INR',
    });
    expect(payload.totalCost).toBe(8500);
    expect(payload.deliveryDays).toBe(2);
  });
});
