import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Phase 7.1 UX Telemetry Abstraction Regressions', () => {
  const commercialPages = [
    'src/features/award/pages/AwardPage.tsx',
    'src/features/reveal/pages/SupplierRevealPage.tsx',
    'src/features/governance/pages/CommitteeVotePage.tsx',
    'src/features/rfq/components/QuoteComparisonSummaryHeader.tsx',
    'src/features/requirement/pages/RequirementDetailPage.tsx',
    'src/features/procurement-os/pages/MarketIntelligenceStepPage.tsx',
    'src/features/performance/pages/SupplierPerformancePage.tsx',
    'src/features/clarification/pages/RfqClarificationPage.tsx',
    'src/features/rfq/components/QuoteStickyBottomBar.tsx',
    'src/features/fulfillment/pages/PurchaseOrdersPage.tsx',
    'src/features/fulfillment/pages/SupplierWorkOrderPage.tsx',
    'src/features/site/pages/FaqPage.tsx',
    'src/components/mobile-showcase/MobileMultiDeviceGallery.tsx',
    'src/components/mobile-showcase/MobileScreensShowcase.tsx',
  ];

  const webRoot = path.resolve(__dirname, '../../../..');

  it('verifies commercial pages do not expose internal 15-step or prototype screen telemetry in rendered JSX', () => {
    // Prohibited telemetry regex patterns in commercial UI JSX templates
    const forbiddenPatterns = [
      /Screen\s+\d+\s*·\s*Step/i,
      /Step\s+\d+\s*(\/|of)\s*15/i,
      /Screen\s+0[1-7]\s*·/i,
      /Screen\s+1[0-1]\s*:/i,
      /Proceed to Award \(Step 9\)/i,
      /Cast Committee Vote \(Step 7\)/i,
      /Proceed to Committee Vote \(Step 7\)/i,
      /View Purchase Order \(Step 13\)/i,
    ];

    for (const relPath of commercialPages) {
      const fullPath = path.join(webRoot, relPath);
      expect(fs.existsSync(fullPath), `File ${relPath} should exist`).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf-8');

      // Check against prohibited patterns
      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        expect(
          match,
          `File ${relPath} contains prohibited telemetry leak: "${match ? match[0] : ''}" matching ${pattern}`,
        ).toBeNull();
      }
    }
  });

  it('verifies ProcurementStageNavigator restricts 15-step telemetry toggle to admin role', () => {
    const navigatorPath = path.join(webRoot, 'src/features/lifecycle/components/ProcurementStageNavigator.tsx');
    const content = fs.readFileSync(navigatorPath, 'utf-8');

    // Should only render 15-step toggle buttons when role === 'admin'
    expect(content).toContain("role === 'admin' &&");
    expect(content).toContain('data-testid="admin-telemetry-toggle"');
    expect(content).toContain('data-testid="admin-bottom-telemetry-toggle"');
  });

  it('verifies canonical commercial stage titles exist on remediated components', () => {
    const awardPage = fs.readFileSync(path.join(webRoot, 'src/features/award/pages/AwardPage.tsx'), 'utf-8');
    expect(awardPage).toContain('Award Governance &amp; Decision Lock');

    const revealPage = fs.readFileSync(path.join(webRoot, 'src/features/reveal/pages/SupplierRevealPage.tsx'), 'utf-8');
    expect(revealPage).toContain('Controlled Supplier Identity Reveal');

    const committeePage = fs.readFileSync(path.join(webRoot, 'src/features/governance/pages/CommitteeVotePage.tsx'), 'utf-8');
    expect(committeePage).toContain('Committee Voting &amp; Deliberation');

    const headerComponent = fs.readFileSync(path.join(webRoot, 'src/features/rfq/components/QuoteComparisonSummaryHeader.tsx'), 'utf-8');
    expect(headerComponent).toContain('Proposal Comparison &amp; Evaluation');

    const reqDetailPage = fs.readFileSync(path.join(webRoot, 'src/features/requirement/pages/RequirementDetailPage.tsx'), 'utf-8');
    expect(reqDetailPage).toContain('Requirement Specification');

    const marketPage = fs.readFileSync(path.join(webRoot, 'src/features/procurement-os/pages/MarketIntelligenceStepPage.tsx'), 'utf-8');
    expect(marketPage).toContain('Market Intelligence &amp; Pricing Radar');

    const perfPage = fs.readFileSync(path.join(webRoot, 'src/features/performance/pages/SupplierPerformancePage.tsx'), 'utf-8');
    expect(perfPage).toContain('Performance Scorecard &amp; Rating');
  });
});
