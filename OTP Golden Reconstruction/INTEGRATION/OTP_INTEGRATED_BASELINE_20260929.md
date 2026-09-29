# OTP Integrated Local Baseline — 2026-09-29

## Repository snapshot (Phase 1)

| Field | Value |
| --- | --- |
| Branch | `main` |
| HEAD SHA | `7b1afc12ac7761efc206c70db80486612a34d146` |
| Remote tracking | `main...origin/main` (no push this pass) |
| Production deploy this pass | **NOT DONE** |
| Production migration ceiling | **00219** (00220 **not** applied to hosted project) |
| Local Docker Postgres | `127.0.0.1:54322` — **UP** |
| Local migrations applied | Through **00220** on Docker only (`supabase_db_otp-local`) |
| Git commit / push | **Forbidden this pass** — large dirty working tree (modified app, packages, migrations 00216–00220, tests, Golden Reconstruction docs) |
| Migration 00221 created | **NO** |

### Local migration files present

- `00216_verified_remediation_p0_p1_security_integrity.sql`
- `00217_revoke_public_execute_default_privileges.sql`
- `00218_rfq_status_transition_whitelist.sql`
- `00219_guard_rfq_approval_stage_direct_write.sql`
- `00220_supplier_wallet_ledger_events.sql` (patched this pass: dedupe index + post-lock duplicate guard)

## Integrated baseline scope

Single coherent **local** baseline: security migrations 00216–00219 (already on local DB) + supplier wallet 00220 (applied locally only), with app-layer fixes for signup truthfulness, notification status scale, workspace permission null-safety, portal-side reconciliation, OTP registry discovery (no synthetic local sellers), and ONDC `NOT_CONFIGURED` without credentials.

No OTP product redesign. No production schema/data/grants/RLS/secrets changes.

## Code paths reviewed (read-through)

| Area | Location | Notes |
| --- | --- | --- |
| Signup email | `apps/web/src/features/portal/api/signup.ts` | `signInWithOtp` + `resolveSupabaseEmailDispatch` → **SUBMITTED**, not delivered |
| WhatsApp / edge | `edge-dispatch.ts`, `onboarding-notify` invoke | HTTP/provider mapped via `resolveNotificationStatus` |
| Permissions | `PermissionChips.tsx`, `normalizeRolePermissions` | Missing permissions → `[]`, no throw |
| Portal side | `reconcilePortalSide`, `ProtectedRoute` | Stale BUYER + supplier-only → SUPPLIER; dual-role keeps explicit BUYER |
| Supplier wallet SQL | `00220` `credit_supplier_wallet_event_atomic` | service_role only; ₹100 server-derived; cashback path rejected |
| Wallet domain | `packages/domain/src/types/supplier-wallet.ts` | Referral/success rules; self/duplicate/circular |
| ONDC | `ondc-network-adapter.ts`, `ondc-supplier-provider` | No keys → `NOT_CONFIGURED`, zero fabricated sellers |

## Surgical changes this pass

1. **00220** — `uq_wallet_supplier_event_source` unique partial index + duplicate check after wallet `FOR UPDATE` (concurrency).
2. **supplier-network-engine.test.ts** — wire minimal `SupplierRepository` for OTP local registry (no synthetic production sellers).
3. **supplier-wallet.test.ts** — circular referral unit case.
4. **tests/security/supplier-wallet-00220-database.test.ts** — local DB RPC contract.
5. **verified-remediation-00216-redteam.test.ts** — assert dedupe index in 00220 SQL.

## Executive status

```
LOCAL INTEGRATION: PASS
FOUR BUGS: PASS
SUPPLIER WALLET: PASS
SUPPLIER NETWORK: PASS
GOOGLE DISCOVERY: PASS
ONDC: NOT_CONFIGURED
SECURITY 00216–00219: PASS
00220: PASS
REGRESSION: PASS
DEPLOYMENT: BLOCKED
```

**Build:** BLOCKED — ENVIRONMENT (`npm` not on PATH in agent shell; not behaviorally verified this pass).
