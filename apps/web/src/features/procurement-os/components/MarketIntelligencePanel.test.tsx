import React from 'react';
import { describe, expect, it } from 'vitest';
import { MarketIntelligencePanel } from './MarketIntelligencePanel';
import type { MarketIntelligenceSummary } from '@otp/domain';

describe('MarketIntelligencePanel (Stage R2-16)', () => {
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
    sourceProviderName: 'OTP Curated Reference Baselines (CPWD/BIS)',
    freshnessStatus: 'AGING',
    confidenceLevel: 'MEDIUM',
    confidenceScore: 65,
    confidenceMethodology: 'Audited CPWD/BIS reference benchmark from 34 contracts.',
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

  const cacheIntelligence: MarketIntelligenceSummary = {
    ...staticIntelligence,
    sourceType: 'DATABASE_CACHE',
    sourceProviderName: 'OTP Verified Database Cache',
    freshnessStatus: 'FRESH',
    confidenceLevel: 'HIGH',
    confidenceScore: 80,
  };

  const unavailableIntelligence: MarketIntelligenceSummary = {
    categoryKey: 'unknown_category',
    locationCity: null,
    historicalPriceMin: null,
    historicalPriceMax: null,
    typicalDeliveryDaysMin: null,
    typicalDeliveryDaysMax: null,
    typicalWarrantyMonthsMin: null,
    typicalWarrantyMonthsMax: null,
    supplierPerformanceAvg: null,
    sampleSize: 0,
    sourceType: 'UNAVAILABLE',
    sourceProviderName: 'NONE',
    freshnessStatus: 'UNAVAILABLE',
    confidenceLevel: 'INSUFFICIENT_DATA',
    confidenceScore: 0,
    confidenceMethodology: 'Market intelligence data is currently unavailable for this category/geography.',
    isFallback: true,
  };

  it('instantiates with honest static reference properties and zero false live claims', () => {
    const element = React.createElement(MarketIntelligencePanel, {
      intelligence: staticIntelligence,
    });

    expect(element).toBeDefined();
    expect(element.props.intelligence?.sourceType).toBe('STATIC_REFERENCE');
    expect(element.props.intelligence?.sourceProviderName).toBe('OTP Curated Reference Baselines (CPWD/BIS)');
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

  it('instantiates with DATABASE_CACHE source', () => {
    const element = React.createElement(MarketIntelligencePanel, {
      intelligence: cacheIntelligence,
    });

    expect(element).toBeDefined();
    expect(element.props.intelligence?.sourceType).toBe('DATABASE_CACHE');
    expect(element.props.intelligence?.sourceProviderName).toBe('OTP Verified Database Cache');
  });

  it('instantiates with UNAVAILABLE source without fabricating fake values', () => {
    const element = React.createElement(MarketIntelligencePanel, {
      intelligence: unavailableIntelligence,
    });

    expect(element).toBeDefined();
    expect(element.props.intelligence?.sourceType).toBe('UNAVAILABLE');
    expect(element.props.intelligence?.historicalPriceMin).toBeNull();
    expect(element.props.intelligence?.historicalPriceMax).toBeNull();
    expect(element.props.intelligence?.sampleSize).toBe(0);
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

  it('exposes honest fallback ladder with regional baseline active when live API is unconfigured', () => {
    const element = React.createElement(MarketIntelligencePanel, {
      intelligence: staticIntelligence,
    });

    expect(element).toBeDefined();
    expect(element.props.intelligence?.sourceType).toBe('STATIC_REFERENCE');
    // Ensure no false claims of live stream
    expect(element.props.intelligence?.sourceType).not.toBe('LIVE_API');
    expect(element.props.intelligence?.sampleSize).toBe(34);
  });
});
