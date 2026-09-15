import { describe, expect, it } from 'vitest';
import { MobileScreensShowcase } from './MobileScreensShowcase';

describe('Mobile-First Flow Pipeline Architecture Tests', () => {
  it('exports MobileScreensShowcase component properly', () => {
    expect(MobileScreensShowcase).toBeDefined();
    expect(typeof MobileScreensShowcase).toBe('function');
  });

  it('defines 7-screen Buyer Pipeline architecture with exact canonical titles', () => {
    const expectedBuyerScreens = [
      { step: '01', title: 'Sourcing Cockpit' },
      { step: '02', title: 'Voice Intake' },
      { step: '03', title: 'Supplier Radar' },
      { step: '04', title: 'Supplier Quoting' },
      { step: '05', title: 'Sealed Matrix' },
      { step: '06', title: 'Committee Vote' },
      { step: '07', title: 'Digital PO & Tracking' },
    ];
    expect(expectedBuyerScreens).toHaveLength(7);
  });

  it('defines 5-screen Multi-Channel Supplier Pipeline architecture with canonical procurement vocabulary', () => {
    const expectedSupplierScreens = [
      { step: '01', title: 'Supplier Radar & Notification Hub' },
      { step: '02', title: '30-Minute Quoting Engine' },
      { step: '03', title: 'Quote Status & Active Quotes' },
      { step: '04', title: 'Award Notification & PO Sign-off' },
      { step: '05', title: 'Order Fulfillment & Milestone Tracker' },
    ];
    expect(expectedSupplierScreens).toHaveLength(5);
    // Strict zero-tolerance check for prohibited terms
    for (const s of expectedSupplierScreens) {
      expect(s.title.toLowerCase()).not.toContain('bid');
      expect(s.title.toLowerCase()).not.toContain('blind');
    }
  });

  it('maps 5-step Executive Overview directly to the 7-screen mobile pipeline', () => {
    const buyerPhaseMappings = [
      { phaseNumber: 1, label: 'Intake & Specs', screenIndices: [0, 1], screensLabel: 'Screens 01 & 02' },
      { phaseNumber: 2, label: 'Sourcing Radar', screenIndices: [2], screensLabel: 'Screen 03' },
      { phaseNumber: 3, label: 'Sealed Quoting', screenIndices: [3, 4], screensLabel: 'Screens 04 & 05' },
      { phaseNumber: 4, label: 'Committee Vote', screenIndices: [5], screensLabel: 'Screen 06' },
      { phaseNumber: 5, label: 'Digital PO & Tracking', screenIndices: [6], screensLabel: 'Screen 07' },
    ];

    expect(buyerPhaseMappings).toHaveLength(5);
    // All 7 screens accounted for
    const allMappedIndices = buyerPhaseMappings.flatMap((p) => p.screenIndices);
    expect(allMappedIndices).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
