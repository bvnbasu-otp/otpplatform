# OTP Stage R2-19 Gap Register: Enterprise Retirement, Demo/Pilot Isolation & Production Purity

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-19  
**Baseline Commit:** `71ebddd`  
**Date:** Friday, Sep 25, 2026  

---

## 1. Summary of Discovery Findings

| Finding ID | Classification | Location | Description | Action Required |
| :--- | :--- | :--- | :--- | :--- |
| **GAP-19-01** | **REAL PRODUCTION RISK** | `apps/web/src/features/requirement/api/rfq-lifecycle.ts` | `openRfq` and `publishRequirementAndRfq` unconditionally invoke `simulateQuotesForRfq(rfqId)` | **REMOVE**: Real RFQs must never automatically generate synthetic supplier quotes |
| **GAP-19-02** | **REAL PRODUCTION RISK** | `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` | Demo buttons ("Demo: Simulate Quotes", "⚡ Simulate Supplier Questions") rendered in evaluation cockpit | **GUARD / CLEAN**: Demo buttons must be strictly hidden/disabled in production mode |
| **GAP-19-03** | **REAL PRODUCTION RISK** | `apps/web/src/App.tsx` | Route `/demo` is directly mounted on the frontend router | **GUARD**: In production (`!isDemoMode`), `/demo` must redirect cleanly to `/dashboard` |
| **GAP-19-04** | **RETIRED** | `apps/web/src/features/site/pages/LandingPage.tsx`, `site-content.ts`, `SubscriptionPaymentModal.tsx` | Customer-facing Enterprise pricing card, audience, and subscription tier references | **RETIRE**: Align customer-facing copy and modals to canonical 3 personas (`INDIVIDUAL`, `RWA`, `MSME`) |
| **GAP-19-05** | **REAL PRODUCTION RISK** | `packages/services/src/services/managed-supplier-network-service.ts` | Discovered suppliers with `raw.isGstKnown` assigned `GST_VERIFIED` directly upon discovery | **HARDEN**: Discovered suppliers start at `DISCOVERED_IN_AREA` or `DETAILS_AVAILABLE`; only Stage 2 verification grants `GST_VERIFIED` |
| **GAP-19-06** | **FALSE POSITIVE** | `msme-governance.ts`, `BuyerRegisterForm.tsx`, GST services | "MSME Enterprise", "Commercial Enterprise", legal business names ending in "Enterprises" | **PRESERVE**: Legitimate Indian statutory business vocabulary (MSME) |
| **GAP-19-07** | **DEVELOPMENT-ONLY / TEST-ONLY** | `mock-network-discovery-service.ts`, `scripts/demo/*`, test fixtures | Unit test mocks and staging seed helpers | **PRESERVE & QUARANTINE**: Retained for test automation; isolated from production runtime |
| **GAP-19-08** | **DOCUMENTATION-ONLY** | Historical stage PRDs and markdown notes | Architecture documents referencing enterprise retirement | **PRESERVE**: Historical record |

---

## 2. Detailed Gap Analysis & Impact Assessment

### GAP-19-01: Unconditional Synthetic Quote Simulation in RFQ Lifecycle
- **Location:** `apps/web/src/features/requirement/api/rfq-lifecycle.ts` (lines 330, 754)
- **Current Behavior:** Publishing or opening an RFQ automatically triggers `simulateQuotesForRfq(rfqId)` in the background.
- **Production Impact:** Real production requirements receive fake quotes from simulated suppliers (`sup-demo-01`, etc.).
- **Security / Regulatory Impact:** Violates truth-in-procurement standards; manufactures artificial market competition.
- **Correction:** Remove `simulateQuotesForRfq` from `openRfq` and `publishRequirementAndRfq`. Real RFQs receive only genuine supplier quotes.
- **Code Change Required:** Yes (`apps/web/src/features/requirement/api/rfq-lifecycle.ts`).

### GAP-19-02: Exposed Demo Quote Simulation Controls in Cockpit
- **Location:** `apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx` (lines 616-624, 741-746)
- **Current Behavior:** UI renders "Demo: Simulate Quotes" button unconditionally.
- **Production Impact:** Allows production buyers to trigger simulated quotes in active RFQs.
- **Correction:** Hide simulation buttons unless `isDemoMode && status.enabled`.
- **Code Change Required:** Yes (`apps/web/src/features/evaluation/components/EvaluationDecisionCockpit.tsx`).

### GAP-19-03: Direct Route Exposure of `/demo`
- **Location:** `apps/web/src/App.tsx` (line 483)
- **Current Behavior:** `/demo` route is mounted and accessible in all environments.
- **Production Impact:** In production, navigating to `/demo` exposes the demo scenario runner.
- **Correction:** In clean production mode (`!isDemoMode`), navigating to `/demo` redirects to `/dashboard`.
- **Code Change Required:** Yes (`apps/web/src/App.tsx` / `apps/web/src/features/demo/pages/DemoDashboardPage.tsx`).

### GAP-19-04: Enterprise Persona Marketing Residuals
- **Location:** `apps/web/src/features/site/pages/LandingPage.tsx`, `apps/web/src/features/site/content/site-content.ts`, `apps/web/src/features/subscription/components/SubscriptionPaymentModal.tsx`
- **Current Behavior:** 4th tier "Enterprise" card displayed on LandingPage; `SubscriptionPaymentModal.tsx` lists Enterprise option.
- **Production Impact:** Confuses buyers about active personas; suggests an un-scoped 4th persona exists.
- **Correction:** Standardize all customer surfaces to strictly 3 canonical buyer personas (`INDIVIDUAL`, `RWA`, `MSME`).
- **Code Change Required:** Yes.

### GAP-19-05: Supplier Discovery Lifecycle Stage Progression
- **Location:** `packages/services/src/services/managed-supplier-network-service.ts` (lines 538-542)
- **Current Behavior:** New discovery observation marks supplier as `GST_VERIFIED` if `raw.isGstKnown`.
- **Production Impact:** Bypasses statutory Stage 2 PAN/GSTIN validation.
- **Correction:** Discovered suppliers are strictly `DISCOVERED_IN_AREA` or `DETAILS_AVAILABLE`.
- **Code Change Required:** Yes (`packages/services/src/services/managed-supplier-network-service.ts`).
