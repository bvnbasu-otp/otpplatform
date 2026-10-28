import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Unified UI/UX Mobile Simplicity Redesign Invariants', () => {
  const root = resolve(__dirname, '../../../../');

  it('Step 1: WorkspaceHeader & MobileBottomNav hide complex chrome on mobile', () => {
    const headerSrc = readFileSync(
      resolve(root, 'apps/web/src/features/navigation/components/WorkspaceHeader.tsx'),
      'utf8',
    );
    expect(headerSrc).toContain('hidden sm:inline-flex');
    expect(headerSrc).toContain('hidden sm:flex');
    expect(headerSrc).toContain('hidden sm:block');

    const navSrc = readFileSync(
      resolve(root, 'apps/web/src/components/MobileBottomNav.tsx'),
      'utf8',
    );
    expect(navSrc).toContain("t('History', 'History')");
    expect(navSrc).toContain("t('Activity', 'Activity')");
  });

  it('Step 2: Google-Style Home & 2-Fork Intake provide plain layman terms and 1-tap choice', () => {
    const cockpitSrc = readFileSync(
      resolve(root, 'apps/web/src/features/home/components/BuyerSourcingCockpitCard.tsx'),
      'utf8',
    );
    expect(cockpitSrc).toContain('What do you need today?');
    expect(cockpitSrc).toContain('Start New Request →');
    expect(cockpitSrc).toContain('Get Quotes →');
    expect(cockpitSrc).toContain('Review &amp; Inspect');
    expect(cockpitSrc).not.toContain('canVote: false');

    const intakeSrc = readFileSync(
      resolve(root, 'apps/web/src/features/intake/components/Tier1TellOtpCard.tsx'),
      'utf8',
    );
    expect(intakeSrc).toContain('data-testid="fork-buy-products"');
    expect(intakeSrc).toContain('data-testid="fork-hire-service"');
    expect(intakeSrc).toContain('Buy Products');
    expect(intakeSrc).toContain('Hire a Service');
  });

  it('Step 3: Layman Quotes Review & Quick Quote replace enterprise procurement jargon', () => {
    const quickQuoteSrc = readFileSync(
      resolve(root, 'apps/web/src/features/quick-quote/pages/QuickQuotePage.tsx'),
      'utf8',
    );
    expect(quickQuoteSrc).toContain('3. Warranty Period');
    expect(quickQuoteSrc).not.toContain('3. Warranty SLA');
    expect(quickQuoteSrc).toContain('Submit Quote →');
    expect(quickQuoteSrc).not.toContain('🔒 Seal & Transmit Quote →');

    const evalSrc = readFileSync(
      resolve(root, 'apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx'),
      'utf8',
    );
    expect(evalSrc).toContain('Delivery:');
    expect(evalSrc).toContain('Match Score:');
    expect(evalSrc).toContain('Choose Winner &amp; Create Order →');
  });

  it('Step 4: Watrify 2-Pill History provides clean Active and Completed tabs on mobile', () => {
    const poPageSrc = readFileSync(
      resolve(root, 'apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx'),
      'utf8',
    );
    expect(poPageSrc).toContain('data-testid="mobile-tab-active"');
    expect(poPageSrc).toContain('data-testid="mobile-tab-completed"');
    expect(poPageSrc).toContain('Active (');
    expect(poPageSrc).toContain('Completed (');

    const poListSrc = readFileSync(
      resolve(root, 'apps/web/src/features/fulfillment/components/PurchaseOrderList.tsx'),
      'utf8',
    );
    expect(poListSrc).toContain('View Order Details →');
    expect(poListSrc).not.toContain('View PO & Inspection →');
  });
});
