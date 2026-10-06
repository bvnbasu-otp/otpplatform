import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FounderDashboardPage } from '../pages/FounderDashboardPage';
import {
  GooglePlacesOperationalCard,
  type GooglePlacesOperationalVisibilityData,
} from '../components/GooglePlacesOperationalCard';

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

/**
 * F-08: the founder dashboard may only show real values or an explicit "not available" state.
 * The removed literals were: 94.2% cache hit, 88.5% zero-call, 32.8% organic claim, 148 / 1,500 budget,
 * and the card defaulting to LIVE + credential verified + 148 used + 42/3.5/312/84/46 discovery counts.
 */
const metrics = {
  generatedAt: '2026-10-06T00:00:00.000Z',
  buyers: { total: 12, active: 8, repeat: 4, repeatPercentage: 50 },
  suppliers: { total: 35, verified: 21, active: 18, repeat: 9, repeatPercentage: 50 },
  procurement: {
    totalRfqs: 45,
    activeRfqs: 6,
    awardedRfqs: 28,
    purchaseOrdersIssued: 25,
    completedOrders: 11,
    totalGmv: 1850000,
    totalPlatformFees: 9250,
    firstTransactionAt: null,
    latestTransactionAt: null,
  },
  geography: { citiesCovered: 3 },
  milestones: [],
};

const FABRICATED = [/94\.2/, /88\.5/, /32\.8/, /148\s*\/\s*1,500/, /\b148\b/, /\b312\b/];

function expectNoFabricated(html: string) {
  for (const pattern of FABRICATED) expect(html).not.toMatch(pattern);
}

