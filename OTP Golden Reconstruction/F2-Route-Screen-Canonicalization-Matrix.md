# OTP Route-Screen Canonicalization Matrix (F2)
**Document Identifier:** `OTP-RECON-F2-ROUTEMATRIX`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE FORENSIC AUDIT  
**Target Rule:** *One Capability $\rightarrow$ One Canonical Route $\rightarrow$ One Canonical Screen*  
**Scope:** `apps/web/src/App.tsx`, all feature pages (`apps/web/src/features/**/pages/*`), and root pages (`apps/web/src/pages/*`)

---

## 1. Executive Summary & Canonical Principles

Over successive development phases (Phases 1 through 7.1), the web application accumulated **68 declared route paths** in `apps/web/src/App.tsx` and **51 physical page/screen components**. This resulted in:
1. **Route Bloat & Redundant Aliases:** Multiple distinct URLs pointing to the exact same screen component (e.g., 9 separate URLs routing to `EvaluationDecisionCockpitPage`).
2. **Duplicate Screens:** Competing implementations of identical capabilities (e.g., `HomePage` vs `DashboardPage`, `ActiveRfqMonitoringPage` vs `RequirementDetailPage`, `RfqIdentityProtectedComparisonPage` vs `EvaluationDecisionCockpitPage`).
3. **Enterprise & Prototype Clutter:** Lingering enterprise-only tabs, test-suite runners, and demo-walkthrough hooks embedded in standard navigation.

### Classification Taxonomy:
- **`CANONICAL`**: The single, authoritative production route and screen component for a legitimate customer or platform capability.
- **`DUPLICATE`**: An unnecessary secondary route or component that duplicates canonical functionality.
- **`LEGACY`**: An obsolete path or screen preserved temporarily for deep-link / backward-compatibility redirects.
- **`DEAD`**: Unused, unreachable, or orphaned screens and routes that should be purged.
- **`INTENTIONAL VARIANT`**: A legitimate secondary presentation mode of a capability (e.g., authenticated vs unauthenticated token view).
- **`INTERNAL`**: Operational, administrative, or diagnostic tools reserved exclusively for platform Superadmins and Founders.
- **`ENTERPRISE-ONLY`**: Routes or components implementing out-of-scope enterprise workflows that must be removed or refactored for MSME/RWA.
- **`REQUIRES DECISION`**: Ambiguous screens where product owner clarification is needed.

---

## 2. Master Route & Screen Forensic Matrix

