# 11. Testing Architecture, Staging Verification Gate & Superadmin Test Center

## 1. Testing Philosophy & "No Unverified Code in Production" Mandate

The OTP Platform enforces an uncompromising **Zero-Mocks, Zero-Defects Promotion Gate**:
- **Staging / Pre-Production Precedence**: All test cases (unit, module, functional, regression, buyer flows, seller flows, and superadmin operations) **MUST be verified in Developer / Tester / Pre-Production / Staging / Demo environments FIRST**.
- **100% Green Requirement**: Promotion to production live occurs **only if 100% of tests pass**.
- **Zero-Downtime Old-Code Retention**: If any issue is identified in the staging verification gate, the live production website continues running with the old code flow uninterrupted.
- **Zero In-Memory Mocks for Integration**: All integration tests, RLS assertions, and end-to-end flows execute against real running database instances and containers.
- **Canonical Vocabulary Scanner**: Strict static analysis verifying 0 occurrences of prohibited legacy terms (`bid`, `bids`, `bidder`, `bidders`, `bidding`, `blind`).

---

## 2. Certified Test Inventory Breakdown (Series-6 Baseline)

The certified automated test suite consists of **1,355 tests across 139 test files**, achieving 100% pass across all packages:

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
| **`apps/web`** | **88** | **726** | 0 | 🟢 **100% PASS** | Multimodal intake (voice, text, photo, document), `<ProtectedRoute>` security & deep-linking, `<ProcurementStageNavigator>` linear step progression, comparison & voting rooms, contract gate & mutual reveal modals, 5-point inspection checklists, dispute drawers, device capabilities (camera/mic teardown, geolocation fallback, Web Share), and Super Admin console tabs. |
| **TOTAL** | **139** | **1,355** | **0** | 🎉 **100% PASS** | **Complete Series-6 Verified Monorepo Baseline** |

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
| **1** | `POLICY` | Canonical Procurement Vocabulary Scanner | Scans all source files for `bid`, `bidder`, `bidding`, `blind` (0 violations) | ✅ PASS |
| **2** | `DOMAIN` | Domain Logic, Math & State Machines (`@otp/domain`) | 297 tests across 29 test files | ✅ PASS |
| **3** | `SERVICES` | Adapters & Dispatch Queues (`@otp/services`) | 331 tests across 21 test files | ✅ PASS |
| **4** | `DATABASE` | Database Entity Mappers (`@otp/database`) | 1 test file | ✅ PASS |
| **5** | `WEB` | Web Features, Governance & PWA (`@otp/web`) | 726 tests across 88 test files | ✅ PASS |
| **6** | `INTEGRATION` | Live Database Integration & RLS Security Suite | Live PostgREST RLS and role boundaries | ✅ PASS |
| **7** | `DEMO_E2E` | Live Demo Scenario & E2E Walkthrough Suite | Multi-actor buyer/seller walkthroughs | ✅ PASS |
| **8** | `POSTGRES` | Database Engine & Security RPCs | PostgreSQL security definer benchmarks | ✅ PASS |
| **9** | `SMOKE` | Live Operational & Auth Smoke Battery | Microservice & Auth liveness checks | ✅ PASS |
| **10** | `LIVE_FLOWS` | Multi-Actor Procurement Simulation Flows | End-to-end real-time call flow simulations | ✅ PASS |
| **11** | `BUILD` | Production TypeScript Compilation (`pnpm typecheck`) | Clean compilation across all 4 workspace packages | ✅ PASS |

### Staging Gate Certificate (`backups/staging-gate-cert.json`)
Upon 100% pass across all verification layers, the runner issues a cryptographically tracked certificate:
```json
{
  "status": "APPROVED",
  "gateResult": "PASS",
  "targetEnvironment": "STAGING/DEMO",
  "activeLiveBuildVersionHash": "series6-baseline",
  "timestamp": "2026-09-18T17:35:00.000Z",
  "verifiedSuites": [
    "POLICY",
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
  "totalTests": 1355,
  "passedTests": 1355,
  "failedTests": 0,
  "gateVersion": "6.6.0"
}
```

---

## 4. Superadmin Interactive Test Center (`/admin?tab=tests`)

Administrators can inspect and trigger test suites directly inside the web application:
- **Dual-View Switcher**:
  - `📊 Master Platform Matrix (1,355 Tests)`: Comprehensive module-by-module documentation table across all 139 test files.
  - `⚡ Live Database Battery`: Interactive execution with single-test `▶ Run` buttons executing `admin_run_test_case` in real time.
- **Real-Time Duration & Diagnostic Reporting**: Millisecond latency tracking and instant error stack traces.
- **Production Guard**: Interactive test runs execute in isolated transactions, preventing state pollution.
