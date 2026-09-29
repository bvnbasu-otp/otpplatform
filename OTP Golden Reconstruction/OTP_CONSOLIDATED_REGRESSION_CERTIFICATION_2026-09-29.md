# OTP Consolidated Regression Certification — 2026-09-29

**Database target for security tests:** `127.0.0.1:54322` (when available)  
**Production:** not used for tests

---

## 18. Status table

| Suite | Result | Count |
| --- | --- | --- |
| `verified-remediation-00216-database.test.ts` | **PASS** | (included in bundle) |
| `verified-remediation-00216-redteam.test.ts` | **PASS** | (included in bundle) |
| `protected-route.test.ts` | **PASS** | +1 supplier stale-side case |
| `portal-side-reconciliation.test.ts` | **PASS** | 3 tests |
| `edge-dispatch.test.ts` | **PASS** | 1 test |
| `registration-outcome.test.tsx` | **PASS** | +EMAIL channel case |
| **Total bundle** | **PASS** | **55/55** |

Command:

```
node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts tests/security/verified-remediation-00216-redteam.test.ts apps/web/src/features/auth/protected-route.test.ts apps/web/src/features/roles/portal-side-reconciliation.test.ts apps/web/src/features/notifications/lib/edge-dispatch.test.ts apps/web/src/features/portal/registration-outcome.test.tsx
```

---

## A. Purpose

Certify local regressions for explicit findings F-1–F-4 without weakening 00216–00219 controls.

## B. New regressions

| Test | Guards |
| --- | --- |
| Supplier stale BUYER side → `/supplier/quotes` ALLOW | F-4 |
| `reconcilePortalSide` dual vs supplier-only | F-4 |
| HTTP 503 JSON → FAILED not outcome-unknown | F-2 |
| EMAIL signup → signInWithOtp + separate guaranteedNotice | F-1/F-2 |
| `normalizeRolePermissions(undefined)` → [] | F-3 |

## C. Security suite

00216 database + redteam: **PASS** in same run (no RLS/allowlist edits).

## D. Not run

Full `tests/security` tree, payment E2E, production JWT matrix.

## E. Deploy gate

Tests green; deploy **BLOCKED** (tooling).

## F. Production verification

**NOT RE-VERIFIED** on https://otpplatform-theta.vercel.app after deploy.

## G. Sign-off

**LOCAL CERTIFIED** for listed suites. **PRODUCTION BEHAVIOUR NOT RE-VERIFIED.**