| Route Path | Current Component / Target | Current Status | Target Classification | Target Canonical Route | Architectural Recommendation & Cleanup Action |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`/`** | `LandingPage` | Active | **`CANONICAL`** | `/` | Keep as public marketing homepage; routes authenticated buyers to `/dashboard`. |
| **`/how-it-works`** | `Navigate to /faqs#workflow` | Redirect | **`LEGACY`** | `/faqs#workflow` | Retain redirect for external marketing links. |
| **`/howitworks`** | `Navigate to /faqs#workflow` | Redirect | **`LEGACY`** | `/faqs#workflow` | Retain redirect. |
| **`/showcase`** | `MobileShowcasePage` | Active | **`INTENTIONAL VARIANT`**| `/showcase` | Retain for public PWA device preview gallery. |
| **`/mobile`** | `Navigate to /showcase` | Redirect | **`LEGACY`** | `/showcase` | Retain redirect. |
| **`/mobile-showcase`** | `Navigate to /showcase` | Redirect | **`LEGACY`** | `/showcase` | Retain redirect. |
| **`/pricing`** | `PricingPage` | Active | **`CANONICAL`** | `/pricing` | Keep; refactor content to strictly reflect Individual & RWA/MSME pricing (remove Enterprise card). |
| **`/faqs`** | `FaqPage` | Active | **`CANONICAL`** | `/faqs` | Keep as canonical help/FAQ repository. |
| **`/about-us`** | `AboutPage` | Active | **`CANONICAL`** | `/about-us` | Keep as canonical corporate mission page. |
| **`/login`** | `LoginPage` | Active | **`CANONICAL`** | `/login` | Authoritative single sign-in door for all personas. |
| **`/signup`** | `SignupPage` | Active | **`CANONICAL`** | `/signup` | Authoritative registration portal with `side` query parameter (`?side=buyer` or `?side=supplier`). |
| **`/reset-password`** | `ResetPasswordPage` | Active | **`CANONICAL`** | `/reset-password` | GoTrue password recovery flow. |
| **`/buyer`** | `Navigate to /signup?side=buyer` | Redirect | **`LEGACY`** | `/signup?side=buyer` | Retain redirect for legacy inbound campaign links. |
| **`/seller`** | `Navigate to /signup?side=supplier`| Redirect | **`LEGACY`** | `/signup?side=supplier` | Retain redirect. |
| **`/supplier`** | `Navigate to /signup?side=supplier`| Redirect | **`LEGACY`** | `/signup?side=supplier` | Retain redirect. |
| **`/supplier/register`** | `Navigate to /signup?side=supplier`| Redirect | **`LEGACY`** | `/signup?side=supplier` | Retain redirect. |
| **`/legal/:topic`** | `LegalPage` | Active | **`CANONICAL`** | `/legal/:topic` | Dynamic statutory terms, privacy policy, and procurement integrity rules. |
| **`/q/:token`** | `QuickQuotePage` | Active | **`CANONICAL`** | `/q/:token` | Authoritative unauthenticated supplier quote submission via magic link. |
| **`/supplier/award-onboarding/:token`** | `SupplierAwardOnboardingPage` | Active | **`CANONICAL`** | `/supplier/award-onboarding/:token` | Authoritative 2-stage supplier award onboarding gate (GST/Bank/KYC verification). |
| **`/supplier/award-onboarding`** | `SupplierAwardOnboardingPage` | Active | **`CANONICAL`** | `/supplier/award-onboarding` | Direct entry for authenticated winning suppliers. |
| **`/invite/:token`** | `InviteAcceptancePage` | Active | **`CANONICAL`** | `/invite/:token` | Tokenized RWA/MSME invitation acceptance gate. |
| **`/maintenance`** | `MaintenancePage` | Active | **`INTERNAL`** | `/maintenance` | System maintenance splash page shown during live upgrades. |
| **`/dashboard`** | `HomePage` | Active | **`CANONICAL`** | `/dashboard` | Authoritative unified role-aware buyer/supplier/admin home cockpit. |
| **`DashboardPage.tsx`** | `DashboardPage` | Orphaned | **`DEAD`** | `/dashboard` | Delete orphaned file `apps/web/src/pages/DashboardPage.tsx`. |
| **`SupplierDashboardPage.tsx`** | `SupplierDashboardPage` | Orphaned | **`DEAD`** | `/dashboard` | Delete orphaned file `apps/web/src/pages/SupplierDashboardPage.tsx`. |
| **`/create`** | `Navigate to /intake` | Redirect | **`LEGACY`** | `/intake` | Retain redirect to canonical intake. |
| **`/requirements/new`** | `RequirementIntakePage` | Active | **`DUPLICATE`** | `/intake` | Make `/requirements/new` redirect to `/intake`. |
| **`/intake`** | `RequirementIntakePage` | Active | **`CANONICAL`** | `/intake` | Authoritative multimodal intake screen (Voice, Text, Form). |
| **`/requirements/:requirementId`** | `RequirementDetailPage` | Active | **`CANONICAL`** | `/requirements/:requirementId` | Requirement summary and specification review. |
| **`/requirements/:requirementId/discover`** | `DiscoverSuppliersPage` | Active | **`CANONICAL`** | `/requirements/:requirementId/discover` | Supplier network matching, distance filtering, and invitation pool selection. |
| **`/requirements/:requirementId/rfq-review`** | `RfqReviewPublishPage` | Active | **`DUPLICATE`** | `/requirements/:requirementId/review-publish` | Consolidate into `/requirements/:requirementId/review-publish`. |
| **`/requirements/:requirementId/review-publish`** | `RfqReviewPublishPage` | Active | **`CANONICAL`** | `/requirements/:requirementId/review-publish` | Commercial weights, timeline, governance protocol configuration, and publication. |
| **`/rfq/:rfqId/publish`** | `RfqReviewPublishPage` | Active | **`DUPLICATE`** | `/requirements/:requirementId/review-publish` | Redirect to canonical review-publish. |
| **`/rfq/:rfqId/review`** | `RfqReviewPublishPage` | Active | **`DUPLICATE`** | `/requirements/:requirementId/review-publish` | Redirect to canonical review-publish. |
| **`/requirements/:requirementId/monitoring`** | `ActiveRfqMonitoringPage` | Active | **`CANONICAL`** | `/requirements/:requirementId/monitoring` | Realtime quotation countdown, pool participation tracker, and supplier pulse. |
| **`/requirements/:requirementId/live`** | `ActiveRfqMonitoringPage` | Active | **`DUPLICATE`** | `/requirements/:requirementId/monitoring` | Redirect to `/monitoring`. |
| **`/rfq/:rfqId/monitoring`** | `ActiveRfqMonitoringPage` | Active | **`DUPLICATE`** | `/requirements/:requirementId/monitoring` | Redirect to `/monitoring`. |
| **`/rfq/:rfqId/live`** | `ActiveRfqMonitoringPage` | Active | **`DUPLICATE`** | `/requirements/:requirementId/monitoring` | Redirect to `/monitoring`. |
| **`/requirements/:requirementId/market-intelligence`** | `MarketIntelligenceStepPage` | Active | **`CANONICAL`** | `/requirements/:requirementId/market-intelligence` | Price benchmark indices and BIS/CPWD quality specifications. |
| **`/rfq/:rfqId/market-intelligence`** | `MarketIntelligenceStepPage` | Active | **`DUPLICATE`** | `/requirements/:requirementId/market-intelligence` | Redirect to requirement-based market intelligence. |
| **`/rfq/:rfqId/evaluation`** | `EvaluationDecisionCockpitPage`| Active | **`CANONICAL`** | `/rfq/:rfqId/evaluation` | Single authoritative identity-protected decision room for buyers and committees. |
| **`/rfq/:rfqId/cockpit`** | `EvaluationDecisionCockpitPage`| Active | **`DUPLICATE`** | `/rfq/:rfqId/evaluation` | Redirect to `/evaluation`. |
| **`/rfq/:rfqId/decision`** | `EvaluationDecisionCockpitPage`| Active | **`DUPLICATE`** | `/rfq/:rfqId/evaluation` | Redirect to `/evaluation`. |
| **`/rfqs/:rfqId/evaluation`** | `EvaluationDecisionCockpitPage`| Active | **`DUPLICATE`** | `/rfq/:rfqId/evaluation` | Redirect to `/evaluation`. |
| **`/rfq/:rfqId/quotes`** | `EvaluationDecisionCockpitPage`| Active | **`DUPLICATE`** | `/rfq/:rfqId/evaluation` | Redirect to `/evaluation`. |
| **`/rfqs/:rfqId/quotes`** | `EvaluationDecisionCockpitPage`| Active | **`DUPLICATE`** | `/rfq/:rfqId/evaluation` | Redirect to `/evaluation`. |
| **`/rfq/:rfqId/identity-protected-comparison`**| `EvaluationDecisionCockpitPage`| Active | **`DUPLICATE`** | `/rfq/:rfqId/evaluation` | Redirect to `/evaluation`. |
| **`RfqIdentityProtectedComparisonPage.tsx`**| `RfqIdentityProtectedComparisonPage`| Legacy | **`DEAD`** | `/rfq/:rfqId/evaluation` | Delete superseded file `apps/web/src/features/rfq/pages/RfqIdentityProtectedComparisonPage.tsx`. |
| **`/rfq/:rfqId/clarification`** | `RfqClarificationPage` | Active | **`CANONICAL`** | `/rfq/:rfqId/clarification` | Anonymized broadcast addenda and Q&A workbench. |
| **`/rfq/:rfqId/committee`** | `CommitteeVotePage` | Active | **`CANONICAL`** | `/rfq/:rfqId/committee` | RWA democratic voting room and COI recusal. |
| **`/governance/evaluations/:rfqId/vote`** | `CommitteeVotePage` | Active | **`DUPLICATE`** | `/rfq/:rfqId/committee` | Redirect to `/rfq/:rfqId/committee`. |
| **`/governance/evaluations/:rfqId`** | `CommitteeVotePage` | Active | **`DUPLICATE`** | `/rfq/:rfqId/committee` | Redirect to `/rfq/:rfqId/committee`. |
| **`/rfq/:rfqId/award`** | `AwardPage` | Active | **`CANONICAL`** | `/rfq/:rfqId/award` | Award summary, decision justification, and award lock. |
| **`/rfq/:rfqId/reveal`** | `SupplierRevealPage` | Active | **`CANONICAL`** | `/rfq/:rfqId/reveal` | Mutual identity reveal and contact unmasking. |
| **`/supplier/rfq/:rfqId`** | `SupplierRfqPage` | Active | **`CANONICAL`** | `/supplier/rfq/:rfqId` | Supplier view of published RFQ specifications. |
| **`/supplier/rfqs/:rfqId`** | `SupplierRfqPage` | Active | **`DUPLICATE`** | `/supplier/rfq/:rfqId` | Redirect to singular `/supplier/rfq/:rfqId`. |
| **`/supplier/rfq/:rfqId/quote`** | `SupplierQuoteSubmitPage` | Active | **`CANONICAL`** | `/supplier/rfq/:rfqId/quote` | Authenticated supplier commercial quotation form. |
| **`/supplier/rfqs/:rfqId/quote`**| `SupplierQuoteSubmitPage` | Active | **`DUPLICATE`** | `/supplier/rfq/:rfqId/quote` | Redirect to `/supplier/rfq/:rfqId/quote`. |
| **`/supplier/capabilities`** | `SupplierCapabilitiesPage` | Active | **`CANONICAL`** | `/supplier/capabilities` | Supplier vertical categories, service radiuses, and capacity declarations. |
| **`/supplier/onboarding`** | `Navigate to /supplier/capabilities`| Redirect | **`LEGACY`** | `/supplier/capabilities` | Retain redirect. |
| **`/supplier/quotes`** | `SupplierQuotesPage` | Active | **`CANONICAL`** | `/supplier/quotes` | History of all submitted quotations for supplier. |
| **`/purchase-orders`** | `PurchaseOrdersPage (role=buyer)` | Active | **`CANONICAL`** | `/purchase-orders` | Buyer commercial ledger, active POs, and milestone trackers. |
| **`/purchase-orders/:poId`** | `PurchaseOrderDetailPage` | Active | **`CANONICAL`** | `/purchase-orders/:poId` | Buyer PO detail, milestone inspection checklists, and invoices. |
| **`/supplier/purchase-orders`**| `PurchaseOrdersPage (role=supplier)`| Active | **`CANONICAL`** | `/supplier/purchase-orders` | Supplier purchase order list and fulfillment dashboard. |
| **`/supplier/purchase-orders/:poId`**| `PurchaseOrderDetailPage` | Active | **`CANONICAL`** | `/supplier/purchase-orders/:poId` | Supplier PO detail, milestone progress submissions, and invoice generation. |
| **`/supplier/work-orders/:woId`**| `SupplierWorkOrderPage` | Active | **`CANONICAL`** | `/supplier/work-orders/:woId` | Work order milestone execution and dispatch proof uploads. |
| **`/orders-reports`** | `Navigate to /purchase-orders` | Redirect | **`LEGACY`** | `/purchase-orders` | Retain redirect. |
| **`/orders`** | `Navigate to /purchase-orders` | Redirect | **`LEGACY`** | `/purchase-orders` | Retain redirect. |
| **`/reports`** | `Navigate to /purchase-orders?view=reports`| Redirect | **`LEGACY`** | `/purchase-orders?view=reports` | Retain redirect. |
| **`/financial-controls`** | `FinancialControlDashboardPage` | Active | **`CANONICAL`** | `/financial-controls` | Double-entry ledger, TDS withholding, and bank reconciliation. |
| **`/reconciliation`** | `FinancialControlDashboardPage` | Active | **`DUPLICATE`** | `/financial-controls` | Redirect to `/financial-controls`. |
| **`/audit`** | `AuditLogPage` | Active | **`CANONICAL`** | `/audit` | Platform-wide audit history for buyer organization. |
| **`/rfq/:rfqId/audit`** | `AuditLogPage` | Active | **`INTENTIONAL VARIANT`**| `/rfq/:rfqId/audit` | RFQ-scoped audit timeline. |
| **`/performance`** | `SupplierPerformancePage` | Active | **`CANONICAL`** | `/performance` | Vendor master scorecards and performance tiers. |
| **`/notifications`** | `NotificationsPage` | Active | **`CANONICAL`** | `/notifications` | Omnichannel notification center. |
| **`/profile`** | `ProfilePage` | Active | **`CANONICAL`** | `/profile` | User profile, active persona, address book, and GST credentials. |
| **`/settings/profile`** | `Navigate to /profile` | Redirect | **`LEGACY`** | `/profile` | Retain redirect. |
| **`/org/members`** | `OrgMembersPage` | Active | **`CANONICAL`** | `/org/members` | Committee team management, spend delegation, and annual succession timeline. |
| **`/team`** | `Navigate to /org/members` | Redirect | **`LEGACY`** | `/org/members` | Retain redirect. |
| **`/governance/team`** | `Navigate to /org/members` | Redirect | **`LEGACY`** | `/org/members` | Retain redirect. |
| **`/demo`** | `DemoDashboardPage` | Active | **`INTERNAL`** | `/demo` | Synthetic demo scenarios (isolated from customer routes). |
| **`/admin`** | `AdminDashboardPage` | Active | **`INTERNAL`** | `/admin` | Authoritative Superadmin operations console. |
| **`/founder`** | `FounderDashboardPage` | Active | **`INTERNAL`** | `/founder` | Authoritative CEO/Founder executive observability cockpit. |
| **`/ceo`** | `Navigate to /founder` | Redirect | **`LEGACY`** | `/founder` | Retain redirect. |
| **`/ops`** | `Navigate to /admin` | Redirect | **`LEGACY`** | `/admin` | Retain redirect. |

