# OTP Test / Demo / Pilot / Staging Classification (F4)
**Document Identifier:** `OTP-RECON-F4-DEMO-AUDIT`  
**Version:** 1.0 (Golden Baseline)  
**Status:** AUTHORITATIVE FORENSIC AUDIT  
**Core Product Invariant:** *Zero Demo, Pilot, or Test Artifact Leakage into Customer Production Routes (Constitution v1.0, Section 39).*  
**Scope:** Frontend providers, hardcoded pilot dictionaries, simulated quote generators, database seed scripts, demo reset RPCs, and test fixtures.

---

## 1. Executive Summary & Forensic Leakage Points

During earlier testing and stakeholder demonstrations, synthetic walkthroughs, hardcoded pilot verticals, and simulated quote buttons were introduced. Our forensic inspection reveals that **these mechanisms were wired directly into the root customer application**:
1. **Global Provider Pollution in `App.tsx`:** `<DemoModeProvider>` and `<PilotProvider>` wrap the entire application tree, rendering demo banners and walkthrough floating sheets for all authenticated users.
2. **Hardcoded Fallbacks in `EvaluationDecisionCockpit.tsx`:** `getPilotByRfqId(rfqId)` injects hardcoded titles (`"10 HP Borewell Motor Winding"`) and fallback locations (`"Bengaluru"`) if RFQ metadata is loading or missing.
3. **Simulated Quote Injection on Live Views:** A `"Demo: Simulate Quotes"` button is rendered directly inside the primary commercial evaluation cockpit header (`EvaluationDecisionCockpit.tsx`, Line 619–622).
4. **Hardcoded Mock Attachments:** `SupplierMilestoneStepper.tsx` contains an embedded mock attachment submission form (`handleAddMockAttachment`).

This document classifies every test/demo asset across the repository using the 10-tier taxonomy and defines the **Strict Isolation Strategy** to ensure clean production operation while preserving automated testing and Superadmin sandbox verification.

---

## 2. Master Classification Matrix

