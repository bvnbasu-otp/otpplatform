# OTP Repository Forensic Inventory (F1)
**Document Identifier:** `OTP-RECON-F1-INVENTORY`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE FORENSIC INVENTORY  
**Working Root:** `G:/My Drive/otp`  
**Migration Count:** 197 Migrations (`00001` through `00197`)  
**Monorepo Architecture:** PNPM Workspaces (`@otp/domain`, `@otp/database`, `@otp/services`, `apps/web`, `packages/config`)

---

## 1. Monorepo Package Topology & Dependencies

```text
                               ┌───────────────────┐
                               │  packages/config  │
                               └─────────┬─────────┘
                                         │ (devDependencies)
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
       ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
       │ @otp/domain      │    │ @otp/database    │    │ @otp/web         │
       │ (Domain Models & │◄───┤ (Repositories &  │    │ (apps/web UI)    │
       │ Pure Logic)      │    │ Mappers)         │    │                  │
       └────────┬─────────┘    └────────┬─────────┘    └────────┬─────────┘
                │                       │                       │
                └───────────┬───────────┘                       │
                            ▼                                   │
                  ┌──────────────────┐                          │
                  │ @otp/services    │                          │
                  │ (Business Logic  │                          │
                  │ Orchestration)   │                          │
                  └─────────┬────────┘                          │
                            │                                   │
                            └───────────────────────────────────┘
```

### 1.1 Package Summary Table

| Package Name | Physical Path | Primary Language / Runtime | Core Purpose | Direct Dependencies |
| :--- | :--- | :--- | :--- | :--- |
| **`@otp/domain`** | `packages/domain` | TypeScript 5.6.3 (Pure) | State machines, entities, GST/TDS calculators, ERP/Tally exporters, Indian standards catalog, VMI scoring | None (Zero runtime dependencies) |
| **`@otp/database`** | `packages/database` | TypeScript 5.6.3 + Supabase | Typed PostgreSQL client, repository implementations, entity mappers, RLS context helpers | `@otp/domain`, `@supabase/supabase-js` |
| **`@otp/services`** | `packages/services` | TypeScript 5.6.3 + Node 22 | Service orchestrations, ONDC Beckn adapters, notification worker, double-entry ledger postings, role lifecycle | `@otp/domain`, `@otp/database` |
| **`apps/web` (`@otp/web`)** | `apps/web` | React 19.0.0 + Vite 6.0.6 + Tailwind 3.4 | Customer-facing PWA, evaluation decision cockpit, committee voting room, order management, PWA shell | `@otp/domain`, `@supabase/supabase-js`, `react-router-dom` |
| **`packages/config`** | `packages/config` | JSON / Config | Shared tsconfig and lint rules | None |
| **`scripts/whatsapp-bridge`**| `scripts/whatsapp-bridge` | Node 22 / Express | Microservice bridge interfacing with WAHA container | `express`, `dotenv` |

---

## 2. Directory Layout & Source Code Statistics

### 2.1 Workspace Source Distribution
- **Total Source Files:** 1,256+ tracked files across repository.
- **Frontend TSX Components & Pages (`apps/web/src`):** 258 files.
- **Domain & Service Modules (`packages/`):** 270 files.
- **Database Migrations (`supabase/migrations`):** 197 files.
- **Supabase Edge Functions (`supabase/functions`):** 32 files (10 entrypoints/handlers).
- **Automation & Operational Scripts (`scripts/`):** 73 files.
- **Automated Test Suites (`tests/` + in-package tests):** 86 dedicated test files (>1,514 automated assertions).

### 2.2 Feature Directory Inventory (`apps/web/src/features/`)

