# OTP Stage R2-20 — Consolidated Release Gap Register

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-20 — Human Black-Box Product Audit & Golden-Path Gap Discovery  
**Audit Baseline Commit:** `32334aae872c98ddc13d326985723c560534823b`  
**Ceiling Migration:** `00197_universal_org_role_lifecycle_succession_and_audit.sql`  
**Standard:** Release Readiness Certification Baseline  

---

## 1. Release Readiness Evaluation Matrix

This register provides the definitive release-readiness assessment across every platform subsystem, detailing whether any identified finding constitutes a **Release Blocker** (P0) or a **Pre-Certification Requirement**.

| Functional Area | Audit Assessment & Finding Summary | Finding ID | Severity | Release Blocker? | Forensic Evidence | Required Before Certification? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Golden Paths (Individual)** | Flow completes from intake to settlement; excessive award friction identified | `F-20-04` | P3 | **NO** | `AwardPage.tsx:835-865` | Recommended UX polish |
| **Golden Paths (RWA)** | Complete; 7 canonical roles, quorum, weighted voting, COI verified | None | Clean | **NO** | `rwa-governance.test.ts` (13/13) | **NO** |
| **Golden Paths (MSME)** | Complete; spend authority thresholds, anti-self-approval enforced | None | Clean | **NO** | `msme-spend-governance-redteam.test.ts` (20/20) | **NO** |
| **Identity Protection** | 100% verified; zero PII leakage prior to award reveal; losing bids sealed | None | Clean | **NO** | `award-closeout.test.ts` (18/18) | **NO** |
| **Supplier Verification** | 5-tier canonical sequence enforced; discovery does not confer verification | None | Clean | **NO** | `supplier-lifecycle-redteam.test.ts` (16/16) | **NO** |
| **Authorization & RBAC** | 13-stage authorization chain verified; zero authority bleed across contexts | None | Clean | **NO** | `authorization-chain.test.ts` (14/14) | **NO** |
| **Retired Enterprise Persona**| Strictly FAIL_CLOSED; all enterprise claims rejected without conversion | None | Clean | **NO** | `enterprise-demo-pilot-isolation-redteam.test.ts` (34/34) | **NO** |
| **Demo / Pilot Isolation** | Empty comparison table exposes "Simulate 4 Demo Quotes" button in production | `F-20-01` | P1 | **NO** (Not P0, but Critical Defect) | `EvaluationDecisionCockpit.tsx:661` | **YES (Mandatory Fix)** |
| **Taxonomy & Parsing** | Natural language, bundled categories, regional MSME hubs verified | None | Clean | **NO** | `taxonomy-classification-redteam.test.ts` (16/16) | **NO** |
| **Supplier Network Engine** | Multi-provider orchestration, graceful fallback, zero fake suppliers | None | Clean | **NO** | `supplier-network-engine.test.ts` (13/13) | **NO** |
| **Address & Snapshots** | 3 concepts separated; address book edits never rewrite transaction snapshots | None | Clean | **NO** | `address-location-snapshots-redteam.test.ts` (16/16) | **NO** |
| **Notifications** | Truthful delivery states enforced; provider accepted $\neq$ delivered | None | Clean | **NO** | `notification-truthful-delivery-redteam.test.ts` (16/16) | **NO** |
| **Delivery & Inspection** | 5 inspection categories, mutual sign-off, star ratings verified | None | Clean | **NO** | `DeliveryInspectionPanel.tsx` | **NO** |
| **Purchase Order Line Items** | Synthesizes fictitious BoQ line items via title regex when db has 0 items | `F-20-03` | P2 | **NO** | `PurchaseOrderDetailPage.tsx:68-270` | **YES (Mandatory Fix)** |
| **GST & Place of Supply** | Deterministic CGST/SGST vs IGST calculation verified; 18% standard | None | Clean | **NO** | `tax-engine.test.ts` (26/26) | **NO** |
| **Financial Settlement** | Double-entry ledger (PA-07), 0.50% fee, 0.10% buyer reward verified | None | Clean | **NO** | `financial-settlement-controls-redteam.test.ts` (16/16) | **NO** |
| **Admin Observability** | Centralized taxonomy, GIS quotas, provider health, zero transaction tampering| None | Clean | **NO** | `AdminDashboardPage.tsx` | **NO** |
| **Founder Dashboard** | Clean revenue KPIs; zero synthetic demo GMV contamination | None | Clean | **NO** | `superadmin-founder-oversight-redteam.test.ts` (16/16) | **NO** |
| **Mobile UX & Responsiveness** | Responsive layout across 360px–414px viewports; some targets under 44px | `F-20-05` | P3 | **NO** | `EvaluationDecisionCockpit.tsx:619` | Recommended |
| **Accessibility (a11y)** | Keyboard navigation supported; lacks focus traps and aria labels on icons | `F-20-05` | P3 | **NO** | Modals and emoji button triggers | Recommended |
| **Bundle Size & Performance** | Monolithic index bundle exceeds 2.33 MB (warning threshold: 1.5 MB) | `F-20-02` | P2 | **NO** | `vite build apps/web` (2,333.22 kB chunk) | **YES (Mandatory Fix)** |
| **Node Compatibility** | Fully functional on Node 22 LTS and 24; deprecation warning on Node 24 | `F-20-06` | P4 | **NO** | `scripts/test-functions.ts` `[DEP0190]` | Optional (CI pin to Node 22) |
| **Dependency Security** | `pnpm audit` reports 0 vulnerabilities across all dependencies | None | Clean | **NO** | `pnpm audit` (0 CVEs) | **NO** |
| **Supabase Compatibility** | Client v2.112.4 operational; 197 contiguous migrations validated | None | Clean | **NO** | `deploy-migrations.ts --check-only` (PASS)| **NO** |
| **Vercel Compatibility** | `vercel.json` SPA rewrites, security headers, CSP operational | None | Clean | **NO** | `vercel.json` | **NO** |
| **CI / CD Pipeline** | Automated 12-layer verification gate (`verify-staging-gate.ts`) active | None | Clean | **NO** | `.github/workflows/ci-cd.yml` | **NO** |
| **Environment Configuration** | Strict environment boundary between production and demo | None | Clean | **NO** | `validate-prod-env.ts` | **NO** |
| **Regression Risk** | 275 test files passing (661 domain, 540 services, 1133 web, 42 functions) | None | Clean | **NO** | Full test battery execution | **NO** |

---

## 2. Summary of Mandatory Action Items Prior to Final Release Certification

Before final production deployment and Gold Release sign-off, the following three items must be resolved in implementation stage R2-21:

1. **Close GAP `F-20-01` (Critical UI Contamination):**
   - In `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` (line 661), guard `onSimulateQuotes` with `isDemoMode` so the button never appears to production buyers.
2. **Close GAP `F-20-02` (Monolithic Bundle Size):**
   - Introduce `React.lazy()` dynamic imports in `apps/web/src/App.tsx` for heavy dashboards (`AdminDashboardPage`, `FounderDashboardPage`, `PurchaseOrderDetailPage`, `EvaluationDecisionCockpitPage`), bringing the primary bundle under 500 kB.
3. **Close GAP `F-20-03` (Synthetic Line Item Fallback):**
   - In `apps/web/src/features/fulfillment/pages/PurchaseOrderDetailPage.tsx`, remove `derivePoLineItems()` and replace with an honest contractual summary row matching the agreed PO commitment total.
