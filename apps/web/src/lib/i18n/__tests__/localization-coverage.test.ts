/**
 * Localization is a phrase-table preference. It does not certify eight complete
 * languages, and it must not rewrite authorization or agreement identity.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getTranslation, resetMissingTranslationKeys, missingTranslationKeys } from '../translations';

const WEB = resolve(__dirname, '../../../..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue;
      walk(full, acc);
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) {
      acc.push(relative(WEB, full).replace(/\\/g, '/'));
    }
  }
  return acc;
}

describe('pilot localization coverage', () => {
  const pages = walk(resolve(WEB, 'src'))
    .filter((file) => file.includes('/pages/') || file.startsWith('src/pages/'))
    .sort();
  const usingPhraseTable = pages.filter((file) => {
    const source = readFileSync(resolve(WEB, file), 'utf8');
    return source.includes('useLanguage(') || source.includes('getTranslation(');
  });
  const uncovered = pages.filter((file) => !usingPhraseTable.includes(file));

  it('keeps English as the only complete language and does not machine-translate the agreement', () => {
    const languages = readFileSync(resolve(__dirname, '../languages.ts'), 'utf8');
    const context = readFileSync(resolve(__dirname, '../LanguageContext.tsx'), 'utf8');
    expect(languages).toContain('English is the only complete interface language');
    expect(context).not.toContain('triggerPageTranslation');
    expect(context).not.toContain('is_platform_admin');
    expect(context).not.toContain('document_hash');
    expect(context).not.toContain('eula_version');
    resetMissingTranslationKeys();
    expect(getTranslation('hi-IN', 'legal.customerEula.body')).toBe('');
    expect(missingTranslationKeys()).toContain('legal.customerEula.body');
  });

  it('records the screens that are still English-only', () => {
    expect(usingPhraseTable).toEqual(['src/features/requirement/pages/DiscoverSuppliersPage.tsx']);
    expect(uncovered).toEqual([
      'src/features/admin/pages/AdminBuyerDiagnosticsPage.tsx',
      'src/features/admin/pages/AdminDashboardPage.tsx',
      'src/features/admin/pages/AdminSellerDiagnosticsPage.tsx',
      'src/features/audit/pages/AuditLogPage.tsx',
      'src/features/award/pages/AwardPage.tsx',
      'src/features/clarification/pages/RfqClarificationPage.tsx',
      'src/features/demo/pages/DemoDashboardPage.tsx',
      'src/features/evaluation/pages/EvaluationDecisionCockpitPage.tsx',
      'src/features/founder/pages/FounderDashboardPage.tsx',
      'src/features/fulfillment/pages/FinancialControlDashboardPage.tsx',
      'src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx',
      'src/features/fulfillment/pages/PurchaseOrdersPage.tsx',
      'src/features/fulfillment/pages/SupplierWorkOrderPage.tsx',
      'src/features/governance/pages/CommitteeVotePage.tsx',
      'src/features/intake/pages/RequirementIntakePage.tsx',
      'src/features/notifications/pages/NotificationsPage.tsx',
      'src/features/org/pages/InviteAcceptancePage.tsx',
      'src/features/org/pages/OrgMembersPage.tsx',
      'src/features/performance/pages/SupplierPerformancePage.tsx',
      'src/features/portal/pages/LegalPage.tsx',
      'src/features/portal/pages/LoginPage.tsx',
      'src/features/portal/pages/ResetPasswordPage.tsx',
      'src/features/portal/pages/SignupPage.tsx',
      'src/features/procurement-os/pages/MarketIntelligenceStepPage.tsx',
      'src/features/profile/pages/ProfilePage.tsx',
      'src/features/quick-quote/pages/QuickQuotePage.tsx',
      'src/features/requirement/pages/RequirementDetailPage.tsx',
      'src/features/requirement/pages/RfqReviewPublishPage.tsx',
      'src/features/reveal/pages/SupplierRevealPage.tsx',
      'src/features/rfq/pages/ActiveRfqMonitoringPage.tsx',
      'src/features/rfq/pages/RfqIdentityProtectedComparisonPage.tsx',
      'src/features/roles/pages/RoleOnboardingPage.tsx',
      'src/features/site/pages/AboutPage.tsx',
      'src/features/site/pages/FaqPage.tsx',
      'src/features/site/pages/LandingPage.tsx',
      'src/features/site/pages/PricingPage.tsx',
      'src/features/supplier/pages/SupplierAwardOnboardingPage.tsx',
      'src/features/supplier/pages/SupplierCapabilitiesPage.tsx',
      'src/features/supplier/pages/SupplierQuoteSubmitPage.tsx',
      'src/features/supplier/pages/SupplierQuotesPage.tsx',
      'src/features/supplier/pages/SupplierRfqPage.tsx',
      'src/pages/DashboardPage.tsx',
      'src/pages/HomePage.tsx',
      'src/pages/MaintenancePage.tsx',
      'src/pages/MobileShowcasePage.tsx',
      'src/pages/SupplierDashboardPage.tsx',
    ]);
    expect(uncovered).toContain('src/features/portal/pages/LegalPage.tsx');
  });
});