| Feature Directory | Components / Sub-modules | Purpose & Functionality |
| :--- | :--- | :--- |
| `admin/` | `AdminDashboardPage`, `AdminUsersActivityPanel`, `AdminSupportTicketsPanel`, `AdminBackupRestorePanel`, `AdminTestSuiteRunner`, `AdminBuyerTroubleshooter` | Platform Superadmin ops console, SQL query terminal, system diagnostics, and tenant troubleshooter |
| `announcements/` | `AnnouncementBanner`, `useAnnouncements` | System-wide maintenance, upgrade notices, and operational announcements |
| `attachments/` | `RequirementAttachmentsPanel`, `QuoteAttachmentsPanel`, `SecureAttachmentViewer` | SHA-256 validated, metadata-scrubbed document/photo upload and preview |
| `audit/` | `AuditLogPage`, `AuditFilterBar`, `AuditTimelineCard` | Append-only audit viewer for RFQ and organizational lifecycle events |
| `auth/` | `AuthProvider`, `RequireAuth`, `ProtectedRoute`, `SignInForm`, `user-role` | Supabase GoTrue authentication wrapper, session persistence, and portal role guards |
| `award/` | `AwardPage`, `AwardConfirmationModal`, `api/awards` | RFQ winner confirmation, award locking, and contract preparation |
| `clarification/`| `RfqClarificationPage`, `ClarificationWorkbench`, `BroadcastAddendumComposer` | Anonymized Q&A channel between buyer and quoting suppliers with anti-contact redaction |
| `demo/` | `DemoDashboardPage`, `DemoModeProvider`, `DemoWalkthroughPanel`, `demo-config` | Synthetic demo scenarios, step-by-step interactive walkthroughs, and instant state resets |
| `evaluation/` | `EvaluationDecisionCockpitPage`, `EvaluationDecisionCockpit`, `CriterionBreakdownTable`, `VendorIntelligenceScorecardWidget` | Identity-protected quote evaluation matrix, normalized weights, and L1/TAT/Warranty indicators |
| `founder/` | `FounderDashboardPage`, `FounderMetricCard`, `FunnelVelocityChart` | Executive read-only cockpit tracking platform GMV, user adoption, and procurement velocity |
| `fulfillment/` | `PurchaseOrdersPage`, `PurchaseOrderDetailPage`, `SupplierWorkOrderPage`, `DeliveryInspectionPanel`, `FinancialControlDashboardPage` | Post-award PO execution, 5-point milestone inspection checklists, progressive invoices, and disputes |
| `governance/` | `CommitteeVotePage`, `CommitteeVoteModal`, `WeightedTallyTable`, `COIDeclarationModal` | RWA democratic voting room, conflict of interest declarations, and quorum validation |
| `home/` | `HomePage`, `BuyerActionCard`, `HomeContextBar`, `RoleAwareHomeDispatch` | Central role-aware cockpit routing users to actionable procurement tasks |
| `intake/` | `RequirementIntakePage`, `UnifiedThreeTierIntake`, `VoiceRequirementDictation`, `AttributeFields` | Multimodal procurement intake (Voice note, Text prompt, Photo, Structured form) |
| `maintenance/` | `MaintenanceBanner`, `MaintenanceGlobalGuard`, `RestoredSessionBanner` | Zero-downtime maintenance shields, session lock guards, and maintenance mode alerts |
| `navigation/` | `WorkspaceHeaderMenu`, `AdminQuickActionsSheet`, `MobileBottomNav` | Single authoritative header, mobile bottom navigation bar, and context drawer |
| `notifications/`| `NotificationsPage`, `NotificationBell`, `NotificationItemCard` | Realtime notification inbox with read/unread tracking and deep-link routing |
| `org/` | `OrgMembersPage`, `InviteAcceptancePage`, `OrgRoleSuccessionTimeline`, `RoleRenewalModal`, `RoleTransferModal` | Universal RWA & MSME member management, tokenized invitations, and annual role succession |
| `performance/` | `SupplierPerformancePage`, `PerformanceSummary`, `ScorecardDimensionCard` | VMI 4-pillar vendor performance scorecards (Quality, Delivery, SLA, Commercial) |
| `pilots/` | `PilotProvider`, `PilotContextBadge`, `PilotVerticalSelector` | Horizontal pilot vertical selector (Bengaluru RWA, Coimbatore MSME, Tiruppur Yarn, Malleswaram Electrical) |
| `portal/` | `LoginPage`, `SignupPage`, `ResetPasswordPage`, `LegalPage`, `BuyerRegisterForm`, `SupplierRegisterForm` | Dual-door public authentication, registration forms with persona selection, and statutory legal pages |
| `procurement-os/`| `MarketIntelligenceStepPage`, `MarketIntelligencePanel`, `ProcurementOsStack` | Realtime market price intelligence benchmarks, BIS standards lookup, and rate cards |
| `profile/` | `ProfilePage`, `AddressBookManager`, `PersonaCard`, `GstinVerificationBadge` | User profile management, multi-context switcher, and primary/secondary address book |
| `quick-quote/` | `QuickQuotePage`, `QuickQuoteForm`, `TokenExpiryBanner` | Zero-login supplier quote submission interface accessed via single-use magic links |
| `requirement/` | `RequirementDetailPage`, `DiscoverSuppliersPage`, `RfqReviewPublishPage`, `SupplierCard` | Requirement review, supplier pool matching, custom evaluation weighting, and RFQ publication |
| `reveal/` | `SupplierRevealPage`, `DecisionReceiptCard`, `MutualContactCard` | Post-award mutual reveal gate unveiling supplier and buyer contact credentials |
| `rfq/` | `ActiveRfqMonitoringPage`, `QuoteCard4Pillar`, `BlindQuoteComparisonTable` | Live RFQ tracking, quotation countdown timer, and masked quote comparison cards |
| `roles/` | `RoleProvider`, `RequireRole`, `AccountMenu`, `useRoleContext` | Multi-context resolution engine dynamically computing permissions and active org context |
| `site/` | `LandingPage`, `AboutPage`, `PricingPage`, `FaqPage`, `MobileShowcasePage` | Marketing pages, pricing tiers (Individual, RWA/MSME), and mobile interactive showcase |
| `subscription/` | `SubscriptionPaymentModal`, `SubscriptionBadge`, `useSubscription` | Prepaid subscription lifecycle, free RFQ credits, and payment gateway webhooks |
| `supplier/` | `SupplierRfqPage`, `SupplierQuoteSubmitPage`, `SupplierCapabilitiesPage`, `SupplierQuotesPage`, `SupplierAwardOnboardingPage` | Dedicated Supplier Portal for RFQ discovery, quotation submission, capabilities, and award onboarding |
| `theme/` | `ThemeProvider`, `ThemeToggle`, `ThemePersonaSync`, `ThemeBottomSheet` | High-contrast WCAG 2.1 AA compliant theme provider with persona-tailored color accents |

