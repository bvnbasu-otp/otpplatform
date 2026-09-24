# OTP Code Asset Mapping & Technical Inventory (R2)
**Document Identifier:** `OTP-RECON-R2-CODE-ASSET-MAPPING`  
**Version:** 1.0 (Authoritative R2 Asset Mapping)  
**Status:** SUPREME PHYSICAL ASSET MAPPING SPECIFICATION  
**Working Root:** `G:/My Drive/otp`  
**Migration Ceiling:** `00197` (Universal Org Role Lifecycle, Succession & Audit)  
**Authoritative Hierarchy:** OTP Product Constitution v1.0 $\rightarrow$ R1 Target Architecture $\rightarrow$ R2 Asset Mapping  
**Operating Invariant:** *MODE: PLANNING & MAPPING ONLY. ZERO CODE/SCHEMA MUTATION DURING R2.*

---

## 1. Executive Summary & Mapping Framework

This document provides a comprehensive, physical mapping of every target capability in the **OTP Golden Reconstruction** to its concrete code assets across the monorepo:
1. **Presentation Layer:** React 19 TSX components, pages, hooks, context providers (`apps/web/src/`).
2. **Domain Layer:** Pure TypeScript business logic, state machines, tax calculators (`packages/domain/src/`).
3. **Application & Services Layer:** Business orchestration services, GIS adapters, discovery engines (`packages/services/src/`).
4. **Database & Infrastructure Layer:** PostgreSQL tables, RPCs, triggers, masked views, RLS policies (`supabase/migrations/`).
5. **Serverless Edge Layer:** Deno Edge Functions (`supabase/functions/`).
6. **Verification Layer:** Unit, integration, security, and regression test suites (`tests/`, `packages/*/src/**/*.test.ts`).

### Mapping Taxonomy Columns:
- **`Capability`**: Functional capability defined in Constitution v1.0 and R1 Specifications.
- **`Current Asset`**: Physical symbol, component, class, function, or database object name.
- **`Location`**: Exact relative file path in repository.
- **`Current State`**: Current architectural condition (`Active`, `Duplicate`, `Coupled`, `Hardened`, `Orphaned`).
- **`R1 Decision`**: Authoritative disposition from R1 (`KEEP CURRENT`, `RECONSTRUCT`, `REFACTOR`, `PRESERVE AS INFRASTRUCTURE`, `REMOVE`).
- **`R2 Action`**: Concrete implementation task to execute during reconstruction.
- **`Dependencies`**: Upstream/downstream physical file and object dependencies.
- **`Risk`**: Risk classification (`Low`, `Medium`, `High`, `Critical`).

---

