# OTP Release Candidate Gate — 2026-09-29

**Mandate this pass:** Read-only gate. No code fixes, no deploy, no git commit/push, no production migration apply (00220 stays off hosted), no 00221, no production modification, no file deletes/reverts.

---

## 1. Baseline

| Field | Value |
| --- | --- |
| **HEAD** | `7b1afc12ac7761efc206c70db80486612a34d146` |
| **BRANCH** | `main` |
| **WORKTREE** | Dirty — 31 modified tracked paths + 70 untracked paths (**101** total per `git status --short`); no `.env` / credentials files in status |
| **LOCAL MIGRATION** | **00220** (confirmed on `127.0.0.1:54322` via `supabase_migrations.schema_migrations`; top rows 00220…00216) |
| **PRODUCTION MIGRATION** | **00219** (operator-verified ceiling; not re-queried hosted this pass; `deploy-migrations.ts --status` not used) |
| **CHANGED FILE COUNT** | **101** |

**Migrations on disk (00216–00220):** all five files present under `supabase/migrations/`.

---

## 2. Dirty worktree classification

| Group | Classification | Notes |
| --- | --- | --- |
| `apps/web/**`, `packages/domain/**`, `packages/services/**` (modified + new tests/providers/wallet) | **INTENTIONAL RELEASE CHANGE** | Four bug fixes, wallet/network/ONDC/discovery, persona routing |
| `supabase/migrations/00216`–`00220`, `tests/security/*00216*`, `supplier-wallet-00220-database.test.ts` | **INTENTIONAL RELEASE CHANGE** | Security + wallet release scope |
| `scripts/deploy-migrations.ts`, `scripts/*-contract-run.mjs`, `scripts/hosted-readonly-verify-run.mjs` | **INTENTIONAL RELEASE CHANGE** | Migration/deploy and contract verification helpers |
| `OTP Golden Reconstruction/**` (docs + `INTEGRATION/`) | **INTENTIONAL RELEASE CHANGE** | Golden Reconstruction program documentation |
| `OTP Golden Reconstruction/_*_evidence.json` | **GENERATED/LOCAL ARTIFACT** | Local/hosted read-only audit captures; no secrets observed in filenames |
| `.env`, `node_modules`, unrelated experiments | *(none in status)* | — |

**UNRELATED CHANGE:** none material.  
**UNKNOWN:** none material.

**WORKTREE:** **ACCEPTABLE** (all changes align with stated reconstruction/release scope).

---

## 3. Scope verification (read-only)

| Requirement | Present | Evidence |
| --- | --- | --- |
| Signup `signInWithOtp` path | Yes | `apps/web/src/features/portal/api/signup.ts` (`signInWithOtp` ~L148, ~L252) |
| Notification channel result handling | Yes | `edge-dispatch.ts` → `resolveNotificationStatus` / HTTP observation; tests in `edge-dispatch.test.ts`, `registration-outcome.test.tsx` |
| `PermissionChips` null-safe permissions | Yes | `permissions ?? []` in `PermissionChips.tsx` |
| `reconcilePortalSide` buyer/supplier persona | Yes | `roles.ts`, `ProtectedRoute.tsx`, `portal-side-reconciliation.test.ts` |
| `00220` `credit_supplier_wallet_event_atomic` | Yes | `00220_supplier_wallet_ledger_events.sql` |
| Server ₹100 amounts | Yes | SQL `CASE` → `100.00` for referral + success; client override rejected |
| Unique / idempotency | Yes | `uq_wallet_supplier_event_source`; `idempotency_key` replay branch |
| Anon not granted execute | Yes | `REVOKE … FROM PUBLIC, anon, authenticated`; `GRANT … TO service_role` only |
| No live `SUPPLIER_CASHBACK` credit path | Yes | SQL raises on cashback; domain `REMOVED_SUPPLIER_CASHBACK_LEDGER_TYPE` guard only in TS |
| ONDC `NOT_CONFIGURED` without fabricated sellers | Yes | `ondc-supplier-provider.ts`, `ondc-network-adapter.ts` + tests |
| Google not labeled OTP verified | Yes | `GOOGLE_DISCOVERY` → buyer label **Local businesses** (`supplier-discovery-source.ts`); Google provider uses `provenanceLabel` from that map |

---

## 4. Tests

**Command (representative RC bundle):**

```text
node node_modules/vitest/vitest.mjs run \
  tests/security/verified-remediation-00216-database.test.ts \
  tests/security/verified-remediation-00216-redteam.test.ts \
  tests/security/supplier-wallet-00220-database.test.ts \
  packages/domain/src/types/supplier-wallet.test.ts \
  packages/services/src/discovery/networks/ondc-network-adapter.test.ts \
  packages/services/src/discovery/supplier-network-providers/supplier-network-providers.test.ts \
  packages/services/src/discovery/supplier-network-engine.test.ts \
  apps/web/src/features/roles/portal-side-reconciliation.test.ts \
  apps/web/src/features/portal/registration-outcome.test.tsx \
  apps/web/src/features/portal/api/signup.test.ts \
  apps/web/src/features/notifications/lib/edge-dispatch.test.ts \
  apps/web/src/features/auth/protected-route.test.ts \
  apps/web/src/features/profile/address-book-and-persona.test.ts
```