---

## 3. Complete Database Migration Inventory (00001–00197)

The OTP database schema is defined through **197 contiguous, forward-migrating PostgreSQL scripts** (`supabase/migrations/00001_enums.sql` through `00197_universal_org_role_lifecycle_succession_and_audit.sql`).

```text
┌───────────────────────────────────────────────────────────────────────────────────────┐
│                       197 MIGRATIONS GROUPED BY FUNCTIONAL PHASE                      │
└───────────────────────────────────────────────────────────────────────────────────────┘
 Phase 1: Core Foundation & Security (00001–00020)
 Phase 2: Identity Protection & Demo Engine (00021–00040)
 Phase 3: Sourcing, Quorum & Work Orders (00041–00060)
 Phase 4: Supplier Verification & Superadmin Ops (00061–00085)
 Phase 5: Production Go-Live & Diagnostics (00086–00115)
 Phase 6: Canonical Redaction & Hardened RLS (00116–00140)
 Phase 7: Subscriptions, Rate Limits & Webhooks (00141–00165)
 Phase 8: Financial Ledgers & Progressive Invoices (00166–00176)
 Phase 9: Hardening, Edge Adapters & Vendor Intelligence (00177–00189)
 Phase 10: Universal Governance, Persona Addresses & Succession (00190–00197)
```

### 3.1 Migration Phase Breakdown Table

