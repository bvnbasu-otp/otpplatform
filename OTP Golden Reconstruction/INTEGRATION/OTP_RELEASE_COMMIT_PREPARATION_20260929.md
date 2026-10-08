# OTP Release Commit Preparation — 2026-09-29

| Field | Value |
| --- | --- |
| **PREVIOUS SHA** | `7b1afc12` |
| **NEW RELEASE SHA** | `10a4a1291ee3ed2db7200e7c2badcec3e5a01114` |
| **BRANCH** | `main` |
| **FINAL** | **RELEASE COMMIT READY** |

## Worktree

**Before commit:** 34 modified paths; untracked migrations `00216`–`00220`, supplier wallet/network code and tests, Golden Reconstruction markdown, INTEGRATION gate docs, local evidence JSON, PROD_CONTAINMENT SQL/txt, contract-runner scripts.

**After commit:** Release SHA contains certified RC. Remaining dirty/untracked (excluded from release):

| Path | Classification |
| --- | --- |
| `apps/web/src/features/award/pages/AwardPage.tsx` | LOCAL/TEST ONLY — copy tweak; unstaged to satisfy pre-commit coverage-append rule |
| `apps/web/src/features/governance/lib/organization-charter.ts` | LOCAL/TEST ONLY — copy tweak; unstaged |
| `apps/web/src/features/reveal/components/DecisionReceiptCard.tsx` | LOCAL/TEST ONLY — copy tweak; unstaged |
| `apps/web/src/features/site/components/SiteLayout.tsx` | LOCAL/TEST ONLY — MobileSimulatorFrame removal; unstaged |
| `apps/web/src/features/site/pages/PricingPage.tsx` | LOCAL/TEST ONLY — copy tweak; unstaged |
| `OTP Golden Reconstruction/PROD_CONTAINMENT/` | LOCAL/TEST ONLY — production readonly SQL/txt evidence, QA matrices |
| `OTP Golden Reconstruction/_hosted_readonly_evidence.json` | GENERATED ARTIFACT |
| `OTP Golden Reconstruction/_local_contract_evidence.json` | GENERATED ARTIFACT |
| `OTP Golden Reconstruction/_p0_gaps_evidence.json` | GENERATED ARTIFACT |
| `scripts/hosted-readonly-verify-run.mjs` | LOCAL/TEST ONLY — embeds local Supabase demo JWT fallbacks |
| `scripts/local-db-contract-run.mjs` | LOCAL/TEST ONLY — demo JWT fallbacks |
| `scripts/p0-gaps-contract-run.mjs` | LOCAL/TEST ONLY — demo JWT fallbacks |

This report file is a **post-commit local artifact** and is **not** in the release SHA.

## Release scope

| Metric | Value |
| --- | --- |
| **Release file count (commit)** | 98 files |
| **Migrations in commit** | `00216_verified_remediation_p0_p1_security_integrity.sql`, `00217_revoke_public_execute_default_privileges.sql`, `00218_rfq_status_transition_whitelist.sql`, `00219_guard_rfq_approval_stage_direct_write.sql`, `00220_supplier_wallet_ledger_events.sql` (no `00221`) |

## Certification gates (pre-commit)

| Gate | Result |
| --- | --- |
| Four bugs (signup `signInWithOtp`, notification honesty, `PermissionChips` null guard, `reconcilePortalSide` / `ProtectedRoute`) | **PASS** — present at `HEAD` |
| Wallet `00220` (₹100 server-derived referral + success reward, no live cashback credit, anon not granted, idempotency) | **PASS** — SQL review + tests |
| Supplier network / Google discovery | **PASS** |
| ONDC `NOT_CONFIGURED` boundary | **PASS** |
| Security `00216` database + redteam | **PASS** |

## Tests

**Command:**

```text
node node_modules/vitest/vitest.mjs run tests/security/verified-remediation-00216-database.test.ts tests/security/verified-remediation-00216-redteam.test.ts tests/security/supplier-wallet-00220-database.test.ts packages/domain/src/types/supplier-wallet.test.ts packages/services/src/discovery/networks/ondc-network-adapter.test.ts packages/services/src/discovery/supplier-network-providers/supplier-network-providers.test.ts packages/services/src/discovery/supplier-network-engine.test.ts apps/web/src/features/roles/portal-side-reconciliation.test.ts apps/web/src/features/portal/registration-outcome.test.tsx apps/web/src/features/portal/api/signup.test.ts apps/web/src/features/notifications/lib/edge-dispatch.test.ts apps/web/src/features/auth/protected-route.test.ts apps/web/src/features/profile/address-book-and-persona.test.ts
```

**Result:** 13 files, **110/110 passed**, 0 failed.

## Build

**Command:** `node node_modules/vite/bin/vite.js build apps/web`  
**Result:** **PASS** (production bundle built in ~54s).

## Secrets

**NONE** in staged/commit set. Staged paths scanned; no `.env`, credentials, or service-role keys added. Contract-runner scripts with demo JWT fallbacks were **not** committed.

## Unrelated / excluded

**DETAILS:** Five site/award/governance copy UX files (see worktree table); PROD_CONTAINMENT evidence tree; three `*_evidence.json`; three `*-contract-run.mjs` / `hosted-readonly-verify-run.mjs`.

## Post-commit verification

- `git cat-file -e HEAD:supabase/migrations/00220_supplier_wallet_ledger_events.sql` — OK
- `git grep reconcilePortalSide HEAD -- apps/web/src` — matches in `roles.ts`, `ProtectedRoute.tsx`, tests
- `git grep signInWithOtp HEAD -- apps/web/src/features/portal` — matches in `signup.ts` and tests
- `git ls-tree` lists `00216`–`00220` under `supabase/migrations/`

## Operations

| Action | Performed |
| --- | --- |
| Push | **NO** |
| Deploy | **NO** |
| Apply `00220` to production | **NO** |
| `supabase db push` | **NO** |
| Amend `7b1afc12` | **NO** |
