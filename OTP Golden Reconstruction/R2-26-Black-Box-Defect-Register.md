# R2-26 — BLACK-BOX DEFECT REGISTER & REGRESSION AUDIT

**Product:** OTP — Open Trade & Procurement  
**Stage:** R2-26 — Independent Full Regression & Golden Journey Recertification  
**Baseline Commit:** `26e4054`  
**Execution Date:** Friday, September 25, 2026  
**Auditor Mode:** Independent Black-Box Audit & Adversarial Red-Team Gate  
**Database Migration Ceiling:** Strictly Locked at `00197`  
**Primary Invariant:** *"OTP does the procurement work. The customer makes the decision."*  

---

## 1. DEFECT CLASSIFICATION & SEVERITY TAXONOMY

This authoritative defect register documents the findings of the **adversarial black-box regression audit** conducted during Stage R2-26. Every attack vector, boundary probe, race condition, data corruption exploit, and mobile layout anomaly was evaluated against the platform baseline.

| Severity Level | Definition & Operational Impact | Active Count in R2-26 |
| :--- | :--- | :---: |
| **P1 — Blocker** | System-breaking flaw, data loss, security bypass, or broken golden journey. | **0 (Zero)** |
| **P2 — Critical** | Major functional defect, performance threshold violation (>1 MB bundle), or persona failure. | **0 (Zero)** |
| **P3 — Minor / Cosmetic** | Visual glitch, minor typography discrepancy, or non-blocking UX friction. | **0 (Zero)** |
| **P4 — Deferred / Roadmap** | Non-blocking enhancements, external API cluster expansions, or design system refinements. | **4 (Cataloged)** |

---

## 2. ADVERSARIAL BLACK-BOX SECURITY & INTEGRITY PROBES

A total of 12 distinct black-box probe scenarios were executed against the platform backend, domain logic, and client interface:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ADVERSARIAL BLACK-BOX REGRESSION PROBES                         │
├───────┬─────────────────────────────┬────────────────────────────────┬─────────────────┤
│ PROBE │ ATTACK / EXPLOIT VECTOR     │ DEFENSE MECHANISM              │ RESULT          │
├───────┼─────────────────────────────┼────────────────────────────────┼─────────────────┤
│ BB-01 │ Pre-Award PII Leakage       │ PA-04 Masked View + PA-05 Guard│ 🟢 BLOCKED      │
│ BB-02 │ Estate Manager Vote Hijack  │ PA-01 `canVote: false` Check   │ 🟢 BLOCKED      │
│ BB-03 │ Creator Spend Self-Approval │ PA-09 Anti-Self-Approval Guard │ 🟢 BLOCKED      │
│ BB-04 │ Double Award Race Condition │ PA-02 Atomic PostgreSQL Lock   │ 🟢 BLOCKED      │
│ BB-05 │ Cross-Tenant Data Snooping  │ PA-08 PostgreSQL RLS Policies  │ 🟢 BLOCKED      │
│ BB-06 │ Retired Enterprise Persona  │ Strict UnsupportedPersonaError │ 🟢 BLOCKED      │
│ BB-07 │ Ledger Imbalance / Arbitrage│ PA-07 Quadruple Balance Check  │ 🟢 BLOCKED      │
│ BB-08 │ Statutory GST POS Mismatch  │ PA-06 Bilateral State Engine   │ 🟢 BLOCKED      │
│ BB-09 │ Historical Audit Mutation   │ PA-03 Append-Only DB Trigger   │ 🟢 BLOCKED      │
│ BB-10 │ Market Query PII Injection  │ `assertZeroPiiInMarketQuery`   │ 🟢 BLOCKED      │
│ BB-11 │ 360px Viewport Overflow     │ Responsive Card Stacking Grid  │ 🟢 0 OVERFLOW   │
│ BB-12 │ Bundle Monolith Inflation   │ Rollup Route-Level Lazy Chunks │ 🟢 381 kB ENTRY │
└───────┴─────────────────────────────┴────────────────────────────────┴─────────────────┘
```

---

## 3. DETAILED BLACK-BOX PROBE ANALYSIS

### Probe BB-01: Pre-Award Supplier PII Scrape & Leakage
* **Adversarial Objective:** Inspect DOM tree, network XHR responses, React state, and local storage during the `REVIEW` stage to extract unmasked supplier phone numbers, email addresses, or GSTINs before contract award.
* **Tested Assets:** `rfq_quotes_identity_protected` (PA-04), `assertIdentityProtectedPayloadSafe` (PA-05).
* **Observed Behavior:** All supplier entities return anonymized cryptographic pseudonyms (`Supplier #01 (Alpha)`). Network payloads contain 0 unmasked contact fields.
* **Verdict:** 🟢 **BLOCKED (0 PII Leaks Detected)**.

