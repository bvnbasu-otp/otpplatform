# OTP Checkpoint Gates & Human Governance Protocol (R2)
**Document Identifier:** `OTP-RECON-R2-CHECKPOINT-GATES`  
**Version:** 1.0 (Authoritative R2 Governance Protocol)  
**Status:** SUPREME HUMAN GOVERNANCE & GATING SPECIFICATION  
**Working Root:** `G:/My Drive/otp`  
**Ceiling Migration:** `00197` (Universal Org Role Lifecycle, Succession & Audit)  
**Operating Invariant:** *EXPLICIT HUMAN AUTHORIZATION REQUIRED AT EVERY GATE. ZERO CODE ADVANCEMENT WITHOUT FORMAL GATE SIGN-OFF.*

---

## 1. Executive Summary & Gating Topology

To maintain total alignment between technical implementation and product authority, the **OTP Golden Reconstruction** introduces **6 Mandatory Human Checkpoint Gates (Gates A through F)**.

These gates act as non-negotiable physical synchronization barriers. An implementation agent is strictly prohibited from advancing to subsequent stages until the designated human authorities review artifacts, execute verification suites, and issue explicit gate clearance.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 6 HUMAN CHECKPOINT GATES TOPOLOGY                           │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [GATE A] ──> Prior to First Code Mutation (Baseline Invariant Lock)
                  │
 [GATE B] ──> Prior to Database / Protected Backend Asset Preservation Verification
                  │
 [GATE C] ──> Post Foundational Identity & Authorization Engine (Negative Tests)
                  │
 [GATE D] ──> Post Customer 4-Action Journey Reconstruction (Mobile Evidence)
                  │
 [GATE E] ──> Prior to Financial, Tax & Double-Entry Settlement Activation
                  │
 [GATE F] ──> Final Production Deployment & 3-Tier Certification