---

## 3. Targeted Clean Architecture: 18 Canonical Public & Customer Routes

Following canonicalization, the customer-facing router is streamlined into 18 crisp, non-redundant route definitions:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    THE 18 CANONICAL CUSTOMER ROUTES (POST-RECONSTRUCTION)              │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [PUBLIC MARKETING & AUTH]
  1.  /                                 ──> LandingPage
  2.  /pricing                          ──> PricingPage (Individual + RWA/MSME)
  3.  /faqs                             ──> FaqPage
  4.  /about-us                         ──> AboutPage
  5.  /login                            ──> LoginPage
  6.  /signup                           ──> SignupPage (?side=buyer|supplier)
  7.  /q/:token                         ──> QuickQuotePage (Unauthenticated Supplier Magic Link)
  8.  /invite/:token                    ──> InviteAcceptancePage (RWA/MSME Team Join)

 [BUYER PROCUREMENT WORKSPACE]
  9.  /dashboard                        ──> HomePage (Role-Aware Customer Cockpit)
 10.  /intake                           ──> RequirementIntakePage (Tell OTP What You Need)
 11.  /requirements/:id/discover        ──> DiscoverSuppliersPage (Supplier Pool Matching)
 12.  /requirements/:id/review-publish  ──> RfqReviewPublishPage (Review & Publish RFQ)
 13.  /rfq/:id/evaluation               ──> EvaluationDecisionCockpitPage (Review Masked Quotes)
 14.  /rfq/:id/committee                ──> CommitteeVotePage (Vote / Decide with Quorum)
 15.  /purchase-orders                  ──> PurchaseOrdersPage (Track POs & Milestone Progress)
 16.  /purchase-orders/:id              ──> PurchaseOrderDetailPage (Inspection Checklist & Invoices)

 [ORGANIZATION & USER SETTINGS]
 17.  /org/members                      ──> OrgMembersPage (RWA Committee / MSME Delegation)
 18.  /profile                          ──> ProfilePage (Persona Switcher & Address Book)
```

---
*End of Route-Screen Canonicalization Matrix (F2)*
