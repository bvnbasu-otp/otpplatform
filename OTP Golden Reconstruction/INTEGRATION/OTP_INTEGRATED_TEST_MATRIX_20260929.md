# OTP Integrated Test Matrix — 2026-09-29

**Runner:** `node node_modules/vitest/vitest.mjs run` (local only)  
**Result:** **105 / 105 passed** (12 files)

## Command (canonical bundle)

```
node node_modules/vitest/vitest.mjs run \
  tests/security/verified-remediation-00216-database.test.ts \
  tests/security/verified-remediation-00216-redteam.test.ts \
  tests/security/supplier-wallet-00220-database.test.ts \
  packages/domain/src/types/supplier-wallet.test.ts \
  packages/services/src/discovery/networks/ondc-network-adapter.test.ts \
  packages/services/src/discovery/supplier-network-engine.test.ts \
  packages/domain/src/types/supplier-network-provider.test.ts \
  packages/domain/src/notifications/notification-status.test.ts \
  apps/web/src/features/portal/registration-outcome.test.tsx \
  apps/web/src/features/notifications/lib/edge-dispatch.test.ts \
  apps/web/src/features/roles/portal-side-reconciliation.test.ts \
  apps/web/src/features/auth/protected-route.test.ts
```

## Matrix

| Suite | Classification | Tests | Notes |
| --- | --- | --- | --- |
| `verified-remediation-00216-database.test.ts` | PASS — LOCALLY VERIFIED | 9 | Real DB `127.0.0.1:54321/54322`; anon allowlist + wallet/award blocks |
| `verified-remediation-00216-redteam.test.ts` | PASS — LOCALLY VERIFIED | 11 | Static SQL/deploy guards incl. 00220 |
| `supplier-wallet-00220-database.test.ts` | PASS — LOCALLY VERIFIED | 3 | Requires 00220 on local Docker |
| `supplier-wallet.test.ts` | PASS — LOCALLY VERIFIED | 9 | Referral/success/cashback removed |
| `ondc-network-adapter.test.ts` | PASS — LOCALLY VERIFIED | 5 | NOT_CONFIGURED, no fabricated sellers |
| `supplier-network-engine.test.ts` | PASS — LOCALLY VERIFIED | 13 | Multi-provider orchestration (repo-backed local registry) |
| `supplier-network-provider.test.ts` | PASS — LOCALLY VERIFIED | 2 | Google ≠ OTP verified bucket |
| `notification-status.test.ts` | PASS — LOCALLY VERIFIED | 15 | Channel status scale (success/fail/unavailable/timeout semantics) |
| `registration-outcome.test.tsx` | PASS — LOCALLY VERIFIED | 14 | EMAIL GoTrue SUBMITTED; WA/EMAIL not conflated |
| `edge-dispatch.test.ts` | PASS — LOCALLY VERIFIED | 1 | 503 JSON → FAILED, not outcome-unknown |
| `portal-side-reconciliation.test.ts` | PASS — LOCALLY VERIFIED | 3 | Stale BUYER / dual-role |
| `protected-route.test.ts` | PASS — LOCALLY VERIFIED | 21 | `/supplier/quotes` supplier founder stale side |

## Four bugs — test mapping

| Bug | Evidence | Classification |
| --- | --- | --- |
| F-1 EMAIL signup | `registration-outcome.test.tsx` (`signInWithOtp`, SUBMITTED not delivered) | PASS — LOCALLY VERIFIED; inbox delivery **BLOCKED — ENVIRONMENT** (not observable) |
| F-2 WA vs Email | `registration-outcome` EMAIL+failed WA; `notification-status.test.ts`; `edge-dispatch.test.ts` | PASS — LOCALLY VERIFIED |
| F-3 Missing permissions | `portal-side-reconciliation` `normalizeRolePermissions`; `PermissionChips` null-safe | PASS — LOCALLY VERIFIED |
| F-4 Portal side / supplier quotes | `portal-side-reconciliation.test.ts`; `protected-route.test.ts` stale BUYER founder | PASS — LOCALLY VERIFIED |

## Not run / blocked

| Item | Classification |
| --- | --- |
| Full `npm run build` | BLOCKED — ENVIRONMENT (`npm` unavailable in shell) |
| Production DB / hosted JWT matrix | NOT APPLICABLE (forbidden) |
| Live email inbox / WhatsApp delivery | BLOCKED — ENVIRONMENT / EXTERNAL CREDENTIALS |

## 00221

**Created:** NO
