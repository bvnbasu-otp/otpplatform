# Screen inventory

Routes declared in `apps/web/src/App.tsx`. A screen is listed because the route element exists. Visual QA in a browser was not done for this inventory. Status of the router: `IMPLEMENTED`.

## Public

| Path | Element |
| --- | --- |
| `/` | `LandingPage` |
| `/pricing` | `PricingPage` |
| `/faqs` | `FaqPage` |
| `/about-us` | `AboutPage` |
| `/showcase`, `/mobile`, `/mobile-showcase` | `MobileShowcasePage` |
| `/login` | `LoginPage` |
| `/signup` | `SignupPage` |
| `/reset-password` | `ResetPasswordPage` |
| `/legal/:topic` | `LegalPage` |
| `/q/:token` | `QuickQuotePage` (no session) |
| `/supplier/award-onboarding/:token` | `SupplierAwardOnboardingPage` |
| `/invite/:token` | `InviteAcceptancePage` |
| `/maintenance` | `MaintenancePage` |

Redirects: `/how-it-works` and `/howitworks` to `/faqs#workflow`. `/register` to `/signup`. `/buyer` to `/signup?side=buyer`. `/seller`, `/supplier`, and `/supplier/register` to `/signup?side=supplier`.

## Signed-in workspace

Wrapped by `RequireAuth` and `RequireRole`.

| Path | Element |
| --- | --- |
| `/dashboard` | `HomePage` |
| `/intake` | `RequirementIntakePage` |
| `/requirements/:requirementId` | `RequirementRoute` |
| `/requirements/:requirementId/discover` | `DiscoverRoute` |
| `/requirements/:requirementId/rfq-review` and `review-publish` | `RfqReviewRoute` |
| `/requirements/:requirementId/monitoring` and `live` | `ActiveRfqMonitoringRoute` |
| `/rfq/:rfqId/evaluation` (and cockpit, decision, quotes aliases) | `EvaluationDecisionCockpitPage` |
| `/rfq/:rfqId/clarification` | `ClarificationRoute` |
| `/rfq/:rfqId/committee` | `CommitteeVoteRoute` |
| `/rfq/:rfqId/award` | `AwardRoute` |
| `/rfq/:rfqId/reveal` | `RevealRoute` |
| `/rfq/:rfqId/track` | `RfqTrackRoute` |
| `/supplier/rfq/:rfqId/quote` | `SupplierQuoteSubmitRoute` |
| `/supplier/capabilities`, `/supplier/onboarding` | `SupplierCapabilitiesPage` |
| `/purchase-orders`, `/purchase-orders/:poId` | Buyer PO list and detail |
| `/supplier/purchase-orders`, `/supplier/purchase-orders/:poId` | Supplier PO |
| `/supplier/work-orders/:woId` | `SupplierWoRoute` |
| `/notifications` | `NotificationsPage` |
| `/profile` | `ProfilePage` |
| `/org/members` | `OrgMembersPage` |
| `/audit`, `/performance` | Audit and performance routes |
| `/financial-controls`, `/reconciliation` | `FinancialControlDashboardPage` (buyer or admin) |
| `/demo` | `DemoDashboardPage` |
| `/admin` | `AdminDashboardPage` (admin) |
| `/founder` | `FounderDashboardPage` (`FOUNDER`) |

`/create` and `/requirements/new` redirect to `/intake`. Many supplier dashboard aliases redirect to `/dashboard` or the PO list. The full alias list is the `<Route` block in `App.tsx` from the public routes through the admin redirects.

## Public website structure

Source: `apps/web/src/features/site/` and `App.tsx`. Not a redesign.

| Page | Route | Content source |
| --- | --- | --- |
| Landing | `/` | `LandingPage` plus `site-content.ts` |
| Pricing | `/pricing` | `PricingPage.tsx` (working tree differs from HEAD). Three buyer cards. |
| FAQs | `/faqs` | `FaqPage` and FAQ strings in `site-content.ts` |
| About | `/about-us` | `AboutPage.tsx` |
| Legal | `/legal/:topic` | `LegalPage` |
| Mobile showcase | `/showcase`, `/mobile`, `/mobile-showcase` | `MobileShowcasePage` |

Public journey words are Request → Compare → Decide → Purchase → Track (`PUBLIC_JOURNEY_STEPS` in `brand.ts`). Supplier channels in `SUPPLIER_CHANNELS`: OTP registry and direct suppliers are labeled available now; WhatsApp/SMS, ONDC, BNI, and associations are planned.

Pricing page copy COPY-01, COPY-02, and COPY-03 was corrected in source. The deployed page is NOT RE-VERIFIED. See [DOCUMENTATION_DISCOVERED_DEFECTS.md](../13-truth/DOCUMENTATION_DISCOVERED_DEFECTS.md).

## Not a separate app

`/mobile` is `MobileShowcasePage`, a page in the web app. It is not a native client. See [MOBILE_PRODUCT_CONTRACT.md](../14-mobile-contract/MOBILE_PRODUCT_CONTRACT.md).
