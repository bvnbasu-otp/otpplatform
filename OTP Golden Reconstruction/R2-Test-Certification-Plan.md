# OTP Test Certification Plan & Verification Strategy (R2)
**Document Identifier:** `OTP-RECON-R2-TEST-CERTIFICATION-PLAN`  
**Version:** 1.0 (Authoritative R2 Test Plan)  
**Status:** SUPREME TEST ARCHITECTURE & CERTIFICATION SPECIFICATION  
**Working Root:** `G:/My Drive/otp`  
**Baseline Test Battery:** 1,514+ Automated Assertions Across 12 Tiers (100% Green Requirement)  
**Operating Invariant:** *ZERO COMPROMISE ON TEST COVERAGE. ZERO MUTATION OF PROTECTED ASSET TESTS. FAIL-CLOSED ON ANY REGRESSION.*

---

## 1. Executive Summary & Verification Framework

The **OTP Test Certification Plan** establishes the authoritative quality assurance, security validation, and automated regression verification battery governing the **Golden Reconstruction v1**.

To guarantee that code consolidation and UX streamlining never compromise backend security, financial precision, or institutional governance, testing is structured across **12 rigorous test tiers**:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          12-TIER VERIFICATION TOPOLOGY                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [TIER 1]  Pure Unit & Domain Model Tests
 [TIER 2]  Service Orchestration & Integration Tests
 [TIER 3]  PostgreSQL Row-Level Security (RLS) Positive & Negative Tests
 [TIER 4]  Supplier Identity Protection & Side-Channel Anti-Leakage Tests
 [TIER 5]  GAAP Double-Entry Financial Ledger & Tax Split Tests
 [TIER 6]  RWA Democratic Governance, Quorum & COI Recusal Tests
 [TIER 7]  MSME Spend Delegation, Spend Caps & Anti-Self-Approval Tests
 [TIER 8]  Supplier 2-Stage Lifecycle & Award Onboarding Gate Tests
 [TIER 9]  Truthful 8-State Notification & Webhook Signature Tests
 [TIER 10] Canonical Sourcing Taxonomy & Rule-Based NLP Parser Tests
 [TIER 11] Mobile AppShell, Safe-Area Inset & Visual Regression Tests (360px-414px)
 [TIER 12] Master End-to-End Persona Regression & 22 Failure Paths Battery
```

---

## 2. Comprehensive 12-Tier Test Suite Specifications

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        12-TIER TEST SPECIFICATION MATRIX                               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Tier # & Name | Target Scope & Invariants | Physical Test File Paths | Execution Command | Pass Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Domain Models** | Pure business models, status transitions, tax logic, and HSN/SAC lookups. | `packages/domain/src/**/*.test.ts` | `pnpm --filter @otp/domain test` | 100% assertions green; zero network or DB dependencies. |
| **Tier 2: Service Layer** | Service orchestration, GIS location adapters, and DI containers. | `packages/services/src/**/*.test.ts` | `pnpm --filter @otp/services test` | All service methods resolve valid `Result<T, E>` types. |
| **Tier 3: PostgreSQL RLS** | Multi-tenant isolation across buyer orgs, individual buyers, and suppliers. | `tests/security/rls-security.test.ts`, `tests/security/cross-organization.test.ts` | `pnpm test tests/security/` | Negative access attempts throw SQL 42501 (insufficient privilege). |
| **Tier 4: Anti-Leakage** | Zero supplier contact, GSTIN, or phone leakage in evaluation payloads. | `tests/security/blind-rfq-engine.test.ts`, `packages/domain/src/errors/blind-violation.test.ts` | `pnpm test tests/security/blind-rfq-engine.test.ts` | Evaluation JSON payloads contain strictly pseudonyms; memory guards throw on contact leak. |
| **Tier 5: Financial Ledger** | GAAP double-entry ledger balance, 0.50% fee, 0.10% reward, GST, TDS. | `packages/domain/src/accounting/double-entry-ledger.test.ts`, `packages/services/src/services/financial-control-5d.test.ts` | `pnpm test packages/domain/src/accounting/` | $\sum \text{Debits} = \sum \text{Credits}$; zero rounding errors. |
| **Tier 6: RWA Governance** | 365-day term expiry, annual succession, quorum ($\ge 2$), and COI recusal. | `packages/services/src/services/org-role-lifecycle-service.test.ts`, `tests/unit/governance-immutability.test.ts` | `pnpm test packages/services/src/services/org-role-lifecycle-service.test.ts` | Manager role cannot vote; unconflicted votes $<2$ block award; audit logs immutable. |
| **Tier 7: MSME Delegation** | Spend caps, UTC validity expiry, anti-self-approval rule, 1-click Primary. | `packages/services/src/services/c84-spend-approval-orchestration-and-delegation.test.ts` | `pnpm test packages/services/src/services/c84-*.test.ts` | RFQ creator cannot approve own spend; spend exceeding cap escalates to Primary. |
| **Tier 8: Supplier KYC Gate** | 2-stage lifecycle, magic-link quoting, fail-closed KYC/GST award gate. | `packages/domain/src/types/supplier-award-onboarding.test.ts`, `tests/integration/supplier-portal.test.ts` | `pnpm test packages/domain/src/types/supplier-award-onboarding.test.ts` | Unverified supplier award halts reveal; valid KYC completes onboarding and unmasks. |
| **Tier 9: Notifications** | 8-state notification lifecycle, WAHA/Twilio webhook signature verification. | `packages/services/src/notifications/notification-queue-worker.test.ts`, `tests/security/messaging-rls.test.ts` | `pnpm test packages/services/src/notifications/` | Status remains "Dispatch Requested" until verified webhook receipt arrives. |
| **Tier 10: Taxonomy & NLP** | 3-level taxonomy hierarchy, database caching, regex extraction from prompts. | `packages/domain/src/taxonomy/taxonomy-cache.test.ts`, `packages/domain/src/parser/extractors.test.ts` | `pnpm test packages/domain/src/taxonomy/` | NLP extractor accurately extracts quantities, units, dimensions, and warranty. |
| **Tier 11: Mobile Visual** | Viewport containment ($360\text{px}-414\text{px}$), safe-area insets, $\ge 44\text{px}$ touch targets. | `apps/web/src/features/rfq/quote-comparison-mobile.test.ts`, `apps/web/src/features/theme/contrast.test.ts` | `pnpm --filter @otp/web test` | Zero footer button obscuration; zero horizontal scrollbars on mobile. |
| **Tier 12: Master Regression** | Full platform regression battery covering all 22 Formal Failure Paths. | `apps/web/src/features/governance/failure-paths-regression.test.ts`, `tests/functional/workflow-lifecycle.test.ts` | `npx tsx scripts/run-master-regression.ts` | All 1,514+ assertions pass with 100% green status. |

---

## 3. The 10 Strict Definition of Done (DoD) Criteria

Every stage in the **22-Stage Implementation Sequence (R2-01 through R2-22)** MUST satisfy all **10 Definition of Done criteria** before its git commit boundary is sealed:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        THE 10 DEFINITION OF DONE CRITERIA                              │
└────────────────────────────────────────────────────────────────────────────────────────┘

 [1]  Zero Codebase Regressions (100% green pass rate across all 1,514+ tests).
 [2]  Strict Preservation of Protected Backend Assets PA-01 through PA-10.
 [3]  Migration Ceiling Permanently Locked at 00197 (zero migration modifications).
 [4]  Strict 1:1:1 Canonical Route Alignment (18 Canonical Routes, zero dead pages).
 [5]  Mobile-First AppShell Standards (max-w-md, safe-area pb, >=44px touch targets).
 [6]  Zero Identity / Contact Leakage (DOM, Network, WebSockets, Memory guards).
 [7]  Fail-Closed Security & Governance (Quorum >= 2, COI recusal, Anti-Self-Approval).
 [8]  Double-Entry Financial Conservation (Sum Debits = Sum Credits, Tax accuracy).
 [9]  Complete Enterprise Purge in Customer UI (Zero Enterprise cards or forms).
 [10] Clean Static Analysis, Linting & Strict TypeScript Compilation (Zero errors).
```

