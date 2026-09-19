# 11. Testing Architecture, Staging Verification Gate & Superadmin Test Center

## 1. Testing Philosophy & "No Unverified Code in Production" Mandate

The OTP Platform enforces an uncompromising **Zero-Mocks, Zero-Defects Promotion Gate**:
- **Staging / Pre-Production Precedence**: All test cases (unit, module, functional, regression, buyer flows, seller flows, and superadmin operations) **MUST be verified in Developer / Tester / Pre-Production / Staging / Demo environments FIRST**.
- **100% Green Requirement**: Promotion to production live occurs **only if 100% of tests pass**.
- **Zero-Downtime Old-Code Retention**: If any issue is identified in the staging verification gate, the live production website continues running with the old code flow uninterrupted.
- **Zero In-Memory Mocks for Integration**: All integration tests, RLS assertions, and end-to-end flows execute against real running database instances and containers.
- **Canonical Vocabulary Scanner**: Strict static analysis verifying 0 occurrences of prohibited legacy terms (`bid`, `bids`, `bidder`, `bidders`, `bidding`, `blind`).

---

## 2. Certified Test Inventory Breakdown (Phase 7.1 Baseline)

The certified automated test suite consists of **1,514+ automated verifications across 12 layers**, achieving 100% pass across all packages:

```text
========================================================================================
                 OTP PLATFORM — AUTOMATED TEST SUITE INVENTORY
========================================================================================
```

| Package / Directory | Test Files | Tests Passed | Failed | Status | Scope & Key Test Modules |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`packages/domain`** | **29** | **297** | 0 | 🟢 **100% PASS** | 15-step linear monotonic pipeline, Indian Standards parsing, VMI 35/30/20/15 scorecards, enterprise approval matrix, Step 11 contract compilation & SHA-256 hashes, double-entry ledger & tax splitting, 0.50% platform fee & 0.10% buyer reward calculations, milestone inspection scoring, and dispute SLA timers. |
| **`packages/services`** | **21** | **331** | 0 | 🟢 **100% PASS** | Omnichannel notification dispatch queue, exponential backoff retries, WAHA WhatsApp adapter, universal SMTP relay, provider webhook HMAC verification, and external network discovery stubs. |
| **`packages/database`** | **1** | **1** | 0 | 🟢 **100% PASS** | PostgreSQL Supabase client bindings, connection pools, and query builders. |
| **`apps/web`** | **90+** | **760+** | 0 | 🟢 **100% PASS** | Multimodal intake with UUID syntax guards, 6-Stage commercial views, `<ProtectedRoute>` security & deep-linking, `<ProcurementStageNavigator>` admin linear step progression, comparison & voting rooms, contract gate & mutual reveal modals, 5-point inspection checklists, dispute drawers, device capabilities (camera/mic teardown, geolocation fallback, Web Share), **22 Formal Failure Paths (`failure-paths-regression.test.ts`, 32/32 tests passed)**, and **UX Telemetry Scrub (`ux-telemetry-abstraction.test.ts`)**. |
| **Integration & Edge** | **40+** | **125+** | 0 | 🟢 **100% PASS** | Live PostgREST RLS security, role separation, cryptographic HMAC webhooks, Deno functions (`payment-webhook`), and end-to-end multi-actor call flows. |
| **TOTAL** | **184** | **1,514+** | **0** | 🎉 **100% PASS** | **Complete Phase 7.1 Re-Certified Monorepo Baseline** |

---

## 3. Staging Verification Gate (`pnpm gate:verify`)

Codified in [`scripts/verify-staging-gate.ts`](file:///G:/My%20Drive/otp/scripts/verify-staging-gate.ts) and registered as `pnpm gate:verify` in `package.json`.

### Execution Command:
```powershell
Set-Location "G:\My Drive\otp"
pnpm gate:verify
```

### Verification Layers & Scorecard:

| Layer # | Category | Layer Description | Test Suite Scope | Status |
| :---: | :--- | :--- | :--- | :---: |
| **1** | `POLICY` | Canonical Procurement Vocabulary Scanner | Scans 407 source files for `bid`, `bidder`, `bidding`, `blind` (0 violations) | ✅ PASS |
| **2** | `COVERAGE` | Automated Test Coverage Policy | 184 active test files audited across Unit, Module, Functional, and Regression tiers | ✅ PASS |
| **3** | `DOMAIN` | Domain Logic, Math & State Machines (`@otp/domain`) | 297 tests across 29 test files | ✅ PASS |
| **4** | `SERVICES` | Adapters & Dispatch Queues (`@otp/services`) | 331 tests across 21 test files | ✅ PASS |
| **5** | `DATABASE` | Database Entity Mappers (`@otp/database`) | 1 test file | ✅ PASS |
| **6** | `WEB` | Web Features, Governance & PWA (`@otp/web`) | 760+ tests including Failure Paths (32/32) and UX Telemetry Scrub | ✅ PASS |
| **7** | `INTEGRATION` | Live Database Integration & RLS Security Suite | Live PostgREST RLS and role boundaries | ✅ PASS |
| **8** | `DEMO_E2E` | Live Demo Scenario & E2E Walkthrough Suite | Multi-actor buyer/seller walkthroughs | ✅ PASS |
| **9** | `POSTGRES` | Database Engine & Security RPCs | PostgreSQL security definer benchmarks (185 migrations) | ✅ PASS |
| **10** | `SMOKE` | Live Operational & Auth Smoke Battery | Microservice & Auth liveness checks | ✅ PASS |
| **11** | `LIVE_FLOWS` | Multi-Actor Procurement Simulation Flows | End-to-end real-time call flow simulations | ✅ PASS |
| **12** | `BUILD` | Production TypeScript Compilation (`pnpm typecheck`) | Clean compilation across all workspace packages | ✅ PASS |

### Staging Gate Certificate (`backups/staging-gate-cert.json`)
Upon 100% pass across all verification layers, the runner issues a cryptographically tracked certificate:
```json
{
  "status": "APPROVED",
  "gateResult": "PASS",
  "targetEnvironment": "STAGING/DEMO",
  "activeLiveBuildVersionHash": "c5c97ca",
  "timestamp": "2026-09-19T08:03:30.000Z",
  "verifiedSuites": [
    "POLICY",
    "COVERAGE",
    "DOMAIN",
    "SERVICES",
    "DATABASE",
    "WEB",
    "INTEGRATION",
    "DEMO_E2E",
    "POSTGRES",
    "SMOKE",
    "LIVE_FLOWS",
    "BUILD"
  ],
  "totalTests": 1514,
  "passedTests": 1514,
  "failedTests": 0,
  "gateVersion": "7.1.0"
}
```

---

## 4. Superadmin Interactive Test Center (`/admin?tab=tests`)

Administrators can inspect and trigger test suites directly inside the web application:
- **Dual-View Switcher**:
  - `📊 Master Platform Matrix (1,514+ Verifications)`: Comprehensive module-by-module documentation table across all 184 active test files.
  - `⚡ Live Database Battery`: Interactive execution with single-test `▶ Run` buttons executing `admin_run_test_case` in real time.
- **Real-Time Duration & Diagnostic Reporting**: Millisecond latency tracking and instant error stack traces.
- **Production Guard**: Interactive test runs execute in isolated transactions, preventing state pollution.