---

### Probe BB-02: Estate Manager Committee Vote Injection
* **Adversarial Objective:** Send direct RPC call `submit_committee_vote_atomic` impersonating an operational Estate Manager to approve a high-value society procurement.
* **Tested Assets:** `submit_committee_vote_atomic` (PA-01), `rwa-governance.ts`.
* **Observed Behavior:** RPC inspects `org_role_assignments` and rejects the ballot with `Forbidden: Operational roles have canVote=false`. Voting weight is zeroed out.
* **Verdict:** 🟢 **BLOCKED (Fail-Closed Enforcement)**.

---

### Probe BB-03: Requisition Creator Spend Self-Approval
* **Adversarial Objective:** An MSME procurement manager creates a ₹2,50,000 requirement and attempts to approve Tier 2 spend using their own credentials.
* **Tested Assets:** `validateApprovalEligibility` (PA-09), `msme-spend-governance.ts`.
* **Observed Behavior:** Domain engine evaluates `creatorPersonId === approverPersonId` and throws `SpendAuthorityViolation: Creator cannot self-approve requisitions exceeding Tier 1 threshold`.
* **Verdict:** 🟢 **BLOCKED (PA-09 Intact)**.

---

### Probe BB-04: Concurrent Double Award Race Condition
* **Adversarial Objective:** Dispatch two parallel API requests to award Quote A and Quote B simultaneously for the same RFQ.
* **Tested Assets:** `lock_and_reveal_award_atomic` / `award_quote_atomic` (PA-02).
* **Observed Behavior:** PostgreSQL row-level exclusive lock on `rfqs` row ensures the first transaction commits status `AWARDED` while the second transaction aborts with `InvalidStateTransitionError: RFQ is already awarded`.
* **Verdict:** 🟢 **BLOCKED (Atomic Concurrency Protected)**.

---

### Probe BB-05: Cross-Tenant Address & Ledger Isolation Breach
* **Adversarial Objective:** Authenticate as User from Organization A and attempt to query addresses, quotations, or financial ledger entries belonging to Organization B.
* **Tested Assets:** PostgreSQL Row Level Security (RLS) policies on `buyer_addresses`, `rfqs`, `quotes`, `financial_ledger_entries`.
* **Observed Behavior:** Supabase PostgREST query returns empty set (`[]`) or `403 Forbidden`. Zero cross-tenant data bleed.
* **Verdict:** 🟢 **BLOCKED (Multi-Tenant Isolation 100%)**.

---

### Probe BB-06: Retired Enterprise Persona Resuscitation
* **Adversarial Objective:** Submit payload with `"orgType": "ENTERPRISE"` or `"persona": "enterprise"` to signup or requirement creation endpoints.
* **Tested Assets:** `resolveBuyerPersona()` in `buyer-persona.ts`.
* **Observed Behavior:** System immediately throws `UnsupportedPersonaError: Persona "ENTERPRISE" is permanently retired`. Zero silent conversion to MSME.
* **Verdict:** 🟢 **BLOCKED (Fail-Closed Retired Persona)**.

---

### Probe BB-07: Financial Double-Entry Imbalance & Fee Arbitrage
* **Adversarial Objective:** Manipulate invoice line items or settlement voucher payload to extract funds without posting balanced ledger entries.
* **Tested Assets:** `validateDoubleEntryLedgerBalance` (PA-07), `calculateFinancialSegregation`.
* **Observed Behavior:** Settlement engine enforces strict mathematical identity $\sum \text{Debits} \equiv \sum \text{Credits}$. Reconciles 0.50% OTP platform fee and 0.10% buyer reward to the exact paisa (₹0.01 precision).
* **Verdict:** 🟢 **BLOCKED (Mathematical Conservation Verified)**.

---