| File / Artifact Path | Specific Symbol / Mechanism | Current Execution Context | Forensic Classification | Isolation & Reconstruction Action |
| :--- | :--- | :--- | :--- | :--- |
| `apps/web/src/lib/pilots.ts` | `PILOTS` array (Pilots 1–4: Greenview RWA, Precision Tools MSME, Sri Krishna Spinners, Malleswaram Electronics), `getPilotByRfqId()` | Exported globally; imported into `App.tsx` and `EvaluationDecisionCockpit.tsx` | **`PILOT`** / **`REFERENCE`** | **ISOLATE FROM PRODUCTION:** Move to `@/features/demo/lib/pilots.ts`. Remove all imports from `App.tsx` and production evaluation views. Retain strictly for `/demo` walkthrough routes and integration test fixtures. |
| `apps/web/src/features/demo/demo-config.ts` | `isDemoMode`, `DEMO_BANNER_TEXT`, `DEMO_ORG_NAME` ("Durga Rainbow Flat Owner Welfare Association") | Configures demo environment state and banner text | **`DEMO`** | Gate strictly by server-side RPC `demo_status()`. Never allow demo banners on `/dashboard` or standard buyer routes. |
| `apps/web/src/features/demo/DemoModeProvider.tsx` & `DemoWalkthroughPanel.tsx` | Global React context provider and floating interactive walkthrough drawer | Mounted in root `App.tsx` | **`DEMO`** | **UNMOUNT FROM ROOT:** Remove `<DemoModeProvider>` from `App.tsx`. Mount exclusively within the `/demo` route tree (`DemoDashboardPage.tsx`). |
| `apps/web/src/features/pilots/PilotProvider.tsx` | React context managing selected horizontal pilot vertical | Mounted in root `App.tsx` | **`PILOT`** | **UNMOUNT FROM ROOT:** Remove `<PilotProvider>` from root `App.tsx`. Mount only inside `/demo` or admin diagnostic tools. |
| `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` | Lines 145–149: `const pilot = useMemo(() => getPilotByRfqId(rfqId), [rfqId]);`<br>Lines 619–622: `"Demo: Simulate Quotes"` button | Live buyer decision cockpit | **`PRODUCTION`** contaminated with **`DEMO`** | **PURGE DEMO HOOKS:** Remove `getPilotByRfqId` fallback. Derive title and location strictly from database `rfqs` / `requirements` table. Relocate "Simulate Quotes" button to Superadmin Troubleshooter (`/admin?tab=buyer_troubleshooter`). |
| `apps/web/src/features/rfq/api/simulate-quotes.ts` | `simulateQuotesForRfq()`, `simulateQuotesViaRpc()` | Client helper generating synthetic quotations with realistic Indian vendor names | **`DEMO`** / **`STUB`** | Retain for Superadmin diagnostic testing and automated end-to-end tests; restrict execution to users with `is_platform_admin = true`. |
| `supabase/migrations/00188_automatic_and_on_demand_simulated_quotes_generation.sql` | PostgreSQL RPC `public.generate_simulated_quotes_for_rfq()` | Database RPC generating synthetic quotations | **`DEMO`** / **`SHARED INFRASTRUCTURE`** | **SECURITY HARDEN:** Add server-side guard restricting execution to Platform Admins or test-tenant organizations; reject execution on live production organizations. |
| `apps/web/src/features/fulfillment/components/SupplierMilestoneStepper.tsx` | Line 83, 445–455: `handleAddMockAttachment()` with mock LR / staging photo form | Live supplier work order page | **`MOCK`** | **REMOVE FORM:** Replace mock form with genuine Supabase Storage attachment uploader (`QuoteAttachmentsPanel` / `RequirementAttachmentsPanel`). |
| `apps/web/src/features/supplier/pages/SupplierQuotesPage.tsx` | Line 59: Fallback mock / showcase view adhering to Screen 08 | Renders when quote table is empty | **`MOCK`** | **REPLACE WITH EMPTY STATE:** Replace hardcoded showcase cards with clean, production-grade `<EmptyState title="No active quotations" message="Invitations to quote on RFQs will appear here." />`. |
| `supabase/migrations/00021_demo_foundation.sql` & `00026_demo_reset.sql` | `public.demo_scenarios`, `reset_demo_state()` RPC | Base demo scenario schema and reset logic | **`DEMO`** | Keep in database schema; guarded by environment flag `allow_demo_reset`. |
| `supabase/migrations/00115_seed_benchmark_org_and_fix_test_runner.sql` | Seeds benchmark RWA organization ("Greenview Apartments") and 16 domain suppliers | Database seed script | **`TEST`** / **`DEMO`** | Retain in migration chain; used for isolated regression testing. |
| `supabase/migrations/00125_production_preservation_and_staging_gate.sql` | Immutability triggers protecting genuine production users from automated resets | Production database protection | **`PRODUCTION`** / **`SHARED INFRASTRUCTURE`** | **CRITICAL PROTECTED ASSET:** Enforces permanent retention of real customer accounts during demo resets. |
| `supabase/migrations/00184_production_clean_state_reset_and_demo_isolation.sql` | `public.admin_purge_test_transactions()` RPC | Superadmin tool to clean test RFQs while preserving customer accounts | **`SHARED INFRASTRUCTURE`** | **PROTECTED BACKEND ASSET:** Allows operational cleanup of test data without schema truncation. |
| `supabase/functions/demo-reset/index.ts` | Deno edge function handling remote demo reset requests | Edge function | **`DEMO`** | Ensure HMAC token authentication and environment gate are active. |
| `scripts/demo/seed-demo.ts`, `reset-demo.ts`, `walkthrough.ts` | Automation scripts in `scripts/demo/` | CLI demo runner | **`DEMO`** | Retain for local development and CI sandbox runs. |
| `tests/helpers/demo-fixtures.ts`, `tests/demo/demo-scenario.test.ts` | Test fixtures and scenario runners | Automated test suites | **`TEST`** | Retain; executes in CI/Vitest pipeline. |
| `packages/domain/src/parser/taxonomy.fixture.ts` | Static JSON fixture of 5 taxonomy categories and 25 subcategories | Domain test fixture | **`TEST`** / **`REFERENCE`** | Retain for offline unit testing of `RuleBasedRequirementParser`. |
| `packages/services/src/repositories/in-memory.ts` | In-memory repository implementations (`InMemoryRfqRepository`, etc.) | Unit test mock layer | **`MOCK`** / **`TEST`** | Retain for lightning-fast domain service unit tests. |

---

## 3. Strict 4-Tier Isolation Strategy

To guarantee that customer-facing production operations remain 100% free of engineering and demo clutter, OTP enforces four strict isolation barriers:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        4-TIER DEMO & TEST ISOLATION MODEL                              │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [TIER 1: CLIENT ROUTER ISOLATION]
  ├── Demo components (DemoModeProvider, DemoWalkthroughPanel, PilotProvider) are 
  │   completely removed from the global AppLayout and customer routes.
  └── Demo tools are accessible ONLY when the URL explicitly starts with `/demo`.

 [TIER 2: METADATA & FALLBACK HYGIENE]
  ├── Zero hardcoded pilot titles ("10 HP Borewell Motor Winding") in production components.
  ├── EvaluationDecisionCockpit renders ONLY real data from database `rfqs` table.
  └── When data is missing, render standard skeleton loaders, never synthetic pilot defaults.

 [TIER 3: ACTION & MUTATION GUARDS]
  ├── "Simulate Quotes" and synthetic test generators are removed from customer UI.
  ├── Relocated exclusively to Superadmin Operations Console (`/admin?tab=buyer_troubleshooter`).
  └── Database RPC `generate_simulated_quotes_for_rfq` rejects execution on real orgs.

 [TIER 4: DATABASE & STATE PRESERVATION]
  ├── Migration 00125 and 00184 immutability triggers prevent accidental deletion of real users.
  └── Automated test runs operate against isolated test org IDs (`org-test-*` / `d1000000-*`).
```

---
*End of Test / Demo / Pilot / Staging Classification (F4)*