| Migration Range | Key Milestones & Script Names | Architectural Functionality Added |
| :--- | :--- | :--- |
| **`00001–00010`** | `00001_enums.sql`<br>`00002_core_tables.sql`<br>`00004_rls_policies.sql`<br>`00005_blind_views.sql`<br>`00008_procurement_os.sql` | Base PostgreSQL ENUMs, core tables (`profiles`, `organizations`, `requirements`, `rfqs`, `rfq_quotes`, `purchase_orders`), tenant RLS policies, masked evaluation views. |
| **`00011–00030`** | `00013_requirement_taxonomy.sql`<br>`00022_identity_protection.sql`<br>`00023_award_lock_reveal.sql`<br>`00024_weighted_voting.sql`<br>`00026_demo_reset.sql` | Canonical Indian procurement taxonomy, supplier identity protection views, atomic award locking, RWA weighted committee voting, and synthetic demo reset RPCs. |
| **`00031–00050`** | `00036_messaging_channel_schema.sql`<br>`00037_messaging_gateway.sql`<br>`00039_role_based_access.sql`<br>`00042_clarification_redaction.sql`<br>`00049_committee_access.sql` | Inbound/outbound messaging channels (WhatsApp/Email), RBAC authorization matrix, clarification message redaction, and RWA committee evaluation room access controls. |
| **`00051–00075`** | `00051_rfq_voting_summary.sql`<br>`00052_lock_award_auto_evaluation.sql`<br>`00054_work_orders_rls_and_init_rpc.sql`<br>`00065_supplier_gst_verification.sql`<br>`00070_super_admin_ops_console.sql` | Automatic evaluation scoring, work order initialization RPCs, supplier GSTIN verification pipelines, and superadmin operations console schema. |
| **`00076–00100`** | `00079_fix_discover_and_invite_uniqueness.sql`<br>`00080_fix_invoice_notification_triggers.sql`<br>`00096_admin_test_suite_runner_rpc.sql`<br>`00097_fix_buyer_seller_diagnostics_rpcs.sql` | Supplier pool deduplication, invoice trigger hardening, administrative test runner RPCs, and buyer/seller diagnostic troubleshooters. |
| **`00101–00125`** | `00108_production_go_live_enhancements.sql`<br>`00110_supplier_network_stub_toggle.sql`<br>`00117_canonical_identity_protected_views.sql`<br>`00125_production_preservation_and_staging_gate.sql` | Production go-live hardening, supplier network stub controls, canonical identity-protected views, and production data preservation gates. |
| **`00126–00150`** | `00127_invite_org_member_rpc.sql`<br>`00135_clean_ascii_notifications.sql`<br>`00139_admin_operations_suite.sql`<br>`00144_prepaid_subscription_model.sql`<br>`00148_strict_linear_15_step_pipeline.sql` | Tokenized member invitation RPC, ASCII notification templates, admin troubleshooting suite, prepaid subscription model, and 15-step linear pipeline engine. |
| **`00151–00165`** | `00151_atomic_award_and_po_transaction.sql`<br>`00156_buyer_identity_reveal_on_po_issuance.sql`<br>`00160_fix_lock_and_reveal_award_atomic.sql`<br>`00162_user_online_presence.sql` | Atomic award-to-PO transactions, bilateral GST reveal on PO issuance, hardened `lock_and_reveal_award_atomic` RPC, and user presence heartbeats. |
| **`00166–00176`** | `00167_phase5a_progressive_invoicing.sql`<br>`00168_phase5b_statutory_gst.sql`<br>`00173_phase5c4_tds_change_orders.sql`<br>`00174_phase5c5_settlement_execution.sql`<br>`00176_phase5d_double_entry_ledger.sql` | Progressive milestone invoicing, bilateral GST splitting, TDS withholding under 194C/194Q, change order tracking, and GAAP double-entry financial ledger. |
| **`00177–00189`** | `00177_phase6_group1_database_hardening.sql`<br>`00181_phase6_group4_wallet_and_rewards.sql`<br>`00183_phase6_group6_vendor_intelligence.sql`<br>`00184_clean_state_reset_and_demo_isolation.sql`<br>`00187_dual_persona_portal_switching.sql` | Database security hardening, organization wallets (0.10% buyer reward), 4-pillar VMI scorecards, demo data isolation, and dual-persona switching RPCs. |
| **`00190–00197`** | `00190_buyer_org_governance_and_delegation.sql`<br>`00191_dynamic_approval_routing.sql`<br>`00192_approval_execution_orchestration.sql`<br>`00193_fix_delivery_inspection_po_completion.sql`<br>`00195_fix_delivery_inspection_buyer_role.sql`<br>`00196_buyer_identity_address_rwa_msme.sql`<br>`00197_universal_org_role_lifecycle.sql` | Cryptographic tokenized invitations (`organization_invitations`), spend delegation proxies (`organization_delegations`), buyer address book with frozen snapshots (`buyer_addresses`), 2-stage supplier award onboarding gate (`complete_supplier_award_onboarding_atomic`), and universal annual role succession with immutable audit ledger (`org_role_assignments`, `org_governance_action_audits`). |

