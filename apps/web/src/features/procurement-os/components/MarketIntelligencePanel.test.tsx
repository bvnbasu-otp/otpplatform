import React from 'react';
import { describe, expect, it } from 'vitest';
import { MarketIntelligencePanel } from './MarketIntelligencePanel';
import type { MarketIntelligenceSummary } from '@otp/domain';

describe('MarketIntelligencePanel (Phase C8.3.1)', () => {
  const staticIntelligence: MarketIntelligenceSummary = {
    categoryKey: 'cctv_surveillance',
    locationCity: 'Bengaluru',
    historicalPriceMin: 85000,
    historicalPriceMax: 120000,
    typicalDeliveryDaysMin: 3,
    typicalDeliveryDaysMax: 7,
    typicalWarrantyMonthsMin: 12,
    typicalWarrantyMonthsMax: 24,
    supplierPerformanceAvg: 96.5,
    sampleSize: 34,
    sourceType: 'STATIC_REFERENCE',
    sourceProviderName: 'OTP MSME Curated Cluster Benchmarks',
    freshnessStatus: 'AGING',
    confidenceLevel: 'MEDIUM',
    confidenceScore: 65,
    confidenceMethodology: 'Audited regional baseline from 34 transacted contracts.',
  };

  const liveIntelligence: MarketIntelligenceSummary = {
    ...staticIntelligence,
    sourceType: 'LIVE_API',
    sourceProviderName: 'ONDC Real-Time Commodity Index',
    freshnessStatus: 'FRESH',
    confidenceLevel: 'HIGH',
    confidenceScore: 92,
    responseIntegrityHash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
  };

  it('instantiates with honest static reference properties and zero false live claims', () => {
    const element = React.createElement(MarketIntelligencePanel, {
      intelligence: staticIntelligence,
    });

    expect(element).toBeDefined();
    expect(element.props.intelligence?.sourceType).toBe('STATIC_REFERENCE');
    expect(element.props.intelligence?.sourceProviderName).toBe('OTP MSME Curated Cluster Benchmarks');
    expect(element.props.intelligence?.freshnessStatus).toBe('AGING');
    expect(element.props.intelligence?.confidenceLevel).toBe('MEDIUM');
    expect(element.props.intelligence?.historicalPriceMin).toBe(85000);
    expect(element.props.intelligence?.historicalPriceMax).toBe(120000);
  });

  it('instantiates with LIVE_API source and captured response integrity hash', () => {
    const element = React.createElement(MarketIntelligencePanel, {
      intelligence: liveIntelligence,
    });

    expect(element).toBeDefined();
    expect(element.props.intelligence?.sourceType).toBe('LIVE_API');
    expect(element.props.intelligence?.freshnessStatus).toBe('FRESH');
    expect(element.props.intelligence?.confidenceLevel).toBe('HIGH');
    expect(element.props.intelligence?.responseIntegrityHash).toBe(
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    );
  });

  it('instantiates loading state cleanly', () => {
    const element = React.createElement(MarketIntelligencePanel, {
      intelligence: null,
      isLoading: true,
    });

    expect(element).toBeDefined();
    expect(element.props.isLoading).toBe(true);
    expect(element.props.intelligence).toBeNull();
  });
});