```

---

## 2. Exhaustive Specification of Checkpoint Gates A through F

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        CHECKPOINT GATES SPECIFICATION MATRIX                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Checkpoint Gate A: Baseline Invariant & Repository Lock
- **Gate ID:** `GATE-A`
- **Timing & Trigger:** Prior to executing any code mutation in Stage `R2-02` (immediately following Stage `R2-01`).
- **Primary Objective:** Validate that all 7 R2 planning artifacts are approved, the workspace builds cleanly, all 1,514+ baseline tests pass, and the migration ceiling is locked at `00197`.
- **Review & Sign-Off Authority:** Principal Architect / Technical Lead.
- **Mandatory Entry Evidence & Artifacts:**
  1. Complete set of 7 R2 planning documents in `OTP Golden Reconstruction/`.
  2. Clean build log: `pnpm -r run build` (Exit Code 0).
  3. Green baseline test log: `pnpm test` (1,514+ assertions passing).
  4. Git status clean; zero uncommitted diffs.
- **Pass / Fail Evaluation Criteria:**
  - **PASS:** 100% tests passing, clean workspace, zero missing planning specifications.
  - **FAIL:** Any build warning treated as error, test failure, or unapproved schema modification.
- **Lockout & Enforcement Mechanism:** Agent halts execution; no source file edits permitted until Gate A is stamped.
- **Escalation Runbook:** If baseline fails, revert to last known stable tag; run `pnpm store prune` and reinstall dependencies.

---

### Checkpoint Gate B: Protected Backend Assets & Database Invariant Gate
- **Gate ID:** `GATE-B`
- **Timing & Trigger:** Prior to touching any service or adapter that interfaces with Protected Assets `PA-01` through `PA-10` (before Stage `R2-05`).
- **Primary Objective:** Formally verify that Migration 00197 ceiling remains unbroken, no new migration files exist, and all 10 Protected Assets are locked against mutation.
- **Review & Sign-Off Authority:** Database Architect / Security Lead.
- **Mandatory Entry Evidence & Artifacts:**
  1. Database migration count check: exactly 197 migrations in `supabase/migrations/`.
  2. AST / Hash verification confirming zero edits to `PA-01` through `PA-10` SQL and TypeScript definitions.
  3. Automated RLS security test output: `pnpm test tests/security/`.
- **Pass / Fail Evaluation Criteria:**
  - **PASS:** Protected asset hashes match baseline; zero RLS regression; zero migration ceiling bypass.
  - **FAIL:** Any detected edit to historical migrations `00001` through `00197` or altered RPC signatures.
- **Lockout & Enforcement Mechanism:** CI/CD and agent pre-commit hooks reject commit if migration count $\neq 197$.
- **Escalation Runbook:** Immediately revert any modified migration file using `git checkout supabase/migrations/`.

---

### Checkpoint Gate C: Foundational Identity & Authorization Gate
- **Gate ID:** `GATE-C`
- **Timing & Trigger:** Immediately following Stage `R2-03` and `R2-04` (Identity, Context, and Individual Buyer flow).
- **Primary Objective:** Formally verify the **13-Stage Canonical Authorization Model**, multi-context independence, and fail-closed negative authorization tests.
- **Review & Sign-Off Authority:** Security Architect / Lead Engineer.
- **Mandatory Entry Evidence & Artifacts:**
  1. Negative authorization test log: `pnpm test tests/security/cross-organization.test.ts`.
  2. Context independence verification: proving an RWA Treasurer context cannot sign MSME transactions.
  3. Individual buyer verification: proving `requirements.organization_id = NULL` functions with zero committee leaks.
- **Pass / Fail Evaluation Criteria:**
  - **PASS:** 100% of negative authorization assertions pass (unauthorized actions throw HTTP 403 / SQL 42501).
  - **FAIL:** Any context leakage or cross-tenant visibility.
- **Lockout & Enforcement Mechanism:** Execution halts; Stages `R2-05` and `R2-06` blocked from dispatch.
- **Escalation Runbook:** Refactor `RoleProvider.tsx` and `actor-context.ts` to isolate evaluation tuples.

---

### Checkpoint Gate D: Customer 4-Action Journey & Mobile Containment Gate
- **Gate ID:** `GATE-D`
- **Timing & Trigger:** Following completion of Stages `R2-09` through `R2-12` (TELL, REVIEW, DECIDE, TRACK).
- **Primary Objective:** Validate the complete 4-Action Customer Journey on mobile viewports ($360\text{px}-414\text{px}$), verifying zero button obscuration, $<60$s fast-track intake, and zero supplier identity leakage.
- **Review & Sign-Off Authority:** Product Owner & UX Design Lead.
- **Mandatory Entry Evidence & Artifacts:**
  1. Mobile visual test results: `pnpm test apps/web/src/features/rfq/quote-comparison-mobile.test.ts`.
  2. Identity protection test results: `pnpm test tests/security/blind-rfq-engine.test.ts`.
  3. Quorum and award test results: `pnpm test apps/web/src/features/governance/failure-paths-regression.test.ts`.
  4. Inspection checklist and PO snapshot test results: `pnpm test packages/domain/src/types/milestone-inspection.test.ts`.
- **Pass / Fail Evaluation Criteria:**
  - **PASS:** Mobile AppShell enforces `max-w-md mx-auto` and `pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))]`; zero horizontal scroll; zero supplier contact leaks.
  - **FAIL:** Obscured CTA buttons, broken mobile layouts, or supplier contacts visible prior to award reveal.
- **Lockout & Enforcement Mechanism:** Blocks advancement to platform engines and control planes.
- **Escalation Runbook:** Adjust CSS classes in `AppLayout.tsx` and `MobileActionFooter.tsx`; inspect masked views.

---

### Checkpoint Gate E: Financial Ledger & Tax Integrity Gate
- **Gate ID:** `GATE-E`
- **Timing & Trigger:** Prior to finalizing Stage `R2-17` (GAAP Financial Controls).
- **Primary Objective:** Formally verify double-entry journal balance conservation ($\sum \text{Debits} = \sum \text{Credits}$), bilateral GST place-of-supply calculations, and statutory TDS 194C/194Q withholdings.
- **Review & Sign-Off Authority:** Financial Controller / Domain Specialist.
- **Mandatory Entry Evidence & Artifacts:**
  1. Double-entry accounting test output: `pnpm test packages/domain/src/accounting/double-entry-ledger.test.ts`.
  2. Bilateral GST tax test output: `pnpm test packages/domain/src/tax/tax-engine.test.ts`.
  3. TDS withholding test output: `pnpm test packages/domain/src/tax/tds-calculator.test.ts`.
  4. Tally ERP XML export sample showing zero balancing discrepancies.
- **Pass / Fail Evaluation Criteria:**
  - **PASS:** 100% of financial tests pass; platform fee (0.50%) and buyer reward (0.10%) mathematically balance to ₹0.00.
  - **FAIL:** Any fractional paise rounding error or unbalanced journal entry.
- **Lockout & Enforcement Mechanism:** Blocks superadmin and production release pipelines.
- **Escalation Runbook:** Trace double-entry balancing logic in `AccountingService.ts` and `chart-of-accounts.ts`.

---

### Checkpoint Gate F: Production Deployment & 3-Tier Authority Certification
- **Gate ID:** `GATE-F`
- **Timing & Trigger:** Final release gate following Stage `R2-22`.
- **Primary Objective:** Issue authoritative platform certification across Product, Architecture, and Quality tiers; approve live production deployment to Vercel Edge CDN.
- **Review & Sign-Off Authority:** 3-Tier Authority Board:
  1. Product Authority (Founder / Product Owner)
  2. Architectural Authority (Lead Architect)
  3. Engineering & Security Authority (Principal Engineer)
- **Mandatory Entry Evidence & Artifacts:**
  1. Full master regression output: `npx tsx scripts/run-master-regression.ts` (1,514+ green tests).
  2. Pre-deployment staging gate clearance: `npx tsx scripts/verify-staging-gate.ts` (22 failure paths clean).
  3. Vocabulary verification report: `npx tsx scripts/verify-vocabulary.ts` (Zero forbidden legacy words).
  4. Encrypted production database backup confirmation: `scripts/backup-prod-db.ps1`.
- **Pass / Fail Evaluation Criteria:**
  - **PASS:** Unanimous sign-off by all 3 authorities; 100% automated gate clearance.
  - **FAIL:** Single dissenting vote or single failing automated assertion.
- **Lockout & Enforcement Mechanism:** Production deployment script `scripts/deploy-prod.ps1` aborted if Gate F signature is missing.
- **Escalation Runbook:** Full triage meeting; root-cause diagnosis of blocking defect; patch and re-run full test battery.

---

## 3. Governance Authority & Sign-Off Matrix

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        GATE SIGN-OFF AUTHORITY MATRIX                                  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Checkpoint Gate | Primary Focus | Required Sign-Off Role(s) | Blocking Condition |
| :---: | :--- | :--- | :--- |
| **Gate A** | Baseline & Invariants | Lead Architect | Any baseline build/test error |
| **Gate B** | Protected Assets (PA-01 to PA-10) | Database & Security Lead | Migration ceiling $\neq 197$ or modified PA |
| **Gate C** | Identity & 13-Stage Auth | Security Architect | Failed negative authorization test |
| **Gate D** | 4-Action Journey & Mobile | Product Owner & UX Lead | Mobile button overlap or identity leak |
| **Gate E** | Financial Ledger & Tax | Financial Controller | Unbalanced double-entry journal ($\ne 0$) |
| **Gate F** | Final Production Release | 3-Tier Board (Product, Arch, Eng) | Any single failing assertion (>1,514) |

---
*End of OTP Checkpoint Gates & Human Governance Protocol (R2)*