---

## 4. Supabase Edge Functions Inventory

Located in `supabase/functions/` (Deno / TypeScript runtime):

| Function Name | Entrypoint Path | Trigger & Invocation | Security & Authorization |
| :--- | :--- | :--- | :--- |
| **`payment-webhook`** | `payment-webhook/index.ts` | HTTPS POST from Razorpay / Stripe gateways | Cryptographic HMAC-SHA256 signature verification; idempotent ledger posting |
| **`messaging-outbound`** | `messaging-outbound/index.ts` | PostgreSQL pg_net webhook or internal worker | Service-role auth; dispatches via WAHA (WhatsApp) or Gmail SMTP |
| **`messaging-inbound`** | `messaging-inbound/index.ts` | HTTPS Webhook from WAHA / Twilio | Webhook token validation; parses quote replies and clarification responses |
| **`rfq-quotes-identity-protected`** | `rfq-quotes-identity-protected/index.ts` | Client GET request during evaluation | Bearer JWT; returns masked supplier quotations |
| **`rfq-quotes-revealed`** | `rfq-quotes-revealed/index.ts` | Client GET request post-award reveal | Bearer JWT; enforces server-side reveal gate before returning supplier credentials |
| **`supplier-magic-link`** | `supplier-magic-link/index.ts` | Client / System invitation generation | Generates single-use cryptographically signed quick-quote tokens |
| **`process-attachment`** | `process-attachment/index.ts` | Supabase Storage `OBJECT_CREATED` trigger | Sanitizes EXIF/metadata, scrubs malicious scripts, and computes SHA-256 checksums |
| **`demo-reset`** | `demo-reset/index.ts` | Superadmin / Demo button invocation | Gated strictly by environment guard (`allow_demo_reset = true`) |

---

## 5. Automation & Operational Scripts Inventory

Located in `scripts/`:

| Script Name | Language / Runtime | Purpose & Execution Context |
| :--- | :--- | :--- |
| **`otp.ps1`** | PowerShell 7+ | Master platform CLI: starts/stops Docker containers, runs tests, deploys migrations, and triggers maintenance runbooks |
| **`deploy-prod.ps1`** | PowerShell 7+ | Gated Blue-Green production deployment pipeline targeting Vercel Edge CDN |
| **`backup-prod-db.ps1`** | PowerShell 7+ | Automated PBKDF2 (100k rounds) + AES-256-CBC encrypted PostgreSQL database backup with SHA-256 integrity checksums |
| **`restore-prod-db.ps1`** | PowerShell 7+ | Decrypted point-in-time disaster recovery restore script |
| **`update-live.ps1`** | PowerShell 7+ | Zero-data-loss live maintenance script applying forward SQL migrations and pre/post health alerts |
| **`run-master-regression.ts`** | TSX / Node 22 | Executes the 1,514+ automated test battery across domain, services, database, and UI |
| **`verify-staging-gate.ts`** | TSX / Node 22 | Formal pre-deployment staging verification gate running 22 formal failure paths |
| **`verify-vocabulary.ts`** | TSX / Node 22 | AST static analysis enforcing zero-tolerance prohibition of prohibited legacy words (`bid`, `bids`, `bidder`, `blind`) |
| **`clean-production-data.ts`** | TSX / Node 22 | Production database sanitization tool purging test artifacts while strictly preserving genuine customer accounts |

---

## 6. Build & Configuration Artifacts

- `package.json` / `pnpm-workspace.yaml`: Root workspace definition enforcing Node `>=22`, PNPM `9.15.0`, TypeScript `5.6.3`.
- `vitest.workspace.ts`: Root test configuration aggregating all package test runners into unified execution.
- `apps/web/vite.config.ts`: Vite 6.0 build bundler with React plugin, path aliases (`@/` -> `apps/web/src/`), and split chunk optimization.
- `apps/web/tailwind.config.js`: Tailwind CSS 3.4 design system defining OTP color tokens (`primary`, `secondary`, `surface`, `border`, `accent`), persona themes, and responsive container breakpoints.

---
*End of Repository Forensic Inventory (F1)*