## 2. Presentation Tier Asset Mapping (`apps/web/src/`)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION TIER CODE ASSET MAPPING                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Capability | Current Asset | Location | Current State | R1 Decision | R2 Action | Dependencies | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Global Routing & Aliases** | `App` | `apps/web/src/App.tsx` | 68 routes, bloated aliases | **`RECONSTRUCT`** | Consolidate to 18 Canonical Routes; replace 50+ aliases with `<Navigate replace />`; unmount `<DemoModeProvider>` & `<PilotProvider>` from root. | `AppLayout.tsx`, 18 Canonical Pages | High |
| **Mobile AppShell Container** | `AppLayout` | `apps/web/src/components/layout/AppLayout.tsx` | Desktop-heavy; missing bottom insets | **`RECONSTRUCT`** | Implement `max-w-md mx-auto` mobile smartphone container with `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`. | `MobileActionFooter.tsx`, Tailwind tokens | High |
| **Universal Mobile Footer** | `MobileActionFooter` | `apps/web/src/components/layout/MobileActionFooter.tsx` | Missing / ad-hoc across screens | **`REBUILD`** | Build unified mobile floating CTA footer with safe-area padding and sticky viewport containment; guarantee $\ge 44\text{px}$ touch targets. | `AppLayout.tsx`, `Button.tsx` | Medium |
| **Dual-Persona Navigation** | `WorkspaceHeaderMenu` | `apps/web/src/features/navigation/components/WorkspaceHeaderMenu.tsx` | Persona toggle present; admin links unhardened | **`REFACTOR`** | Standardize dual-persona switching (`BUYER` $\leftrightarrow$ `SUPPLIER`); gate `/admin` and `/founder` access behind server whitelist check. | `RoleProvider.tsx`, `switch_portal_side()` | Medium |
| **Marketing Pricing** | `PricingPage` | `apps/web/src/features/site/pages/PricingPage.tsx` | Contains Card 3 Enterprise (₹4,999) | **`REFACTOR`** | Purge Enterprise card; display canonical Individual (₹0), RWA (₹499/mo), and MSME (₹999/mo) plans. | `pricing-entitlement.ts` | Low |
| **Buyer Registration** | `BuyerRegisterForm` | `apps/web/src/features/portal/components/BuyerRegisterForm.tsx` | Includes `ENTERPRISE` dropdown option | **`REFACTOR`** | Remove `ENTERPRISE` option; restrict to `INDIVIDUAL`, `RWA`, `MSME`. | `signup.ts`, `buyer-persona.ts` | Low |
| **Role-Aware Home Cockpit** | `HomePage` | `apps/web/src/features/home/HomePage.tsx` | Canonical cockpit | **`KEEP CURRENT`** | Ensure dynamic routing based on active context (`INDIVIDUAL`, `RWA`, `MSME`, `SUPPLIER`). | `RoleProvider.tsx`, `BuyerActionCard.tsx` | Medium |
| **Orphaned Dashboard 1** | `DashboardPage` | `apps/web/src/pages/DashboardPage.tsx` | Duplicate legacy file | **`REMOVE`** | Delete orphaned file; replaced by canonical `HomePage.tsx`. | None | Low |
| **Orphaned Dashboard 2** | `SupplierDashboardPage`| `apps/web/src/pages/SupplierDashboardPage.tsx` | Duplicate legacy file | **`REMOVE`** | Delete orphaned file; replaced by canonical `HomePage.tsx`. | None | Low |
| **Action 1: Intake Form** | `UnifiedThreeTierIntake`| `apps/web/src/features/intake/components/UnifiedThreeTierIntake.tsx` | Competing address fallbacks | **`REFACTOR`** | Auto-inherit primary address from `public.buyer_addresses`; bind category dropdowns directly to Supabase taxonomy API. | `use-taxonomy.ts`, `buyer_addresses` | High |
| **Supplier Discovery** | `DiscoverSuppliersPage`| `apps/web/src/features/requirement/pages/DiscoverSuppliersPage.tsx` | Sourcing radar active | **`REFACTOR`** | Connect to unified `SupplierNetworkEngine`; display masked previews with distance and verified badges. | `supplier-network-engine.ts` | Medium |
| **RFQ Review & Publish** | `RfqReviewPublishPage` | `apps/web/src/features/requirement/pages/RfqReviewPublishPage.tsx` | Duplicate routes point here | **`REFACTOR`** | Single canonical publishing gate; captures frozen address and tax snapshots. | `rfqs`, `buyer_addresses` | Medium |
| **Action 2: Decision Room** | `EvaluationDecisionCockpit` | `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` | Hardcoded `getPilotByRfqId()` fallback; test buttons | **`REFACTOR`** | Purge `lib/pilots.ts` fallback; read RFQ data strictly from DB; relocate "Simulate Quotes" to Superadmin console. | `rfq_quotes_identity_protected`, `QuoteCard4Pillar.tsx` | Critical |
| **Duplicate Comparison** | `RfqIdentityProtectedComparisonPage` | `apps/web/src/features/rfq/pages/RfqIdentityProtectedComparisonPage.tsx` | Duplicate legacy page | **`REMOVE`** | Delete duplicate page file; superseded by `EvaluationDecisionCockpitPage.tsx`. | None | Low |
| **Action 3: Quorum Voting** | `CommitteeVotePage` | `apps/web/src/features/governance/pages/CommitteeVotePage.tsx` | Committee voting active | **`REFACTOR`** | Wire directly to `submit_committee_vote_atomic()` with mandatory COI declaration and live quorum tracker. | `PA-01`, `COIDeclarationModal.tsx` | High |
| **Action 3: Spend Approval** | `SpendApprovalModal` | `apps/web/src/features/award/components/SpendApprovalModal.tsx` | Enterprise-oriented UI | **`REFACTOR`** | Reconstruct for MSME spend delegation and spend caps; enforce anti-self-approval display. | `SpendApprovalGovernanceService` | Medium |
| **Award Lock Gate** | `AwardPage` | `apps/web/src/features/award/pages/AwardPage.tsx` | Award lock active | **`REFACTOR`** | Wire to `lock_and_reveal_award_atomic()`; handle 2-stage verification routing for unverified suppliers. | `PA-02`, `SupplierAwardOnboardingPage.tsx`| Critical |
| **Mutual Identity Reveal** | `SupplierRevealPage` | `apps/web/src/features/reveal/pages/SupplierRevealPage.tsx` | Identity unmasking | **`KEEP CURRENT`** | Renders mutual buyer/supplier credentials post-award with cryptographic Decision Receipt. | `DecisionReceiptCard.tsx`, `PA-02` | Medium |
| **Action 4: Orders Ledger** | `PurchaseOrdersPage` | `apps/web/src/features/fulfillment/pages/PurchaseOrdersPage.tsx` | Dual-role orders list | **`KEEP CURRENT`** | Serves both buyer and supplier modes via role prop. | `purchase-orders.ts`, `PurchaseOrderList.tsx` | Medium |
| **Action 4: PO Milestones** | `PurchaseOrderDetailPage` | `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx` | 5-point milestone checklist | **`REFACTOR`** | Read delivery/billing address from frozen JSONB snapshots; render progressive invoice generator. | `DeliveryInspectionPanel.tsx`, `PA-06` | High |
| **RWA Team & Succession** | `OrgMembersPage` | `apps/web/src/features/org/pages/OrgMembersPage.tsx` | Member list active | **`REFACTOR`** | Connect to Migration 00197 role succession timeline (`transfer_org_role_succession_atomic`) and delegation proxies. | `OrgRoleSuccessionTimeline.tsx`, `PA-03` | High |
| **Profile & Addresses** | `ProfilePage` | `apps/web/src/features/profile/pages/ProfilePage.tsx` | Profile and persona switch | **`REFACTOR`** | Standardize address book CRUD on `buyer_addresses`; display verification badges. | `AddressBookManager.tsx`, `buyer_addresses` | Medium |
| **Supplier Magic Quoting** | `QuickQuotePage` | `apps/web/src/features/quick-quote/pages/QuickQuotePage.tsx` | Magic link quoting | **`KEEP CURRENT`** | Unauthenticated quote submission via `/q/:token` with instant price/tax calculations. | `quick-quote`, `PA-09` | High |
| **Supplier KYC Onboarding** | `SupplierAwardOnboardingPage` | `apps/web/src/features/supplier/pages/SupplierAwardOnboardingPage.tsx` | Statutory onboarding | **`KEEP CURRENT`** | 2-stage onboarding gate validating GSTIN, PAN, and Bank before PO release. | `complete_supplier_award_onboarding_atomic`, `PA-02` | Critical |
| **Superadmin Operations** | `AdminDashboardPage` | `apps/web/src/features/admin/pages/AdminDashboardPage.tsx` | Admin control plane | **`REFACTOR`** | Gated by `private_security.admin_whitelist`; host "Simulate Quotes" and taxonomy manager. | `PA-08`, `AdminHealthDashboard.tsx` | High |
| **CEO / Founder Cockpit** | `FounderDashboardPage` | `apps/web/src/features/founder/pages/FounderDashboardPage.tsx` | Executive observability | **`KEEP CURRENT`** | Read-only executive telemetry; GMV velocity, adoption metrics; zero PO signing authority. | `FounderMetricCard.tsx`, `FunnelVelocityChart.tsx` | Medium |
| **Demo Sandbox Container** | `DemoDashboardPage` | `apps/web/src/features/demo/pages/DemoDashboardPage.tsx` | Synthetic demo sandbox | **`REFACTOR`** | Isolate demo providers strictly under `/demo`; zero presence in customer routes. | `DemoModeProvider.tsx`, `demo-config.ts` | Medium |