describe('F-08 founder dashboard truthfulness', () => {
  it('page never renders the fabricated telemetry literals', () => {
    expectNoFabricated(renderToStaticMarkup(<FounderDashboardPage initialMetrics={metrics} />));
    expectNoFabricated(
      renderToStaticMarkup(
        <FounderDashboardPage initialMetrics={metrics} initialGoogleBudget={{ usageDate: '2026-10-06', requestCount: 37 }} />,
      ),
    );
  });

  it('cache hit, zero-call and organic claim are explicitly not instrumented', () => {
    const html = renderToStaticMarkup(<FounderDashboardPage initialMetrics={metrics} />);
    for (const label of ['Network Cache Hit Rate', 'Zero-Call RFQs', 'Organic Claim Rate']) {
      const idx = html.indexOf(label);
      expect(idx).toBeGreaterThan(-1);
      expect(html.slice(idx, idx + 260)).toContain('Not instrumented');
      expect(html.slice(idx, idx + 260)).not.toMatch(/\d+(\.\d+)?%/);
    }
  });

  it('Google budget shows a real counter reading as used and the configured limit as a limit', () => {
    const html = renderToStaticMarkup(
      <FounderDashboardPage initialMetrics={metrics} initialGoogleBudget={{ usageDate: '2026-10-06', requestCount: 37 }} />,
    );
    expect(html).toContain('37 / 1,500');
    expect(html).toContain('configured limit');
    // The card shows the same real usage but still does not claim a provider status.
    expect(html).toContain('data-testid="quota-used-today"');
    expect(html).not.toContain('>LIVE</span>');
  });

  it('Google budget is Unavailable (not a number) when the counter has not been read', () => {
    const html = renderToStaticMarkup(<FounderDashboardPage initialMetrics={metrics} />);
    const idx = html.indexOf('Google API Daily Budget');
    expect(html.slice(idx, idx + 320)).toContain('Unavailable');
    expect(html.slice(idx, idx + 320)).not.toMatch(/\d+ \/ 1,500/);
  });

  it('missing places data is not labeled LIVE and carries no usage or discovery counts', () => {
    const html = renderToStaticMarkup(<GooglePlacesOperationalCard />);
    expect(html).not.toContain('>LIVE</span>');
    expect(html).not.toContain('Configured (Live)');
    expect(html).not.toContain('ACTIVE TIER');
    expect(html).toContain('>UNAVAILABLE</span>');
    expect(html).toContain('Not reported');
    expect(html).toContain('Usage not reported');
    expect(html).toContain('Not instrumented');
    expectNoFabricated(html);
    for (const id of ['quota-used-today', 'quota-remaining-today', 'quota-percent-consumed']) {
      expect(html).toMatch(new RegExp(`data-testid="${id}"[^>]*>—</p>`));
    }
    // A configured limit is configuration, so it may be shown as a limit.
    expect(html).toContain('Limit: 1,500 reqs/day');
  });

  it('a real counter reading on the card never promotes status to LIVE', () => {
    const html = renderToStaticMarkup(
      <GooglePlacesOperationalCard quotaCounter={{ usedToday: 37, dailySafetyLimit: 1500 }} />,
    );
    expect(html).toMatch(/data-testid="quota-used-today"[^>]*>37<\/p>/);
    expect(html).toContain('>UNAVAILABLE</span>');
    expect(html).not.toContain('>LIVE</span>');
  });

  it('fallback stays visibly distinct from live when real data is passed in', () => {
    const base: GooglePlacesOperationalVisibilityData = {
      providerStatus: 'FALLBACK_ACTIVE',
      isCredentialConfigured: true,
      isCredentialVerifiedLive: false,
      activeFallbackTier: 'DATABASE_CACHE',
      dailySafetyLimit: 1500,
      usedToday: 1500,
      metrics: null,
    };
    const fallback = renderToStaticMarkup(<GooglePlacesOperationalCard data={base} />);
    expect(fallback).toContain('>FALLBACK_ACTIVE</span>');
    expect(fallback).not.toContain('>LIVE</span>');
    expect(fallback).toContain('Not instrumented'); // null metrics render honestly
    const live = renderToStaticMarkup(
      <GooglePlacesOperationalCard
        data={{ ...base, providerStatus: 'LIVE', isCredentialVerifiedLive: true, activeFallbackTier: 'LIVE_API', usedToday: 10 }}
      />,
    );
    expect(live).toContain('>LIVE</span>');
    expect(live).not.toContain('>FALLBACK_ACTIVE</span>');
  });

  it('Verified Suppliers and Completed POs show the corrected counts, or a dash on an older server', () => {
    const html = renderToStaticMarkup(<FounderDashboardPage initialMetrics={metrics} />);
    expect(html).toMatch(/data-testid="kpi-verified-suppliers"[^>]*>21<\/p>/);
    expect(html).toMatch(/data-testid="kpi-completed-pos"[^>]*>11<\/p>/);

    const legacy = {
      ...metrics,
      suppliers: { total: 35, active: 18, repeat: 9, repeatPercentage: 50 },
      procurement: { ...metrics.procurement, purchaseOrdersIssued: undefined },
    };
    const legacyHtml = renderToStaticMarkup(<FounderDashboardPage initialMetrics={legacy} />);
    expect(legacyHtml).toMatch(/data-testid="kpi-verified-suppliers"[^>]*>—<\/p>/);
    expect(legacyHtml).toMatch(/data-testid="kpi-completed-pos"[^>]*>—<\/p>/);
  });

  it('source files no longer contain the fabricated literals', () => {
    const base = resolve(__dirname, '..');
    for (const file of ['pages/FounderDashboardPage.tsx', 'components/GooglePlacesOperationalCard.tsx']) {
      const src = readFileSync(resolve(base, file), 'utf8');
      expect(src, file).not.toMatch(/94\.2%|88\.5%|32\.8%/);
      expect(src, file).not.toMatch(/148\s*\/\s*1,500/);
      expect(src, file).not.toMatch(/usedToday:\s*148/);
      expect(src, file).not.toMatch(/candidatesDiscoveredInArea:\s*312/);
      expect(src, file).not.toMatch(/providerStatus:\s*'LIVE'/);
    }
  });
});
