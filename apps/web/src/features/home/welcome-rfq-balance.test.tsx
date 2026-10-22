import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { PilotRfqAllowance } from '@otp/domain';
import { HomeContextBar } from './components/HomeContextBar';
import { formatRfqBalanceSummary } from '@/features/requirement/components/PilotAllowanceText';

const dashboard = readFileSync(resolve(__dirname, '../../pages/DashboardPage.tsx'), 'utf8');
const supplier = readFileSync(resolve(__dirname, '../../pages/SupplierDashboardPage.tsx'), 'utf8');
const barSource = readFileSync(resolve(__dirname, 'components/HomeContextBar.tsx'), 'utf8');

const fullLabel = 'Pilot Allowance: 2 of 3 RFQs remaining this month (₹0 charged in Pilot Mode)';

function bar(rfqBalance?: {
  status: 'loading' | 'ready' | 'unavailable';
  label: string | null;
  summary: string | null;
}) {
  return renderToStaticMarkup(
    <HomeContextBar
      greeting="Good morning"
      name="Asha"
      organizationName="Basu House"
      actionCount={0}
      activeCount={1}
      onRefresh={() => {}}
      rfqBalance={rfqBalance}
    />,
  );
}

describe('RFQ balance beside the welcome heading', () => {
  it('places the authoritative allowance beside the greeting and keeps it on one line', () => {
    const summary = formatRfqBalanceSummary({
      remaining: 2,
      allowance: 3,
      quarterlyBonusAllowance: 0,
      quarterlyBonusRemaining: 0,
      purchasedCredits: 0,
      label: fullLabel,
    } as PilotRfqAllowance);
    const html = bar({ status: 'ready', label: fullLabel, summary });
    const heading = html.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? '';
    expect(heading).toContain('Good morning');
    expect(heading).toContain('Asha');
    expect(html).toContain('data-testid="pilot-allowance-label"');
    expect(html.indexOf('pilot-allowance-label')).toBeGreaterThan(html.indexOf('<h1'));
    expect(html.indexOf('pilot-allowance-label')).toBeLessThan(html.indexOf('</h1>') + 400);
    expect(html).toContain('2/3 RFQs');
    expect(html).toContain(`aria-label="${fullLabel}"`);
    expect(html).toContain('flex-nowrap');
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('overflow-x-hidden');
    expect(html).toContain('truncate');
    expect(barSource).toContain('max-w-[7.5rem]');
  });

  it('does not show a numeric balance while the allowance is loading or unavailable', () => {
    const loading = bar({ status: 'loading', label: fullLabel, summary: '2/3 RFQs' });
    expect(loading).toContain('Checking RFQs');
    expect(loading).not.toContain('2/3 RFQs');
    expect(loading).toContain('checking this month');

    const unavailable = bar({ status: 'unavailable', label: null, summary: null });
    const chip = unavailable.match(/data-testid="pilot-allowance-label"[^>]*>([^<]*)</)?.[1] ?? '';
    expect(chip).toBe('RFQs unavailable');
    expect(chip).not.toMatch(/\d/);
    expect(unavailable).toContain('could not be verified');
  });

  it('prints quarterly and purchased fields without folding them into a new total', () => {
    const summary = formatRfqBalanceSummary({
      remaining: 0,
      allowance: 3,
      quarterlyBonusAllowance: 1,
      quarterlyBonusRemaining: 1,
      purchasedCredits: 2,
      label: 'server label',
    } as PilotRfqAllowance);
    expect(summary).toBe('0/3 RFQs · 1/1 qtr · 2 extra');
    expect(summary).not.toBe('3 RFQs');
  });

  it('binds the buyer dashboard to the pilot allowance hook and leaves the supplier welcome without it', () => {
    expect(dashboard).toContain('usePilotAllowance');
    expect(dashboard).toContain('formatRfqBalanceSummary');
    expect(dashboard).toContain('rfqBalance={{');
    expect(dashboard).not.toContain('data-testid="pilot-allowance-label"');
    expect(dashboard).not.toContain('remaining +');
    expect(supplier).not.toContain('rfqBalance');
    expect(supplier).not.toContain('usePilotAllowance');
  });
});
