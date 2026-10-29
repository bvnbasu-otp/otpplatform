import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Unified UI/UX Mobile Simplicity Redesign Invariants', () => {
  // __dirname is apps/web/src/features/home
  const webSrc = resolve(__dirname, '../../');

  it('Step 1: WorkspaceHeader & MobileBottomNav hide complex chrome on mobile', () => {
    const headerSrc = readFileSync(
      resolve(webSrc, 'features/navigation/components/WorkspaceHeader.tsx'),
      'utf8',
    );
    expect(headerSrc).toContain('data-testid="header-role-indicator"');
    expect(headerSrc).toContain('className="hidden"');

    const navSrc = readFileSync(
      resolve(webSrc, 'components/MobileBottomNav.tsx'),
      'utf8',
    );
    expect(navSrc).toContain('data-testid="bottom-nav-3-items"');
    expect(navSrc).toContain("t('History',");
    expect(navSrc).toContain("t('Profile',");
  });

  it('Step 2: Google-Style Home & 2-Fork Intake provide plain layman terms and 1-tap choice', () => {
    const cockpitSrc = readFileSync(
      resolve(webSrc, 'features/home/components/BuyerSourcingCockpitCard.tsx'),
      'utf8',
    );
    expect(cockpitSrc).toContain('What do you need today?');
    expect(cockpitSrc).toContain('Start New Request →');
    expect(cockpitSrc).toContain('Get Quotes →');
    expect(cockpitSrc).toContain('Home Repairs');
    expect(cockpitSrc).toContain('Electrical & Plumbing');
    expect(cockpitSrc).toContain('Drinking Water');
    expect(cockpitSrc).toContain('Cleaning & Maintenance');
    expect(cockpitSrc).toContain('Office Furniture');
    expect(cockpitSrc).toContain('Office Supplies');
    expect(cockpitSrc).toContain('Review &amp; Inspect');
    expect(cockpitSrc).not.toContain('canVote: false');

    const intakeSrc = readFileSync(
      resolve(webSrc, 'features/intake/components/Tier1TellOtpCard.tsx'),
      'utf8',
    );
    expect(intakeSrc).toContain('data-testid="fork-buy-products"');
    expect(intakeSrc).toContain('data-testid="fork-hire-service"');
    expect(intakeSrc).toContain('Buy Products');
    expect(intakeSrc).toContain('Hire a Service');
    expect(intakeSrc).toContain('Stage 1 — What do you need?');

    const tier2Src = readFileSync(
      resolve(webSrc, 'features/intake/components/Tier2PrecisionScopeCard.tsx'),
      'utf8',
    );
    expect(tier2Src).toContain('Stage 2 — Item Details &amp; Specifications');

    const tier3Src = readFileSync(
      resolve(webSrc, 'features/intake/components/Tier3SourcingControlsCard.tsx'),
      'utf8',
    );
    expect(tier3Src).toContain('Stage 3 — Supplier &amp; Location Preferences');

    const unifiedSrc = readFileSync(
      resolve(webSrc, 'features/intake/components/UnifiedThreeTierIntake.tsx'),
      'utf8',
    );
    expect(unifiedSrc).toContain('Submit Request &amp; Get Quotes →');
  });

  it('Step 3: Layman Quotes Review & Quick Quote replace enterprise procurement jargon', () => {
    const quickQuoteSrc = readFileSync(
      resolve(webSrc, 'features/quick-quote/pages/QuickQuotePage.tsx'),
      'utf8',
    );
    expect(quickQuoteSrc).toContain('3. Warranty Period');
    expect(quickQuoteSrc).not.toContain('3. Warranty SLA');
    expect(quickQuoteSrc).toContain('Submit Quote →');
    expect(quickQuoteSrc).not.toContain('🔒 Seal & Transmit Quote →');

    const evalSrc = readFileSync(
      resolve(webSrc, 'features/evaluation/components/EvaluationDecisionCockpit.tsx'),
      'utf8',
    );
    expect(evalSrc).toContain('Compare Quotes &amp; Offers');
    expect(evalSrc).toContain('🛡️ Verified Private Quotes');
    expect(evalSrc).toContain('Total Price (incl. GST):');
    expect(evalSrc).toContain('Delivery:');
    expect(evalSrc).toContain('Match Score:');
    expect(evalSrc).toContain('Choose Winner &amp; Create Order →');

    const voteSrc = readFileSync(
      resolve(webSrc, 'features/governance/pages/CommitteeVotePage.tsx'),
      'utf8',
    );
    expect(voteSrc).toContain('Team Decision Progress');
    expect(voteSrc).toContain('Fair Decision Check:');
    expect(voteSrc).toContain('Submit My Choice →');

    const awardSrc = readFileSync(
      resolve(webSrc, 'features/award/pages/AwardPage.tsx'),
      'utf8',
    );
    expect(awardSrc).toContain('Winner Selected:');
    expect(awardSrc).toContain('Call Supplier');
    expect(awardSrc).toContain('WhatsApp Chat');
    expect(awardSrc).not.toContain('Identity unmasked:');
  });

  it('Step 4: Watrify 2-Pill History provides clean Active and Completed tabs on mobile', () => {
    const poPageSrc = readFileSync(
      resolve(webSrc, 'features/fulfillment/pages/PurchaseOrdersPage.tsx'),
      'utf8',
    );
    expect(poPageSrc).toContain('data-testid="mobile-tab-active"');
    expect(poPageSrc).toContain('data-testid="mobile-tab-completed"');
    expect(poPageSrc).toContain('Active (');
    expect(poPageSrc).toContain('Completed (');

    const poListSrc = readFileSync(
      resolve(webSrc, 'features/fulfillment/components/PurchaseOrderList.tsx'),
      'utf8',
    );
    expect(poListSrc).toContain('View Order Details →');
    expect(poListSrc).not.toContain('View PO & Inspection →');
  });
});
