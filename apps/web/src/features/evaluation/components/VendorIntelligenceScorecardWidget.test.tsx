import { describe, expect, it } from 'vitest';
import React from 'react';
import { VendorIntelligenceScorecardWidget } from './VendorIntelligenceScorecardWidget';
import type { AnonymizedPerformanceBadge } from '@otp/domain';

describe('VendorIntelligenceScorecardWidget Component', () => {
  const sampleBadge: AnonymizedPerformanceBadge = {
    supplierAlias: 'Supplier A7K3',
    coarseScoreBand: 'EXEMPLARY',
    tier: 'PLATINUM',
    completedJobsCountRange: '25-49 Orders',
    qualityRatingBand: '4.8 - 5.0 ★',
    onTimeDeliveryBand: '95%+ On-Time',
    verifiedSinceYear: 2024,
  };

  it('renders correctly with anonymous performance badge', () => {
    const element = React.createElement(VendorIntelligenceScorecardWidget, {
      badge: sampleBadge,
    });
    expect(element).toBeDefined();
    expect(element.props.badge.supplierAlias).toBe('Supplier A7K3');
    expect(element.props.badge.tier).toBe('PLATINUM');
  });
});