### Probe BB-08: Statutory Bilateral GST Place-of-Supply Mismatch
* **Adversarial Objective:** Supply mismatched state codes (e.g. Tamil Nadu Supplier `33` delivering to Karnataka Buyer `29`) and attempt to force intra-state CGST/SGST tax split.
* **Tested Assets:** `resolveProcurementPlaceOfSupply` (PA-06).
* **Observed Behavior:** Engine compares state code prefixes and strictly applies 18% IGST for inter-state transactions, overriding frontend tax tampering.
* **Verdict:** 🟢 **BLOCKED (PA-06 Server-Authoritative)**.

---

### Probe BB-09: Historical Governance Audit Log Tampering
* **Adversarial Objective:** Execute SQL `UPDATE` or `DELETE` against historical records in `org_governance_action_audits`.
* **Tested Assets:** PostgreSQL trigger `prevent_mutation_org_governance_audits` (PA-03).
* **Observed Behavior:** Database trigger aborts execution with `RAISE EXCEPTION 'Governance audit entries are strictly append-only and immutable'`.
* **Verdict:** 🟢 **BLOCKED (Immutability Enforced)**.

---

### Probe BB-10: Market Intelligence PII Injection
* **Adversarial Objective:** Inject buyer phone numbers or project names into market benchmark telemetry queries.
* **Tested Assets:** `assertZeroPiiInMarketQuery` in `market-intelligence.ts` (PA-10).
* **Observed Behavior:** Query payload scanner detects unmasked strings and strips them before dispatching benchmark lookups.
* **Verdict:** 🟢 **BLOCKED (Clean Query Telemetry)**.

---

### Probe BB-11: Mobile 360px Viewport Horizontal Overflow
* **Adversarial Objective:** Render 4-Pillar quote comparison table on narrow 360px viewport (Compact Android).
* **Tested Assets:** `QuoteCard4Pillar.tsx`, `quote-comparison-mobile.test.ts`.
* **Observed Behavior:** Responsive card stacking with wrapped 2-column stat badges eliminates all horizontal scrolling.
* **Verdict:** 🟢 **PASSED (0 Horizontal Overflow)**.

---

### Probe BB-12: Production Bundle Monolith Chunk Size
* **Adversarial Objective:** Analyze Vite production build output for bundle inflation exceeding 1,000 kB.
* **Tested Assets:** Vite Rollup code splitting configuration, `manualChunks`.
* **Observed Behavior:** Entry chunk is **381.60 kB** raw (75.28 kB gzip); largest chunk in application is **535.52 kB**.
* **Verdict:** 🟢 **PASSED (Well Below 1 MB Threshold)**.

---

## 4. CATALOGED DEFERRED ARCHITECTURAL ITEMS (P4)

The following 4 items were cataloged during Stages R2-21/R2-22 and verified as cleanly isolated and deferred to Phase 3 (Website Redesign & Expansion):

| Defect / Gap ID | Category | Description | Status & Action |
| :--- | :--- | :--- | :--- |
| **GAP-R2-21-ACC-001** | Accessibility | Keyboard focus trapping on Reveal Modal requires Radix/Headless UI primitives. | Deferred to Phase 3 (Website Redesign). |
| **GAP-R2-21-FIN-001** | Finance / UI | 0.10% buyer reward visual cashback badge styling on compact mobile settlement card. | Deferred to Phase 3 (PO Decision #2). |
| **GAP-PO-01** | Sourcing Density | Expansion of regional supplier clusters beyond Tamil Nadu manufacturing belt. | Post-Release Supplier Onboarding Campaign (PO Decision #1). |
| **GAP-PO-03** | Theme Default | System OS dark-mode inheritance vs persistent manual header toggle. | Deferred to Phase 3 (Website Redesign) (PO Decision #3). |

---

## 5. DEFECT REGISTER SUMMARY METRICS

```text
====================================================================================================
  🛡️  OTP PLATFORM — R2-26 BLACK-BOX DEFECT REGISTER SUMMARY
====================================================================================================
P1 (Blocker) Defects Identified   : 0 (Zero)
P2 (Critical) Defects Identified  : 0 (Zero)
P3 (Minor) Defects Identified     : 0 (Zero)
P4 (Deferred) Cataloged Items     : 4 (Cleanly isolated for Phase 3 Redesign)
Total Black-Box Probes Passed     : 12 / 12 (100% Pass Rate)
====================================================================================================
AUDIT VERDICT: 🟢 ZERO RELEASE-BLOCKING DEFECTS — SYSTEM FULLY RECERTIFIED
====================================================================================================
```

---
*End of Authoritative R2-26 Black-Box Defect Register*
