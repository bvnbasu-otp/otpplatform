import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inferJourneyStageFromPath } from '@/features/navigation/journey-stage';

const WEB_SRC = resolve(__dirname, '../..');

describe('Slice 2 — buyer dashboard & intake entry', () => {
  it('keeps the journey strip off the buyer dashboard hub', () => {
    expect(inferJourneyStageFromPath('/dashboard')).toBeNull();
  });

  it('shows TELL stage on the intake route for shell continuity', () => {
    expect(inferJourneyStageFromPath('/intake')).toBe('TELL');
  });

  it('exposes one primary intake CTA on the buyer dashboard', () => {
    const dashboard = readFileSync(resolve(WEB_SRC, 'pages/DashboardPage.tsx'), 'utf8');
    expect(dashboard).not.toContain('BuyerDashboardStartPanel');
    expect(dashboard).not.toContain('Tell OTP what you need');
    expect(dashboard).not.toContain('Start a procurement request');
    const cockpit = readFileSync(resolve(WEB_SRC, 'features/home/components/BuyerSourcingCockpitCard.tsx'), 'utf8');
    expect(cockpit).toContain('data-testid="cockpit-open-intake-wizard"');
    expect(cockpit).toContain('aria-expanded');
    expect(cockpit).not.toContain('What do you need to buy?');
  });

  it('documents intake entry banner on the requirement intake page', () => {
    const page = readFileSync(resolve(WEB_SRC, 'features/intake/pages/RequirementIntakePage.tsx'), 'utf8');
    expect(page).toContain('IntakeEntryBanner');
    const banner = readFileSync(resolve(WEB_SRC, 'features/intake/components/IntakeEntryBanner.tsx'), 'utf8');
    expect(banner).toContain('data-testid="intake-entry-banner"');
  });

  it('uses dashboard empty state when there is no activity', () => {
    const dashboard = readFileSync(resolve(WEB_SRC, 'pages/DashboardPage.tsx'), 'utf8');
    expect(dashboard).toContain('HomeEmptyState');
    expect(dashboard).toContain('buyer-dashboard-empty');
  });
});