---

## 4. Master Test Verification Commands

The following commands represent the automated verification pipeline executed during reconstruction:

### 4.1 Fast Development Verification (In-Session)
```powershell
# Run package unit and domain tests
pnpm --filter @otp/domain test
pnpm --filter @otp/services test
pnpm --filter @otp/web test
```

### 4.2 Comprehensive Security & Governance Verification
```powershell
# Run security, RLS, and governance failure path tests
pnpm test tests/security/
pnpm test apps/web/src/features/governance/failure-paths-regression.test.ts
pnpm test packages/services/src/services/c84-spend-approval-orchestration-and-delegation.test.ts
pnpm test packages/services/src/services/org-role-lifecycle-service.test.ts
```

### 4.3 Master Release Regression Battery
```powershell
# Run full repository regression suite (>1,514 assertions)
npx tsx scripts/run-master-regression.ts

# Run pre-deployment staging verification gate (22 formal failure paths)
npx tsx scripts/verify-staging-gate.ts

# Execute vocabulary static analysis guard
npx tsx scripts/verify-vocabulary.ts
```

---

## 5. Certification Sign-Off Template

```text
========================================================================================
                  STAGE VERIFICATION & CERTIFICATION SIGN-OFF
========================================================================================

Stage ID: _____________________________________________________________________________
Stage Title: __________________________________________________________________________
Commit SHA: ___________________________________________________________________________

CHECKLIST EVALUATION:
 [ ] DoD 1: 1,514+ Automated Tests Passing (Zero Regressions)
 [ ] DoD 2: Protected Assets PA-01 through PA-10 Verified Intact
 [ ] DoD 3: Migration Ceiling Verified at 00197
 [ ] DoD 4: Canonical 1:1:1 Route & Screen Structure Enforced
 [ ] DoD 5: Mobile-First AppShell & Safe-Area Inset Verified (360px–414px)
 [ ] DoD 6: Zero Contact / Identity Leaks Verified via Network & Memory Guards
 [ ] DoD 7: Fail-Closed Security, Quorum & Anti-Self-Approval Asserted
 [ ] DoD 8: Double-Entry Financial Ledger Balances Verified
 [ ] DoD 9: Enterprise UI Purged from Customer Scope
 [ ] DoD 10: Strict TypeScript Compilation Clean (Zero Errors)

CERTIFICATION VERDICT: [ ] APPROVED / CERTIFIED    [ ] REJECTED (HALT)

Lead Architect Sign-Off: ____________________________ Date: ___________________________
========================================================================================
```

---
*End of OTP Test Certification Plan & Verification Strategy (R2)*