| Metric | Result |
| --- | --- |
| Test files | **13 passed** |
| Tests | **110 passed**, **0 failed** |
| Prior claim 105/105 | **Superseded** — independent count **110/110** this pass |

**Security 00216:** included above (database + redteam) — **PASS**.

---

## 5. Migration 00220

| Check | Result |
| --- | --- |
| File order after 00219 | **PASS** — `00220_supplier_wallet_ledger_events.sql` follows `00219_*` on disk |
| Grants | **PASS** — `service_role` only |
| Anon execute | **DENIED** (revoked) |
| Server amount | **₹100** fixed in SQL |
| Idempotency / concurrency | **PASS** — partial unique index + idempotency_key replay + post-lock duplicate SELECT |
| 00221 created | **NO** |
| Production apply | **NOT DONE** (mandate) |

---

## 6. Production build

| Field | Value |
| --- | --- |
| `package.json` script | `"build": "vite build apps/web"` |
| `npm` / `pnpm` on PATH | **Not found** (`where.exe` exit 1) |
| Build executed | **Yes** — `node node_modules/vite/bin/vite.js build apps/web` |
| Outcome | **PASS** (vite v6.4.3; 619 modules; ~58s) |

**BUILD:** **PASS** (via Node-invoked Vite; equivalent to npm script).

---

## 7. Static scan

| Check | Result |
| --- | --- |
| `SUPPLIER_CASHBACK` as live credit path | **None** in app/packages credit flows; removal constant + SQL reject only |
| Fake/demo ONDC sellers in production adapter paths | **None** when `NOT_CONFIGURED` (tests assert zero fabrication) |
| Hardcoded secrets in changed app paths | **None flagged** in status diff |
| QA password `Welcome@OTP2026!` | **Observed** legacy default in `apps/web/src/features/admin/api/admin-ops.ts` (not in modified list this pass); tests reference for admin flows — **not a new secret introduction** |
| Debug `console.log` in portal/discovery changes | **None** in scoped portal/discovery dirs |
| Disabled auth / bypass | **None** — `ProtectedRoute` still session-gated |

**STATIC SCAN:** **PASS** (with documented legacy QA default note).

---

## 8. Email

| Field | Value |
| --- | --- |
| **EMAIL API ACCEPTANCE** | **VERIFIED** — `registration-outcome.test.tsx` expects `signInWithOtp` called and `notification.status` **SUBMITTED** (not inbox delivery) on EMAIL channel |
| **REAL EMAIL DELIVERY** | **BLOCKED — ENVIRONMENT** (no inbox verification this pass) |

---

## 9. Decision

| Gate | Result |
| --- | --- |
| Worktree acceptable | **Yes** |
| Tests | **110/110 PASS** |
| Security 00216–00219 (+ 00220 local) | **PASS** (vitest + SQL review) |
| 00220 valid | **PASS** |
| BUILD | **PASS** |
| Secrets / debug bypass | **No blockers** |
| Production touched | **No** — ceiling remains **00219** on hosted |

**RELEASE CANDIDATE:** **APPROVED** (local release-candidate baseline; production deploy and 00220 apply remain out of scope).

---

## 10. Production untouched attestation

- No production migration apply (00220 **not** on hosted).
- No deploy, commit, or push this pass.
- Local Docker used only at `127.0.0.1:54322` for DB-backed tests / migration read.

---

## 11. Exact gate fields (machine block)

```text
DATE: 2026-09-29
HEAD: 7b1afc12ac7761efc206c70db80486612a34d146
BRANCH: main
WORKTREE: ACCEPTABLE
WORKTREE_CHANGED_FILE_COUNT: 101
LOCAL_MIGRATION: 00220
PRODUCTION_MIGRATION: 00219
SECURITY_00216_00219: PASS
MIGRATION_00220: PASS
TESTS: 110/110 PASS
BUILD: PASS
BUILD_COMMAND: node node_modules/vite/bin/vite.js build apps/web
STATIC_SCAN: PASS
EMAIL_API_ACCEPTANCE: VERIFIED
REAL_EMAIL_DELIVERY: BLOCKED — ENVIRONMENT
PRODUCTION_TOUCHED: NO
00221_CREATED: NO
RELEASE_CANDIDATE: APPROVED
FINAL: RELEASE CANDIDATE APPROVED — local gate green; production unchanged at migration 00219; 00220 local-only.
```