---

## 3. Domain Tier Asset Mapping (`packages/domain/src/`)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          DOMAIN TIER CODE ASSET MAPPING                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Capability | Current Asset | Location | Current State | R1 Decision | R2 Action | Dependencies | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **13-Stage Auth Engine** | `resolveBuyerPersona` | `packages/domain/src/types/buyer-persona.ts` | Persona models | **`KEEP CURRENT`** | Evaluates Individual, RWA, and MSME persona rules and member claim states. | None | Medium |
| **Identity Leak Guard** | `assertIdentityProtectedPayloadSafe` | `packages/domain/src/errors/blind-violation.ts` | In-memory regex guard | **`KEEP` (PA-05)** | Scans JSON payloads for unmasked phone numbers, emails, and GSTINs; throws error on leak. | None | Critical |
| **Bilateral GST Engine** | `calculateGstTaxBreakdown` | `packages/domain/src/tax/gst-calculator.ts` | Statutory tax engine | **`KEEP` (PA-06)** | Computes intra-state (CGST+SGST) vs inter-state (IGST) tax breakdown based on state codes. | `gstin-validator.ts` | Critical |
| **TDS Withholding Engine** | `calculateTds` | `packages/domain/src/tax/tds-calculator.ts` | Section 194C/194Q engine | **`KEEP` (PA-06)** | Computes statutory TDS deductions for 1961/2025 tax law versions; validates PAN status. | `gstin-validator.ts` | Critical |
| **Double-Entry Models** | `calculateTrialBalance` | `packages/domain/src/accounting/ledger-balance.ts` | GAAP ledger models | **`KEEP` (PA-07)** | Verifies balanced debits and credits ($\sum \text{Debits} = \sum \text{Credits}$). | `chart-of-accounts.ts` | Critical |
| **Tally ERP Exporter** | `exportToTallyJournalVoucher` | `packages/domain/src/accounting/tally-journal-exporter.ts` | XML export formatter | **`KEEP CURRENT`** | Generates compliant Tally XML journal vouchers for accounting export. | `ledger-balance.ts` | Low |
| **7-Stage State Machine** | `LINEAR_PROCUREMENT_STEPS` | `packages/domain/src/enums/linear-pipeline.ts` | 15-step linear pipeline | **`RECONSTRUCT`** | Group 15 steps into the 7 Canonical Customer States (`DRAFT`, `QUOTING`, `EVALUATING`, `AWARDED`, `PO_ISSUED`, `INVOICED`, `SETTLED`). | `procurement-journey.ts` | High |
| **Subscription Constants** | `SUBSCRIPTION_TIERS` | `packages/domain/src/types/pricing-entitlement.ts` | Contains `ENTERPRISE` tier | **`REFACTOR`** | Remove `ENTERPRISE` plan constant; assert canonical 3 plans (Individual ₹0, RWA ₹499, MSME ₹999). | None | Low |
| **Supplier KYC Validator** | `validateSupplierOnboardingProfile` | `packages/domain/src/types/supplier-award-onboarding.ts` | KYC / GSTIN validator | **`KEEP CURRENT`** | Validates PAN format, GSTIN checksum, and bank account details for 2-stage onboarding. | `gstin-validator.ts` | High |
| **4-Pillar Scorecard** | `computeScorecardDimensions` | `packages/domain/src/types/vendor-intelligence.ts` | VMI scoring models | **`KEEP CURRENT`** | Computes normalized Quality, Delivery, SLA, and Commercial performance dimensions. | None | Medium |
| **Market Freshness Ladder** | `calculateMarketFreshness` | `packages/domain/src/types/market-intelligence.ts` | 4-tier provenance ladder | **`KEEP CURRENT`** | Assigns `LIVE_API`, `DATABASE_CACHE`, `STATIC_REFERENCE`, or `UNAVAILABLE` status. | None | Medium |
| **8-State Notifications** | `renderNotificationTemplate` | `packages/domain/src/types/procurement-communications.ts` | 8-state communication models | **`KEEP CURRENT`** | Enforces truthful delivery state transitions; HMAC webhook validation. | None | Medium |
| **Dispute SLA Engine** | `calculateDisputeSlaDeadline` | `packages/domain/src/types/dispute-escalation.ts` | SLA deadline calculator | **`KEEP CURRENT`** | Computes resolution SLA hours based on dispute severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`). | None | Low |

---

## 4. Application & Services Tier Asset Mapping (`packages/services/src/`)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        SERVICES TIER CODE ASSET MAPPING                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Capability | Current Asset | Location | Current State | R1 Decision | R2 Action | Dependencies | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Spend Approval Engine** | `EnterpriseApprovalMatrixService` | `packages/services/src/services/enterprise-approval-matrix-service.ts` | Corporate name; robust delegation logic | **`REFACTOR`** | Rename to `SpendApprovalGovernanceService`; bind to MSME spend caps and RWA capex thresholds; preserve anti-self-approval. | `organization_delegations`, `c84-test` | High |
| **Universal Role Lifecycle** | `OrgRoleLifecycleService` | `packages/services/src/services/org-role-lifecycle-service.ts` | Universal 365-day role manager | **`KEEP` (PA-03)** | Orchestrates annual officer succession and audit logging via Migration 00197 RPCs. | `org_role_assignments`, `org_governance_action_audits` | Critical |
| **Sourcing Network Engine** | `SupplierNetworkEngine` | `packages/services/src/discovery/supplier-network-engine.ts` | Sourcing aggregator | **`REFACTOR`** | Centralize matching algorithm across VMI, Direct, ONDC, and BNI; enforce deduplication. | `composite-discovery-service.ts` | High |
| **Double-Entry Ledger Svc** | `AccountingService` | `packages/services/src/services/accounting-service.ts` | Double-entry poster | **`KEEP` (PA-07)** | Posts balanced journal entries in `financial_ledger_entries` for GMV, 0.50% fee, and 0.10% reward. | `financial_ledger_entries` | Critical |
| **Truthful Notifications** | `OmnichannelNotificationService` | `packages/services/src/services/omnichannel-notification-service.ts` | Multi-channel dispatcher | **`REFACTOR`** | Enforce 8-state lifecycle; update status strictly upon verifiable provider webhook receipt. | `notification-queue-worker.ts`, `WAHA` | Medium |
| **Market Intelligence Svc** | `MarketIntelligenceService` | `packages/services/src/services/market-intelligence-service.ts` | Multi-provider benchmark svc | **`KEEP CURRENT`** | Orchestrates 4-tier benchmark lookups with SHA-256 integrity hashing. | `market_intelligence_cache` | Medium |
| **Buyer Address Book Svc** | `BuyerAddressService` | `packages/services/src/services/buyer-address-service.ts` | Address CRUD service | **`KEEP CURRENT`** | Manages `buyer_addresses` table, primary flags, and snapshot generation. | `buyer_addresses` | Medium |
| **Supplier KYC Onboarding** | `SupplierAwardOnboardingService` | `packages/services/src/services/supplier-award-onboarding-service.ts` | Onboarding orchestrator | **`KEEP CURRENT`** | Executes 2-stage verification workflow and triggers mutual reveal upon completion. | `complete_supplier_award_onboarding_atomic` | Critical |
| **Inspection & Checklists** | `MilestoneInspectionService` | `packages/services/src/services/milestone-inspection-service.ts` | 5-point inspection svc | **`KEEP CURRENT`** | Validates site inspection photos and executes milestone completion transitions. | `purchase_orders` | Medium |
| **Dispute Resolution Svc** | `DisputeResolutionService` | `packages/services/src/services/dispute-resolution-service.ts` | Dispute workflow engine | **`KEEP CURRENT`** | Manages non-custodial milestone holdbacks and arbitration SLA tracking. | `disputes` | Medium |
| **Location Intelligence** | `ProviderNeutralLocationIntelligence` | `packages/services/src/gis/provider-neutral-location-intelligence.ts` | Haversine GIS adapter | **`KEEP CURRENT`** | Calculates distance radiuses ($\le 25\text{km}$) without hard third-party lock-in. | None | Low |
| **Service Factory** | `createOtpServices` | `packages/services/src/factory/create-otp-services.ts` | DI service container | **`REFACTOR`** | Register `SpendApprovalGovernanceService` and inject domain memory guards into evaluation factories. | All services | High |

---

## 5. Database & Security Tier Asset Mapping (`supabase/migrations/`)

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        DATABASE & SECURITY TIER ASSET MAPPING                          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Database Object / Capability | Migration File | Object Type | Security Guarantee & Role | R1 / R2 Invariant |
| :--- | :--- | :--- | :--- | :--- |
| **`public.committee_votes` & Quorum** | `00024_weighted_voting.sql`, `00049_committee_access.sql` | Table & RPC `submit_committee_vote_atomic` | Democratic voting, mandatory COI recusal, quorum verification ($\ge 2$). | **`PA-01: DO NOT MUTATE`** |
| **`lock_and_reveal_award_atomic`** | `00160_fix_lock_and_reveal_award_atomic...sql`, `00196_...sql` | PostgreSQL Security DEFINER RPC | Atomic transition to `AWARDED`, quote locking, 2-stage KYC verification gate. | **`PA-02: DO NOT MUTATE`** |
| **`org_role_assignments` & Audits** | `00197_universal_org_role_lifecycle...sql` | Tables & RPC `transfer_org_role_succession_atomic` | Universal 365-day role expiry, officer succession, append-only trigger. | **`PA-03: DO NOT MUTATE`** |
| **`rfq_quotes_identity_protected`** | `00005_blind_views.sql`, `00117_canonical_identity_protected...sql` | PostgreSQL Masked View | Redacts supplier names, contacts, and GSTINs prior to post-award reveal. | **`PA-04: DO NOT MUTATE`** |
| **`buyer_addresses` Normalized Table** | `00196_buyer_identity_address_rwa_msme...sql` | Table & RPC `upsert_buyer_address_atomic` | Supports Individual (`profile_id`) and Org (`organization_id`), primary flags. | **`PRESERVE SCHEMA`** |
| **`organization_delegations`** | `00190_buyer_org_governance_and_delegation.sql` | Table & RPC `create_delegation_proxy_atomic` | MSME spend delegation proxies, spend cap amounts, anti-self-approval rule. | **`PA-09: DO NOT MUTATE`** |
| **`organization_invitations`** | `00190_buyer_org_governance_and_delegation.sql` | Table & RPC `create_organization_invitation_atomic` | Tokenized SHA-256 member invitations with role bindings. | **`PA-09: DO NOT MUTATE`** |
| **`financial_ledger_entries`** | `00176_phase5d_double_entry_ledger.sql` | Table & Accounting Functions | GAAP/IndAS double-entry journal postings ($\sum \text{Debits} = \sum \text{Credits}$). | **`PA-07: DO NOT MUTATE`** |
| **`private_security.admin_whitelist`**| `00152_immutable_platform_admin_role.sql` | Schema, Table & Trigger `trg_protect_platform_admin` | Restricts Superadmin access strictly to authorized email (`bvnbasu@gmail.com`). | **`PA-08: DO NOT MUTATE`** |
| **`taxonomy_categories` & Subcategories** | `00013_requirement_taxonomy.sql` | Normalized Reference Tables | 3-level canonical procurement taxonomy reference single source of truth. | **`PRESERVE SCHEMA`** |
| **`market_intelligence_cache`** | `00008_procurement_os.sql`, `00191_...sql` | Caching Table & Hash Verification | Stores cached CPWD/BIS benchmarks with validity timestamps. | **`PRESERVE SCHEMA`** |

---

## 6. Serverless Edge Functions Mapping (`supabase/functions/`)

| Function Name | Location | Trigger & Invocation | Security & Authorization | R2 Reconstruction Action |
| :--- | :--- | :--- | :--- | :--- |
| **`payment-webhook`** | `supabase/functions/payment-webhook/index.ts` | HTTPS POST from Razorpay | Cryptographic HMAC-SHA256 signature verification | Preserve idempotent double-entry ledger posting trigger. |
| **`messaging-inbound`** | `supabase/functions/messaging-inbound/index.ts` | HTTPS Webhook from WAHA / Twilio | Webhook token validation | Parse asynchronous delivery receipts to update 8-state notification status. |
| **`messaging-outbound`** | `supabase/functions/messaging-outbound/index.ts` | pg_net webhook / worker | Service-role auth | Dispatch invitations and receipts via WAHA (WhatsApp) or SMTP. |
| **`rfq-quotes-identity-protected`** | `supabase/functions/rfq-quotes-identity-protected/index.ts` | Client GET during evaluation | Bearer JWT | Returns masked supplier quotes; enforces domain memory guard. |
| **`rfq-quotes-revealed`** | `supabase/functions/rfq-quotes-revealed/index.ts` | Client GET post-award reveal | Bearer JWT | Enforces server-side verification gate before unmasking supplier credentials. |
| **`process-attachment`** | `supabase/functions/process-attachment/index.ts` | Storage `OBJECT_CREATED` | Storage service role | Sanitizes EXIF/metadata and scrubs malicious scripts from uploaded drawings. |

---

## 7. Summary of Mapping Metrics

- **Total Mapped Presentation Components:** 28 canonical UI components and pages.
- **Total Mapped Domain Engines:** 13 pure TypeScript domain models and calculators.
- **Total Mapped Application Services:** 12 business orchestration services.
- **Total Database Objects / Migrations:** 197 migrations, 11 critical tables/views, 8 hardened RPCs.
- **Total Protected Backend Assets:** 10 assets (`PA-01` through `PA-10`) with zero-mutation locks.

---
*End of OTP Code Asset Mapping & Technical Inventory (R2)*
