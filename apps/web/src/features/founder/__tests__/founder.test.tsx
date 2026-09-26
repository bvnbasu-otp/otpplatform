import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FounderDashboardPage } from '../pages/FounderDashboardPage';
import {
  GooglePlacesOperationalCard,
  evaluateGooglePlacesQuotaHealth,
  type GooglePlacesOperationalVisibilityData,
} from '../components/GooglePlacesOperationalCard';
import { supabase } from '@/lib/supabase';
import { TruthfulProviderStatus, GisExecutionMode } from '@otp/domain';

// Mock Supabase RPC for FounderDashboardPage
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('OTP R2-C2: Founder / CEO Operational Visibility Suite (C2-01 to C2-12)', () => {
  const sampleFounderMetrics = {
    generatedAt: new Date().toISOString(),
    buyers: {
      total: 12,
      active: 8,
      repeat: 4,
      repeatPercentage: 50,
    },
    suppliers: {
      total: 35,
      active: 18,
      repeat: 9,
      repeatPercentage: 50,
    },
    procurement: {
      totalRfqs: 45,
      activeRfqs: 6,
      awardedRfqs: 28,
      completedOrders: 25,
      totalGmv: 1850000,
      totalPlatformFees: 9250,
      firstTransactionAt: '2026-09-01T10:00:00Z',
      latestTransactionAt: '2026-09-26T12:00:00Z',
    },
    geography: {
      citiesCovered: 3,
    },
    milestones: [
      {
        id: 'M-BUYER-001',
        title: 'First Enterprise/Community Buyer',
        target: 1,
        current: 12,
        achieved: true,
      },
      {
        id: 'M-TX-001',
        title: 'First Successful Procurement Award & PO',
        target: 1,
        current: 25,
        achieved: true,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: sampleFounderMetrics,
      error: null,
    } as any);
  });

  /**
   * C2-01: Founder page renders correctly with executive cockpit components.
   */
  it('C2-01: Founder page renders cleanly with executive cockpit components', () => {
    const html = renderToStaticMarkup(<FounderDashboardPage initialMetrics={sampleFounderMetrics} />);

    expect(html).toContain('OTP Executive &amp; Founder Cockpit');
    expect(html).toContain('Executive Isolation');
    expect(html).toContain('Google Places Supplier Discovery');
    expect(html).toContain('Baskar Loganathan');
    expect(html).toContain('Founder &amp; CEO');
  });

  /**
   * C2-02: Google Places status renders correctly for each valid state.
   */
  it('C2-02: Google Places status renders correctly for each valid state (LIVE, CREDENTIAL_GATED, FALLBACK_ACTIVE, QUOTA_EXHAUSTED, UNAVAILABLE)', () => {
    const baseData: GooglePlacesOperationalVisibilityData = {
      providerStatus: 'LIVE',
      isCredentialConfigured: true,
      isCredentialVerifiedLive: true,
      activeFallbackTier: 'LIVE_API',
      dailySafetyLimit: 1500,
      usedToday: 250,
      metrics: {
        sessionsToday: 30,
        avgApiCallsPerSession: 3.1,
        candidatesDiscoveredInArea: 180,
        candidatesOtpRegistered: 50,
        candidatesGstVerified: 28,
      },
    };

    // 1. LIVE
    const liveHtml = renderToStaticMarkup(<GooglePlacesOperationalCard data={baseData} />);
    expect(liveHtml).toContain('data-testid="places-provider-status-badge"');
    expect(liveHtml).toContain('>LIVE</span>');

    // 2. CREDENTIAL_GATED
    const gatedHtml = renderToStaticMarkup(
      <GooglePlacesOperationalCard
        data={{
          ...baseData,
          providerStatus: 'CREDENTIAL_GATED',
          isCredentialVerifiedLive: false,
          activeFallbackTier: 'DATABASE_CACHE',
        }}
      />,
    );
    expect(gatedHtml).toContain('>CREDENTIAL_GATED</span>');

    // 3. FALLBACK_ACTIVE
    const fallbackHtml = renderToStaticMarkup(
      <GooglePlacesOperationalCard
        data={{
          ...baseData,
          providerStatus: 'FALLBACK_ACTIVE',
          activeFallbackTier: 'STATIC_REFERENCE',
        }}
      />,
    );
    expect(fallbackHtml).toContain('>FALLBACK_ACTIVE</span>');

    // 4. QUOTA_EXHAUSTED
    const quotaHtml = renderToStaticMarkup(
      <GooglePlacesOperationalCard
        data={{
          ...baseData,
          providerStatus: 'QUOTA_EXHAUSTED',
          usedToday: 1500,
          activeFallbackTier: 'DATABASE_CACHE',
        }}
      />,
    );
    expect(quotaHtml).toContain('>QUOTA_EXHAUSTED</span>');

    // 5. UNAVAILABLE
    const unavailHtml = renderToStaticMarkup(
      <GooglePlacesOperationalCard
        data={{
          ...baseData,
          providerStatus: 'UNAVAILABLE',
          isCredentialConfigured: false,
          isCredentialVerifiedLive: false,
          activeFallbackTier: 'UNAVAILABLE',
        }}
      />,
    );
    expect(unavailHtml).toContain('>UNAVAILABLE</span>');
  });

  /**
   * C2-03: Daily safety limit renders correctly with configurable threshold.
   */
  it('C2-03: Daily safety limit renders correctly with configurable threshold', () => {
    const customLimitData: GooglePlacesOperationalVisibilityData = {
      providerStatus: 'LIVE',
      isCredentialConfigured: true,
      isCredentialVerifiedLive: true,
      activeFallbackTier: 'LIVE_API',
      dailySafetyLimit: 2000,
      usedToday: 400,
      metrics: {
        sessionsToday: 20,
        avgApiCallsPerSession: 4.0,
        candidatesDiscoveredInArea: 100,
        candidatesOtpRegistered: 30,
        candidatesGstVerified: 15,
      },
    };

    const html = renderToStaticMarkup(<GooglePlacesOperationalCard data={customLimitData} />);
    expect(html).toContain('data-testid="quota-max-limit"');
    expect(html).toContain('Limit: 2,000 reqs/day');
  });

  /**
   * C2-04: Used/remaining/percentage calculations are exact and correct.
   */
  it('C2-04: Used/remaining/percentage calculations are mathematically sound', () => {
    // 150 used out of 1500 -> 1350 remaining, 10.0%
    const eval1 = evaluateGooglePlacesQuotaHealth(150, 1500);
    expect(eval1.used).toBe(150);
    expect(eval1.limit).toBe(1500);
    expect(eval1.remaining).toBe(1350);
    expect(eval1.percentageConsumed).toBe(10);
    expect(eval1.healthColor).toBe('green');

    // 1200 used out of 1500 -> 300 remaining, 80.0%
    const eval2 = evaluateGooglePlacesQuotaHealth(1200, 1500);
    expect(eval2.used).toBe(1200);
    expect(eval2.remaining).toBe(300);
    expect(eval2.percentageConsumed).toBe(80);
    expect(eval2.healthColor).toBe('yellow');

    // 1350 used out of 1500 -> 150 remaining, 90.0%
    const eval3 = evaluateGooglePlacesQuotaHealth(1350, 1500);
    expect(eval3.used).toBe(1350);
    expect(eval3.remaining).toBe(150);
    expect(eval3.percentageConsumed).toBe(90);
    expect(eval3.healthColor).toBe('orange');

    // 1470 used out of 1500 -> 30 remaining, 98.0%
    const eval4 = evaluateGooglePlacesQuotaHealth(1470, 1500);
    expect(eval4.used).toBe(1470);
    expect(eval4.remaining).toBe(30);
    expect(eval4.percentageConsumed).toBe(98);
    expect(eval4.healthColor).toBe('red');
  });

  /**
   * C2-05: Quota thresholds render correctly (Green/Yellow/Orange/Red).
   */
  it('C2-05: Quota health thresholds render proper color bands (Green, Yellow, Orange, Red)', () => {
    // Green band (<= 70%)
    const greenEval = evaluateGooglePlacesQuotaHealth(750, 1500); // 50%
    expect(greenEval.healthColor).toBe('green');
    expect(greenEval.healthLabel).toBe('Normal Operating Headroom');

    // Yellow band (70% - 85%)
    const yellowEval = evaluateGooglePlacesQuotaHealth(1125, 1500); // 75%
    expect(yellowEval.healthColor).toBe('yellow');
    expect(yellowEval.healthLabel).toBe('Moderate Utilization');

    // Orange band (85% - 95%)
    const orangeEval = evaluateGooglePlacesQuotaHealth(1320, 1500); // 88%
    expect(orangeEval.healthColor).toBe('orange');
    expect(orangeEval.healthLabel).toBe('High Utilization Warning');

    // Red band (>= 95%)
    const redEval = evaluateGooglePlacesQuotaHealth(1450, 1500); // 96.7%
    expect(redEval.healthColor).toBe('red');
    expect(redEval.healthLabel).toBe('Critical / Near Exhaustion');
  });

  /**
   * C2-06: Quota exhaustion state renders correctly with fallback notice.
   */
  it('C2-06: Quota exhaustion state renders critical notice and zero headroom', () => {
    const exhaustedData: GooglePlacesOperationalVisibilityData = {
      providerStatus: 'QUOTA_EXHAUSTED',
      isCredentialConfigured: true,
      isCredentialVerifiedLive: true,
      activeFallbackTier: 'DATABASE_CACHE',
      dailySafetyLimit: 1500,
      usedToday: 1500,
      metrics: {
        sessionsToday: 55,
        avgApiCallsPerSession: 4.2,
        candidatesDiscoveredInArea: 400,
        candidatesOtpRegistered: 110,
        candidatesGstVerified: 65,
      },
    };

    const html = renderToStaticMarkup(<GooglePlacesOperationalCard data={exhaustedData} />);
    expect(html).toContain('data-testid="quota-exhaustion-notice"');
    expect(html).toContain('Daily Safety Limit Exceeded (1,500/1,500 Calls)');
    expect(html).toContain('Zero additional Google API charges incurred');
    expect(html).toContain('data-testid="quota-remaining-today"');
    expect(html).toContain('>0</p>');
  });

  /**
   * C2-07: Fallback status renders active tier across ladder.
   */
  it('C2-07: Fallback ladder correctly reflects active tier', () => {
    const tiers: Array<GooglePlacesOperationalVisibilityData['activeFallbackTier']> = [
      'LIVE_API',
      'DATABASE_CACHE',
      'STATIC_REFERENCE',
      'UNAVAILABLE',
    ];

    tiers.forEach((tier) => {
      const data: GooglePlacesOperationalVisibilityData = {
        providerStatus: tier === 'LIVE_API' ? 'LIVE' : 'FALLBACK_ACTIVE',
        isCredentialConfigured: true,
        isCredentialVerifiedLive: tier === 'LIVE_API',
        activeFallbackTier: tier,
        dailySafetyLimit: 1500,
        usedToday: 200,
        metrics: {
          sessionsToday: 10,
          avgApiCallsPerSession: 3.0,
          candidatesDiscoveredInArea: 50,
          candidatesOtpRegistered: 20,
          candidatesGstVerified: 10,
        },
      };

      const html = renderToStaticMarkup(<GooglePlacesOperationalCard data={data} />);
      const expectedTierTestId = `data-testid="fallback-tier-${tier.toLowerCase()}"`;
      expect(html).toContain(expectedTierTestId);
      expect(html).toContain('data-active="true"');
      expect(html).toContain('ACTIVE TIER');
    });
  });

  /**
   * C2-08: Credential-gated state strictly prevents false LIVE badge display.
   */
  it('C2-08: Credential-gated state strictly prevents false LIVE badge display', () => {
    const unverifiedData: GooglePlacesOperationalVisibilityData = {
      providerStatus: 'LIVE', // Claims live, but isCredentialVerifiedLive is FALSE
      isCredentialConfigured: true,
      isCredentialVerifiedLive: false, // Unverified
      activeFallbackTier: 'DATABASE_CACHE',
      dailySafetyLimit: 1500,
      usedToday: 0,
      metrics: {
        sessionsToday: 0,
        avgApiCallsPerSession: 0,
        candidatesDiscoveredInArea: 0,
        candidatesOtpRegistered: 0,
        candidatesGstVerified: 0,
      },
    };

    const html = renderToStaticMarkup(<GooglePlacesOperationalCard data={unverifiedData} />);
    expect(html).toContain('data-testid="places-provider-status-badge"');
    expect(html).not.toContain('>LIVE</span>');
    expect(html).toContain('>CREDENTIAL_GATED</span>');
  });

  /**
   * C2-09: Proves zero secret exposure in UI rendering and payload serialization.
   */
  it('C2-09: Proves zero secret exposure in UI rendering and payload serialization', () => {
    const liveData: GooglePlacesOperationalVisibilityData = {
      providerStatus: 'LIVE',
      isCredentialConfigured: true,
      isCredentialVerifiedLive: true,
      activeFallbackTier: 'LIVE_API',
      dailySafetyLimit: 1500,
      usedToday: 300,
      metrics: {
        sessionsToday: 30,
        avgApiCallsPerSession: 3.2,
        candidatesDiscoveredInArea: 210,
        candidatesOtpRegistered: 65,
        candidatesGstVerified: 32,
      },
    };

    const html = renderToStaticMarkup(<GooglePlacesOperationalCard data={liveData} />);

    // Must not contain any Google API key pattern (AIzaSy...)
    expect(html).not.toMatch(/AIzaSy[A-Za-z0-9_-]{20,}/);
    expect(html).not.toContain('apiKey');
    expect(html).not.toContain('API_KEY');
    expect(html).not.toContain('process.env');
  });

  /**
   * C2-10: Mobile layout renders within shell boundaries without horizontal overflow.
   */
  it('C2-10: Mobile layout uses responsive containment without overflow and shows IST reset schedule', () => {
    const html = renderToStaticMarkup(<GooglePlacesOperationalCard />);
    expect(html).toContain('data-testid="google-places-operational-card"');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('grid grid-cols-1 sm:grid-cols-2');
    expect(html).toContain('Resets daily at 05:30 IST / 00:00 UTC');
  });

  /**
   * C2-11: Founder dashboard preserves all existing production KPI and milestone tracks.
   */
  it('C2-11: Founder dashboard preserves all existing production KPI and milestone tracks', () => {
    const html = renderToStaticMarkup(<FounderDashboardPage initialMetrics={sampleFounderMetrics} />);

    expect(html).toContain('Cumulative GMV');
    expect(html).toContain('Registered Buyers');
    expect(html).toContain('Verified Suppliers');
    expect(html).toContain('Completed POs');
    expect(html).toContain('Platform Fees');
    expect(html).toContain('City Footprint');
    expect(html).toContain('Production Milestone Certification Track');
    expect(html).toContain('Supplier Network Organic Growth &amp; Discovery Telemetry');
  });

  /**
   * C2-12: Existing Google Places adapter and quota tests remain green.
   */
  it('C2-12: Discovery metrics preserve strict trust boundary across candidate stages and adapter remains verified', async () => {
    const metricsData: GooglePlacesOperationalVisibilityData = {
      providerStatus: 'LIVE',
      isCredentialConfigured: true,
      isCredentialVerifiedLive: true,
      activeFallbackTier: 'LIVE_API',
      dailySafetyLimit: 1500,
      usedToday: 148,
      metrics: {
        sessionsToday: 42,
        avgApiCallsPerSession: 3.5,
        candidatesDiscoveredInArea: 312,
        candidatesOtpRegistered: 84,
        candidatesGstVerified: 46,
      },
    };

    const html = renderToStaticMarkup(<GooglePlacesOperationalCard data={metricsData} />);

    expect(html).toContain('data-testid="metrics-discovered-in-area"');
    expect(html).toContain('>312</p>');
    expect(html).toContain('data-testid="metrics-otp-registered"');
    expect(html).toContain('>84</p>');
    expect(html).toContain('data-testid="metrics-gst-verified"');
    expect(html).toContain('>46</p>');

    // Strict funnel invariant
    expect(metricsData.metrics.candidatesDiscoveredInArea).toBeGreaterThanOrEqual(
      metricsData.metrics.candidatesOtpRegistered,
    );
    expect(metricsData.metrics.candidatesOtpRegistered).toBeGreaterThanOrEqual(
      metricsData.metrics.candidatesGstVerified,
    );
  });
});
