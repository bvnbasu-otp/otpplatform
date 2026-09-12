# 11. Testing Architecture, Staging Verification Gate & Superadmin Test Center

## 1. Testing Philosophy & "No Unverified Code in Production" Mandate

The OTP Platform enforces an uncompromising **Zero-Mocks, Zero-Defects Promotion Gate**:
- **Staging / Pre-Production Precedence**: All test cases (unit, module, functional, regression, buyer flows, seller flows, and superadmin operations) **MUST be verified in Developer / Tester / Pre-Production / Staging / Demo environments FIRST**.
- **100% Green Requirement**: Promotion to production live occurs **only if 100% of tests pass**.
- **Zero-Downtime Old-Code Retention**: If any issue is identified in the staging verification gate, the live production website continues running with the old code flow uninterrupted.
- **Zero In-Memory Mocks for Integration**: All integration tests, RLS assertions, and end-to-end flows execute against real running database instances and containers.
- **Canonical Vocabulary Scanner**: Strict static analysis verifying 0 occurrences of prohibited legacy terms (`bid`, `bidder`, `bidding`, `blind`).

---

## 2. Staging Verification Gate (`pnpm gate:verify`)

Codified in [`scripts/verify-staging-gate.ts`](file:///G:/My%20Drive/otp/scripts/verify-staging-gate.ts) and registered as `pnpm gate:verify` in `package.json`.

### Execution Command:
```powershell
Set-Location "G:\My Drive\otp"
pnpm gate:verify
```

### 12-Layer Verification Architecture & Scorecard:

| Layer # | Category | Layer Description | Tests Passed | Failed | Status | Duration |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: |
| **1** | `POLICY` | Canonical Procurement Vocabulary Scanner (`bid`, `bidder`, `bidding`, `blind`) | **1** | 0 | ✅ PASS | 3.7s |
| **2** | `DOMAIN` | Domain Logic, GST Validation & Parsing Engine (`@otp/domain`) | **70** | 0 | ✅ PASS | 9.2s |
| **3** | `SERVICES` | Network Discovery & External Services Adapters (`@otp/services`) | **30** | 0 | ✅ PASS | 12.3s |
| **4** | `DATABASE` | Database Entity Mappers (`@otp/database`) | **1** | 0 | ✅ PASS | 8.6s |
| **5** | `UNIT` | Messaging Core & Web Routing Invariants (`tests/unit`) | **75** | 0 | ✅ PASS | 7.6s |
| **6** | `WEB` | Web Features, Governance, ProtectedRoute & State Machine Tests (`@otp/web`) | **346** | 0 | ✅ PASS | 27.7s |
| **7** | `INTEGRATION` | Live Database Integration & RLS Security Suite (`tests/integration`, `tests/security`) | **35** | 0 | ✅ PASS | 18.2s |
| **8** | `DEMO_E2E` | Live Demo Scenario & E2E Walkthrough Suite (`tests/demo`) | **12** | 0 | ✅ PASS | 8.8s |
| **9** | `POSTGRES` | Database Engine & Security RPCs (`admin_run_test_case`) | **25** | 0 | ✅ PASS | 0.1s |
| **10** | `SMOKE` | Live Operational & Auth Smoke Battery (`scripts/test-live-smoke.ts`) | **10** | 0 | ✅ PASS | 6.6s |
| **11** | `LIVE_FLOWS` | Multi-Actor Procurement Simulation Flows (`scripts/run_live_automated_tests.ts`) | **25** | 0 | ✅ PASS | 116.0s |
| **12** | `BUILD` | Production TypeScript Compilation & Bundle Build (`vite build`) | **1** | 0 | ✅ PASS | 61.5s |
| **TOTAL** | **ALL LAYERS** | **Complete Platform Staging Pre-Flight Gate** | **631** | **0** | **🎉 100% PASS** | **280.3s** |

### Staging Gate Certificate (`backups/staging-gate-cert.json`)
Upon 100% pass across all 12 layers, the runner issues a cryptographically tracked certificate:
```json
{
  "status": "APPROVED",
  "gateResult": "PASS",
  "targetEnvironment": "STAGING/DEMO",
  "activeLiveBuildVersionHash": "02b13a0",
  "timestamp": "2026-09-12T03:32:02.614Z",
  "durationSeconds": 301.1,
  "verifiedSuites": [
    "POLICY",
    "TEST_EXPANSION_ENGINE",
    "DOMAIN",
    "SERVICES",
    "DATABASE",
    "UNIT",
    "WEB",
    "INTEGRATION",
    "DEMO_E2E",
    "POSTGRES",
    "SMOKE",
    "LIVE_FLOWS",
    "BUILD"
  ],
  "gateVersion": "2.1.0"
}
```
The automated deployment script (`scripts/deploy-prod.ps1` / `scripts/deploy-prod.ps1`) verifies this certificate before any production artifacts are modified.

---

## 3. Fast Regression Battery (`pnpm test:regression`)

For rapid feedback during active development and before deployment, the master regression runner (`scripts/run-master-regression.ts`) executes the complete platform suite across all 12 layers:

```powershell
Set-Location "G:\My Drive\otp"
pnpm test:regression
```

### Current Master Regression Execution Scorecard:
- **Total Tests**: **631 tests**
- **Pass Rate**: **631 / 631 PASSED (100% Green)**
- **Execution Time**: ~280 seconds
- **Suites Verified**:
  1. `[POLICY]` Canonical Procurement Vocabulary Scanner (1 test)
  2. `[DOMAIN]` Domain Logic, GST Validation, Smart Scoring & Parsing Engine (70 tests)
  3. `[SERVICES]` Network Discovery, SMTP Relay & Rate Limiter Adapters (30 tests)
  4. `[DATABASE]` Database Entity Mappers (1 test)
  5. `[UNIT]` Messaging Core & Web Routing Invariants (75 tests)
  6. `[WEB]` Web Features, Governance, ProtectedRoute & State Machine Tests (346 tests)
  7. `[INTEGRATION]` Live Database Integration & RLS Security Suite (35 tests)
  8. `[DEMO_E2E]` Live Demo Scenario & E2E Walkthrough Suite (12 tests)
  9. `[POSTGRES]` Database Engine & Security RPCs (25 tests)
  10. `[SMOKE]` Live Operational & Auth Smoke Battery (10 tests)
  11. `[LIVE_FLOWS]` Real-Time End-to-End Live Call Flow Battery (25 tests)
  12. `[BUILD]` Production TypeScript Compilation & Vite Bundle Build (1 test)

---

## 4. Edge Functions & Deno Test Suite (`pnpm test:functions`)

Deno edge function tests (`supabase/functions/_shared` and `payment-webhook/`) are run via:
```powershell
pnpm test:functions
```
- **Tests Verified**: 38 tests across CORS headers, HMAC primitives, constant-time validation, WhatsApp templates, and payment webhook signature extraction.
- **Runtime Standard**: Runs with `--allow-env --no-lock` in `supabase/functions/deno.json`, and server bootstrap is isolated with `if (import.meta.main)`.

## 4. Playwright End-to-End Browser Testing Suite

Playwright browser automation is configured in `e2e/playwright.config.ts` to simulate real-world multi-actor procurement sessions:

### 4.1 Target Viewports & Browser Matrix:
- **Desktop Chrome**: $1280 \times 720\text{px}$ viewport for enterprise procurement managers.
- **Mobile Chrome (Pixel 5)**: $393 \times 851\text{px}$ viewport for field technicians and mobile buyers.
- **Mobile Safari (iPhone 12)**: $390 \times 844\text{px}$ viewport for RWA committee members.

### 4.2 Verified 15-Step Sourcing Workflow (`e2e/sourcing-full-lifecycle.spec.ts`):
1. **Buyer Intake**: Requirement creation with auto-extraction of quantity and warranty.
2. **Supplier Matching**: Location radius and GSTIN validation.
3. **Blind Quoting**: Sealed quote submission with `Supplier-XXXX` tokenization.
4. **Smart Scoring**: Multi-factor evaluation (commercial, speed, warranty, quality, GST bonus).
5. **Committee Governance**: Weighted voting with mandatory justification capture.
6. **Atomic Award**: Irrevocable supplier reveal and instant Purchase Order generation.
7. **Compliance Checks**: Zero leakage of supplier PII pre-award.

---

## 5. Superadmin Interactive Test Center (`/admin?tab=tests`)

Administrators can inspect and trigger test suites directly inside the web application:
- **Dual-View Switcher**:
  - `📊 Master Platform Matrix (828 Tests)`: Comprehensive module-by-module documentation table.
  - `⚡ Live Database Battery (25 Tests)`: Interactive execution with single-test `▶ Run` buttons executing `admin_run_test_case` in real time.
- **Real-Time Duration & Diagnostic Reporting**: Millisecond latency tracking and instant error stack traces.
- **Production Guard**: Interactive test runs execute in isolated transactions, preventing state pollution.
