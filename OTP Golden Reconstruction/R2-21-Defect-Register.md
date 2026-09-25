# R2-21 — DEFECT REGISTER

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-21 — Independent Release Hardening, Black-Box Audit & Platform Compatibility  
**Date:** September 25, 2026  
**Auditor Mode:** Independent Black-Box & Forensic Audit  

---

## 1. SEVERITY DEFINITIONS

* **P0 — RELEASE BLOCKER:** Identity leakage, authorization bypass, financial corruption, data loss, Golden Path failure.
* **P1 — CRITICAL:** Major functionality or severe user journey failure without straightforward workaround.
* **P2 — SIGNIFICANT:** Important UX, reliability, performance, or accessibility issue.
* **P3 — IMPROVEMENT:** Non-blocking friction point, cosmetic defect, or usability enhancement.
* **P4 — OBSERVATION:** Architectural insight, future refactoring opportunity, or monitoring recommendation.

---

## 2. DEFECT LOG & AUDIT FINDINGS

| Defect ID | Severity | Persona | Route / Component | Description | Root Cause | Status / Remediation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R2-21-SEC-001** | P3 | All Buyers | `/signup` (`BuyerRegisterForm.tsx`) | Legacy text referencing retired 4-vote/3-vote Enterprise & Institution tiers. | Vestigial copy from pre-reconstruction enterprise multi-tier governance. | **FIXED (Surgical)**: Updated descriptions to canonical `INDIVIDUAL`, `MSME`, `COMMUNITY`. |
| **R2-21-REG-001** | P3 | MSME / RWA | `packages/domain/src/types/approval-matrix.ts` | Export naming used `DEFAULT_ENTERPRISE_APPROVAL_TIERS` for MSME/Community spend governance. | Legacy terminology in domain approval matrix. | **FIXED (Surgical)**: Created `DEFAULT_ORG_APPROVAL_TIERS` and updated UI components. |
| **R2-21-UX-001** | P3 | All Buyers | `/intake` (`TemplatesAndExamplesModal.tsx`) | Modal example tagged as `ENTERPRISE` for Bengaluru Solar Rooftop. | Pre-reconstruction example metadata. | **FIXED (Surgical)**: Converted template to `MSME` persona. |
| **R2-21-UX-002** | P3 | Individual | `/intake` (`UnifiedThreeTierIntake.tsx`) | Intake full-governance array checked retired `ENTERPRISE` string. | Legacy array check. | **FIXED (Surgical)**: Removed `ENTERPRISE` and added canonical tests. |
| **R2-21-PERF-001** | P2 | All Users | Global Client (`apps/web/dist`) | Entry JavaScript bundle (`index-DJxwIzZH.js`) is 2.33 MB raw (exceeds 2 MB threshold). | Monolithic build without manual rollup vendor splitting for Lucide, Charts, and Supabase. | **DEFERRED TO PHASE 3 (UX Redesign & Optimization)**: Non-blocking for local hardening; requires Vite chunk splitting. |
| **R2-21-MOB-001** | P2 | Mobile Users | `/rfq/:rfqId/evaluation` | 4-Pillar comparison matrix requires horizontal scrolling on 360px viewports. | Desktop-first multi-column table layout in comparison cockpit. | **DEFERRED TO WEBSITE REDESIGN**: Requires responsive card-stacking redesign on mobile viewports. |
| **R2-21-ACC-001** | P3 | Keyboard Users | `/rfq/:rfqId/reveal` | Modal backdrop does not trap focus automatically when reveal gate opens. | Custom modal overlay without Radix/Headless UI focus trap wrapper. | **DEFERRED TO WEBSITE REDESIGN**: Non-blocking accessibility enhancement. |
| **R2-21-FIN-001** | P4 | MSME | `/financial-controls` | Buyer Platform Reward (0.10%) ledger credits are displayed in paise but lack visual currency breakdown on mobile. | Compact table layout on small screens. | **DEFERRED TO WEBSITE REDESIGN**: Cosmetic ledger refinement. |

---

## 3. ZERO P0 / P1 DEFECT CONFIRMATION

* **Total P0 Defects Identified:** `0`
* **Total P1 Defects Identified:** `0`
* **Total P2 Defects Identified:** `2` (Flagged for controlled Phase 3 optimization & redesign)
* **Total P3 Defects Identified:** `5` (4 Surgically Resolved in R2-21, 1 Deferred)
* **Total P4 Defects Identified:** `1` (Deferred to Phase 3)

**Summary:** The application is free of release-blocking security, financial, and authorization defects.
